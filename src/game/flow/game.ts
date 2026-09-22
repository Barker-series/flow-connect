/**
 * The Flow rules — DESIGN.md §2.
 *
 * Owns the paths on the board and every decision about them: where a drag may
 * go, which other flow it cuts, when a flow is connected, when the board is
 * solved, what a move is, and what undo restores. It knows nothing about Pixi,
 * React, the store, sparks, or ads — `npm run simulate` drives this exact class
 * headless, so the board you see and the board the simulation proves are the
 * same board.
 *
 * A path is a list of cell indices that always STARTS at one of its flow's two
 * endpoints. A flow is connected when its path ends on the other endpoint.
 *
 * A drag is provisional. While the finger is down, the active path may run
 * over other flows' cells; those flows are shown cut back to where they were
 * crossed, but the cut is only kept if the finger lifts there. Drag back off a
 * crossed flow and it springs back whole — exactly as the player expects.
 */
import type { Cell, FlowPuzzle } from "./types.ts";

export type FlowStatus = "playing" | "solved";

export interface DragStep {
    /** Cells the active path gained (+) or lost (-) this call. */
    delta: number;
    /** Flows newly cut by the active path this call. */
    cut: number[];
    /** Flows restored whole because the active path backed off them. */
    restored: number[];
    /** The active flow just reached its other endpoint. */
    connected: boolean;
    /** The active flow was connected and just stopped being so. */
    disconnected: boolean;
}

export interface MoveResult {
    /** Anything on the board actually changed. */
    changed: boolean;
    flow: number;
    /** This commit counted as a new move (a different flow than last time). */
    counted: boolean;
    /** Flows connected after the commit that were not before it. */
    newlyConnected: number[];
    /** Flows broken by the commit (cut, or the active one pulled off). */
    broken: number[];
    status: FlowStatus;
    /** Every flow connected but cells left empty: DESIGN.md §2.4 "almost". */
    almost: boolean;
}

interface Snapshot {
    paths: number[][];
    lastFlow: number;
}

const EMPTY_STEP: DragStep = { delta: 0, cut: [], restored: [], connected: false, disconnected: false };

export class FlowGame {
    readonly size: number;
    readonly cells: number;
    readonly puzzle: FlowPuzzle;
    readonly flowCount: number;
    /** Flow index at each endpoint cell, -1 elsewhere. */
    readonly endpointOf: Int8Array;
    /** The intended solution, as an ordered path per flow from `a` to `b`. */
    readonly solutionPaths: readonly number[][];

    private paths: number[][];
    private undoStack: Snapshot[] = [];
    private _moves = 0;
    private lastFlow = -1;
    private _hintsUsed = 0;
    private readonly hinted: Set<number> = new Set();
    private _status: FlowStatus = "playing";

    // Drag state.
    private dragFlow = -1;
    private dragBase: number[][] | null = null;
    private active: number[] = [];

    constructor(puzzle: FlowPuzzle) {
        this.puzzle = puzzle;
        this.size = puzzle.size;
        this.cells = puzzle.size * puzzle.size;
        this.flowCount = puzzle.flows.length;
        this.endpointOf = new Int8Array(this.cells).fill(-1);
        puzzle.flows.forEach((flow, index) => {
            this.endpointOf[this.indexOf(flow.a)] = index;
            this.endpointOf[this.indexOf(flow.b)] = index;
        });
        this.paths = puzzle.flows.map(() => []);
        this.solutionPaths = puzzle.flows.map((_, index) => this.traceSolution(index));
    }

    // -----------------------------------------------------------------------
    // Reading
    // -----------------------------------------------------------------------

    get status(): FlowStatus {
        return this._status;
    }

    get moves(): number {
        return this._moves;
    }

    get hintsUsed(): number {
        return this._hintsUsed;
    }

    get canUndo(): boolean {
        return this.undoStack.length > 0 && this.dragFlow < 0;
    }

    get dragging(): boolean {
        return this.dragFlow >= 0;
    }

    get activeFlow(): number {
        return this.dragFlow;
    }

    /** The minimum possible move count: one per flow. */
    get par(): number {
        return this.flowCount;
    }

    isHinted(flow: number): boolean {
        return this.hinted.has(flow);
    }

    indexOf(cell: Cell): number {
        return cell.y * this.size + cell.x;
    }

    cellOf(index: number): Cell {
        return { x: index % this.size, y: Math.floor(index / this.size) };
    }

    /** The live path for `flow`, including a drag in progress. */
    pathOf(flow: number): readonly number[] {
        return this.livePaths()[flow] ?? [];
    }

    /** Every live path, including a drag in progress. */
    livePaths(): readonly (readonly number[])[] {
        if (this.dragFlow < 0 || !this.dragBase) return this.paths;
        return this.composeDrag();
    }

    /** Flow index covering each cell (row-major), -1 for empty. */
    occupancy(): Int8Array {
        const owner = new Int8Array(this.cells).fill(-1);
        this.livePaths().forEach((path, flow) => {
            for (const cell of path) owner[cell] = flow;
        });
        // Endpoints always belong to their flow, drawn or not.
        for (let cell = 0; cell < this.cells; cell++) {
            const flow = this.endpointOf[cell] ?? -1;
            if (flow >= 0) owner[cell] = flow;
        }
        return owner;
    }

    isConnected(flow: number, paths: readonly (readonly number[])[] = this.livePaths()): boolean {
        const path = paths[flow];
        if (!path || path.length < 2) return false;
        const first = path[0] ?? -1;
        const last = path[path.length - 1] ?? -1;
        return first !== last && this.endpointOf[first] === flow && this.endpointOf[last] === flow;
    }

    connectedCount(paths: readonly (readonly number[])[] = this.livePaths()): number {
        let count = 0;
        for (let flow = 0; flow < this.flowCount; flow++) if (this.isConnected(flow, paths)) count++;
        return count;
    }

    /** Covered cells, counting endpoints — the "pipe" percentage Flow players read. */
    filledCount(paths: readonly (readonly number[])[] = this.livePaths()): number {
        const covered = new Uint8Array(this.cells);
        for (const path of paths) for (const cell of path) covered[cell] = 1;
        for (let cell = 0; cell < this.cells; cell++) if ((this.endpointOf[cell] ?? -1) >= 0) covered[cell] = 1;
        let total = 0;
        for (const value of covered) total += value;
        return total;
    }

    // -----------------------------------------------------------------------
    // Dragging
    // -----------------------------------------------------------------------

    /**
     * Put a finger down. Starting on an endpoint begins that flow afresh;
     * starting on a drawn path picks it up from that cell. Anything else is
     * not a drag. Returns the flow picked up, or -1.
     */
    beginDrag(cell: number): number {
        if (this._status === "solved" || this.dragFlow >= 0) return -1;
        if (cell < 0 || cell >= this.cells) return -1;

        const endpoint = this.endpointOf[cell] ?? -1;
        let flow = -1;
        let start: number[] = [];
        if (endpoint >= 0) {
            // An endpoint always starts its flow afresh from that end.
            flow = endpoint;
            start = [cell];
        } else {
            this.paths.forEach((path, index) => {
                const at = path.indexOf(cell);
                if (at >= 0) {
                    flow = index;
                    start = path.slice(0, at + 1);
                }
            });
        }
        if (flow < 0) return -1;

        this.dragFlow = flow;
        this.dragBase = this.paths.map((path) => path.slice());
        this.active = start;
        return flow;
    }

    /**
     * Move the finger to `cell`. Walks the active head one orthogonal step at a
     * time toward it, so a fast swipe that skips cells still draws a legal,
     * contiguous path — or stops cleanly at the first thing it may not cross.
     */
    dragTo(cell: number): DragStep {
        if (this.dragFlow < 0 || cell < 0 || cell >= this.cells) return EMPTY_STEP;
        const before = this.composeDrag();
        const wasConnected = this.isConnected(this.dragFlow, before);
        const startLength = this.active.length;

        // Backing up over your own path: truncate straight to that cell.
        const own = this.active.indexOf(cell);
        if (own >= 0) {
            this.active.length = own + 1;
        } else {
            let guard = this.cells * 2;
            while (guard-- > 0) {
                const head = this.active[this.active.length - 1] ?? cell;
                if (head === cell) break;
                const step = this.nextStep(head, cell);
                if (step < 0) break;
                const back = this.active.indexOf(step);
                if (back >= 0) {
                    this.active.length = back + 1;
                    continue;
                }
                this.active.push(step);
            }
        }

        const after = this.composeDrag();
        const cut: number[] = [];
        const restored: number[] = [];
        for (let flow = 0; flow < this.flowCount; flow++) {
            if (flow === this.dragFlow) continue;
            const was = before[flow]?.length ?? 0;
            const now = after[flow]?.length ?? 0;
            if (now < was) cut.push(flow);
            else if (now > was) restored.push(flow);
        }
        const connected = this.isConnected(this.dragFlow, after);
        return {
            delta: this.active.length - startLength,
            cut,
            restored,
            connected: connected && !wasConnected,
            disconnected: wasConnected && !connected,
        };
    }

    /** Lift the finger: the provisional state becomes the board. */
    endDrag(): MoveResult {
        const flow = this.dragFlow;
        const base = this.dragBase;
        if (flow < 0 || !base) return this.idleResult(-1);

        const next = this.composeDrag().map((path) => (path.length > 1 ? path.slice() : []));
        this.dragFlow = -1;
        this.dragBase = null;
        this.active = [];

        const changed = next.some((path, index) => !samePath(path, base[index] ?? []));
        if (!changed) return this.idleResult(flow);

        this.undoStack.push({ paths: base, lastFlow: this.lastFlow });
        if (this.undoStack.length > 200) this.undoStack.shift();
        const counted = flow !== this.lastFlow;
        if (counted) this._moves += 1;
        this.lastFlow = flow;
        return this.commit(base, next, flow, counted);
    }

    /** Abandon a drag without committing it (a cancelled pointer, a hint). */
    cancelDrag(): void {
        this.dragFlow = -1;
        this.dragBase = null;
        this.active = [];
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /** Restore the board before the last committed change. */
    undo(): MoveResult | null {
        if (!this.canUndo) return null;
        const snapshot = this.undoStack.pop();
        if (!snapshot) return null;
        const before = this.paths;
        // Undo never gives a move back: the counter records effort, and a
        // free rewind would make a perfect trivially farmable.
        this.lastFlow = snapshot.lastFlow;
        return this.commit(before, snapshot.paths, -1, false);
    }

    /** Clear every path. Counts toward nothing and keeps the move count. */
    restart(): MoveResult {
        this.cancelDrag();
        const before = this.paths;
        if (before.every((path) => path.length === 0)) return this.idleResult(-1);
        this.undoStack.push({ paths: before.map((path) => path.slice()), lastFlow: this.lastFlow });
        this.lastFlow = -1;
        return this.commit(
            before,
            this.paths.map(() => []),
            -1,
            false,
        );
    }

    /**
     * Lay one flow exactly as the intended solution has it (DESIGN.md §5.2).
     *
     * Picks the lowest-numbered flow that is not already drawn correctly, so a
     * hint always teaches something. Anything in its way is cut. Returns the
     * flow hinted, or -1 when every flow already matches the solution.
     */
    hintFlow(): number {
        if (this._status === "solved") return -1;
        this.cancelDrag();
        const target = this.solutionPaths.findIndex(
            (path, flow) => !samePathEitherWay(this.paths[flow] ?? [], path) || !this.isConnected(flow, this.paths),
        );
        return target;
    }

    applyHint(flow: number): MoveResult | null {
        const solution = this.solutionPaths[flow];
        if (!solution || this._status === "solved") return null;
        const before = this.paths.map((path) => path.slice());
        const claimed = new Set(solution);
        const next = this.paths.map((path, index) => {
            if (index === flow) return solution.slice();
            const at = path.findIndex((cell) => claimed.has(cell));
            const kept = at < 0 ? path.slice() : path.slice(0, at);
            return kept.length > 1 ? kept : [];
        });
        this.undoStack.push({ paths: before, lastFlow: this.lastFlow });
        this._hintsUsed += 1;
        this.hinted.add(flow);
        this.lastFlow = -1;
        return this.commit(before, next, flow, false);
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    /**
     * The board as it would be if the finger lifted now: the active path, and
     * every other flow cut back to just before the first cell it covers.
     */
    private composeDrag(): number[][] {
        const base = this.dragBase ?? this.paths;
        const covered = new Set(this.active);
        return base.map((path, flow) => {
            if (flow === this.dragFlow) return this.active.slice();
            const at = path.findIndex((cell) => covered.has(cell));
            return at < 0 ? path.slice() : path.slice(0, at);
        });
    }

    /**
     * One orthogonal step from `head` toward `target`, trying the longer axis
     * first. Returns -1 when neither axis may be entered.
     */
    private nextStep(head: number, target: number): number {
        const hx = head % this.size;
        const hy = Math.floor(head / this.size);
        const tx = target % this.size;
        const ty = Math.floor(target / this.size);
        const dx = Math.sign(tx - hx);
        const dy = Math.sign(ty - hy);
        const horizontal = dx !== 0 ? head + dx : -1;
        const vertical = dy !== 0 ? head + dy * this.size : -1;
        const order = Math.abs(tx - hx) >= Math.abs(ty - hy) ? [horizontal, vertical] : [vertical, horizontal];
        for (const candidate of order) {
            if (candidate >= 0 && this.mayEnter(head, candidate)) return candidate;
        }
        return -1;
    }

    private mayEnter(head: number, cell: number): boolean {
        if (cell < 0 || cell >= this.cells) return false;
        // Once the head sits on the flow's OTHER endpoint the flow is connected:
        // it may back up along itself (handled before this is asked) but never
        // grow past its terminal.
        const onTerminal = this.active.length > 1 && head !== this.active[0] && this.endpointOf[head] === this.dragFlow;
        if (onTerminal) return false;
        // Another colour's endpoint is a wall. Every other cell may be crossed;
        // the flow it belonged to is cut back provisionally.
        const endpoint = this.endpointOf[cell] ?? -1;
        return endpoint < 0 || endpoint === this.dragFlow;
    }

    private commit(before: number[][], next: number[][], flow: number, counted: boolean): MoveResult {
        this.paths = next;
        const newlyConnected: number[] = [];
        const broken: number[] = [];
        for (let index = 0; index < this.flowCount; index++) {
            const was = this.isConnected(index, before);
            const now = this.isConnected(index, next);
            if (now && !was) newlyConnected.push(index);
            if (was && !now) broken.push(index);
        }
        const allConnected = this.connectedCount(next) === this.flowCount;
        const full = this.filledCount(next) === this.cells;
        this._status = allConnected && full ? "solved" : "playing";
        return {
            changed: true,
            flow,
            counted,
            newlyConnected,
            broken,
            status: this._status,
            almost: allConnected && !full,
        };
    }

    private idleResult(flow: number): MoveResult {
        const allConnected = this.connectedCount(this.paths) === this.flowCount;
        return {
            changed: false,
            flow,
            counted: false,
            newlyConnected: [],
            broken: [],
            status: this._status,
            almost: allConnected && this._status !== "solved",
        };
    }

    /**
     * Order the solution's cells for `flow` into a path from `a` to `b`.
     *
     * A depth-first walk, not a greedy one: a flow may brush against itself,
     * and at such a cell the first same-coloured neighbour is not necessarily
     * the next step. The solver has already proved this ordering is unique.
     */
    private traceSolution(flow: number): number[] {
        const pair = this.puzzle.flows[flow];
        if (!pair) return [];
        const start = this.indexOf(pair.a);
        const end = this.indexOf(pair.b);
        const total = this.puzzle.solution.filter((owner) => owner === flow).length;
        const path = [start];
        const seen = new Set(path);
        const walk = (current: number): boolean => {
            if (current === end) return path.length === total;
            for (const next of this.neighbours(current)) {
                if (seen.has(next) || this.puzzle.solution[next] !== flow) continue;
                seen.add(next);
                path.push(next);
                if (walk(next)) return true;
                path.pop();
                seen.delete(next);
            }
            return false;
        };
        return walk(start) ? path : [start];
    }

    neighbours(index: number): number[] {
        const x = index % this.size;
        const y = Math.floor(index / this.size);
        const list: number[] = [];
        if (x > 0) list.push(index - 1);
        if (x < this.size - 1) list.push(index + 1);
        if (y > 0) list.push(index - this.size);
        if (y < this.size - 1) list.push(index + this.size);
        return list;
    }
}

function samePath(a: readonly number[], b: readonly number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function samePathEitherWay(a: readonly number[], b: readonly number[]): boolean {
    if (samePath(a, b)) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[b.length - 1 - i]) return false;
    return true;
}
