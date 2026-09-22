/**
 * The board: grid, tubes, endpoints, and the drag that draws them.
 *
 * The scene owns presentation and input. It does not own the rules — every
 * question about where a tube may go, what it cuts, and whether the board is
 * solved goes to `FlowGame`, so the board you see and the board
 * `npm run simulate` proves are the same board.
 *
 * Drawing model (DESIGN.md §8): the finger is over exactly the cell you are
 * trying to see, so the active tube's head carries a halo in its own colour
 * that sits around the finger, and every step, cut and connection answers with
 * sound and a haptic tick. A cut flow is drawn cut the instant it is crossed,
 * and springs back the instant the finger backs off it.
 */
import { type Application, Container, type FederatedPointerEvent, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { benchLightCanvas } from "../art/light.ts";
import { context2d, createCanvas, drawBoardBase, TUBE } from "../art/neon.ts";
import { boost, mix, type PaletteId, palette, tubeColour } from "../art/palette.ts";
import { createNeonTextures, type NeonTextures } from "../art/textures.ts";
import type { FlowGame, MoveResult } from "../flow/game.ts";
import type { Stage } from "../stage.ts";
import { createTweenController, ease } from "../tween.ts";
import { type Ambience, createAmbience } from "./ambience.ts";
import { cellAtPoint, cellCentre, cellOrigin, computeLayout, type Insets, type SceneLayout } from "./layout.ts";
import { createEffects, type Effects, type Point } from "./vfx.ts";

export type SceneSfx = "grab" | "step" | "cut" | "connect" | "blocked" | "solve" | "perfect" | "almost" | "hint";
export type SceneHaptic = "light" | "medium" | "heavy" | "success" | "warning" | "error";

export interface FlowSceneCallbacks {
    /** After every committed change to the board (drag, undo, restart, hint). */
    onBoardChanged(result: MoveResult): void;
    /** The finger went down on / came up from the board. */
    onDragChanged(active: boolean): void;
    /** The solve celebration has finished; the shell may show its card. */
    onSolvedShown(): void;
    sfx(cue: SceneSfx, pitch?: number): void;
    haptic(style: SceneHaptic): void;
}

export interface FlowSceneOptions {
    app: Application;
    stage: Stage;
    game: FlowGame;
    paletteId: PaletteId;
    reducedMotion: boolean;
    quality: "high" | "low";
    insets: Insets;
    callbacks: FlowSceneCallbacks;
}

/** How far past the rim a drawing finger may drift and still count, in cells. */
const DRAG_SLACK = 0.45;

export class FlowScene {
    private readonly app: Application;
    private readonly stage: Stage;
    private game: FlowGame;
    private readonly callbacks: FlowSceneCallbacks;

    private textures: NeonTextures;
    private paletteId: PaletteId;
    private reducedMotion: boolean;
    private quality: "high" | "low";
    private insets: Insets;
    private layout: SceneLayout;

    private readonly root = new Container();
    private readonly stageSprite = new Sprite();
    private readonly stageLight = new Sprite();
    /** The light the board throws on the stage, under the bezel. */
    private readonly poolLayer = new Container();
    private readonly boardBase = new Sprite();
    private readonly tintLayer = new Graphics();
    private readonly glowLayer = new Graphics();
    private readonly tubeLayer = new Graphics();
    private readonly orbLayer = new Container();
    private readonly headLayer = new Graphics();
    private readonly fxLayer = new Container();
    private readonly airLayer = new Container();

    private orbs: Sprite[] = [];
    private readonly tweens = createTweenController();
    private effects: Effects;
    private ambience: Ambience;

    private pointerId = -1;
    private pointer: Point | null = null;
    private lastCell = -1;
    private elapsed = 0;
    private boardKey = "";
    private celebrating = false;
    private offResize: () => void;
    private destroyed = false;

    /** Development/QA counter: proves a harness drag actually committed. */
    movesCommitted = 0;

    get effectsActive(): number {
        return this.effects.activeCount;
    }

    constructor(options: FlowSceneOptions) {
        this.app = options.app;
        this.stage = options.stage;
        this.game = options.game;
        this.callbacks = options.callbacks;
        this.paletteId = options.paletteId;
        this.reducedMotion = options.reducedMotion;
        this.quality = options.quality;
        this.insets = options.insets;
        this.textures = createNeonTextures(this.paletteId);
        this.layout = this.computeLayout();

        this.glowLayer.blendMode = "add";
        this.headLayer.blendMode = "add";
        this.root.addChild(
            this.stageSprite,
            this.stageLight,
            this.poolLayer,
            this.boardBase,
            this.tintLayer,
            this.glowLayer,
            this.tubeLayer,
            this.orbLayer,
            this.headLayer,
            this.fxLayer,
            this.airLayer,
        );
        this.stage.root.addChild(this.root);
        this.effects = createEffects(this.fxLayer, this.textures, this.reducedMotion, this.quality);
        this.ambience = createAmbience(
            { under: this.poolLayer, over: this.airLayer },
            palette(this.paletteId),
            this.reducedMotion,
            this.quality,
        );

        this.buildOrbs();
        this.applyLayout();
        this.redraw();

        // Input is delegated to the root and hit-tested by hand; no child is an
        // event target, so the root's cursor is the one Pixi applies.
        this.root.eventMode = "static";
        this.root.interactiveChildren = false;
        this.applyHitArea();
        this.root.on("pointerdown", this.onPointerDown);
        this.root.on("pointermove", this.onPointerMove);
        this.root.on("pointerup", this.onPointerUp);
        this.root.on("pointerupoutside", this.onPointerUp);
        this.root.on("pointercancel", this.onPointerCancel);

        this.offResize = this.stage.onResize(() => {
            this.applyHitArea();
            this.layout = this.computeLayout();
            this.applyLayout();
            this.redraw();
        });
        this.app.ticker.add(this.tick);
    }

    // -----------------------------------------------------------------------
    // Construction and layout
    // -----------------------------------------------------------------------

    private computeLayout(): SceneLayout {
        return computeLayout(this.stage.designWidth(), this.stage.designHeight(), this.game.size, this.insets);
    }

    private buildOrbs(): void {
        for (const orb of this.orbs) orb.destroy();
        this.orbs = [];
        this.game.puzzle.flows.forEach((flow, index) => {
            for (const _end of [flow.a, flow.b]) {
                const sprite = new Sprite(this.textures.orb(index));
                sprite.anchor.set(0.5);
                this.orbLayer.addChild(sprite);
                this.orbs.push(sprite);
            }
        });
    }

    private applyLayout(): void {
        const { width, height, boardX, boardY, boardSize, cellSize, bezel } = this.layout;
        this.stageSprite.texture = this.textures.stage(width, height);
        this.stageSprite.width = width;
        this.stageSprite.height = height;

        const lightPixels = 384;
        const focusY = (boardY + boardSize / 2) / Math.max(1, height);
        this.stageLight.texture?.destroy(true);
        this.stageLight.texture = Texture.from(
            benchLightCanvas(lightPixels, Math.round(lightPixels * (height / Math.max(1, width))), focusY),
        );
        this.stageLight.width = width;
        this.stageLight.height = height;

        // The bezel and sockets, drawn once per layout at device resolution so
        // the grid lines stay crisp at any board size.
        const key = `${this.paletteId}:${this.game.size}:${Math.round(boardSize)}`;
        const outer = boardSize + bezel * 2.4;
        if (key !== this.boardKey) {
            this.boardKey = key;
            const density = Math.min(2, window.devicePixelRatio || 1) * this.stage.scale();
            const pixels = Math.max(256, Math.min(1_600, Math.round(outer * density)));
            const scale = pixels / outer;
            const canvas = createCanvas(pixels, pixels);
            const ctx = context2d(canvas);
            ctx.scale(scale, scale);
            drawBoardBase(ctx, bezel * 1.2, bezel * 1.2, boardSize, this.game.size, palette(this.paletteId));
            this.boardBase.texture?.destroy(true);
            this.boardBase.texture = Texture.from(canvas);
        }
        this.boardBase.position.set(boardX - bezel * 1.2, boardY - bezel * 1.2);
        this.boardBase.width = outer;
        this.boardBase.height = outer;

        let orb = 0;
        this.game.puzzle.flows.forEach((flow) => {
            for (const end of [flow.a, flow.b]) {
                const sprite = this.orbs[orb++];
                if (!sprite) continue;
                sprite.position.set(boardX + (end.x + 0.5) * cellSize, boardY + (end.y + 0.5) * cellSize);
                // The texture's orb radius is a quarter-ish of its width (see orbCanvas).
                const size = cellSize * TUBE.orb * 4.2;
                sprite.width = size;
                sprite.height = size;
            }
        });

        this.ambience.layout(width, height, { x: boardX, y: boardY, size: boardSize });
    }

    private applyHitArea(): void {
        this.root.hitArea = new Rectangle(0, 0, this.stage.designWidth(), this.stage.designHeight());
    }

    // -----------------------------------------------------------------------
    // Drawing
    // -----------------------------------------------------------------------

    /** Repaint tints, tubes and the head halo from the live game. Cheap: ≤81 cells. */
    private redraw(): void {
        const set = palette(this.paletteId);
        const { cellSize } = this.layout;
        const paths = this.game.livePaths();
        const active = this.game.activeFlow;

        this.tintLayer.clear();
        paths.forEach((path, flow) => {
            const colour = tubeColour(set, flow);
            const connected = this.game.isConnected(flow, paths);
            for (const cell of path) {
                const origin = cellOrigin(this.layout, cell);
                const inset = cellSize * 0.045;
                this.tintLayer
                    .roundRect(
                        origin.x + inset,
                        origin.y + inset,
                        cellSize - inset * 2,
                        cellSize - inset * 2,
                        cellSize * 0.16,
                    )
                    .fill({ color: colour, alpha: connected ? TUBE.cellTint : TUBE.cellTint * 0.6 });
            }
        });

        this.glowLayer.clear();
        this.tubeLayer.clear();
        paths.forEach((path, flow) => {
            if (path.length < 2) return;
            const colour = tubeColour(set, flow);
            const points = path.map((cell) => cellCentre(this.layout, cell));
            const connected = this.game.isConnected(flow, paths);
            const lit = connected || flow === active;
            this.stroke(this.glowLayer, points, cellSize * TUBE.glow, colour, lit ? 0.16 : 0.08);
            this.stroke(this.glowLayer, points, cellSize * TUBE.glow * 0.62, colour, lit ? 0.22 : 0.1);
            this.stroke(this.tubeLayer, points, cellSize * TUBE.core * 1.14, mix(colour, 0x000000, 0.4), 1);
            this.stroke(this.tubeLayer, points, cellSize * TUBE.core, colour, 1);
            this.stroke(
                this.tubeLayer,
                points,
                cellSize * TUBE.filament,
                mix(boost(colour, 1.3), 0xffffff, lit ? 0.6 : 0.3),
                lit ? 0.9 : 0.55,
            );
        });

        // Orbs of connected flows sit steady; the rest breathe (see tick()).
        let orb = 0;
        for (let flow = 0; flow < this.game.flowCount; flow++) {
            const connected = this.game.isConnected(flow, paths);
            for (let end = 0; end < 2; end++) {
                const sprite = this.orbs[orb++];
                if (sprite) sprite.alpha = connected ? 1 : sprite.alpha;
            }
        }

        this.ambience.setBoard(this.game.occupancy(), this.game.size);
        this.drawHead();
    }

    private stroke(target: Graphics, points: readonly Point[], width: number, color: number, alpha: number): void {
        const first = points[0];
        if (!first) return;
        target.moveTo(first.x, first.y);
        for (let i = 1; i < points.length; i++) {
            const point = points[i] as Point;
            target.lineTo(point.x, point.y);
        }
        target.stroke({ width, color, alpha, cap: "round", join: "round" });
    }

    /**
     * The halo around the finger while drawing, in the active flow's colour.
     * The thumb covers the cell the player is aiming for; the halo is wider
     * than a thumb, so the colour being drawn is always visible around it.
     */
    private drawHead(): void {
        this.headLayer.clear();
        const flow = this.game.activeFlow;
        if (flow < 0 || !this.pointer) return;
        const colour = tubeColour(palette(this.paletteId), flow);
        const radius = this.layout.cellSize * 1.05;
        const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.elapsed * 9) * 0.04;
        this.headLayer
            .circle(this.pointer.x, this.pointer.y, radius * pulse)
            .fill({ color: colour, alpha: 0.12 })
            .circle(this.pointer.x, this.pointer.y, radius * pulse)
            .stroke({ width: this.layout.cellSize * 0.06, color: colour, alpha: 0.5 });
    }

    // -----------------------------------------------------------------------
    // Input
    // -----------------------------------------------------------------------

    private readonly onPointerDown = (event: FederatedPointerEvent): void => {
        if (this.pointerId >= 0 || this.celebrating || this.game.status === "solved") return;
        const point = event.getLocalPosition(this.root);
        const cell = cellAtPoint(this.layout, point.x, point.y);
        if (cell < 0) return;
        const flow = this.game.beginDrag(cell);
        if (flow < 0) return;
        this.pointerId = event.pointerId;
        this.pointer = { x: point.x, y: point.y };
        this.lastCell = cell;
        this.setCursor("grabbing");
        this.callbacks.onDragChanged(true);
        this.callbacks.sfx("grab", flow);
        this.callbacks.haptic("light");
        this.redraw();
    };

    private readonly onPointerMove = (event: FederatedPointerEvent): void => {
        const point = event.getLocalPosition(this.root);
        if (this.pointerId < 0 || event.pointerId !== this.pointerId) {
            this.updateHoverCursor(point);
            return;
        }
        this.pointer = { x: point.x, y: point.y };
        const cell = cellAtPoint(this.layout, point.x, point.y, DRAG_SLACK);
        if (cell < 0 || cell === this.lastCell) {
            this.drawHead();
            return;
        }
        this.lastCell = cell;
        const step = this.game.dragTo(cell);
        if (step.delta !== 0 || step.cut.length > 0 || step.restored.length > 0) {
            const length = this.game.pathOf(this.game.activeFlow).length;
            if (step.connected) {
                this.onConnected(this.game.activeFlow);
            } else if (step.cut.length > 0) {
                this.callbacks.sfx("cut");
                this.callbacks.haptic("medium");
            } else if (step.delta > 0) {
                this.callbacks.sfx("step", length);
                this.callbacks.haptic("light");
            } else if (step.disconnected) {
                this.callbacks.sfx("step", length);
            }
            this.redraw();
        } else {
            this.drawHead();
        }
    };

    private readonly onPointerUp = (event: FederatedPointerEvent): void => {
        if (this.pointerId < 0 || event.pointerId !== this.pointerId) return;
        this.pointerId = -1;
        this.pointer = null;
        this.lastCell = -1;
        this.setCursor("default");
        this.callbacks.onDragChanged(false);
        const result = this.game.endDrag();
        this.redraw();
        this.afterCommit(result);
    };

    private readonly onPointerCancel = (event: FederatedPointerEvent): void => {
        if (this.pointerId < 0 || event.pointerId !== this.pointerId) return;
        this.pointerId = -1;
        this.pointer = null;
        this.lastCell = -1;
        this.setCursor("default");
        this.callbacks.onDragChanged(false);
        this.game.cancelDrag();
        this.redraw();
    };

    private cursor: "default" | "pointer" | "grabbing" = "default";

    private updateHoverCursor(point: Point): void {
        const cell = cellAtPoint(this.layout, point.x, point.y);
        const live = cell >= 0 && this.game.status !== "solved" && this.game.occupancy()[cell] !== -1;
        this.setCursor(live ? "pointer" : "default");
    }

    private setCursor(cursor: "default" | "pointer" | "grabbing"): void {
        if (this.cursor === cursor) return;
        this.cursor = cursor;
        this.root.cursor = cursor;
        const canvas = this.app.canvas as HTMLCanvasElement | undefined;
        if (canvas?.style) canvas.style.cursor = cursor;
    }

    // -----------------------------------------------------------------------
    // Consequences
    // -----------------------------------------------------------------------

    /** Choreograph a committed change and hand it to the shell. */
    private afterCommit(result: MoveResult): void {
        if (!result.changed) return;
        this.movesCommitted += 1;
        this.callbacks.onBoardChanged(result);
        if (result.status === "solved") {
            this.celebrate();
            return;
        }
        if (result.almost) this.nudgeEmptyCells();
        else if (result.broken.length > 0 && result.newlyConnected.length === 0) this.callbacks.sfx("cut");
    }

    private onConnected(flow: number): void {
        const colour = tubeColour(palette(this.paletteId), flow);
        const points = this.game.pathOf(flow).map((cell) => cellCentre(this.layout, cell));
        this.effects.charge(points, this.layout.cellSize, colour);
        const start = points[0];
        if (start) this.effects.sparks(start.x, start.y, this.layout.cellSize, colour, 6);
        this.popOrbs(flow);
        this.callbacks.sfx("connect", flow);
        this.callbacks.haptic("success");
    }

    private popOrbs(flow: number): void {
        if (this.reducedMotion) return;
        for (const sprite of [this.orbs[flow * 2], this.orbs[flow * 2 + 1]]) {
            if (!sprite) continue;
            const base = this.layout.cellSize * TUBE.orb * 4.2;
            this.tweens.addTween(
                (value) => {
                    if (sprite.destroyed) return;
                    sprite.width = base * value;
                    sprite.height = base * value;
                },
                1.35,
                1,
                ease.outBack,
                undefined,
                { durationMs: 320 },
            );
        }
    }

    /**
     * Every flow connected, cells still dark: the most common "why didn't it
     * finish?" moment in the genre. The empty cells pulse so the answer is on
     * the board, not in a tooltip.
     */
    private nudgeEmptyCells(): void {
        const occupancy = this.game.occupancy();
        let order = 0;
        for (let cell = 0; cell < occupancy.length; cell++) {
            if ((occupancy[cell] ?? -1) >= 0) continue;
            const origin = cellOrigin(this.layout, cell);
            this.effects.flashCell(origin.x, origin.y, this.layout.cellSize, 0xffffff, order++ * 40);
        }
        this.callbacks.sfx("almost");
        this.callbacks.haptic("warning");
    }

    /** Every tube charges in a wave, the board flares, then the shell takes over. */
    private celebrate(): void {
        this.celebrating = true;
        const set = palette(this.paletteId);
        const paths = this.game.livePaths();
        paths.forEach((path, flow) => {
            const points = path.map((cell) => cellCentre(this.layout, cell));
            this.effects.charge(
                points,
                this.layout.cellSize,
                tubeColour(set, flow),
                this.reducedMotion ? 0 : flow * 70,
            );
        });
        const centre = {
            x: this.layout.boardX + this.layout.boardSize / 2,
            y: this.layout.boardY + this.layout.boardSize / 2,
        };
        for (let flow = 0; flow < this.game.flowCount; flow++) {
            this.ambience.burst(centre.x, centre.y, this.layout.boardSize * 0.9, 3, tubeColour(set, flow));
        }
        this.callbacks.sfx("solve");
        this.callbacks.haptic("success");
        const delay = this.reducedMotion ? 350 : 950;
        this.tweens.addTween(
            () => {},
            0,
            1,
            ease.linear,
            () => {
                this.celebrating = false;
                this.callbacks.onSolvedShown();
            },
            { durationMs: delay },
        );
    }

    // -----------------------------------------------------------------------
    // Driven from the shell
    // -----------------------------------------------------------------------

    /** Redraw after the shell changed the game (undo, restart, hint). */
    commitExternal(result: MoveResult | null, hintedFlow = -1): void {
        this.cancelPointer();
        this.redraw();
        if (!result?.changed) return;
        if (hintedFlow >= 0) {
            const colour = tubeColour(palette(this.paletteId), hintedFlow);
            const points = this.game.pathOf(hintedFlow).map((cell) => cellCentre(this.layout, cell));
            this.effects.charge(points, this.layout.cellSize, colour);
            this.popOrbs(hintedFlow);
            this.callbacks.sfx("hint");
        }
        this.afterCommit(result);
    }

    /** Swap in a new level without tearing down the renderer. */
    loadGame(game: FlowGame): void {
        this.cancelPointer();
        this.effects.clear();
        this.tweens.clear();
        this.celebrating = false;
        this.game = game;
        this.boardKey = "";
        this.layout = this.computeLayout();
        this.buildOrbs();
        this.applyLayout();
        this.redraw();
        this.introduce();
    }

    /** The board powers up: orbs pop in from the centre outward. */
    introduce(): void {
        if (this.reducedMotion) return;
        const centre = (this.game.size - 1) / 2;
        let index = 0;
        this.game.puzzle.flows.forEach((flow) => {
            for (const end of [flow.a, flow.b]) {
                const sprite = this.orbs[index++];
                if (!sprite) continue;
                const base = this.layout.cellSize * TUBE.orb * 4.2;
                const distance = Math.hypot(end.x - centre, end.y - centre);
                sprite.width = 0;
                sprite.height = 0;
                this.tweens.addTween(
                    (value) => {
                        if (sprite.destroyed) return;
                        sprite.width = base * value;
                        sprite.height = base * value;
                    },
                    0,
                    1,
                    ease.outBack,
                    undefined,
                    { durationMs: 340, delayMs: 60 + distance * 55 },
                );
            }
        });
    }

    private cancelPointer(): void {
        if (this.pointerId >= 0) {
            this.pointerId = -1;
            this.pointer = null;
            this.lastCell = -1;
            this.game.cancelDrag();
            this.callbacks.onDragChanged(false);
            this.setCursor("default");
        }
    }

    setReducedMotion(reduced: boolean): void {
        this.reducedMotion = reduced;
        this.effects.setReducedMotion(reduced);
        this.ambience.setReducedMotion(reduced);
    }

    setQuality(quality: "high" | "low"): void {
        this.quality = quality;
        this.effects.setQuality(quality);
        this.ambience.setQuality(quality);
    }

    setInsets(insets: Insets): void {
        this.insets = insets;
        this.layout = this.computeLayout();
        this.applyLayout();
        this.redraw();
    }

    setPalette(paletteId: PaletteId): void {
        if (paletteId === this.paletteId) return;
        this.paletteId = paletteId;
        const previous = this.textures;
        this.textures = createNeonTextures(paletteId);
        this.effects.clear();
        this.effects.destroy();
        this.effects = createEffects(this.fxLayer, this.textures, this.reducedMotion, this.quality);
        this.ambience.setPalette(palette(paletteId));
        this.boardKey = "";
        this.buildOrbs();
        this.applyLayout();
        this.redraw();
        previous.destroy();
    }

    /**
     * Real positions for the QA harness, in CLIENT pixels. The harness drags
     * the intended solution through these, so a pass proves the whole input →
     * rules → render path, not just that nothing threw.
     */
    qaGeometry(): {
        size: number;
        cell: (index: number) => { clientX: number; clientY: number };
        solution: Array<Array<{ clientX: number; clientY: number }>>;
        movesCommitted: number;
        status: string;
    } {
        const rect = this.app.canvas.getBoundingClientRect();
        const scale = this.stage.scale() || 1;
        const toClient = (index: number) => {
            const centre = cellCentre(this.layout, index);
            return { clientX: rect.left + centre.x * scale, clientY: rect.top + centre.y * scale };
        };
        return {
            size: this.game.size,
            cell: toClient,
            solution: this.game.solutionPaths.map((path) => path.map(toClient)),
            movesCommitted: this.movesCommitted,
            status: this.game.status,
        };
    }

    private readonly tick = (): void => {
        if (this.destroyed) return;
        const dt = this.app.ticker.deltaMS / 1_000;
        this.elapsed += dt;
        this.tweens.update(dt);
        this.effects.update(dt);
        this.ambience.update(dt);

        // Unconnected endpoints breathe, so what is left to do is always legible.
        if (!this.reducedMotion) {
            const paths = this.game.livePaths();
            let orb = 0;
            for (let flow = 0; flow < this.game.flowCount; flow++) {
                const connected = this.game.isConnected(flow, paths);
                const alpha = connected ? 1 : 0.82 + Math.sin(this.elapsed * 3 + flow * 0.9) * 0.18;
                for (let end = 0; end < 2; end++) {
                    const sprite = this.orbs[orb++];
                    if (sprite) sprite.alpha = alpha;
                }
            }
            if (this.pointer) this.drawHead();
        }
    };

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.app.ticker.remove(this.tick);
        this.offResize();
        this.root.off("pointerdown", this.onPointerDown);
        this.root.off("pointermove", this.onPointerMove);
        this.root.off("pointerup", this.onPointerUp);
        this.root.off("pointerupoutside", this.onPointerUp);
        this.root.off("pointercancel", this.onPointerCancel);
        this.tweens.clear();
        this.effects.destroy();
        this.ambience.destroy();
        this.boardBase.texture?.destroy(true);
        this.stageLight.texture?.destroy(true);
        this.root.destroy({ children: true });
        this.textures.destroy();
    }
}
