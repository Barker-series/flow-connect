/**
 * Exhaustive Flow solver — counts solutions up to a limit.
 *
 * The generator only ships a puzzle when this proves it has EXACTLY ONE
 * solution that pairs every colour and fills every cell. A puzzle with two
 * answers is not harder, it is sloppier: the player finds a valid board and
 * the game has no way to tell them it was the intended one.
 *
 * Renderer-free and allocation-light so `npm run simulate` can re-prove every
 * shipped level on every run.
 *
 * Search: grow each flow from its first endpoint toward its second. At every
 * node pick the unfinished flow whose head has the fewest legal steps (most
 * constrained first), and prune any state where
 *
 *   1. an empty cell has fewer than two usable neighbours (it could never be
 *      threaded by a path), or
 *   2. a pocket of empty cells is not bordered by BOTH the head and the target
 *      of at least one unfinished flow (nothing could ever fill it), or
 *   3. an unfinished flow's head can no longer reach its target.
 */
import type { FlowPuzzle } from "./types.ts";

export interface SolveResult {
    /** Solutions found, capped at the requested limit. */
    solutions: number;
    /** Search nodes visited — the generator's difficulty proxy. */
    nodes: number;
    /** True when the node budget ran out before the search finished. */
    exhausted: boolean;
    /** The first solution found, as a colour index per cell (row-major). */
    first: Int8Array | null;
}

export interface SolveOptions {
    limit?: number;
    maxNodes?: number;
}

export function solve(puzzle: FlowPuzzle, options: SolveOptions = {}): SolveResult {
    const size = puzzle.size;
    const cells = size * size;
    const limit = options.limit ?? 2;
    const maxNodes = options.maxNodes ?? 2_000_000;
    const flows = puzzle.flows.length;

    const owner = new Int8Array(cells).fill(-1);
    const head = new Int32Array(flows);
    const target = new Int32Array(flows);
    const done = new Uint8Array(flows);
    const isTarget = new Int8Array(cells).fill(-1);

    puzzle.flows.forEach((flow, index) => {
        const a = flow.a.y * size + flow.a.x;
        const b = flow.b.y * size + flow.b.x;
        owner[a] = index;
        owner[b] = index;
        head[index] = a;
        target[index] = b;
        isTarget[b] = index;
    });

    // Precomputed neighbour lists.
    const neighbours: number[][] = [];
    for (let index = 0; index < cells; index++) {
        const x = index % size;
        const y = (index / size) | 0;
        const list: number[] = [];
        if (x > 0) list.push(index - 1);
        if (x < size - 1) list.push(index + 1);
        if (y > 0) list.push(index - size);
        if (y < size - 1) list.push(index + size);
        neighbours.push(list);
    }

    const result: SolveResult = { solutions: 0, nodes: 0, exhausted: false, first: null };
    // Float64 so the monotonic pocket marker can never wrap on a long search.
    const component = new Float64Array(cells);
    const stack = new Int32Array(cells);
    let marker = 0;

    /** Is `cell` a place an unfinished flow's path could still pass through or end at? */
    const isOpenEnd = (cell: number): boolean => {
        const flow = owner[cell] ?? -1;
        if (flow < 0) return true;
        if (done[flow]) return false;
        return head[flow] === cell || target[flow] === cell;
    };

    const feasible = (): boolean => {
        // 1. Every empty cell needs two usable neighbours.
        for (let cell = 0; cell < cells; cell++) {
            if (owner[cell] !== -1) continue;
            let open = 0;
            for (const next of neighbours[cell] ?? []) if (isOpenEnd(next)) open++;
            if (open < 2) return false;
        }

        // 2 + 3. Flood the empty pockets; each must be serviceable by one flow
        // whose head AND target both border it (or which is already adjacent).
        const callBase = marker;
        const headTouches = new Uint8Array(flows);
        const targetTouches = new Uint8Array(flows);
        const reachable = new Uint8Array(flows);
        for (let flow = 0; flow < flows; flow++) {
            if (done[flow]) {
                reachable[flow] = 1;
                continue;
            }
            // Head directly beside its target: always reachable.
            for (const next of neighbours[head[flow] ?? 0] ?? []) {
                if (next === target[flow]) reachable[flow] = 1;
            }
        }

        for (let start = 0; start < cells; start++) {
            if (owner[start] !== -1 || (component[start] ?? 0) > callBase) continue;
            marker++;
            headTouches.fill(0);
            targetTouches.fill(0);
            let top = 0;
            stack[top++] = start;
            component[start] = marker;
            while (top > 0) {
                const cell = stack[--top] ?? 0;
                for (const next of neighbours[cell] ?? []) {
                    const flow = owner[next] ?? -1;
                    if (flow === -1) {
                        if (component[next] !== marker) {
                            component[next] = marker;
                            stack[top++] = next;
                        }
                    } else if (!done[flow]) {
                        if (head[flow] === next) headTouches[flow] = 1;
                        if (target[flow] === next) targetTouches[flow] = 1;
                    }
                }
            }
            let serviced = false;
            for (let flow = 0; flow < flows; flow++) {
                if (headTouches[flow] && targetTouches[flow]) {
                    serviced = true;
                    reachable[flow] = 1;
                }
            }
            if (!serviced) return false;
        }
        for (let flow = 0; flow < flows; flow++) if (!reachable[flow]) return false;
        return true;
    };

    const search = (): void => {
        if (result.solutions >= limit || result.exhausted) return;
        result.nodes++;
        if (result.nodes > maxNodes) {
            result.exhausted = true;
            return;
        }

        // Most constrained unfinished flow.
        let best = -1;
        let bestCount = 99;
        let allDone = true;
        for (let flow = 0; flow < flows; flow++) {
            if (done[flow]) continue;
            allDone = false;
            let count = 0;
            for (const next of neighbours[head[flow] ?? 0] ?? []) {
                if (owner[next] === -1 || next === target[flow]) count++;
            }
            if (count < bestCount) {
                bestCount = count;
                best = flow;
                if (count <= 1) break;
            }
        }

        if (allDone) {
            for (let cell = 0; cell < cells; cell++) if (owner[cell] === -1) return;
            result.solutions++;
            if (!result.first) result.first = Int8Array.from(owner);
            return;
        }
        if (bestCount === 0 || best < 0) return;

        const from = head[best] ?? 0;
        for (const next of neighbours[from] ?? []) {
            if (next === target[best]) {
                done[best] = 1;
                if (feasible()) search();
                done[best] = 0;
            } else if (owner[next] === -1) {
                owner[next] = best;
                head[best] = next;
                if (feasible()) search();
                head[best] = from;
                owner[next] = -1;
            }
            if (result.solutions >= limit || result.exhausted) return;
        }
    };

    if (feasible()) search();
    return result;
}
