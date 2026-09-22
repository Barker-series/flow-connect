/**
 * Level rewards — DESIGN.md §4 and §5.
 *
 * Pure arithmetic, imported by the controller and by `npm run simulate`, so the
 * numbers the player is paid are the numbers the balance check proves.
 */

/** What a hint costs, in sparks. */
export const HINT_COST = 30;

/** A new profile starts with enough for this many hints. */
export const STARTING_SPARKS = 60;

export interface LevelOutcome {
    size: number;
    daily: boolean;
    moves: number;
    flows: number;
    hintsUsed: number;
    /** The player had solved this level before this solve. */
    solvedBefore: boolean;
    /** The player had already solved this level perfectly before. */
    perfectBefore: boolean;
}

export interface LevelReward {
    /** Moves equal flows and no hint was taken. */
    perfect: boolean;
    base: number;
    perfectBonus: number;
    total: number;
}

/** One move per flow, no hints: the Flow community's "perfect". */
export function isPerfect(moves: number, flows: number, hintsUsed: number): boolean {
    return hintsUsed === 0 && moves <= flows;
}

/**
 * Sparks for a solve.
 *
 * First solves pay by board size; a perfect pays a bonus once per level. A
 * replay pays nothing unless it earns a perfect the level never had — so
 * replaying level one forever cannot fund hints, but going back to clean up a
 * messy solve is always worth something.
 */
export function levelReward(outcome: LevelOutcome): LevelReward {
    const perfect = isPerfect(outcome.moves, outcome.flows, outcome.hintsUsed);
    if (outcome.daily) {
        if (outcome.solvedBefore) return { perfect, base: 0, perfectBonus: 0, total: 0 };
        const perfectBonus = perfect ? 10 : 0;
        return { perfect, base: 30, perfectBonus, total: 30 + perfectBonus };
    }
    const base = outcome.solvedBefore ? 0 : 4 + 2 * Math.max(0, outcome.size - 5);
    const perfectBonus = perfect && !outcome.perfectBefore ? 3 : 0;
    return { perfect, base, perfectBonus, total: base + perfectBonus };
}
