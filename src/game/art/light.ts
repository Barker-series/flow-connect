/**
 * Light: everything on the stage that is not the board.
 *
 * The signature of neon is not the tube — it is the coloured light the tube
 * throws onto everything around it. `colourPool` is that: a blurred smear of
 * whatever is currently lit on the board, painted onto the stage under the
 * bezel in additive blend. It costs one small canvas per board change, and it
 * is why the stage visibly lights up as the player connects flows.
 *
 * Same rule as the rest of `art/`: Canvas2D in, no Pixi, one generator.
 */

import { context2d, createCanvas } from "./neon.ts";
import { boost, css, type TubePalette, tubeColour } from "./palette.ts";

/** Resolution of the colour pool before it is stretched over the stage. */
const POOL_PIXELS = 64;

/**
 * Margin around the pool texture, in the same pixels.
 *
 * Each cell's glow is a radial gradient wider than the cell, so a cell on an
 * edge of the board falls off PAST the board. Without this margin that falloff
 * hit the edge of the canvas and stopped dead — and because the sprite is then
 * blown up to well over the panel's size, the flat cut showed as a hard
 * straight line of light beside the board.
 */
const POOL_PAD = 14;
const POOL_CANVAS = POOL_PIXELS + POOL_PAD * 2;

/** How much bigger the texture is than the board it represents. */
export const POOL_OVERSCAN = POOL_CANVAS / POOL_PIXELS;

/** A dust mote: a soft round dot with no hard edge at any scale. */
export function moteCanvas(size: number): HTMLCanvasElement {
    const canvas = createCanvas(size, size);
    const ctx = context2d(canvas);
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(225,235,255,0.95)");
    gradient.addColorStop(0.4, "rgba(210,225,255,0.4)");
    gradient.addColorStop(1, "rgba(200,220,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return canvas;
}

/** A soft white circular bloom, tinted per use (connect bursts, banners). */
export function bloomCanvas(size: number): HTMLCanvasElement {
    const canvas = createCanvas(size, size);
    const ctx = context2d(canvas);
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.25, "rgba(255,255,255,0.42)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0.12)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return canvas;
}

/**
 * The stage's own lighting: a cool pool where the board sits, falling away to
 * near-black at the edges.
 *
 * Generated as a texture rather than drawn as Graphics because an ellipse fill
 * has a hard edge — on a dark stage that edge reads as a bright band smeared
 * across the middle of the screen, which is worse than no lighting at all.
 */
export function benchLightCanvas(width: number, height: number, focusY: number): HTMLCanvasElement {
    const canvas = createCanvas(width, height);
    const ctx = context2d(canvas);
    const short = Math.min(width, height);

    const pool = ctx.createRadialGradient(
        width * 0.5,
        height * focusY,
        short * 0.05,
        width * 0.5,
        height * focusY,
        short * 1.15,
    );
    pool.addColorStop(0, "rgba(190,210,255,0.14)");
    pool.addColorStop(0.42, "rgba(170,190,255,0.04)");
    pool.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, width, height);

    // Corners fall away, so the panel is the only place the eye settles.
    const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * focusY,
        short * 0.3,
        width * 0.5,
        height * focusY,
        Math.hypot(width, height) * 0.72,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.55, "rgba(0,0,0,0.24)");
    vignette.addColorStop(1, "rgba(0,0,0,0.66)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    return canvas;
}

/**
 * The colour the board is currently throwing, as a blurred smear.
 *
 * Each covered cell contributes one radial blob of its flow's colour, boosted
 * well past its on-screen value because this is composited additively at low
 * alpha. Empty cells contribute nothing, so an empty board throws no light —
 * which is exactly right, and is what makes solving feel like switching the
 * room on.
 *
 * @param cells `-1` for empty, otherwise the flow index, row-major.
 */
export function colourPoolCanvas(cells: ArrayLike<number>, set: TubePalette, columns: number): HTMLCanvasElement {
    const canvas = createCanvas(POOL_CANVAS, POOL_CANVAS);
    const ctx = context2d(canvas);
    const rows = Math.max(1, Math.ceil(cells.length / columns));
    const cellW = POOL_PIXELS / columns;
    const cellH = POOL_PIXELS / rows;
    // Blobs overlap by design: the overlap is the blur, and it costs nothing.
    const radius = Math.max(cellW, cellH) * 1.15;

    ctx.globalCompositeOperation = "lighter";
    for (let index = 0; index < columns * rows; index++) {
        const flow = cells[index] ?? -1;
        if (flow < 0) continue;
        const colour = tubeColour(set, flow);
        const cx = POOL_PAD + (index % columns) * cellW + cellW / 2;
        const cy = POOL_PAD + Math.floor(index / columns) * cellH + cellH / 2;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, css(boost(colour, 1.4), 0.5));
        gradient.addColorStop(0.45, css(colour, 0.14));
        gradient.addColorStop(1, css(colour, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
    return canvas;
}
