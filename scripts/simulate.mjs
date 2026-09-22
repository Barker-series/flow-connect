#!/usr/bin/env node
/**
 * Deterministic headless proof for FLOW CONNECT.
 *
 * `src/game/flow/` imports nothing from Pixi, React, or the store, so it runs
 * here exactly as it runs in the browser (Node 22+ strips the types on import).
 *
 *   npm run simulate   the rules, every shipped level, the Daily Flow, rewards
 *   npm run balance    the spark economy against the hint price
 *
 * A level with two solutions still looks like a perfectly good level on
 * screen, and a drag rule that silently drops a crossed flow just feels like a
 * fumble. Neither is catchable by playing, so both are proved here.
 */
import process from "node:process";
import { FlowGame } from "../src/game/flow/game.ts";
import { generatePuzzle } from "../src/game/flow/generator.ts";
import { allPackLevels, DAILY, dailyPuzzle, dailySeed, LEVELS_PER_PACK, PACKS } from "../src/game/flow/levels.ts";
import { HINT_COST, isPerfect, levelReward, STARTING_SPARKS } from "../src/game/flow/scoring.ts";
import { solve } from "../src/game/flow/solver.ts";

let failures = 0;
function check(condition, message) {
    if (condition) return;
    failures += 1;
    console.error(`  FAIL  ${message}`);
}

/** Play a path by dragging through it, as a finger would. `stride` skips cells like a fast swipe. */
function drawPath(game, path, stride = 1) {
    const flow = game.beginDrag(path[0]);
    for (let i = stride; i < path.length; i += stride) game.dragTo(path[i]);
    game.dragTo(path[path.length - 1]);
    const result = game.endDrag();
    return { flow, result };
}

// ---------------------------------------------------------------------------
// Every shipped level: well-formed, uniquely solvable, and playable to perfect
// ---------------------------------------------------------------------------

function checkShippedLevels() {
    const levels = allPackLevels();
    const expected = PACKS.length * LEVELS_PER_PACK;
    check(levels.length === expected, `expected ${expected} levels, found ${levels.length}`);
    const seen = new Set();
    for (const { packId, index, puzzle } of levels) {
        const name = `${packId} #${index + 1}`;
        const cells = puzzle.size * puzzle.size;
        check(puzzle.solution.length === cells, `${name}: solution has ${puzzle.solution.length} cells`);
        check(
            puzzle.solution.every((flow) => flow >= 0 && flow < puzzle.flows.length),
            `${name}: solution leaves a cell unassigned`,
        );
        const key = puzzle.solution.join("");
        check(!seen.has(key), `${name}: duplicate of an earlier level`);
        seen.add(key);

        // Unique, and the unique answer is the stored one.
        const proof = solve(puzzle, { limit: 2, maxNodes: 2_000_000 });
        check(!proof.exhausted, `${name}: solver ran out of budget`);
        check(proof.solutions === 1, `${name}: has ${proof.solutions} solutions, must have exactly one`);
        if (proof.first) {
            check(
                [...proof.first].every((flow, cell) => flow === puzzle.solution[cell]),
                `${name}: stored solution disagrees with the solver's`,
            );
        }

        // Playable through the real rules, one drag per flow → a perfect.
        const game = new FlowGame(puzzle);
        game.solutionPaths.forEach((path, flow) => {
            const pair = puzzle.flows[flow];
            check(path.length >= 3, `${name}: flow ${flow} is shorter than three cells`);
            check(
                path[path.length - 1] === pair.b.y * puzzle.size + pair.b.x,
                `${name}: flow ${flow}'s stored path does not reach its endpoint`,
            );
            drawPath(game, path);
        });
        check(game.status === "solved", `${name}: drawing the solution did not solve the board`);
        check(
            isPerfect(game.moves, puzzle.flows.length, game.hintsUsed),
            `${name}: one drag per flow was not a perfect`,
        );
    }
    return levels.length;
}

// ---------------------------------------------------------------------------
// Drag semantics on a real board
// ---------------------------------------------------------------------------

function checkRules() {
    const level = allPackLevels()[0];
    const game = new FlowGame(level.puzzle);
    const [first, second] = game.solutionPaths;

    // A fast swipe that skips cells still draws a contiguous path.
    const { result } = drawPath(game, first, 3);
    check(game.isConnected(0), "a skipping swipe along flow 0 did not connect it");
    check(result.newlyConnected.includes(0), "connecting flow 0 was not reported");
    const path = game.pathOf(0);
    for (let i = 1; i < path.length; i++) {
        const a = game.cellOf(path[i - 1]);
        const b = game.cellOf(path[i]);
        check(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1, "a path contains a non-adjacent step");
    }
    check(game.moves === 1, `one drag counted ${game.moves} moves`);

    // A connected flow cannot grow past its endpoint.
    const terminal = first[first.length - 1];
    game.beginDrag(first[0]);
    for (const cell of first.slice(1)) game.dragTo(cell);
    for (const cell of game.neighbours(terminal)) game.dragTo(cell);
    check(
        game.pathOf(0)[game.pathOf(0).length - 1] === terminal || game.pathOf(0).includes(terminal) === false,
        "a connected flow grew past its endpoint",
    );
    game.cancelDrag();

    // Continuing the same flow is not a new move; switching flows is.
    game.beginDrag(first[first.length - 2]);
    game.endDrag();
    game.beginDrag(first[0]);
    game.dragTo(first[1]);
    game.endDrag();
    check(game.moves === 1, "re-dragging the same flow counted as a new move");
    check(!game.isConnected(0), "shortening a flow left it connected");
    drawPath(game, first);
    check(game.moves === 1, "reconnecting the same flow counted as a new move");
    drawPath(game, second);
    check(game.moves === 2, "drawing a different flow did not count as a move");

    // Another colour's endpoint is a wall.
    const walls = new FlowGame(level.puzzle);
    let wallChecked = false;
    for (let flow = 0; flow < walls.flowCount && !wallChecked; flow++) {
        const own = walls.solutionPaths[flow];
        for (let i = 1; i < own.length && !wallChecked; i++) {
            const foreign = walls
                .neighbours(own[i])
                .find((cell) => walls.endpointOf[cell] >= 0 && walls.endpointOf[cell] !== flow);
            if (foreign === undefined) continue;
            walls.beginDrag(own[0]);
            for (const cell of own.slice(1, i + 1)) walls.dragTo(cell);
            walls.dragTo(foreign);
            check(!walls.pathOf(flow).includes(foreign), "a drag entered another flow's endpoint");
            walls.cancelDrag();
            wallChecked = true;
        }
    }
    check(wallChecked, "no board position exercised the endpoint wall");

    // Crossing cuts provisionally; backing off restores; lifting commits; undo reverts.
    let crossChecked = false;
    for (const sample of allPackLevels()) {
        const cross = new FlowGame(sample.puzzle);
        drawPath(cross, cross.solutionPaths[1]);
        const victim = cross.solutionPaths[1];
        const own = cross.solutionPaths[0];
        // Find a cell of flow 0's path that neighbours a body cell of flow 1.
        // Never from the terminal cell: a connected flow may not step past it.
        for (let i = 0; i < own.length - 1 && !crossChecked; i++) {
            const hit = cross
                .neighbours(own[i])
                .find((cell) => victim.indexOf(cell) > 0 && victim.indexOf(cell) < victim.length - 1);
            if (hit === undefined) continue;
            cross.beginDrag(own[0]);
            for (const cell of own.slice(1, i + 1)) cross.dragTo(cell);
            const step = cross.dragTo(hit);
            check(step.cut.includes(1), "crossing flow 1 was not reported as a cut");
            check(!cross.isConnected(1), "flow 1 still reads connected while crossed");
            const back = cross.dragTo(own[i]);
            check(back.restored.includes(1), "backing off flow 1 did not restore it");
            check(cross.isConnected(1), "flow 1 was not whole again after backing off");
            cross.dragTo(hit);
            const committed = cross.endDrag();
            check(committed.broken.includes(1), "lifting on flow 1 did not commit the cut");
            check(!cross.isConnected(1), "flow 1 survived a committed cut");
            const undone = cross.undo();
            check(Boolean(undone?.changed), "undo reported no change");
            check(cross.isConnected(1), "undo did not restore the cut flow");
            check(cross.pathOf(0).length === 0, "undo did not remove the crossing drag");
            crossChecked = true;
        }
        if (crossChecked) break;
    }
    check(crossChecked, "no shipped board exercised a crossing");

    // Restart clears everything, keeps the move count, and is undoable.
    const restart = new FlowGame(level.puzzle);
    drawPath(restart, first);
    const movesBefore = restart.moves;
    restart.restart();
    check(
        restart.livePaths().every((p) => p.length === 0),
        "restart left a path behind",
    );
    check(restart.moves === movesBefore, "restart changed the move count");
    restart.undo();
    check(restart.isConnected(0), "undoing a restart did not bring the board back");

    // Hints: repeatedly applying them solves any board, and never counts as perfect.
    for (const sample of allPackLevels().filter((_, i) => i % 11 === 0)) {
        const hinted = new FlowGame(sample.puzzle);
        // Scribble flow 0 through flow 1's cells first so hints have to cut.
        hinted.beginDrag(hinted.solutionPaths[0][0]);
        for (const cell of hinted.solutionPaths[1] ?? []) hinted.dragTo(cell);
        hinted.endDrag();
        let guard = 0;
        while (hinted.status !== "solved" && guard++ < sample.puzzle.flows.length + 2) {
            const flow = hinted.hintFlow();
            if (flow < 0) break;
            hinted.applyHint(flow);
        }
        check(hinted.status === "solved", `${sample.packId} #${sample.index + 1}: hints did not solve the board`);
        check(
            !isPerfect(hinted.moves, sample.puzzle.flows.length, hinted.hintsUsed),
            "a hinted solve counted as perfect",
        );
    }
}

// ---------------------------------------------------------------------------
// Generator determinism and the Daily Flow
// ---------------------------------------------------------------------------

function checkDaily() {
    const a = generatePuzzle({ ...DAILY, seed: 12345 });
    const b = generatePuzzle({ ...DAILY, seed: 12345 });
    check(Boolean(a && b), "the generator failed on a fixed seed");
    if (a && b) check(JSON.stringify(a.puzzle) === JSON.stringify(b.puzzle), "the generator is not deterministic");

    const start = Date.UTC(2026, 0, 1);
    const days = Array.from({ length: 120 }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
    const seeds = new Set();
    let slowest = 0;
    for (const day of days) {
        seeds.add(dailySeed(day));
        const began = performance.now();
        const puzzle = dailyPuzzle(day);
        slowest = Math.max(slowest, performance.now() - began);
        check(Boolean(puzzle), `no Daily Flow for ${day}`);
        if (!puzzle) continue;
        const proof = solve(puzzle, { limit: 2, maxNodes: 2_000_000 });
        check(proof.solutions === 1 && !proof.exhausted, `Daily Flow ${day} is not uniquely solvable`);
    }
    check(seeds.size === days.length, "two days share a Daily Flow seed");
    check(slowest < 250, `the slowest Daily Flow took ${slowest.toFixed(0)} ms to generate on this machine`);
}

// ---------------------------------------------------------------------------
// Rewards and the economy guardrail
// ---------------------------------------------------------------------------

function checkRewards() {
    const base = { size: 5, daily: false, moves: 5, flows: 5, hintsUsed: 0, solvedBefore: false, perfectBefore: false };
    check(levelReward(base).total === 7, `a perfect 5x5 first solve pays ${levelReward(base).total}, expected 7`);
    check(levelReward({ ...base, moves: 6 }).total === 4, "a non-perfect 5x5 first solve should pay 4");
    check(levelReward({ ...base, hintsUsed: 1 }).perfect === false, "a hinted solve counted as perfect");
    check(levelReward({ ...base, solvedBefore: true, moves: 9 }).total === 0, "a messy replay paid sparks");
    check(levelReward({ ...base, solvedBefore: true }).total === 3, "a first perfect on a replay should pay the bonus");
    check(
        levelReward({ ...base, solvedBefore: true, perfectBefore: true }).total === 0,
        "a repeat perfect paid sparks",
    );
    check(
        levelReward({ ...base, size: 9, flows: 10, moves: 10 }).total === 15,
        "a perfect 9x9 first solve should pay 15",
    );
    check(levelReward({ ...base, daily: true }).total === 40, "a perfect Daily Flow should pay 40");
    check(levelReward({ ...base, daily: true, solvedBefore: true }).total === 0, "a Daily Flow paid twice");
}

/**
 * No single pack level may pay for a whole hint, so a hint is always a
 * decision; and perfect play through every pack still funds only a limited
 * stock of them.
 */
function balance(print) {
    let maxLevel = 0;
    let everything = STARTING_SPARKS;
    for (const pack of PACKS) {
        const perfect = levelReward({
            size: pack.size,
            daily: false,
            moves: pack.maxFlows,
            flows: pack.maxFlows,
            hintsUsed: 0,
            solvedBefore: false,
            perfectBefore: false,
        }).total;
        maxLevel = Math.max(maxLevel, perfect);
        everything += perfect * LEVELS_PER_PACK;
        if (print) console.log(`  ${pack.id.padEnd(10)} perfect first solve pays ${perfect} sparks`);
    }
    check(maxLevel < HINT_COST, `a single level pays ${maxLevel} sparks — at least a whole hint (${HINT_COST})`);
    const hints = Math.floor(everything / HINT_COST);
    const levels = PACKS.length * LEVELS_PER_PACK;
    if (print) console.log(`  every pack level perfect: ${everything} sparks ≈ ${hints} hints across ${levels} levels`);
    check(hints < levels * 0.4, `perfect play funds ${hints} hints — hints would stop being a decision`);
}

console.log("FLOW CONNECT simulation");
const levelCount = checkShippedLevels();
checkRules();
checkDaily();
checkRewards();
balance(process.argv.includes("--sweep"));

if (failures > 0) {
    console.error(`Simulation failed: ${failures} problem(s).`);
    process.exit(1);
}
console.log(
    `Simulation passed: ${levelCount} shipped levels uniquely solvable and perfect-playable; drag, cut, undo, restart, hints, Daily Flow and rewards intact.`,
);
