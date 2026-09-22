/**
 * Deterministic Flow puzzle generator.
 *
 * 1. Lay one Hamiltonian path over the whole board (a serpentine), then
 *    scramble it with thousands of random "backbite" moves. A backbite keeps
 *    the path Hamiltonian, so every cell stays covered no matter how many are
 *    applied — the board is always fully fillable by construction.
 * 2. Cut that path into flows of at least three cells (see `cutPath`).
 * 3. Hand the result to the solver and keep it only if the solution is
 *    UNIQUE. Everything else is thrown away and re-rolled from the next
 *    position in the seed's noise sequence.
 *
 * Same seed, same puzzle, on every device — levels are addressed by number
 * and never stored.
 */
import { NoiseRandom } from "../noiseRandom.ts";
import { solve } from "./solver.ts";
import type { Cell, FlowPuzzle } from "./types.ts";

export interface GenerateOptions {
    size: number;
    minFlows: number;
    maxFlows: number;
    /** Stable seed; the level number is derived into this. */
    seed: number;
    /** Give up and return the best rejected candidate after this many tries. */
    attempts?: number;
}

export interface GenerateResult {
    puzzle: FlowPuzzle;
    attempts: number;
    /** Solver nodes needed to prove it — a rough difficulty signal. */
    nodes: number;
}

/** Salts, so each decision draws from an independent stream of the same seed. */
const SALT_BACKBITE = 0x0b17e;
const SALT_CUT = 0x0c07;
const SALT_COLOUR = 0x0c01;

export function generatePuzzle(options: GenerateOptions): GenerateResult | null {
    const { size, minFlows, maxFlows } = options;
    const random = new NoiseRandom(options.seed >>> 0, 0);
    const attempts = options.attempts ?? 400;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        const path = scrambledHamiltonian(size, random);
        const flowCount = random.int(minFlows, maxFlows + 1, SALT_CUT);
        const segments = cutPath(path, size, flowCount, random);
        if (!segments || segments.length > maxFlows || segments.length < minFlows) continue;

        // Flow order IS colour order (flow 0 wears palette colour 0), so the
        // segments are shuffled to spread the strongest hues across the board
        // rather than always painting the path's first run red.
        shuffle(segments, random);
        const solution = new Array<number>(size * size).fill(-1);
        const flows = segments.map((segment, index) => {
            for (const cell of segment) solution[cell] = index;
            const first = segment[0] ?? 0;
            const last = segment[segment.length - 1] ?? 0;
            const flip = random.bool(0.5, SALT_COLOUR);
            return {
                colour: index,
                a: toCell(flip ? last : first, size),
                b: toCell(flip ? first : last, size),
            };
        });
        const puzzle: FlowPuzzle = { size, flows, solution };

        const proof = solve(puzzle, { limit: 2, maxNodes: 60_000 });
        if (proof.solutions === 1 && !proof.exhausted) {
            return { puzzle, attempts: attempt, nodes: proof.nodes };
        }
    }
    return null;
}

function toCell(index: number, size: number): Cell {
    return { x: index % size, y: Math.floor(index / size) };
}

/** A serpentine, then randomised with backbite moves. */
function scrambledHamiltonian(size: number, random: NoiseRandom): number[] {
    const path: number[] = [];
    for (let y = 0; y < size; y++) {
        for (let i = 0; i < size; i++) {
            const x = y % 2 === 0 ? i : size - 1 - i;
            path.push(y * size + x);
        }
    }
    const position = new Int32Array(size * size);
    const reindex = (from: number, to: number) => {
        for (let i = from; i <= to; i++) position[path[i] ?? 0] = i;
    };
    reindex(0, path.length - 1);

    const moves = size * size * 24;
    for (let move = 0; move < moves; move++) {
        const fromHead = random.bool(0.5, SALT_BACKBITE);
        const end = fromHead ? (path[0] ?? 0) : (path[path.length - 1] ?? 0);
        const options = gridNeighbours(end, size);
        const next = options[random.int(0, options.length, SALT_BACKBITE)] ?? end;
        const at = position[next] ?? 0;
        if (fromHead) {
            // Head joins `next`; reverse path[0 .. at-1].
            if (at === 1) continue;
            reverse(path, 0, at - 1);
            reindex(0, at - 1);
        } else {
            const last = path.length - 1;
            if (at === last - 1) continue;
            reverse(path, at + 1, last);
            reindex(at + 1, last);
        }
    }
    return path;
}

function reverse(list: number[], from: number, to: number): void {
    for (let i = from, j = to; i < j; i++, j--) {
        const swap = list[i] ?? 0;
        list[i] = list[j] ?? 0;
        list[j] = swap;
    }
}

function gridNeighbours(index: number, size: number): number[] {
    const x = index % size;
    const y = Math.floor(index / size);
    const list: number[] = [];
    if (x > 0) list.push(index - 1);
    if (x < size - 1) list.push(index + 1);
    if (y > 0) list.push(index - size);
    if (y < size - 1) list.push(index + size);
    return list;
}

function adjacent(a: number, b: number, size: number): boolean {
    const ax = a % size;
    const bx = b % size;
    const ay = Math.floor(a / size);
    const by = Math.floor(b / size);
    return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

/**
 * Split the path into about `target` runs of at least three cells.
 *
 * First a greedy pass: walk the path and start a new run the moment the next
 * cell would sit beside a non-consecutive cell of the current one — that
 * yields only "clean" runs that never brush against themselves, which is what
 * keeps solutions unique. Then merge neighbouring runs at random, preferring
 * merges that stay clean, until the target count is reached. A run that is
 * allowed to brush itself is where a hard board's twist comes from, so a few
 * are tolerated once the clean merges run out; the solver decides whether the
 * result is still unique.
 */
function cutPath(path: number[], size: number, target: number, random: NoiseRandom): number[][] | null {
    const segments: number[][] = [];
    let current: number[] = [];
    for (const cell of path) {
        let touches = false;
        for (let i = 0; i < current.length - 1 && !touches; i++) touches = adjacent(current[i] ?? 0, cell, size);
        if (current.length > 0 && touches) {
            segments.push(current);
            current = [];
        }
        current.push(cell);
    }
    segments.push(current);

    for (let guard = 0; guard < size * size; guard++) {
        const short = segments.findIndex((segment) => segment.length < 3);
        if (short < 0 && segments.length <= target) break;
        const clean: number[] = [];
        for (let i = 0; i < segments.length - 1; i++) {
            if (segmentIsClean([...(segments[i] ?? []), ...(segments[i + 1] ?? [])], size)) clean.push(i);
        }
        let candidates = clean;
        if (short >= 0) {
            candidates = clean.filter((i) => i === short || i === short - 1);
            if (candidates.length === 0) return null;
        } else if (candidates.length === 0) {
            candidates = Array.from({ length: segments.length - 1 }, (_, i) => i);
        }
        const pick = candidates[random.int(0, candidates.length, SALT_CUT)] ?? 0;
        segments.splice(pick, 2, [...(segments[pick] ?? []), ...(segments[pick + 1] ?? [])]);
    }
    if (segments.some((segment) => segment.length < 3)) return null;
    return segments;
}

/** No shortcut: no two non-consecutive cells of a run are grid neighbours. */
function segmentIsClean(segment: number[], size: number): boolean {
    for (let i = 0; i < segment.length; i++) {
        for (let j = i + 2; j < segment.length; j++) {
            if (adjacent(segment[i] ?? 0, segment[j] ?? 0, size)) return false;
        }
    }
    return true;
}

function shuffle<T>(list: T[], random: NoiseRandom): void {
    for (let i = list.length - 1; i > 0; i--) {
        const j = random.int(0, i + 1, SALT_COLOUR);
        const swap = list[i] as T;
        list[i] = list[j] as T;
        list[j] = swap;
    }
}
