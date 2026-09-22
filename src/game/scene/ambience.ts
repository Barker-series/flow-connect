/**
 * The space the board sits in.
 *
 * Two layers, neither interactive: motes drifting through the dark, and the
 * coloured light the board itself throws onto the stage.
 *
 * The colour pool is the one that matters. Neon is recognisable less by the
 * tube than by the light it casts on whatever is around it, and because the
 * pool is derived from the live board it does something useful too: the stage
 * visibly lights up as the player connects flows, and dims when they cut one.
 *
 * Everything here respects reduced motion by holding still rather than by
 * disappearing — the light is composition, not decoration.
 */
import { Container, Sprite, Texture } from "pixi.js";
import { bloomCanvas, colourPoolCanvas, moteCanvas, POOL_OVERSCAN } from "../art/light.ts";
import type { TubePalette } from "../art/palette.ts";
import { NoiseRandom } from "../noiseRandom.ts";

interface Mote {
    sprite: Sprite;
    /** Design units per second. */
    driftX: number;
    driftY: number;
    /** Radians per second through its own sine wobble. */
    wobbleRate: number;
    wobblePhase: number;
    wobbleUnits: number;
    baseAlpha: number;
    pulseRate: number;
}

export interface Ambience {
    /** Re-place the light for a new viewport. */
    layout(width: number, height: number, panel: { x: number; y: number; size: number }): void;
    /** Repaint the colour pool from the live board (`-1` empty, else flow). */
    setBoard(cells: ArrayLike<number>, columns: number): void;
    setPalette(palette: TubePalette): void;
    setReducedMotion(reduced: boolean): void;
    setQuality(quality: "high" | "low"): void;
    /** A bloom that swells and fades, tinted `colour`. */
    burst(x: number, y: number, size: number, strength: number, colour?: number): void;
    update(dtSeconds: number): void;
    destroy(): void;
}

const MOTE_COUNT = { high: 22, low: 8 } as const;

export interface AmbienceLayers {
    /** Drawn on the stage, beneath the bezel: the light the board casts. */
    under: Container;
    /** Drawn over everything: motes and connect blooms. */
    over: Container;
}

export function createAmbience(
    layers: AmbienceLayers,
    palette: TubePalette,
    reducedMotion: boolean,
    quality: "high" | "low",
): Ambience {
    // Seeded: the studio looks the same in a screenshot as it does in play,
    // which is what makes visual QA diffable at all.
    const random = new NoiseRandom(0x1_1ce_71, 0);
    let active = palette;
    let reduced = reducedMotion;
    let detail: "high" | "low" = quality;
    let elapsed = 0;

    let width = 0;
    let height = 0;

    const poolTexture = { current: null as Texture | null };
    const pool = new Sprite();
    pool.blendMode = "add";
    pool.alpha = 0.34;
    pool.anchor.set(0.5);

    const moteTexture = Texture.from(moteCanvas(32));
    const bloomTexture = Texture.from(bloomCanvas(128));

    const moteLayer = new Container();
    const bloomLayer = new Container();
    layers.under.addChild(pool);
    layers.over.addChild(moteLayer, bloomLayer);

    const motes: Mote[] = [];
    const blooms: Array<{ sprite: Sprite; life: number; lifeMs: number; size: number }> = [];

    function rebuildMotes(): void {
        for (const mote of motes) mote.sprite.destroy();
        motes.length = 0;
        if (reduced) return;
        const count = MOTE_COUNT[detail];
        for (let i = 0; i < count; i++) {
            const sprite = new Sprite(moteTexture);
            sprite.anchor.set(0.5);
            sprite.blendMode = "add";
            const size = random.float(2.6, 7.5);
            sprite.width = size;
            sprite.height = size;
            sprite.x = random.float(0, Math.max(1, width));
            sprite.y = random.float(0, Math.max(1, height));
            moteLayer.addChild(sprite);
            motes.push({
                sprite,
                // Drifting mostly sideways and slightly up reads as air moving;
                // straight down reads as snow.
                driftX: random.float(3, 11),
                driftY: random.float(-5, -1.2),
                wobbleRate: random.float(0.25, 0.8),
                wobblePhase: random.float(0, Math.PI * 2),
                wobbleUnits: random.float(4, 16),
                baseAlpha: random.float(0.18, 0.62),
                pulseRate: random.float(0.3, 0.9),
            });
        }
    }

    function repaintPool(cells: ArrayLike<number>, columns: number): void {
        const next = Texture.from(colourPoolCanvas(cells, active, columns));
        poolTexture.current?.destroy(true);
        poolTexture.current = next;
        pool.texture = next;
    }

    return {
        layout(nextWidth, nextHeight, panel) {
            width = nextWidth;
            height = nextHeight;

            // The pool spreads well past the panel — light does not stop at the
            // frame — but stays centred on it. The texture carries a margin so
            // an edge cell's glow can fall off inside it (see POOL_OVERSCAN);
            // the sprite has to grow by the same factor or the board's cells
            // would no longer line up with the glass casting the light.
            const spread = panel.size * 1.45 * POOL_OVERSCAN;
            pool.width = spread;
            pool.height = spread;
            pool.x = panel.x + panel.size / 2;
            pool.y = panel.y + panel.size / 2;

            if (motes.length === 0) rebuildMotes();
        },

        setBoard(cells, columns) {
            repaintPool(cells, columns);
        },

        setPalette(next) {
            active = next;
        },

        setReducedMotion(value) {
            reduced = value;
            rebuildMotes();
        },

        setQuality(value) {
            detail = value;
            rebuildMotes();
        },

        burst(x, y, size, strength, colour = 0xffffff) {
            if (reduced) return;
            const sprite = new Sprite(bloomTexture);
            sprite.anchor.set(0.5);
            sprite.blendMode = "add";
            sprite.tint = colour;
            sprite.x = x;
            sprite.y = y;
            sprite.alpha = Math.min(1, 0.5 + strength * 0.2);
            bloomLayer.addChild(sprite);
            blooms.push({ sprite, life: 520, lifeMs: 520, size: size * (1 + strength * 0.28) });
        },

        update(dtSeconds) {
            elapsed += dtSeconds;

            if (!reduced) {
                // The board's own light breathes gently, like a tube on mains current.
                pool.alpha = 0.33 + Math.sin(elapsed * 0.38) * 0.05;
            }

            for (const mote of motes) {
                mote.sprite.x += mote.driftX * dtSeconds;
                mote.sprite.y += mote.driftY * dtSeconds;
                mote.wobblePhase += mote.wobbleRate * dtSeconds;
                mote.sprite.y += Math.sin(mote.wobblePhase) * mote.wobbleUnits * dtSeconds;
                mote.sprite.alpha =
                    mote.baseAlpha * (0.55 + 0.45 * Math.sin(elapsed * mote.pulseRate + mote.wobblePhase));
                // Wrap rather than respawn: a mote that fades in at a screen
                // edge is less noticeable than one that pops into existence.
                if (mote.sprite.x > width + 20) mote.sprite.x = -20;
                if (mote.sprite.y < -20) mote.sprite.y = height + 20;
            }

            for (let i = blooms.length - 1; i >= 0; i--) {
                const bloom = blooms[i];
                if (!bloom) continue;
                bloom.life -= dtSeconds * 1_000;
                const ratio = Math.max(0, bloom.life / bloom.lifeMs);
                const grow = 1 + (1 - ratio) * 0.8;
                bloom.sprite.width = bloom.size * grow;
                bloom.sprite.height = bloom.size * grow;
                bloom.sprite.alpha = ratio * ratio;
                if (bloom.life <= 0) {
                    bloom.sprite.destroy();
                    blooms.splice(i, 1);
                }
            }
        },

        destroy() {
            for (const mote of motes) mote.sprite.destroy();
            for (const bloom of blooms) bloom.sprite.destroy();
            motes.length = 0;
            blooms.length = 0;
            poolTexture.current?.destroy(true);
            poolTexture.current = null;
            moteTexture.destroy(true);
            bloomTexture.destroy(true);
            pool.destroy();
            moteLayer.destroy({ children: true });
            bloomLayer.destroy({ children: true });
        },
    };
}
