/**
 * Tube sets — DESIGN.md §5.3 and §8.
 *
 * Ten colours per set, because a 9x9 board can carry ten flows and every flow
 * needs a hue a player can tell apart at a glance. Sets are purely cosmetic:
 * nothing here reaches the rules.
 *
 * Distinctness beats theme. A set is allowed a mood — a board tone and a hue
 * bias — but never at the cost of two tubes that read as the same colour on a
 * phone in daylight. `npm run test` checks the minimum distance between any
 * two tubes in every set, so a pretty palette cannot ship a broken puzzle.
 *
 * Value structure: dark board << bright saturated tubes. The tubes are the only
 * light source on screen; the board, the frame and the stage are all darker
 * than every tube in the set.
 */

export type PaletteId = "arcade" | "sorbet" | "circuit" | "aurora" | "synthwave" | "prism";

export interface TubePalette {
    id: PaletteId;
    name: string;
    /** One line of flavour, shown on the Studio card. */
    blurb: string;
    /** Exactly ten tube colours, flow 0 first. */
    tubes: readonly number[];
    /** The stage behind everything. */
    bench: number;
    /** The board's mount and the bezel around the grid. */
    frame: number;
    /** Grid lines between cells. */
    grid: number;
    /** An empty cell. */
    empty: number;
}

export const PALETTES: readonly TubePalette[] = [
    {
        id: "arcade",
        name: "ARCADE",
        blurb: "The house set. Ten clean neons on a midnight board.",
        tubes: [0xff3b4e, 0x2f86ff, 0x2fe06a, 0xffe03b, 0xff8a1f, 0x2ff2ff, 0xff4fd8, 0x9d6bff, 0xf4f4f4, 0xa8ff3b],
        bench: 0x121628,
        frame: 0x1d2340,
        grid: 0x2c3563,
        empty: 0x0c0f1e,
    },
    {
        id: "sorbet",
        name: "SORBET",
        blurb: "Soft light on a plum board. Easy on the eyes after dark.",
        tubes: [0xff7a8a, 0x7fb2ff, 0x7fe8a6, 0xffe58a, 0xffb07a, 0x8af2f0, 0xf59ce6, 0xb9a0ff, 0xfff4ea, 0xd2f58a],
        bench: 0x221629,
        frame: 0x33203c,
        grid: 0x4b3158,
        empty: 0x170f1c,
    },
    {
        id: "circuit",
        name: "CIRCUIT",
        blurb: "LEDs on solder mask. Every tube a trace on the board.",
        tubes: [0xff4a3d, 0x3da0ff, 0x7dff5a, 0xffd23d, 0xff9a3d, 0x3dffe0, 0xff5ab8, 0xb77dff, 0xfff3d6, 0xd4ff3d],
        bench: 0x0b1a14,
        frame: 0x13291f,
        grid: 0x1f4633,
        empty: 0x07130e,
    },
    {
        id: "aurora",
        name: "AURORA",
        blurb: "Cold pinks and mint, the light off a northern sky.",
        tubes: [0xff6f9f, 0x5fb5ff, 0x4dffc3, 0xfff07a, 0xffa56b, 0x6bf0ff, 0xe58cff, 0x8f8bff, 0xeafcff, 0xc3ff6b],
        bench: 0x111a2e,
        frame: 0x1a2744,
        grid: 0x2a3d6a,
        empty: 0x0a1122,
    },
    {
        id: "synthwave",
        name: "SYNTHWAVE",
        blurb: "Hot pink sun, chrome cyan, a grid to the horizon.",
        tubes: [0xff2e6e, 0x2ec5ff, 0x39ff9c, 0xffe14d, 0xff8a3d, 0x7dfff0, 0xff4dff, 0xa05cff, 0xfff0fa, 0xc8ff4d],
        bench: 0x1a0f2e,
        frame: 0x2a1648,
        grid: 0x46246e,
        empty: 0x120a22,
    },
    {
        id: "prism",
        name: "PRISM",
        blurb: "Jewel tones on black glass. The Power Pass exclusive.",
        tubes: [0xff2a3a, 0x2a6bff, 0x14e07a, 0xffd21a, 0xff7a0a, 0x14e6ff, 0xff2ac4, 0x8a4dff, 0xffffff, 0x9cff14],
        bench: 0x0a0a10,
        frame: 0x16161f,
        grid: 0x2a2a3a,
        empty: 0x050508,
    },
];

const BY_ID = new Map(PALETTES.map((entry) => [entry.id, entry]));

export const DEFAULT_PALETTE: PaletteId = "arcade";

/** Every set holds ten colours; the levels rely on this. */
export const PALETTE_COLOURS = 10;

export function isPaletteId(value: unknown): value is PaletteId {
    return typeof value === "string" && BY_ID.has(value as PaletteId);
}

export function palette(id: PaletteId | string): TubePalette {
    return BY_ID.get(id as PaletteId) ?? (BY_ID.get(DEFAULT_PALETTE) as TubePalette);
}

/** Tube colour for a flow index, wrapping safely. */
export function tubeColour(set: TubePalette, flow: number): number {
    const list = set.tubes;
    return list[((flow % list.length) + list.length) % list.length] ?? 0xffffff;
}

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

export interface Rgb {
    r: number;
    g: number;
    b: number;
}

export function toRgb(hex: number): Rgb {
    return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

export function fromRgb({ r, g, b }: Rgb): number {
    const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
    return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
}

/** CSS colour string, optionally with alpha. Canvas2D wants strings. */
export function css(hex: number, alpha = 1): string {
    const { r, g, b } = toRgb(hex);
    return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** Positive lightens toward white, negative darkens toward black. */
export function shade(hex: number, amount: number): number {
    const { r, g, b } = toRgb(hex);
    const target = amount >= 0 ? 255 : 0;
    const t = Math.min(1, Math.abs(amount));
    return fromRgb({ r: r + (target - r) * t, g: g + (target - g) * t, b: b + (target - b) * t });
}

/**
 * Raise value without touching hue or saturation ratio. `shade(c, +x)` mixes
 * toward white and turns neon into pastel; scaling the channels keeps a red
 * tube red all the way to its clipping point.
 */
export function boost(hex: number, factor: number): number {
    const { r, g, b } = toRgb(hex);
    return fromRgb({ r: r * factor, g: g * factor, b: b * factor });
}

export function mix(a: number, b: number, t: number): number {
    const from = toRgb(a);
    const to = toRgb(b);
    const k = Math.max(0, Math.min(1, t));
    return fromRgb({
        r: from.r + (to.r - from.r) * k,
        g: from.g + (to.g - from.g) * k,
        b: from.b + (to.b - from.b) * k,
    });
}
