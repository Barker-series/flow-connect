/**
 * Development-only semantic browser contract for `scripts/visual-qa.mjs`.
 *
 * Two rules earned the hard way. The harness must ask the SCENE where things
 * are — computing tap positions from the viewport lands on empty stage, because
 * the SDK mock reports a phone-shaped safe area in `vite dev` and shifts the
 * whole layout. And every interaction assertion must prove something CHANGED
 * (`movesCommitted`, `status: solved`), not merely that nothing threw.
 *
 * This surface may set up local test state. It must never fabricate a
 * successful RUN ad, purchase, entitlement, notification, or privileged
 * outcome, and it is stripped from production by the `import.meta.env.DEV`
 * gate around its installation.
 */
import packageJson from "../../package.json";
import { audioManager } from "../audio/audioManager.ts";
import { getFlowScene, getLevelController } from "../game/GameCanvas.tsx";
import type { LevelRef } from "../game/flow/levels.ts";
import { rendererLifecycleSnapshot } from "../rendering/rendererLifecycle.ts";
import { getRunCapabilities } from "../sdk/runSdk.ts";
import { store } from "../state/store.ts";
import { adDiagnostics } from "../systems/ads.ts";
import { commerceDiagnostics } from "../systems/commerce.ts";
import { saveSystem } from "../systems/save.ts";

interface FlowConnectQa {
    snapshot(): Record<string, unknown>;
    /**
     * Real client-space positions: every cell, and the intended solution as a
     * list of client points per flow, so the harness can drag a real solve.
     */
    geometry(): Record<string, unknown> | null;
    startLevel(ref: LevelRef): void;
    openScreen(screen: string): void;
    returnToMenu(): void;
    /** Grant sparks so the hint and Studio surfaces can be exercised locally. */
    grantSparks(amount: number): void;
    /** Mark the first `count` levels of a pack solved, to review progress UI. */
    markSolved(packId: string, count: number, perfect?: boolean): void;
    /**
     * Raise the host pause overlay. The real one only ever comes from a RUN
     * lifecycle event, so without this the overlay — and the tap that
     * dismisses it — cannot be exercised anywhere but on a device.
     */
    setPaused(value: boolean): void;
    unlockAudio(): Promise<boolean>;
    setSetting(key: string, value: unknown): Promise<boolean>;
}

declare global {
    // Development-only semantic browser contract. Never present in production.
    var __gameQa: FlowConnectQa | undefined;
}

export function installBrowserQaContract(): void {
    if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get("qa") !== "1") return;
    document.documentElement.dataset.qaContract = "ready";
    globalThis.__gameQa = {
        snapshot() {
            const state = store.get();
            const scene = getFlowScene();
            return {
                version: packageJson.version,
                phase: state.phase,
                menuScreen: state.menuScreen,
                paused: state.paused,
                level: state.level,
                moves: state.moves,
                flowsConnected: state.flowsConnected,
                flowCount: state.flowCount,
                pipePercent: state.pipePercent,
                solved: state.solved,
                levelSummary: state.levelSummary,
                sparks: state.sparks,
                levelsCompleted: state.levelsCompleted,
                selectedPalette: state.selectedPalette,
                reducedMotion: state.reducedMotion,
                hapticsEnabled: state.hapticsEnabled,
                musicEnabled: state.musicEnabled,
                sfxEnabled: state.sfxEnabled,
                quality: state.quality,
                locale: state.locale,
                movesCommitted: scene?.movesCommitted ?? 0,
                effectsActive: scene?.effectsActive ?? 0,
                renderer: document.documentElement.dataset.renderer ?? "pending",
                rendererLifecycle: rendererLifecycleSnapshot(),
                host: getRunCapabilities().host,
                audio: audioManager.debugSnapshot(),
                ads: adDiagnostics(),
                commerce: commerceDiagnostics(),
            };
        },
        geometry() {
            const geometry = getFlowScene()?.qaGeometry();
            if (!geometry) return null;
            return {
                size: geometry.size,
                solution: geometry.solution,
                movesCommitted: geometry.movesCommitted,
                status: geometry.status,
                cells: Array.from({ length: geometry.size * geometry.size }, (_, index) => geometry.cell(index)),
            };
        },
        startLevel(ref) {
            const controller = getLevelController();
            if (store.get().phase === "playing" && controller) {
                controller.load(ref);
                return;
            }
            store.patch({ phase: "playing", menuScreen: "main", level: ref, levelSummary: null });
        },
        openScreen(screen) {
            store.patch({ phase: "menu", menuScreen: screen as never });
        },
        returnToMenu() {
            store.patch({ phase: "menu", menuScreen: "main", levelSummary: null });
        },
        grantSparks(amount) {
            store.patch({ sparks: Math.max(0, store.get().sparks + Math.floor(amount)) });
        },
        markSolved(packId, count, perfect = false) {
            const records = { ...store.get().levelRecords };
            for (let index = 0; index < count; index++) records[`${packId}:${index}`] = { best: 9, perfect };
            store.patch({ levelRecords: records });
        },
        setPaused(value) {
            store.patch({ paused: Boolean(value) });
        },
        unlockAudio() {
            return audioManager.unlock();
        },
        async setSetting(key, value) {
            store.patch({ [key]: value } as never);
            if (key === "reducedMotion") document.documentElement.dataset.reducedMotion = String(value);
            return saveSystem.flush();
        },
    };
}
