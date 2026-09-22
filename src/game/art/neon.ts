/**
 * Every piece of FLOW CONNECT art, as Canvas2D drawing functions.
 *
 * The single generator (DESIGN.md §8). The Pixi textures in `textures.ts`, the
 * menu backdrop, the level-select previews, the Studio swatches, and the
 * 512x512 store tile all call the functions below — so a preview physically
 * cannot show a tube the board does not draw. The live board draws its tubes
 * with Pixi Graphics for speed, but from the SAME proportions exported here.
 *
 * Nothing here knows about Pixi. Every function draws into a caller-supplied
 * context at a caller-supplied rect; only the explicit `*Canvas` helpers at the
 * bottom allocate.
 */
import { boost, css, mix, shade, type TubePalette, tubeColour } from "./palette.ts";

/**
 * Tube proportions, as fractions of one cell. Shared by the canvas art and the
 * live Pixi board so the two can never drift.
 */
export const TUBE = Object.freeze({
    /** The bright core of a tube. */
    core: 0.34,
    /** The soft neon bloom around it. */
    glow: 0.78,
    /** The hot white filament down the middle. */
    filament: 0.1,
    /** An endpoint orb's radius. */
    orb: 0.36,
    /** How strongly a covered cell is tinted with its flow's colour. */
    cellTint: 0.2,
});

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/**
 * The bezel and the grid under the tubes. One continuous surface with the grid
 * scored into it, so empty cells read as sockets and covered cells take the
 * tint of what runs through them.
 */
export function drawBoardBase(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    columns: number,
    set: TubePalette,
): void {
    const cell = size / columns;
    const bezel = Math.max(4, cell * 0.16);
    ctx.save();

    // Bezel: a lit face over a side wall, the same single light as the UI.
    roundRect(ctx, x - bezel, y - bezel + bezel * 0.35, size + bezel * 2, size + bezel * 2, bezel * 1.6);
    ctx.fillStyle = css(shade(set.frame, -0.45));
    ctx.fill();
    roundRect(ctx, x - bezel, y - bezel, size + bezel * 2, size + bezel * 2, bezel * 1.6);
    const face = ctx.createLinearGradient(0, y - bezel, 0, y + size + bezel);
    face.addColorStop(0, css(shade(set.frame, 0.12)));
    face.addColorStop(1, css(set.frame));
    ctx.fillStyle = face;
    ctx.fill();

    // Well.
    roundRect(ctx, x, y, size, size, bezel);
    ctx.fillStyle = css(set.empty);
    ctx.fill();

    // Sockets.
    for (let row = 0; row < columns; row++) {
        for (let col = 0; col < columns; col++) {
            drawSocket(ctx, x + col * cell, y + row * cell, cell, set);
        }
    }
    ctx.restore();
}

/** An empty cell: a shallow socket with a faint lip. */
export function drawSocket(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, set: TubePalette): void {
    const inset = cell * 0.045;
    const r = cell * 0.16;
    roundRect(ctx, x + inset, y + inset, cell - inset * 2, cell - inset * 2, r);
    ctx.fillStyle = css(mix(set.empty, set.grid, 0.38));
    ctx.fill();
    ctx.save();
    ctx.clip();
    const sink = ctx.createLinearGradient(0, y, 0, y + cell);
    sink.addColorStop(0, "rgba(0,0,0,0.28)");
    sink.addColorStop(0.45, "rgba(0,0,0,0)");
    sink.addColorStop(1, "rgba(255,255,255,0.035)");
    ctx.fillStyle = sink;
    ctx.fillRect(x, y, cell, cell);
    ctx.restore();
}

// ---------------------------------------------------------------------------
// Tubes
// ---------------------------------------------------------------------------

/**
 * A tube through a list of cell centres. Drawn in passes — bloom, body, core,
 * filament — with round caps and joins so a corner is a smooth bend, not a
 * mitre. Used for the static art; the board draws the same passes live.
 */
export function drawTube(
    ctx: CanvasRenderingContext2D,
    points: ReadonlyArray<{ x: number; y: number }>,
    cell: number,
    colour: number,
): void {
    if (points.length < 2) return;
    const trace = (): void => {
        ctx.beginPath();
        points.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        });
    };
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.globalCompositeOperation = "lighter";
    trace();
    ctx.strokeStyle = css(colour, 0.14);
    ctx.lineWidth = cell * TUBE.glow;
    ctx.stroke();
    trace();
    ctx.strokeStyle = css(colour, 0.2);
    ctx.lineWidth = cell * TUBE.glow * 0.66;
    ctx.stroke();

    ctx.globalCompositeOperation = "source-over";
    trace();
    ctx.strokeStyle = css(shade(colour, -0.28));
    ctx.lineWidth = cell * TUBE.core * 1.12;
    ctx.stroke();
    trace();
    ctx.strokeStyle = css(colour);
    ctx.lineWidth = cell * TUBE.core;
    ctx.stroke();
    trace();
    ctx.strokeStyle = css(mix(boost(colour, 1.3), 0xffffff, 0.55), 0.85);
    ctx.lineWidth = cell * TUBE.filament;
    ctx.stroke();
    ctx.restore();
}

/** Tint the cells a flow covers — the "filled" read of the board. */
export function drawCellTint(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cell: number,
    colour: number,
    alpha: number = TUBE.cellTint,
): void {
    const inset = cell * 0.045;
    roundRect(ctx, x + inset, y + inset, cell - inset * 2, cell - inset * 2, cell * 0.16);
    ctx.fillStyle = css(colour, alpha);
    ctx.fill();
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * An endpoint orb: a lit sphere of the flow's colour with a glass highlight.
 * Drawn centred in a `size`-square so a texture can be anchored at 0.5.
 */
export function drawOrb(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, colour: number): void {
    ctx.save();
    // Halo.
    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius * 1.9);
    halo.addColorStop(0, css(colour, 0.42));
    halo.addColorStop(1, css(colour, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // Rim.
    ctx.beginPath();
    ctx.arc(cx, cy + radius * 0.06, radius, 0, Math.PI * 2);
    ctx.fillStyle = css(shade(colour, -0.5));
    ctx.fill();

    // Body.
    const body = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius * 1.02);
    body.addColorStop(0, css(mix(boost(colour, 1.25), 0xffffff, 0.4)));
    body.addColorStop(0.45, css(colour));
    body.addColorStop(1, css(shade(colour, -0.32)));
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.94, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();

    // Specular.
    ctx.beginPath();
    ctx.ellipse(cx - radius * 0.3, cy - radius * 0.42, radius * 0.38, radius * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();
    ctx.restore();
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

/**
 * The stage behind the board: a deep field with one soft key light, and a
 * faint receding grid so the dark reads as space rather than as nothing.
 */
export function drawStage(ctx: CanvasRenderingContext2D, width: number, height: number, set: TubePalette): void {
    ctx.save();
    const wash = ctx.createLinearGradient(0, 0, width * 0.3, height);
    wash.addColorStop(0, css(shade(set.bench, 0.1)));
    wash.addColorStop(0.55, css(set.bench));
    wash.addColorStop(1, css(shade(set.bench, -0.45)));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    const unit = Math.max(width, height);
    const key = ctx.createRadialGradient(width * 0.5, height * 0.3, 0, width * 0.5, height * 0.3, unit * 0.8);
    key.addColorStop(0, css(shade(set.grid, 0.1), 0.35));
    key.addColorStop(1, css(set.grid, 0));
    ctx.fillStyle = key;
    ctx.fillRect(0, 0, width, height);

    // A dot lattice, fading toward the edges.
    const step = Math.max(18, Math.round(Math.min(width, height) / 22));
    ctx.fillStyle = css(shade(set.grid, 0.25), 0.22);
    for (let y = step / 2; y < height; y += step) {
        for (let x = step / 2; x < width; x += step) {
            const dx = (x - width / 2) / (width / 2);
            const dy = (y - height * 0.4) / (height / 2);
            const fade = Math.max(0, 1 - Math.hypot(dx, dy) * 0.8);
            if (fade <= 0.02) continue;
            ctx.globalAlpha = fade;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(0.8, step * 0.05), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

// ---------------------------------------------------------------------------
// Composite: a whole solved (or part-solved) board
// ---------------------------------------------------------------------------

export interface BoardArt {
    size: number;
    flows: ReadonlyArray<{ a: { x: number; y: number }; b: { x: number; y: number } }>;
    /** Ordered cell-index paths per flow; may be partial or empty. */
    paths: ReadonlyArray<ReadonlyArray<number>>;
}

/**
 * A board as the live scene would draw it. The menu backdrop, the level-select
 * previews, and the store tile are all this.
 */
export function drawBoard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    art: BoardArt,
    set: TubePalette,
    options: { orbs?: boolean } = {},
): void {
    const cell = size / art.size;
    drawBoardBase(ctx, x, y, size, art.size, set);
    const centre = (index: number) => ({
        x: x + ((index % art.size) + 0.5) * cell,
        y: y + (Math.floor(index / art.size) + 0.5) * cell,
    });
    art.paths.forEach((path, flow) => {
        const colour = tubeColour(set, flow);
        for (const index of path) {
            drawCellTint(ctx, x + (index % art.size) * cell, y + Math.floor(index / art.size) * cell, cell, colour);
        }
    });
    art.paths.forEach((path, flow) => {
        drawTube(ctx, path.map(centre), cell, tubeColour(set, flow));
    });
    if (options.orbs !== false) {
        art.flows.forEach((flow, index) => {
            const colour = tubeColour(set, index);
            for (const end of [flow.a, flow.b]) {
                drawOrb(ctx, x + (end.x + 0.5) * cell, y + (end.y + 0.5) * cell, cell * TUBE.orb, colour);
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Canvas factories
// ---------------------------------------------------------------------------

export function createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is unavailable");
    return ctx;
}

/** An endpoint orb texture: the orb centred in a square with room for its halo. */
export function orbCanvas(size: number, colour: number): HTMLCanvasElement {
    const canvas = createCanvas(size, size);
    drawOrb(context2d(canvas), size / 2, size / 2, size / 4.2, colour);
    return canvas;
}

/** A spark: a four-point star, for connect bursts and the solve celebration. */
export function sparkCanvas(size: number): HTMLCanvasElement {
    const canvas = createCanvas(size, size);
    const ctx = context2d(canvas);
    const half = size / 2;
    const glow = ctx.createRadialGradient(half, half, 0, half, half, half);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.25, "rgba(255,255,255,0.55)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.quadraticCurveTo(half, half, size, half);
    ctx.quadraticCurveTo(half, half, half, size);
    ctx.quadraticCurveTo(half, half, 0, half);
    ctx.quadraticCurveTo(half, half, half, 0);
    ctx.fill();
    return canvas;
}

export function stageCanvas(width: number, height: number, set: TubePalette): HTMLCanvasElement {
    const canvas = createCanvas(width, height);
    drawStage(context2d(canvas), width, height, set);
    return canvas;
}

/** A small board thumbnail as a data URL, for the level grid and Studio cards. */
export function boardPreviewDataUrl(art: BoardArt, set: TubePalette, pixels = 120): string {
    const canvas = createCanvas(pixels, pixels);
    const ctx = context2d(canvas);
    const pad = pixels * 0.07;
    drawBoard(ctx, pad, pad, pixels - pad * 2, art, set);
    return canvas.toDataURL("image/png");
}

/** Ten tubes as a swatch strip for the Studio cards. */
export function paletteSwatchDataUrl(set: TubePalette, width = 150, height = 52): string {
    const canvas = createCanvas(width, height);
    const ctx = context2d(canvas);
    ctx.fillStyle = css(set.empty);
    roundRect(ctx, 0, 0, width, height, 8);
    ctx.fill();
    const columns = 5;
    const cell = Math.min(width / columns, height / 2);
    set.tubes.forEach((colour, index) => {
        const cx = (index % columns) * (width / columns) + width / columns / 2;
        const cy = Math.floor(index / columns) * cell + cell / 2 + (height - cell * 2) / 2;
        drawOrb(ctx, cx, cy, cell * 0.36, colour);
    });
    return canvas.toDataURL("image/png");
}
