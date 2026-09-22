/** Plain data shared by the rules, the generator, and the solver. */

export interface Cell {
    x: number;
    y: number;
}

/** One colour: two endpoints that must be joined by a single path. */
export interface FlowPair {
    /** Colour index into the active palette. */
    colour: number;
    a: Cell;
    b: Cell;
}

export interface FlowPuzzle {
    /** Square board edge, in cells. */
    size: number;
    flows: FlowPair[];
    /**
     * The intended solution, row-major, as a flow index per cell. Shipped with
     * the puzzle so hints never have to re-solve on device, and so
     * `npm run simulate` can prove the stored answer actually solves the board.
     */
    solution: number[];
}
