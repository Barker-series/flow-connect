export interface Endpoint {
    row: number;
    col: number;
}

export interface FlowPair {
    colorIndex: number;
    a: Endpoint;
    b: Endpoint;
}

export interface LevelDef {
    gridSize: number;
    pairs: FlowPair[];
}

// All levels generated from Hamiltonian paths and verified solvable by backtracking solver.
// Each grid is fully fillable with non-crossing paths.

export const LEVELS: LevelDef[] = [
    // --- 5x5 Levels (5 pairs each) ---

    // Level 1 (5x5)
    {
        gridSize: 5,
        pairs: [
            { colorIndex: 0, a: { row: 4, col: 4 }, b: { row: 4, col: 0 } },
            { colorIndex: 1, a: { row: 3, col: 0 }, b: { row: 0, col: 1 } },
            { colorIndex: 2, a: { row: 1, col: 1 }, b: { row: 2, col: 1 } },
            { colorIndex: 3, a: { row: 3, col: 1 }, b: { row: 1, col: 3 } },
            { colorIndex: 4, a: { row: 1, col: 4 }, b: { row: 0, col: 4 } },
        ],
    },

    // Level 2 (5x5)
    {
        gridSize: 5,
        pairs: [
            { colorIndex: 0, a: { row: 0, col: 2 }, b: { row: 1, col: 4 } },
            { colorIndex: 1, a: { row: 2, col: 4 }, b: { row: 2, col: 2 } },
            { colorIndex: 2, a: { row: 3, col: 2 }, b: { row: 3, col: 0 } },
            { colorIndex: 3, a: { row: 3, col: 1 }, b: { row: 2, col: 1 } },
            { colorIndex: 4, a: { row: 2, col: 0 }, b: { row: 0, col: 0 } },
        ],
    },

    // Level 3 (5x5)
    {
        gridSize: 5,
        pairs: [
            { colorIndex: 0, a: { row: 4, col: 2 }, b: { row: 3, col: 4 } },
            { colorIndex: 1, a: { row: 3, col: 3 }, b: { row: 2, col: 2 } },
            { colorIndex: 2, a: { row: 2, col: 3 }, b: { row: 0, col: 2 } },
            { colorIndex: 3, a: { row: 0, col: 1 }, b: { row: 2, col: 1 } },
            { colorIndex: 4, a: { row: 2, col: 0 }, b: { row: 4, col: 0 } },
        ],
    },

    // Level 4 (5x5)
    {
        gridSize: 5,
        pairs: [
            { colorIndex: 0, a: { row: 4, col: 4 }, b: { row: 2, col: 4 } },
            { colorIndex: 1, a: { row: 1, col: 4 }, b: { row: 0, col: 4 } },
            { colorIndex: 2, a: { row: 0, col: 3 }, b: { row: 3, col: 3 } },
            { colorIndex: 3, a: { row: 4, col: 3 }, b: { row: 1, col: 2 } },
            { colorIndex: 4, a: { row: 0, col: 2 }, b: { row: 3, col: 1 } },
        ],
    },

    // Level 5 (5x5)
    {
        gridSize: 5,
        pairs: [
            { colorIndex: 0, a: { row: 1, col: 1 }, b: { row: 2, col: 1 } },
            { colorIndex: 1, a: { row: 2, col: 2 }, b: { row: 1, col: 4 } },
            { colorIndex: 2, a: { row: 1, col: 3 }, b: { row: 4, col: 4 } },
            { colorIndex: 3, a: { row: 4, col: 3 }, b: { row: 3, col: 1 } },
            { colorIndex: 4, a: { row: 3, col: 0 }, b: { row: 4, col: 0 } },
        ],
    },

    // --- 6x6 Levels (6 pairs each) ---

    // Level 6 (6x6)
    {
        gridSize: 6,
        pairs: [
            { colorIndex: 0, a: { row: 2, col: 4 }, b: { row: 0, col: 2 } },
            { colorIndex: 1, a: { row: 0, col: 1 }, b: { row: 3, col: 2 } },
            { colorIndex: 2, a: { row: 3, col: 1 }, b: { row: 5, col: 0 } },
            { colorIndex: 3, a: { row: 5, col: 1 }, b: { row: 4, col: 1 } },
            { colorIndex: 4, a: { row: 4, col: 2 }, b: { row: 4, col: 4 } },
            { colorIndex: 5, a: { row: 3, col: 4 }, b: { row: 5, col: 4 } },
        ],
    },

    // Level 7 (6x6)
    {
        gridSize: 6,
        pairs: [
            { colorIndex: 0, a: { row: 5, col: 5 }, b: { row: 4, col: 4 } },
            { colorIndex: 1, a: { row: 4, col: 5 }, b: { row: 2, col: 4 } },
            { colorIndex: 2, a: { row: 3, col: 4 }, b: { row: 2, col: 3 } },
            { colorIndex: 3, a: { row: 1, col: 3 }, b: { row: 0, col: 0 } },
            { colorIndex: 4, a: { row: 1, col: 0 }, b: { row: 3, col: 2 } },
            { colorIndex: 5, a: { row: 2, col: 2 }, b: { row: 1, col: 2 } },
        ],
    },

    // Level 8 (6x6)
    {
        gridSize: 6,
        pairs: [
            { colorIndex: 0, a: { row: 3, col: 3 }, b: { row: 0, col: 1 } },
            { colorIndex: 1, a: { row: 0, col: 0 }, b: { row: 1, col: 4 } },
            { colorIndex: 2, a: { row: 2, col: 4 }, b: { row: 2, col: 3 } },
            { colorIndex: 3, a: { row: 2, col: 2 }, b: { row: 4, col: 2 } },
            { colorIndex: 4, a: { row: 5, col: 2 }, b: { row: 4, col: 3 } },
            { colorIndex: 5, a: { row: 4, col: 4 }, b: { row: 4, col: 5 } },
        ],
    },

    // Level 9 (6x6)
    {
        gridSize: 6,
        pairs: [
            { colorIndex: 0, a: { row: 5, col: 1 }, b: { row: 4, col: 0 } },
            { colorIndex: 1, a: { row: 3, col: 0 }, b: { row: 4, col: 2 } },
            { colorIndex: 2, a: { row: 5, col: 2 }, b: { row: 2, col: 2 } },
            { colorIndex: 3, a: { row: 1, col: 2 }, b: { row: 0, col: 2 } },
            { colorIndex: 4, a: { row: 0, col: 3 }, b: { row: 1, col: 4 } },
            { colorIndex: 5, a: { row: 1, col: 3 }, b: { row: 3, col: 4 } },
        ],
    },

    // Level 10 (6x6)
    {
        gridSize: 6,
        pairs: [
            { colorIndex: 0, a: { row: 1, col: 2 }, b: { row: 0, col: 0 } },
            { colorIndex: 1, a: { row: 1, col: 0 }, b: { row: 3, col: 0 } },
            { colorIndex: 2, a: { row: 3, col: 1 }, b: { row: 4, col: 1 } },
            { colorIndex: 3, a: { row: 4, col: 0 }, b: { row: 1, col: 5 } },
            { colorIndex: 4, a: { row: 1, col: 4 }, b: { row: 3, col: 3 } },
            { colorIndex: 5, a: { row: 4, col: 3 }, b: { row: 4, col: 4 } },
        ],
    },

    // --- 7x7 Levels (7 pairs each) ---

    // Level 11 (7x7)
    {
        gridSize: 7,
        pairs: [
            { colorIndex: 0, a: { row: 4, col: 4 }, b: { row: 4, col: 5 } },
            { colorIndex: 1, a: { row: 5, col: 5 }, b: { row: 5, col: 3 } },
            { colorIndex: 2, a: { row: 6, col: 3 }, b: { row: 5, col: 1 } },
            { colorIndex: 3, a: { row: 6, col: 1 }, b: { row: 5, col: 0 } },
            { colorIndex: 4, a: { row: 4, col: 0 }, b: { row: 3, col: 1 } },
            { colorIndex: 5, a: { row: 3, col: 0 }, b: { row: 1, col: 5 } },
            { colorIndex: 6, a: { row: 1, col: 4 }, b: { row: 0, col: 0 } },
        ],
    },

    // Level 12 (7x7)
    {
        gridSize: 7,
        pairs: [
            { colorIndex: 0, a: { row: 5, col: 1 }, b: { row: 4, col: 5 } },
            { colorIndex: 1, a: { row: 5, col: 5 }, b: { row: 3, col: 4 } },
            { colorIndex: 2, a: { row: 2, col: 4 }, b: { row: 0, col: 4 } },
            { colorIndex: 3, a: { row: 0, col: 3 }, b: { row: 1, col: 3 } },
            { colorIndex: 4, a: { row: 2, col: 3 }, b: { row: 0, col: 2 } },
            { colorIndex: 5, a: { row: 0, col: 1 }, b: { row: 0, col: 0 } },
            { colorIndex: 6, a: { row: 1, col: 0 }, b: { row: 2, col: 0 } },
        ],
    },

    // Level 13 (7x7)
    {
        gridSize: 7,
        pairs: [
            { colorIndex: 0, a: { row: 4, col: 0 }, b: { row: 5, col: 1 } },
            { colorIndex: 1, a: { row: 4, col: 1 }, b: { row: 4, col: 2 } },
            { colorIndex: 2, a: { row: 5, col: 2 }, b: { row: 6, col: 5 } },
            { colorIndex: 3, a: { row: 6, col: 6 }, b: { row: 2, col: 3 } },
            { colorIndex: 4, a: { row: 2, col: 4 }, b: { row: 4, col: 4 } },
            { colorIndex: 5, a: { row: 4, col: 5 }, b: { row: 0, col: 2 } },
            { colorIndex: 6, a: { row: 0, col: 1 }, b: { row: 1, col: 1 } },
        ],
    },

    // Level 14 (7x7)
    {
        gridSize: 7,
        pairs: [
            { colorIndex: 0, a: { row: 4, col: 6 }, b: { row: 2, col: 6 } },
            { colorIndex: 1, a: { row: 1, col: 6 }, b: { row: 3, col: 3 } },
            { colorIndex: 2, a: { row: 3, col: 4 }, b: { row: 4, col: 4 } },
            { colorIndex: 3, a: { row: 4, col: 3 }, b: { row: 4, col: 2 } },
            { colorIndex: 4, a: { row: 4, col: 1 }, b: { row: 5, col: 3 } },
            { colorIndex: 5, a: { row: 5, col: 4 }, b: { row: 6, col: 5 } },
            { colorIndex: 6, a: { row: 6, col: 6 }, b: { row: 5, col: 5 } },
        ],
    },

    // Level 15 (7x7)
    {
        gridSize: 7,
        pairs: [
            { colorIndex: 0, a: { row: 6, col: 0 }, b: { row: 6, col: 1 } },
            { colorIndex: 1, a: { row: 6, col: 2 }, b: { row: 6, col: 3 } },
            { colorIndex: 2, a: { row: 6, col: 4 }, b: { row: 3, col: 1 } },
            { colorIndex: 3, a: { row: 4, col: 1 }, b: { row: 4, col: 2 } },
            { colorIndex: 4, a: { row: 4, col: 3 }, b: { row: 0, col: 5 } },
            { colorIndex: 5, a: { row: 0, col: 4 }, b: { row: 2, col: 2 } },
            { colorIndex: 6, a: { row: 3, col: 2 }, b: { row: 3, col: 3 } },
        ],
    },

    // --- 8x8 Levels (8 pairs each) ---

    // Level 16 (8x8)
    {
        gridSize: 8,
        pairs: [
            { colorIndex: 0, a: { row: 0, col: 3 }, b: { row: 1, col: 7 } },
            { colorIndex: 1, a: { row: 1, col: 6 }, b: { row: 1, col: 3 } },
            { colorIndex: 2, a: { row: 1, col: 2 }, b: { row: 1, col: 0 } },
            { colorIndex: 3, a: { row: 1, col: 1 }, b: { row: 7, col: 0 } },
            { colorIndex: 4, a: { row: 7, col: 1 }, b: { row: 6, col: 1 } },
            { colorIndex: 5, a: { row: 5, col: 1 }, b: { row: 6, col: 2 } },
            { colorIndex: 6, a: { row: 7, col: 2 }, b: { row: 2, col: 4 } },
            { colorIndex: 7, a: { row: 2, col: 5 }, b: { row: 7, col: 7 } },
        ],
    },

    // Level 17 (8x8)
    {
        gridSize: 8,
        pairs: [
            { colorIndex: 0, a: { row: 1, col: 1 }, b: { row: 2, col: 0 } },
            { colorIndex: 1, a: { row: 2, col: 1 }, b: { row: 2, col: 4 } },
            { colorIndex: 2, a: { row: 1, col: 4 }, b: { row: 3, col: 7 } },
            { colorIndex: 3, a: { row: 4, col: 7 }, b: { row: 7, col: 2 } },
            { colorIndex: 4, a: { row: 7, col: 1 }, b: { row: 4, col: 0 } },
            { colorIndex: 5, a: { row: 3, col: 0 }, b: { row: 5, col: 6 } },
            { colorIndex: 6, a: { row: 6, col: 6 }, b: { row: 5, col: 2 } },
            { colorIndex: 7, a: { row: 5, col: 3 }, b: { row: 5, col: 4 } },
        ],
    },

    // Level 18 (8x8)
    {
        gridSize: 8,
        pairs: [
            { colorIndex: 0, a: { row: 7, col: 4 }, b: { row: 7, col: 6 } },
            { colorIndex: 1, a: { row: 7, col: 7 }, b: { row: 7, col: 3 } },
            { colorIndex: 2, a: { row: 7, col: 2 }, b: { row: 6, col: 2 } },
            { colorIndex: 3, a: { row: 5, col: 2 }, b: { row: 1, col: 1 } },
            { colorIndex: 4, a: { row: 1, col: 2 }, b: { row: 2, col: 5 } },
            { colorIndex: 5, a: { row: 2, col: 4 }, b: { row: 3, col: 3 } },
            { colorIndex: 6, a: { row: 3, col: 4 }, b: { row: 4, col: 5 } },
            { colorIndex: 7, a: { row: 3, col: 5 }, b: { row: 4, col: 6 } },
        ],
    },

    // Level 19 (8x8)
    {
        gridSize: 8,
        pairs: [
            { colorIndex: 0, a: { row: 0, col: 0 }, b: { row: 5, col: 0 } },
            { colorIndex: 1, a: { row: 6, col: 0 }, b: { row: 6, col: 3 } },
            { colorIndex: 2, a: { row: 6, col: 2 }, b: { row: 4, col: 4 } },
            { colorIndex: 3, a: { row: 4, col: 3 }, b: { row: 4, col: 1 } },
            { colorIndex: 4, a: { row: 3, col: 1 }, b: { row: 0, col: 1 } },
            { colorIndex: 5, a: { row: 1, col: 1 }, b: { row: 2, col: 2 } },
            { colorIndex: 6, a: { row: 1, col: 2 }, b: { row: 1, col: 5 } },
            { colorIndex: 7, a: { row: 1, col: 6 }, b: { row: 2, col: 5 } },
        ],
    },

    // Level 20 (8x8)
    {
        gridSize: 8,
        pairs: [
            { colorIndex: 0, a: { row: 1, col: 4 }, b: { row: 2, col: 5 } },
            { colorIndex: 1, a: { row: 2, col: 6 }, b: { row: 7, col: 6 } },
            { colorIndex: 2, a: { row: 7, col: 5 }, b: { row: 7, col: 3 } },
            { colorIndex: 3, a: { row: 7, col: 2 }, b: { row: 3, col: 1 } },
            { colorIndex: 4, a: { row: 4, col: 1 }, b: { row: 6, col: 4 } },
            { colorIndex: 5, a: { row: 6, col: 5 }, b: { row: 6, col: 6 } },
            { colorIndex: 6, a: { row: 5, col: 6 }, b: { row: 4, col: 4 } },
            { colorIndex: 7, a: { row: 4, col: 5 }, b: { row: 3, col: 5 } },
        ],
    },
];
