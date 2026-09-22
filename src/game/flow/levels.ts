/**
 * Level catalogue — DESIGN.md §3.
 *
 * Pack levels are generated OFFLINE by `npm run levels` (scripts/build-levels.mjs)
 * and committed as `levels.json`, so every player gets byte-identical boards
 * and `npm run simulate` re-proves every one of them. The Daily Flow is the one
 * board generated on device: it is seeded from the trusted day, so everyone
 * gets the same one, and it is small enough to generate in a couple of
 * milliseconds.
 */
import { generatePuzzle } from "./generator.ts";
import LEVEL_DATA from "./levels.json" with { type: "json" };
import type { FlowPuzzle } from "./types.ts";

export interface PackDefinition {
    id: string;
    /** Localisation key for the pack name. */
    nameKey: string;
    size: number;
    minFlows: number;
    maxFlows: number;
    /** Palette hue the pack tile is lit with, as an index into the tube set. */
    accent: number;
}

/** Order is progression order: a pack unlocks when the previous one is half done. */
export const PACKS: readonly PackDefinition[] = [
    { id: "spark", nameKey: "PackSpark", size: 5, minFlows: 4, maxFlows: 5, accent: 1 },
    { id: "current", nameKey: "PackCurrent", size: 6, minFlows: 5, maxFlows: 6, accent: 2 },
    { id: "circuit", nameKey: "PackCircuit", size: 7, minFlows: 6, maxFlows: 7, accent: 3 },
    { id: "grid", nameKey: "PackGrid", size: 8, minFlows: 7, maxFlows: 9, accent: 5 },
    { id: "mainframe", nameKey: "PackMainframe", size: 9, minFlows: 8, maxFlows: 10, accent: 4 },
];

/** Levels per pack. The build script generates exactly this many. */
export const LEVELS_PER_PACK = 25;

/** A pack opens once this many levels of the one before it are solved. */
export const PACK_UNLOCK_SOLVES = 12;

/** Daily Flow board shape. */
export const DAILY = { size: 7, minFlows: 6, maxFlows: 7 } as const;

interface PackedLevel {
    /** Flows as [ax, ay, bx, by]. */
    f: number[][];
    /** Solution, one base-36 flow index per cell. */
    s: string;
}

interface PackedCatalogue {
    version: number;
    packs: Record<string, PackedLevel[]>;
}

const catalogue = LEVEL_DATA as PackedCatalogue;

export function unpack(size: number, level: PackedLevel): FlowPuzzle {
    return {
        size,
        flows: level.f.map(([ax = 0, ay = 0, bx = 0, by = 0], colour) => ({
            colour,
            a: { x: ax, y: ay },
            b: { x: bx, y: by },
        })),
        solution: [...level.s].map((char) => Number.parseInt(char, 36)),
    };
}

export function packById(id: string): PackDefinition | undefined {
    return PACKS.find((pack) => pack.id === id);
}

export function packLevelCount(packId: string): number {
    return catalogue.packs[packId]?.length ?? 0;
}

export function packLevel(packId: string, index: number): FlowPuzzle | null {
    const pack = packById(packId);
    const level = catalogue.packs[packId]?.[index];
    if (!pack || !level) return null;
    return unpack(pack.size, level);
}

/** Every shipped level, in progression order. Used by the simulation. */
export function allPackLevels(): Array<{ packId: string; index: number; puzzle: FlowPuzzle }> {
    return PACKS.flatMap((pack) =>
        (catalogue.packs[pack.id] ?? []).map((level, index) => ({
            packId: pack.id,
            index,
            puzzle: unpack(pack.size, level),
        })),
    );
}

/** Stable seed for a `YYYY-MM-DD` day key. */
export function dailySeed(day: string): number {
    let hash = 0x811c_9dc5;
    for (const char of `flow-connect:daily:${day}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x0100_0193) >>> 0;
    }
    return hash >>> 0;
}

const dailyCache = new Map<string, FlowPuzzle>();

/** The Daily Flow for `day`. Same day, same board, on every device. */
export function dailyPuzzle(day: string): FlowPuzzle | null {
    const cached = dailyCache.get(day);
    if (cached) return cached;
    const result = generatePuzzle({ ...DAILY, seed: dailySeed(day) });
    if (!result) return null;
    dailyCache.set(day, result.puzzle);
    return result.puzzle;
}

/** Level references the rest of the game passes around. */
export type LevelRef = { kind: "pack"; packId: string; index: number } | { kind: "daily"; day: string };

export function levelKey(ref: LevelRef): string {
    return ref.kind === "daily" ? `daily:${ref.day}` : `${ref.packId}:${ref.index}`;
}

export function puzzleFor(ref: LevelRef): FlowPuzzle | null {
    return ref.kind === "daily" ? dailyPuzzle(ref.day) : packLevel(ref.packId, ref.index);
}
