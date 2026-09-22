/**
 * Board choreography — DESIGN.md §8.
 *
 * Three beats: a flow CONNECTS (a charge of light runs the length of the tube
 * and sparks jump off both endpoints), the board is SOLVED (every tube charges
 * in a wave and the board flares), and text POPS (a number or a banner that
 * floats up and fades). Reduced motion keeps every beat's light and collapses
 * its movement — no flying sparks, no travel, shorter holds.
 *
 * Type sizes are in design units. One design unit is about 0.55 CSS px on a
 * phone, so every intended size here is the CSS size multiplied by 1.83.
 */
import { Container, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { bloomCanvas } from "../art/light.ts";
import type { NeonTextures } from "../art/textures.ts";
import { NoiseRandom } from "../noiseRandom.ts";

const TEXT_UNITS_PER_CSS_PX = 1.83;

/** Convert an intended CSS pixel size into a canvas `fontSize`. */
export function typeSize(cssPx: number): number {
    return Math.round(cssPx * TEXT_UNITS_PER_CSS_PX);
}

export interface Point {
    x: number;
    y: number;
}

interface Spark {
    sprite: Sprite;
    vx: number;
    vy: number;
    life: number;
    lifeMs: number;
    size: number;
}

/** A bright head travelling along a tube. */
interface Charge {
    head: Sprite;
    halo: Sprite;
    points: Point[];
    /** Cumulative length at each point, for constant-speed travel. */
    lengths: number[];
    total: number;
    life: number;
    lifeMs: number;
    delay: number;
}

interface Popup {
    node: Container;
    life: number;
    lifeMs: number;
    riseUnits: number;
    startY: number;
}

interface Flash {
    sprite: Sprite;
    life: number;
    lifeMs: number;
    delay: number;
    peak: number;
}

export interface Effects {
    /** A charge of light along a tube, then sparks off its far end. */
    charge(points: readonly Point[], cellSize: number, colour: number, delayMs?: number): void;
    /** A ring of sparks thrown off one point. */
    sparks(x: number, y: number, cellSize: number, colour: number, count?: number): void;
    /** A soft square flash over a cell — the "left empty" nudge. */
    flashCell(x: number, y: number, cellSize: number, colour: number, delayMs?: number): void;
    popup(x: number, y: number, text: string, colour: number, cssPx?: number): void;
    banner(x: number, y: number, title: string, subtitle: string, colour: number): void;
    setReducedMotion(reduced: boolean): void;
    /** "low" thins the spark count for weaker devices; it never removes a beat. */
    setQuality(quality: "high" | "low"): void;
    update(dtSeconds: number): void;
    clear(): void;
    destroy(): void;
    readonly activeCount: number;
}

export function createEffects(
    layer: Container,
    textures: NeonTextures,
    reducedMotion: boolean,
    quality: "high" | "low" = "high",
): Effects {
    const sparks: Spark[] = [];
    const charges: Charge[] = [];
    const popups: Popup[] = [];
    const flashes: Flash[] = [];
    // Seeded: a replayed solve throws identical sparks; visual only, but a
    // deterministic scene is a scene you can screenshot-test.
    const random = new NoiseRandom(0xf10_c0de, 0);
    const glowTexture = Texture.from(bloomCanvas(128));
    let reduced = reducedMotion;
    let density = quality === "high" ? 1 : 0.45;

    function popupStyle(cssPx: number, colour: number, weight: "bold" | "900" = "900"): TextStyle {
        return new TextStyle({
            fontFamily: "ui-rounded, 'SF Pro Rounded', 'Avenir Next', 'Segoe UI', Roboto, system-ui, sans-serif",
            fontSize: typeSize(cssPx),
            fontWeight: weight,
            fill: colour,
            stroke: { color: 0x070912, width: typeSize(cssPx) * 0.16, join: "round" },
            align: "center",
            letterSpacing: typeSize(cssPx) * 0.04,
        });
    }

    function addSparks(x: number, y: number, cellSize: number, colour: number, count: number): void {
        if (reduced) return;
        const total = Math.max(2, Math.round(count * density));
        for (let i = 0; i < total; i++) {
            const sprite = new Sprite(textures.spark());
            sprite.anchor.set(0.5);
            sprite.blendMode = "add";
            sprite.tint = colour;
            const size = cellSize * random.float(0.22, 0.46);
            sprite.width = size;
            sprite.height = size;
            sprite.position.set(x, y);
            sprite.rotation = random.float(0, Math.PI);
            layer.addChild(sprite);
            const angle = (i / total) * Math.PI * 2 + random.float(-0.3, 0.3);
            const speed = cellSize * random.float(3.2, 6.4);
            const lifeMs = random.float(380, 640);
            sparks.push({
                sprite,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: lifeMs,
                lifeMs,
                size,
            });
        }
    }

    return {
        charge(points, cellSize, colour, delayMs = 0) {
            if (points.length < 2) return;
            const lengths = [0];
            for (let i = 1; i < points.length; i++) {
                const a = points[i - 1] as Point;
                const b = points[i] as Point;
                lengths.push((lengths[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
            }
            const total = lengths[lengths.length - 1] ?? 0;
            const halo = new Sprite(glowTexture);
            halo.anchor.set(0.5);
            halo.blendMode = "add";
            halo.tint = colour;
            halo.width = cellSize * 2.4;
            halo.height = cellSize * 2.4;
            const head = new Sprite(textures.spark());
            head.anchor.set(0.5);
            head.blendMode = "add";
            head.width = cellSize * 0.9;
            head.height = cellSize * 0.9;
            halo.alpha = 0;
            head.alpha = 0;
            layer.addChild(halo, head);
            // Constant speed along the tube, clamped so a long tube is not slow
            // and a short one is not an instant blink.
            const lifeMs = reduced ? 160 : Math.max(260, Math.min(720, (total / cellSize) * 60));
            charges.push({ head, halo, points: [...points], lengths, total, life: lifeMs, lifeMs, delay: delayMs });
        },

        sparks(x, y, cellSize, colour, count = 10) {
            addSparks(x, y, cellSize, colour, count);
        },

        flashCell(x, y, cellSize, colour, delayMs = 0) {
            const sprite = new Sprite(Texture.WHITE);
            sprite.tint = colour;
            sprite.blendMode = "add";
            sprite.position.set(x + cellSize * 0.08, y + cellSize * 0.08);
            sprite.width = cellSize * 0.84;
            sprite.height = cellSize * 0.84;
            sprite.alpha = 0;
            layer.addChild(sprite);
            const lifeMs = reduced ? 380 : 720;
            flashes.push({ sprite, life: lifeMs, lifeMs, delay: delayMs, peak: 0.34 });
        },

        popup(x, y, text, colour, cssPx = 19) {
            const node = new Text({ text, style: popupStyle(cssPx, colour) });
            node.anchor.set(0.5);
            node.position.set(x, y);
            layer.addChild(node);
            const lifeMs = reduced ? 520 : 900;
            popups.push({ node, life: lifeMs, lifeMs, riseUnits: reduced ? 18 : 64, startY: y });
        },

        banner(x, y, title, subtitle, colour) {
            const node = new Container();
            const halo = new Sprite(glowTexture);
            halo.anchor.set(0.5);
            halo.blendMode = "add";
            halo.tint = colour;
            halo.width = 420;
            halo.height = 220;
            halo.alpha = 0.75;
            halo.y = -18;
            const heading = new Text({ text: title, style: popupStyle(34, colour) });
            heading.anchor.set(0.5, 1);
            const caption = new Text({ text: subtitle, style: popupStyle(12, 0xe8ecff, "bold") });
            caption.anchor.set(0.5, 0);
            caption.y = 6;
            node.addChild(halo, heading, caption);
            node.position.set(x, y);
            layer.addChild(node);
            const lifeMs = reduced ? 800 : 1_250;
            popups.push({ node, life: lifeMs, lifeMs, riseUnits: reduced ? 12 : 40, startY: y });
        },

        setReducedMotion(value) {
            reduced = value;
        },

        setQuality(value) {
            density = value === "high" ? 1 : 0.45;
        },

        update(dtSeconds) {
            const dtMs = dtSeconds * 1_000;

            for (let i = charges.length - 1; i >= 0; i--) {
                const charge = charges[i];
                if (!charge) continue;
                if (charge.delay > 0) {
                    charge.delay -= dtMs;
                    continue;
                }
                charge.life -= dtMs;
                const t = 1 - Math.max(0, charge.life / charge.lifeMs);
                const distance = charge.total * t;
                let segment = 1;
                while (segment < charge.lengths.length - 1 && (charge.lengths[segment] ?? 0) < distance) segment++;
                const a = charge.points[segment - 1] as Point;
                const b = charge.points[segment] as Point;
                const from = charge.lengths[segment - 1] ?? 0;
                const span = Math.max(0.0001, (charge.lengths[segment] ?? 0) - from);
                const k = Math.min(1, Math.max(0, (distance - from) / span));
                const x = a.x + (b.x - a.x) * k;
                const y = a.y + (b.y - a.y) * k;
                charge.head.position.set(x, y);
                charge.halo.position.set(x, y);
                const fade = t > 0.85 ? (1 - t) / 0.15 : Math.min(1, t * 8);
                charge.head.alpha = fade;
                charge.halo.alpha = fade * 0.9;
                if (charge.life <= 0) {
                    const end = charge.points[charge.points.length - 1] as Point;
                    addSparks(end.x, end.y, charge.head.width / 0.9, charge.halo.tint as number, 9);
                    charge.head.destroy();
                    charge.halo.destroy();
                    charges.splice(i, 1);
                }
            }

            for (let i = sparks.length - 1; i >= 0; i--) {
                const spark = sparks[i];
                if (!spark) continue;
                spark.life -= dtMs;
                spark.vx *= 1 - 3.2 * dtSeconds;
                spark.vy *= 1 - 3.2 * dtSeconds;
                spark.sprite.x += spark.vx * dtSeconds;
                spark.sprite.y += spark.vy * dtSeconds;
                const ratio = Math.max(0, spark.life / spark.lifeMs);
                spark.sprite.alpha = Math.min(1, ratio * 1.6);
                const size = spark.size * (0.4 + ratio * 0.6);
                spark.sprite.width = size;
                spark.sprite.height = size;
                if (spark.life <= 0) {
                    spark.sprite.destroy();
                    sparks.splice(i, 1);
                }
            }

            for (let i = flashes.length - 1; i >= 0; i--) {
                const flash = flashes[i];
                if (!flash) continue;
                if (flash.delay > 0) {
                    flash.delay -= dtMs;
                    continue;
                }
                flash.life -= dtMs;
                const t = 1 - Math.max(0, flash.life / flash.lifeMs);
                flash.sprite.alpha = Math.sin(t * Math.PI) * flash.peak;
                if (flash.life <= 0) {
                    flash.sprite.destroy();
                    flashes.splice(i, 1);
                }
            }

            for (let i = popups.length - 1; i >= 0; i--) {
                const popup = popups[i];
                if (!popup) continue;
                popup.life -= dtMs;
                const ratio = Math.max(0, popup.life / popup.lifeMs);
                const progress = 1 - ratio;
                popup.node.y = popup.startY - popup.riseUnits * (1 - (1 - progress) ** 3);
                popup.node.alpha = Math.min(1, ratio * 2.4);
                popup.node.scale.set(1 + 0.14 * Math.sin(Math.min(1, progress * 4) * Math.PI));
                if (popup.life <= 0) {
                    popup.node.destroy({ children: true });
                    popups.splice(i, 1);
                }
            }
        },

        clear() {
            for (const charge of charges) {
                charge.head.destroy();
                charge.halo.destroy();
            }
            for (const spark of sparks) spark.sprite.destroy();
            for (const flash of flashes) flash.sprite.destroy();
            for (const popup of popups) popup.node.destroy({ children: true });
            charges.length = 0;
            sparks.length = 0;
            flashes.length = 0;
            popups.length = 0;
        },

        destroy() {
            this.clear();
            glowTexture.destroy(true);
        },

        get activeCount() {
            return charges.length + sparks.length + flashes.length + popups.length;
        },
    };
}
