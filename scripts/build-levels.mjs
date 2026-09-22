#!/usr/bin/env node
/**
 * Generate the shipped level packs into src/game/flow/levels.json.
 *
 *   npm run levels
 *
 * Deterministic: the same generator, the same seeds, the same file. For every
 * pack it generates twice as many unique-solution boards as it ships, scores
 * each by how hard the solver had to work to prove it (and by how few flows it
 * has — fewer flows means longer, more tangled paths), and keeps the pack's
 * worth in ascending difficulty. That is what gives a pack a curve instead of
 * a shuffle.
 *
 * Changing the generator changes every level. Bump `version` when that is
 * intended, because saved progress is keyed by pack and index.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { generatePuzzle } from "../src/game/flow/generator.ts";
import { LEVELS_PER_PACK, PACKS } from "../src/game/flow/levels.ts";

const VERSION = 1;
const OUTPUT = path.join(process.cwd(), "src", "game", "flow", "levels.json");

function packSeed(packId, candidate) {
    let hash = 0x811c9dc5;
    for (const char of `flow-connect:pack:${packId}:${candidate}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

const packs = {};
for (const pack of PACKS) {
    const started = performance.now();
    const candidates = [];
    const seen = new Set();
    for (let candidate = 0; candidates.length < LEVELS_PER_PACK * 2 && candidate < LEVELS_PER_PACK * 12; candidate++) {
        const result = generatePuzzle({
            size: pack.size,
            minFlows: pack.minFlows,
            maxFlows: pack.maxFlows,
            seed: packSeed(pack.id, candidate),
        });
        if (!result) continue;
        const key = result.puzzle.solution.join("");
        if (seen.has(key)) continue;
        seen.add(key);
        const difficulty = Math.log2(1 + result.nodes) - result.puzzle.flows.length * 0.6;
        candidates.push({ puzzle: result.puzzle, difficulty });
    }
    if (candidates.length < LEVELS_PER_PACK) {
        console.error(`pack ${pack.id}: only ${candidates.length} unique boards`);
        process.exit(1);
    }
    candidates.sort((a, b) => a.difficulty - b.difficulty);
    // Keep an even spread of the candidate range rather than the easiest half,
    // so the last level of a pack is genuinely the hardest one generated.
    const chosen = [];
    for (let i = 0; i < LEVELS_PER_PACK; i++) {
        chosen.push(candidates[Math.round((i * (candidates.length - 1)) / (LEVELS_PER_PACK - 1))]);
    }
    packs[pack.id] = chosen.map(({ puzzle }) => ({
        f: puzzle.flows.map((flow) => [flow.a.x, flow.a.y, flow.b.x, flow.b.y]),
        s: puzzle.solution.map((flow) => flow.toString(36)).join(""),
    }));
    const flows = chosen.map(({ puzzle }) => puzzle.flows.length);
    console.log(
        `  ${pack.id.padEnd(10)} ${pack.size}x${pack.size}  ${chosen.length} levels  flows ${Math.min(...flows)}-${Math.max(...flows)}  ${Math.round(performance.now() - started)} ms`,
    );
}

// One level per line: diffs stay readable when the generator changes.
const lines = [`{`, `  "version": ${VERSION},`, `  "packs": {`];
const packIds = Object.keys(packs);
packIds.forEach((id, packIndex) => {
    lines.push(`    "${id}": [`);
    packs[id].forEach((level, index) => {
        const comma = index < packs[id].length - 1 ? "," : "";
        lines.push(`      ${JSON.stringify(level)}${comma}`);
    });
    lines.push(`    ]${packIndex < packIds.length - 1 ? "," : ""}`);
});
lines.push(`  }`, `}`, ``);
fs.writeFileSync(OUTPUT, lines.join("\n"));
console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)}`);
