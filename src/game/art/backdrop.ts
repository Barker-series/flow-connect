/**
 * The menu backdrop, composed from the game's own board.
 *
 * The template sets a quality bar with real menu art and forbids regressing to
 * anonymous CSS gradients. FLOW CONNECT keeps the bar and ships no image files:
 * the backdrop is drawn at boot by the same `drawBoard` the level previews and
 * the store tile use, so the menu is literally a photograph of a solved board,
 * at any resolution, in whichever tube set the player has selected.
 */
import { packLevel } from "../flow/levels.ts";
import { FlowGame } from "../flow/game.ts";
import { colourPoolCanvas } from "./light.ts";
import { type BoardArt, context2d, createCanvas, drawBoard, drawStage } from "./neon.ts";
import { css, type PaletteId, palette, shade } from "./palette.ts";

export interface BackdropOptions {
    width: number;
    height: number;
    paletteId: PaletteId;
    /** Fraction of the short edge the board occupies. */
    boardScale?: number;
    /** Where the board's centre sits, as fractions of width/height. */
    centreX?: number;
    centreY?: number;
    /** Radians. A hair off-square reads as a device on a desk. */
    tilt?: number;
    /** Draw the hero board. The store tile composes its own. */
    showBoard?: boolean;
    /** How hard the vignette bites, 0..1. */
    vignette?: number;
}

/** A solved showcase board: the last level of the second pack, fully drawn. */
export function showcaseBoard(): BoardArt {
    const puzzle = packLevel("current", 24) ?? packLevel("spark", 0);
    if (!puzzle) return { size: 5, flows: [], paths: [] };
    const game = new FlowGame(puzzle);
    return { size: puzzle.size, flows: puzzle.flows, paths: game.solutionPaths };
}

/** The flow index covering each cell of a solved board (for the light pool). */
export function occupancyOf(art: BoardArt): number[] {
    const cells = new Array<number>(art.size * art.size).fill(-1);
    art.paths.forEach((path, flow) => {
        for (const cell of path) cells[cell] = flow;
    });
    return cells;
}

export function drawBackdrop(ctx: CanvasRenderingContext2D, options: BackdropOptions): void {
    const { width, height } = options;
    const set = palette(options.paletteId);
    const short = Math.min(width, height);

    drawStage(ctx, width, height, set);

    const boardSize = short * (options.boardScale ?? 0.66);
    if (options.showBoard !== false) {
        const art = showcaseBoard();
        const centreX = width * (options.centreX ?? 0.5);
        const centreY = height * (options.centreY ?? 0.44);

        // The light the board throws — what ties the menu to the live board,
        // where the same pool is derived from the player's own tubes.
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.55;
        const poolSize = boardSize * 2;
        ctx.translate(centreX, centreY);
        ctx.rotate(options.tilt ?? -0.06);
        ctx.drawImage(
            colourPoolCanvas(occupancyOf(art), set, art.size),
            -poolSize / 2,
            -poolSize / 2,
            poolSize,
            poolSize,
        );
        ctx.restore();

        ctx.save();
        ctx.translate(centreX, centreY);
        ctx.rotate(options.tilt ?? -0.06);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(-boardSize / 2 + boardSize * 0.03, -boardSize / 2 + boardSize * 0.06, boardSize, boardSize);
        drawBoard(ctx, -boardSize / 2, -boardSize / 2, boardSize, art, set);
        ctx.restore();
    }

    // Scrim: the backdrop is atmosphere, never competing with the menu type.
    const bite = Math.max(0, Math.min(1, options.vignette ?? 1));
    ctx.fillStyle = `rgba(4,5,12,${0.42 * bite})`;
    ctx.fillRect(0, 0, width, height);

    const floor = ctx.createRadialGradient(
        width * 0.5,
        height * 1.05,
        0,
        width * 0.5,
        height * 1.05,
        Math.max(width, height) * 0.9,
    );
    floor.addColorStop(0, css(set.tubes[1] ?? 0x2f86ff, 0.16));
    floor.addColorStop(1, css(set.tubes[1] ?? 0x2f86ff, 0));
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createLinearGradient(0, 0, 0, height);
    vignette.addColorStop(0, css(shade(set.bench, -0.7), 0.55 * bite));
    vignette.addColorStop(0.36, "rgba(0,0,0,0)");
    vignette.addColorStop(1, css(shade(set.bench, -0.8), 0.35 * bite));
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
}

export function backdropDataUrl(options: BackdropOptions): string {
    const canvas = createCanvas(options.width, options.height);
    drawBackdrop(context2d(canvas), options);
    return canvas.toDataURL("image/jpeg", 0.86);
}
