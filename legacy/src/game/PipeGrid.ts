import { LevelDef } from "./LevelData";

export interface GridCoord {
    row: number;
    col: number;
}

export interface Cell {
    row: number;
    col: number;
    colorIndex: number; // -1 if empty
    isEndpoint: boolean;
    pairId: number; // -1 if empty
}

export class PipeGrid {
    readonly rows: number;
    readonly cols: number;
    private cells: Cell[][];
    private paths: Map<number, GridCoord[]>;
    private completedPairs: Set<number>;

    // Active drawing state
    private activePairId = -1;

    constructor(private level: LevelDef) {
        this.rows = level.gridSize;
        this.cols = level.gridSize;
        this.paths = new Map();
        this.completedPairs = new Set();

        // Initialize empty grid
        this.cells = [];
        for (let r = 0; r < this.rows; r++) {
            this.cells[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.cells[r][c] = {
                    row: r,
                    col: c,
                    colorIndex: -1,
                    isEndpoint: false,
                    pairId: -1,
                };
            }
        }

        // Place endpoints
        for (let i = 0; i < level.pairs.length; i++) {
            const pair = level.pairs[i];
            const cellA = this.cells[pair.a.row][pair.a.col];
            cellA.colorIndex = pair.colorIndex;
            cellA.isEndpoint = true;
            cellA.pairId = i;

            const cellB = this.cells[pair.b.row][pair.b.col];
            cellB.colorIndex = pair.colorIndex;
            cellB.isEndpoint = true;
            cellB.pairId = i;

            this.paths.set(i, []);
        }
    }

    getCell(row: number, col: number): Cell {
        return this.cells[row][col];
    }

    isInBounds(row: number, col: number): boolean {
        return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
    }

    getPath(pairId: number): GridCoord[] {
        return this.paths.get(pairId) || [];
    }

    isPathComplete(pairId: number): boolean {
        return this.completedPairs.has(pairId);
    }

    isDrawing(): boolean {
        return this.activePairId !== -1;
    }

    getActivePairId(): number {
        return this.activePairId;
    }

    getActivePath(): GridCoord[] {
        if (this.activePairId === -1) return [];
        return this.paths.get(this.activePairId) || [];
    }

    // Start drawing a path from an endpoint or existing pipe cell
    startPath(row: number, col: number): boolean {
        if (!this.isInBounds(row, col)) return false;

        const cell = this.cells[row][col];

        if (cell.isEndpoint) {
            const pairId = cell.pairId;
            this.completedPairs.delete(pairId);
            this.clearPathCells(pairId);
            this.paths.set(pairId, [{ row, col }]);
            this.activePairId = pairId;
            return true;
        }

        // Tapped on an existing pipe — trace back to nearest endpoint
        if (cell.pairId !== -1) {
            const pairId = cell.pairId;
            this.completedPairs.delete(pairId);
            const path = this.paths.get(pairId) || [];

            // Find this cell in the path and truncate
            const idx = path.findIndex((c) => c.row === row && c.col === col);
            if (idx !== -1) {
                // Clear cells after this point
                const removed = path.splice(idx + 1);
                for (const coord of removed) {
                    const rc = this.cells[coord.row][coord.col];
                    if (!rc.isEndpoint) {
                        rc.colorIndex = -1;
                        rc.pairId = -1;
                    }
                }
                this.activePairId = pairId;
                return true;
            }
        }

        return false;
    }

    // Extend the current path to an adjacent cell
    extendPath(row: number, col: number): boolean {
        if (this.activePairId === -1) return false;
        if (!this.isInBounds(row, col)) return false;

        const path = this.paths.get(this.activePairId)!;
        if (path.length === 0) return false;

        const last = path[path.length - 1];

        // Must be adjacent (4-directional)
        if (!this.isAdjacent(last, { row, col })) return false;

        // Same cell — ignore
        if (last.row === row && last.col === col) return false;

        const cell = this.cells[row][col];

        // Backtracking: if this cell is already in our path, truncate to it
        const existingIdx = path.findIndex((c) => c.row === row && c.col === col);
        if (existingIdx !== -1) {
            const removed = path.splice(existingIdx + 1);
            for (const coord of removed) {
                const rc = this.cells[coord.row][coord.col];
                if (!rc.isEndpoint) {
                    rc.colorIndex = -1;
                    rc.pairId = -1;
                }
            }
            return true;
        }

        // If it's an endpoint of a different pair, can't go there
        if (cell.isEndpoint && cell.pairId !== this.activePairId) {
            return false;
        }

        // If it's the other endpoint of our pair, complete the path
        if (cell.isEndpoint && cell.pairId === this.activePairId) {
            path.push({ row, col });
            this.completedPairs.add(this.activePairId);
            this.activePairId = -1;
            return true;
        }

        // If it belongs to another pair's path, truncate the victim from this cell onward
        if (cell.pairId !== -1 && cell.pairId !== this.activePairId) {
            this.completedPairs.delete(cell.pairId);
            this.truncatePathAt(cell.pairId, row, col);
        }

        // Add cell to path
        const pair = this.level.pairs[this.activePairId];
        cell.colorIndex = pair.colorIndex;
        cell.pairId = this.activePairId;
        path.push({ row, col });

        return true;
    }

    // Finish drawing (release pointer)
    finishPath(): void {
        this.activePairId = -1;
    }

    // Clear a pair's path (keep endpoints)
    clearPath(pairId: number): void {
        this.completedPairs.delete(pairId);
        this.clearPathCells(pairId);
        this.paths.set(pairId, []);
    }

    // Clear all paths
    clearAll(): void {
        for (let i = 0; i < this.level.pairs.length; i++) {
            this.clearPath(i);
        }
        this.activePairId = -1;
    }

    // Check if all pairs connected and grid is full
    checkWin(): boolean {
        // All pairs must be complete
        for (let i = 0; i < this.level.pairs.length; i++) {
            if (!this.completedPairs.has(i)) return false;
        }

        // All cells must be filled
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.cells[r][c].pairId === -1) return false;
            }
        }

        return true;
    }

    getCompletedCount(): number {
        return this.completedPairs.size;
    }

    getFilledCount(): number {
        let count = 0;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.cells[r][c].pairId !== -1) count++;
            }
        }
        return count;
    }

    private isAdjacent(a: GridCoord, b: GridCoord): boolean {
        return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
    }

    // Remove all non-endpoint cells of a pair from the grid
    private clearPathCells(pairId: number): void {
        const path = this.paths.get(pairId);
        if (!path) return;

        for (const coord of path) {
            const cell = this.cells[coord.row][coord.col];
            if (!cell.isEndpoint) {
                cell.colorIndex = -1;
                cell.pairId = -1;
            }
        }
    }

    // Truncate a victim pair's path from a given cell onward, preserving the segment before it
    private truncatePathAt(pairId: number, row: number, col: number): void {
        const path = this.paths.get(pairId);
        if (!path) return;

        const idx = path.findIndex((c) => c.row === row && c.col === col);
        if (idx === -1) {
            // Cell not in path array — clear the whole path as fallback
            this.clearPathCells(pairId);
            this.paths.set(pairId, []);
            return;
        }

        // Remove cells from idx onward and clear them
        const removed = path.splice(idx);
        for (const coord of removed) {
            const cell = this.cells[coord.row][coord.col];
            if (!cell.isEndpoint) {
                cell.colorIndex = -1;
                cell.pairId = -1;
            }
        }
    }
}
