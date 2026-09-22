/**
 * Where everything sits, in design units.
 *
 * Pure geometry: no Pixi, no state. The scene lays itself out from this, and
 * the QA harness asks the scene for real cell positions rather than guessing
 * from the viewport — a harness that guesses taps empty stage.
 *
 * Portrait: HUD across the top, the board centred in the room left, the action
 * bar along the bottom. Landscape: the board on the left at full height, and
 * every DOM control in a right-hand rail. THE RESERVES BELOW ARE MIRRORED IN
 * app.css (`--hud-reserve`, `--bar-reserve`, `--rail-width`). Change one,
 * change the other: they are the only thing keeping the DOM off the board.
 */

export interface Insets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Portrait: room for the level header + progress strip above the board. */
export const HUD_RESERVE = 250;
/** Portrait: room for the action bar under the board. */
export const BAR_RESERVE = 150;
/** Landscape: the rail every DOM control is confined to. */
export const RAIL_WIDTH_LANDSCAPE = 380;

const SIDE_MARGIN = 22;
const MIN_BOARD = 240;
const BEZEL_RATIO = 0.16;
const PANEL_MARGIN_LANDSCAPE = 18;
const RAIL_BOARD_GAP = 30;

export interface SceneLayout {
    width: number;
    height: number;
    /** The board's grid, excluding its bezel. */
    boardX: number;
    boardY: number;
    boardSize: number;
    columns: number;
    cellSize: number;
    bezel: number;
}

/**
 * The composition never uses more than this much of the design space. Once
 * the scale is capped (stage.ts MAX_UNIT_PX) a desktop window hands the scene
 * MORE design units than a phone does; the layout works inside a box of the
 * designed size, centred, and the extra units are stage around it.
 */
const MAX_BOX_SHORT = 720;
const MAX_BOX_ASPECT = 2.2;

export interface ContentBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function contentBox(width: number, height: number): ContentBox {
    const landscape = width > height;
    const short = Math.min(landscape ? height : width, MAX_BOX_SHORT);
    const long = Math.min(landscape ? width : height, short * MAX_BOX_ASPECT);
    const boxWidth = landscape ? long : short;
    const boxHeight = landscape ? short : long;
    return { x: (width - boxWidth) / 2, y: (height - boxHeight) / 2, width: boxWidth, height: boxHeight };
}

export function computeLayout(width: number, height: number, columns: number, insets: Insets = NO_INSETS): SceneLayout {
    const box = contentBox(width, height);
    const landscape = width > height;

    let boardSize: number;
    let boardX: number;
    let boardY: number;

    if (landscape) {
        const top = box.y + Math.max(PANEL_MARGIN_LANDSCAPE, insets.top);
        const bottom = box.y + box.height - Math.max(PANEL_MARGIN_LANDSCAPE, insets.bottom);
        const left = box.x + Math.max(SIDE_MARGIN, insets.left);
        const railX = box.x + box.width - Math.max(SIDE_MARGIN, insets.right) - RAIL_WIDTH_LANDSCAPE;
        const roomW = railX - RAIL_BOARD_GAP - left;
        const roomH = bottom - top;
        boardSize = Math.max(MIN_BOARD, Math.min(roomW, roomH) / (1 + (BEZEL_RATIO * 2) / columns));
        boardX = left + (roomW - boardSize) / 2;
        boardY = top + (roomH - boardSize) / 2;
    } else {
        const top = box.y + insets.top + HUD_RESERVE;
        const bottom = box.y + box.height - insets.bottom - BAR_RESERVE;
        const side = Math.max(SIDE_MARGIN, insets.left, insets.right);
        const roomW = box.width - side * 2;
        const roomH = bottom - top;
        boardSize = Math.max(MIN_BOARD, Math.min(roomW, roomH) / (1 + (BEZEL_RATIO * 2) / columns));
        boardX = box.x + (box.width - boardSize) / 2;
        // A hair above centre: the thumb lives low, and the eye reads a board
        // sitting slightly high as balanced rather than sinking.
        boardY = top + Math.max(0, (roomH - boardSize) * 0.46);
    }

    const cellSize = boardSize / columns;
    return {
        width,
        height,
        boardX,
        boardY,
        boardSize,
        columns,
        cellSize,
        bezel: Math.max(4, cellSize * BEZEL_RATIO),
    };
}

/** Centre of a board cell, in design units. */
export function cellCentre(layout: SceneLayout, index: number): { x: number; y: number } {
    return {
        x: layout.boardX + ((index % layout.columns) + 0.5) * layout.cellSize,
        y: layout.boardY + (Math.floor(index / layout.columns) + 0.5) * layout.cellSize,
    };
}

/** Top-left of a board cell. */
export function cellOrigin(layout: SceneLayout, index: number): { x: number; y: number } {
    return {
        x: layout.boardX + (index % layout.columns) * layout.cellSize,
        y: layout.boardY + Math.floor(index / layout.columns) * layout.cellSize,
    };
}

/**
 * Cell index under a design-unit point, or -1 off the board.
 *
 * `slack` extends the hit area past the board edge by a fraction of a cell and
 * clamps into the edge row/column, so a finger drifting just off the board
 * while drawing along the rim keeps drawing instead of dropping the flow.
 */
export function cellAtPoint(layout: SceneLayout, pointX: number, pointY: number, slack = 0): number {
    const fx = (pointX - layout.boardX) / layout.cellSize;
    const fy = (pointY - layout.boardY) / layout.cellSize;
    if (fx < -slack || fy < -slack || fx >= layout.columns + slack || fy >= layout.columns + slack) return -1;
    const x = Math.max(0, Math.min(layout.columns - 1, Math.floor(fx)));
    const y = Math.max(0, Math.min(layout.columns - 1, Math.floor(fy)));
    return y * layout.columns + x;
}
