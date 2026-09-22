/**
 * Pixi textures, generated from the Canvas2D art in `neon.ts`.
 *
 * One cache per tube set. Everything is drawn once at a fixed resolution and
 * scaled by the stage. The cache owns its textures and must be destroyed with
 * the scene — a leaked atlas survives a route change and quietly doubles on
 * the next mount.
 */
import { Texture } from "pixi.js";
import { orbCanvas, sparkCanvas, stageCanvas } from "./neon.ts";
import { type PaletteId, palette, type TubePalette, tubeColour } from "./palette.ts";

const ORB_PIXELS = 160;
const SPARK_PIXELS = 48;
/** The stage is one fitted texture at the viewport's aspect, capped. */
const STAGE_MAX_PIXELS = 640;

export interface NeonTextures {
    readonly palette: TubePalette;
    /** An endpoint orb for flow `index`, halo included (anchor 0.5). */
    orb(flow: number): Texture;
    spark(): Texture;
    /** The stage at the given aspect. Regenerated only when it changes. */
    stage(width: number, height: number): Texture;
    destroy(): void;
}

export function createNeonTextures(paletteId: PaletteId): NeonTextures {
    const active = palette(paletteId);
    const cache = new Map<string, Texture>();

    const remember = (key: string, create: () => HTMLCanvasElement): Texture => {
        const existing = cache.get(key);
        if (existing) return existing;
        const texture = Texture.from(create());
        cache.set(key, texture);
        return texture;
    };

    return {
        palette: active,
        orb(flow) {
            return remember(`orb:${flow}`, () => orbCanvas(ORB_PIXELS, tubeColour(active, flow)));
        },
        spark() {
            return remember("spark", () => sparkCanvas(SPARK_PIXELS));
        },
        stage(width, height) {
            const aspect = Math.max(0.2, Math.min(5, height / Math.max(1, width)));
            const bucket = Math.round(aspect * 8) / 8;
            const stageWidth = aspect >= 1 ? STAGE_MAX_PIXELS : Math.round(STAGE_MAX_PIXELS / bucket);
            const stageHeight = aspect >= 1 ? Math.round(STAGE_MAX_PIXELS * bucket) : STAGE_MAX_PIXELS;
            return remember(`stage:${bucket}`, () => stageCanvas(stageWidth, stageHeight, active));
        },
        destroy() {
            for (const texture of cache.values()) texture.destroy(true);
            cache.clear();
        },
    };
}
