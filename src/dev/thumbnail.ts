/**
 * The 512x512 store tile, rendered from the game's own art.
 *
 * It calls `drawBoard` — the exact function the menu and level previews use,
 * built from the same proportions as the live board — so the tile physically
 * cannot show a tube the game does not draw. It shows the verb of the game: a
 * board part-solved with one tube mid-stroke, its halo around the finger.
 *
 * Development-only: reached solely by `scripts/thumbnail.html`, which is never
 * part of the production build.
 */
import { occupancyOf, showcaseBoard } from "../game/art/backdrop.ts";
import { colourPoolCanvas } from "../game/art/light.ts";
import { context2d, createCanvas, drawBoard, drawStage } from "../game/art/neon.ts";
import { css, palette, shade, tubeColour } from "../game/art/palette.ts";
import { GAME_NAME } from "../game/constants.ts";

const SIZE = 512;

export function renderThumbnail(): string {
    const canvas = createCanvas(SIZE, SIZE);
    const ctx = context2d(canvas);
    const set = palette("arcade");
    drawStage(ctx, SIZE, SIZE, set);

    // Mid-solve: every flow drawn but one, which is half-way through a stroke.
    const solved = showcaseBoard();
    const active = 2;
    const paths = solved.paths.map((path, flow) =>
        flow === active ? path.slice(0, Math.ceil(path.length / 2)) : path,
    );
    const art = { ...solved, paths };

    const boardSize = SIZE * 0.74;
    const boardX = (SIZE - boardSize) / 2;
    const boardY = SIZE * 0.07;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.6;
    const pool = boardSize * 1.7;
    ctx.drawImage(
        colourPoolCanvas(occupancyOf(art), set, art.size),
        boardX + boardSize / 2 - pool / 2,
        boardY + boardSize / 2 - pool / 2,
        pool,
        pool,
    );
    ctx.restore();
    drawBoard(ctx, boardX, boardY, boardSize, art, set);

    // The finger halo at the head of the active tube.
    const head = paths[active]?.[paths[active].length - 1];
    if (head !== undefined) {
        const cell = boardSize / art.size;
        const x = boardX + ((head % art.size) + 0.5) * cell;
        const y = boardY + (Math.floor(head / art.size) + 0.5) * cell;
        const colour = tubeColour(set, active);
        ctx.save();
        ctx.fillStyle = css(colour, 0.14);
        ctx.strokeStyle = css(colour, 0.6);
        ctx.lineWidth = cell * 0.06;
        ctx.beginPath();
        ctx.arc(x, y, cell * 1.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    const fade = ctx.createLinearGradient(0, SIZE * 0.68, 0, SIZE);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(1, css(shade(set.bench, -0.85), 0.96));
    ctx.fillStyle = fade;
    ctx.fillRect(0, SIZE * 0.68, SIZE, SIZE * 0.32);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = '900 58px ui-rounded, "SF Pro Rounded", "Avenir Next", system-ui, sans-serif';
    ctx.shadowColor = css(set.tubes[5] ?? 0x2ff2ff, 0.9);
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#f4fbff";
    ctx.fillText(GAME_NAME, SIZE / 2, SIZE - 44);
    ctx.shadowBlur = 0;
    ctx.font = '700 17px ui-rounded, "SF Pro Rounded", "Avenir Next", system-ui, sans-serif';
    ctx.fillStyle = "#9fb0d8";
    ctx.fillText("CONNECT THE COLOURS · FILL THE BOARD", SIZE / 2, SIZE - 18);
    ctx.restore();

    return canvas.toDataURL("image/jpeg", 0.92);
}
