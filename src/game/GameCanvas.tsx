/**
 * React ↔ Pixi boundary. React owns WHEN the board exists (mount/unmount with
 * the 'playing' phase); Pixi owns everything inside the canvas. No React state
 * flows in per frame — scene → UI communication goes through the store.
 *
 * StrictMode-safe: the realm-wide renderer lifecycle queue serializes the
 * mount/cleanup/mount sequence, including initialization itself.
 */

import type { Application } from "pixi.js";
import { useEffect, useRef } from "react";
import {
    acquireRendererRuntime,
    type RendererLease,
    type RendererLifecycleScope,
} from "../rendering/rendererLifecycle.ts";
import { getFrameSafeArea } from "../sdk/runSdk.ts";
import { store, useStore } from "../state/store.ts";
import { createPixiApp } from "./pixiApp.ts";
import type { LevelRef } from "./flow/levels.ts";
import { LevelController } from "./levelController.ts";
import type { Insets } from "./scene/layout.ts";
import { FlowScene } from "./scene/flowScene.ts";
import { createStage, DESIGN_SHORT_EDGE, type Stage } from "./stage.ts";

interface BoardRuntime {
    app: Application;
    scene: FlowScene;
    controller: LevelController;
}

/** Live handles, so the DOM overlays can drive the run without prop drilling. */
let activeController: LevelController | null = null;
let activeScene: FlowScene | null = null;
let syncInsets: (() => void) | null = null;

/**
 * Re-read the safe area into the live scene.
 *
 * The scene otherwise only re-reads on a stage resize, and on a ROTATION the
 * stage resizes BEFORE the host has published its new insets. The DOM picks
 * the new values up from CSS the moment they land, the scene keeps the old
 * ones until something resizes again, and for that window the action bar and
 * the board are laid out against two different safe areas — which is
 * exactly enough to put one on top of the other. Called straight after
 * applyRunSafeArea so both sides settle on the same numbers in the same frame.
 */
export function resyncSceneInsets(): void {
    syncInsets?.();
}

export function getLevelController(): LevelController | null {
    return activeController;
}

const DEFAULT_LEVEL: LevelRef = { kind: "pack", packId: "spark", index: 0 };

/** Development-only: the QA harness asks the live scene where the cells are. */
export function getFlowScene(): FlowScene | null {
    return activeScene;
}

async function initializeBoard(scope: RendererLifecycleScope, host: HTMLElement): Promise<BoardRuntime> {
    const app = await createPixiApp(scope, host);
    scope.throwIfCancelled();

    const stage: Stage = createStage(app);
    scope.manage(() => stage.destroy());

    const state = store.get();
    const controller = new LevelController(state.level ?? DEFAULT_LEVEL);
    const scene = new FlowScene({
        app,
        stage,
        game: controller.flowGame,
        paletteId: state.selectedPalette,
        reducedMotion: state.reducedMotion,
        quality: state.quality,
        insets: designInsets(stage.scale()),
        callbacks: controller.sceneCallbacks,
    });
    scope.manage(() => {
        controller.detach();
        if (activeController === controller) activeController = null;
        if (activeScene === scene) activeScene = null;
        scene.destroy();
    });

    controller.attach(scene);
    scene.introduce();
    activeController = controller;
    activeScene = scene;

    // Safe-area insets are published in CSS pixels; the scene works in design
    // units, so they have to be rescaled whenever the stage does — and again
    // whenever the host republishes them (see resyncSceneInsets).
    const sync = () => scene.setInsets(designInsets(stage.scale()));
    scope.manage(stage.onResize(sync));
    syncInsets = sync;
    scope.manage(() => {
        if (syncInsets === sync) syncInsets = null;
    });

    // Respect a pause that landed while the canvas was initializing.
    if (store.get().paused || document.hidden) app.ticker.stop();
    return { app, scene, controller };
}

export default function GameCanvas() {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const appRef = useRef<Application | null>(null);
    const sceneRef = useRef<FlowScene | null>(null);
    const paused = useStore((s) => s.paused);
    const reducedMotion = useStore((s) => s.reducedMotion);
    const quality = useStore((s) => s.quality);
    const selectedPalette = useStore((s) => s.selectedPalette);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const abortController = new AbortController();
        let lease: RendererLease<BoardRuntime> | null = null;

        void acquireRendererRuntime("pixi-board", abortController.signal, (scope) => initializeBoard(scope, host))
            .then((nextLease) => {
                lease = nextLease;
                appRef.current = nextLease.value.app;
                sceneRef.current = nextLease.value.scene;
            })
            .catch((error: unknown) => {
                if (abortController.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
                    return;
                }
                console.error("[renderer] Pixi initialization failed", error);
                store.patch({
                    phase: "menu",
                    menuScreen: "main",
                    toast: "RENDERER UNAVAILABLE — TRY A DIFFERENT DEVICE",
                });
            });

        return () => {
            abortController.abort();
            appRef.current = null;
            sceneRef.current = null;
            void lease?.release();
        };
    }, []);

    // Host lifecycle pause/resume → freeze/unfreeze the whole ticker.
    useEffect(() => {
        const app = appRef.current;
        if (!app) return;
        if (paused || document.hidden) app.ticker.stop();
        else app.ticker.start();
    }, [paused]);

    // Browser visibility is a second lifecycle source outside the RUN host.
    // Keep it independent from `paused` so a visibility event cannot clear a
    // host-owned pause overlay.
    useEffect(() => {
        const syncVisibility = () => {
            const app = appRef.current;
            if (!app) return;
            if (document.hidden || store.get().paused) app.ticker.stop();
            else app.ticker.start();
        };
        document.addEventListener("visibilitychange", syncVisibility);
        return () => document.removeEventListener("visibilitychange", syncVisibility);
    }, []);

    // Settings the player can change without leaving the board.
    useEffect(() => {
        sceneRef.current?.setReducedMotion(reducedMotion);
    }, [reducedMotion]);

    useEffect(() => {
        sceneRef.current?.setQuality(quality);
    }, [quality]);

    useEffect(() => {
        sceneRef.current?.setPalette(selectedPalette);
    }, [selectedPalette]);

    return <div ref={hostRef} className="absolute inset-0" />;
}

/**
 * RUN reports insets in CSS pixels. Dividing by the stage scale converts them
 * to design units; without this the safe area would be four times too large on
 * a 4x-density phone and the board would shrink to a postage stamp.
 *
 * Frame-relative, the same values the DOM rail is padded by — the landscape
 * reserves only line up because both sides start from the same insets.
 */
function designInsets(scale: number): Insets {
    const area = getFrameSafeArea();
    const factor = scale > 0 ? scale : 1;
    const cap = DESIGN_SHORT_EDGE / 3;
    return {
        top: Math.min(cap, area.top / factor),
        right: Math.min(cap, area.right / factor),
        bottom: Math.min(cap, area.bottom / factor),
        left: Math.min(cap, area.left / factor),
    };
}
