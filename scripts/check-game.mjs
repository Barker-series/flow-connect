#!/usr/bin/env node
/**
 * Invariants that a typechecker cannot see.
 *
 * These are the things that silently rot: a shop id that drifts away from the
 * catalog it is supposed to name, a LiveOps file that forgets a placement and
 * leaves it fail-closed forever, a `Math.random()` sneaking into game logic, a
 * build that stops using relative asset paths. Each one ships fine, typechecks
 * fine, and is wrong.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
    return JSON.parse(read(relativePath));
}

function expect(condition, message) {
    if (!condition) failures.push(message);
}

function sourceFiles(directory) {
    const absolute = path.join(root, directory);
    if (!fs.existsSync(absolute)) return [];
    return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
        const relative = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(relative);
        return /\.(?:ts|tsx)$/.test(entry.name) ? [relative] : [];
    });
}

const sources = sourceFiles("src");

// ---------------------------------------------------------------------------
// Randomness — ../docs/run-workflow.md forbids Math.random in game logic
// ---------------------------------------------------------------------------

for (const file of sources) {
    const text = read(file);
    if (!/Math\.random\s*\(/.test(text)) continue;
    expect(false, `${file} uses Math.random(); game randomness must go through NoiseRandom`);
}

// ---------------------------------------------------------------------------
// Platform ids must match the configs that register them
// ---------------------------------------------------------------------------

const platform = read("src/config/platform.ts");
const platformIds = Object.fromEntries(
    [...platform.matchAll(/^\s{4}(\w+):\s*"([^"]+)"/gm)].map((match) => [match[1], match[2]]),
);

const shop = readJson("rundot/shop.config.json");
const shopItemIds = new Set(shop.items.map((item) => item.itemId));
const shopEntitlementIds = new Set(shop.items.flatMap((item) => item.entitlements.map((e) => e.entitlementId)));

for (const key of ["tubePackItem", "adFreeItem", "powerPassItem"]) {
    expect(
        shopItemIds.has(platformIds[key]),
        `PLATFORM_IDS.${key} (${platformIds[key]}) is not in rundot/shop.config.json`,
    );
}
for (const key of ["tubePackEntitlement", "adFreeEntitlement", "prismTubesEntitlement"]) {
    expect(
        shopEntitlementIds.has(platformIds[key]),
        `PLATFORM_IDS.${key} (${platformIds[key]}) is granted by no shop item`,
    );
}

// The required Run Bits channel: at least one active item priced in `bucks`.
const runBitsItems = shop.items.filter((item) => item.active && item.price?.type === "bucks");
expect(runBitsItems.length > 0, "no active shop item is priced in Run Bits (price.type must be 'bucks')");
for (const item of shop.items) {
    expect(
        typeof item.price?.value === "string" && Number(item.price.value) > 0,
        `${item.itemId} has no positive price value`,
    );
    expect(item.entitlements.length > 0, `${item.itemId} grants no entitlement`);
}

// The bundle must actually be cheaper than its parts, or it is not a bundle.
const bundle = shop.items.find((item) => item.itemId === platformIds.powerPassItem);
const parts = [platformIds.tubePackItem, platformIds.adFreeItem].map((id) =>
    shop.items.find((item) => item.itemId === id),
);
if (bundle && parts.every(Boolean)) {
    const partsTotal = parts.reduce((sum, item) => sum + Number(item.price.value), 0);
    expect(
        Number(bundle.price.value) < partsTotal,
        `the bundle (${bundle.price.value} RB) must cost less than its parts (${partsTotal} RB)`,
    );
}

// ---------------------------------------------------------------------------
// LiveOps must name every placement and product, or they stay dark forever
// ---------------------------------------------------------------------------

const liveops = readJson("rundot/liveops.config.json");
const monetization = liveops.client?.values?.flowconnect_monetization;
expect(Boolean(monetization), "rundot/liveops.config.json has no flowconnect_monetization section");

if (monetization) {
    expect(
        monetization.enabled === true,
        "flowconnect_monetization.enabled must ship true or every surface stays dark",
    );
    // Scan only the PLACEMENT map. A looser regex over the whole file also
    // matches `model: "hybrid"` in the monetization plan and then demands a
    // LiveOps placement called "hybrid".
    const config = read("src/systems/monetization/config.ts");
    const placementBlock = /export const PLACEMENT = \{([\s\S]*?)\} as const;/.exec(config)?.[1] ?? "";
    const placementIds = [...placementBlock.matchAll(/:\s*"([a-z_]+)"/g)].map((match) => match[1]);
    expect(placementIds.length === 3, `expected 3 placements in config.ts, parsed ${placementIds.length}`);
    for (const id of placementIds) {
        expect(
            monetization.placements?.[id]?.enabled === true,
            `placement "${id}" is missing or disabled in rundot/liveops.config.json`,
        );
    }
    for (const id of ["tube_pack", "ad_free", "power_pass"]) {
        expect(
            monetization.products?.[id]?.enabled === true,
            `product "${id}" is missing or disabled in rundot/liveops.config.json`,
        );
    }
    // Caps must be finite and small; an unbounded daily cap is how a puzzle
    // game turns into an ad rail without anyone deciding to.
    for (const [id, placement] of Object.entries(monetization.placements ?? {})) {
        expect(
            placement.dailyCap > 0 && placement.dailyCap <= 20,
            `${id} dailyCap ${placement.dailyCap} is out of range`,
        );
        expect(
            placement.sessionCap > 0 && placement.sessionCap <= placement.dailyCap,
            `${id} sessionCap ${placement.sessionCap} is out of range`,
        );
    }
}

// ---------------------------------------------------------------------------
// Identity: no template leftovers
// ---------------------------------------------------------------------------

const packageJson = readJson("package.json");
expect(packageJson.name === "flow-connect", `package.json name is "${packageJson.name}"`);
expect(!("three" in (packageJson.dependencies ?? {})), "three is still a dependency but no source imports it");

// README credits the LEADLIGHT foundation on purpose, so it is only checked
// for the generic template names; code, markup and styles must carry neither.
const leftovers = ["PIXEL FOUNDRY", "Pixel Foundry", "pixel-foundry", "rundot_template"];
for (const file of [...sources, "index.html", "src/styles/app.css", "README.md"]) {
    const text = read(file);
    const names = file === "README.md" ? leftovers : [...leftovers, "LEADLIGHT", "leadlight"];
    for (const leftover of names) {
        expect(!text.includes(leftover), `${file} still mentions the template identity "${leftover}"`);
    }
}

// Placeholder ids must be honest about being placeholders, and only where the
// platform is genuinely the thing that has not been provisioned yet.
const placeholderKeys = Object.entries(platformIds)
    .filter(([, value]) => value.startsWith("REPLACE_WITH_"))
    .map(([key]) => key);
expect(
    placeholderKeys.length === 0 || placeholderKeys.join() === "gameId",
    `only gameId may still be a placeholder; found: ${placeholderKeys.join(", ")}`,
);

// ---------------------------------------------------------------------------
// Build and host posture
// ---------------------------------------------------------------------------

const viteConfig = read("vite.config.js");
expect(viteConfig.includes('base: "./"'), "vite.config.js must keep relative asset paths (base: './')");
expect(
    viteConfig.includes("RUNDOT_PLAYGROUND"),
    "the Playground plugin must stay opt-in behind RUNDOT_PLAYGROUND, never always-on",
);

const html = read("index.html");
expect(html.includes("user-scalable=no"), "index.html must keep the locked viewport");
expect(/<title>FLOW CONNECT/.test(html), "index.html title must name the game");

// A game config must never carry ANOTHER game's id: a deploy would overwrite it.
const prodConfig = readJson("game.config.prod.json");
expect(
    prodConfig.gameId !== "HhZKdkXCbYVAhxdHKqTV",
    "game.config.prod.json still carries LEADLIGHT's gameId — deploying would overwrite that game",
);

const css = read("src/styles/app.css");
for (const rule of ["-webkit-user-select: none", "user-select: none", "-webkit-touch-callout: none"]) {
    expect(css.includes(rule), `app.css must disable native selection/callouts (${rule})`);
}
const main = read("src/main.tsx");
for (const guard of ["selectstart", "contextmenu", "dragstart"]) {
    expect(main.includes(guard), `main.tsx must prevent the ${guard} browser gesture`);
}

// ---------------------------------------------------------------------------
// Localization: every t() key must exist in every locale
// ---------------------------------------------------------------------------

const csv = read("src/assets/strings.csv");
const rows = parseCsv(csv);
const header = rows[0] ?? [];
const localeCount = header.length - 1;
const keys = new Map();
for (const row of rows.slice(1)) {
    if (!row[0]) continue;
    expect(!keys.has(row[0]), `strings.csv has a duplicate key: ${row[0]}`);
    keys.set(row[0], row.slice(1));
    for (let index = 0; index < localeCount; index++) {
        expect(Boolean(row[index + 1]?.trim()), `strings.csv: ${row[0]} has no ${header[index + 1]} translation`);
    }
}

const usedKeys = new Set();
for (const file of sources) {
    for (const match of read(file).matchAll(/\bt\(\s*"([A-Za-z][A-Za-z0-9_]*)"/g)) usedKeys.add(match[1]);
}
// Pack names reach t() through `pack.nameKey`, which the regex above cannot see.
for (const match of read("src/game/flow/levels.ts").matchAll(/nameKey: "([A-Za-z]+)"/g)) usedKeys.add(match[1]);
for (const key of usedKeys) {
    expect(keys.has(key), `t("${key}") has no row in strings.csv`);
}
for (const key of keys.keys()) {
    expect(usedKeys.has(key), `strings.csv row "${key}" is never used`);
}

// ---------------------------------------------------------------------------
// Tube sets: every colour in a set must be tellable apart from every other,
// and every tube must be far brighter than the empty cells it runs over.
// ---------------------------------------------------------------------------

const paletteSource = read("src/game/art/palette.ts");
const tubeLists = [
    ...paletteSource.matchAll(/id: "([a-z]+)",[\s\S]*?tubes: \[([^\]]+)\][\s\S]*?empty: (0x[0-9a-f]+)/g),
];
expect(tubeLists.length === 6, `expected 6 tube sets in palette.ts, parsed ${tubeLists.length}`);
for (const [, id, list, empty] of tubeLists) {
    const tubes = list.split(",").map((value) => Number.parseInt(value.trim(), 16));
    expect(tubes.length === 10, `${id} has ${tubes.length} tubes, needs 10 (one per flow)`);
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < tubes.length; i++) {
        for (let j = i + 1; j < tubes.length; j++) closest = Math.min(closest, deltaE(tubes[i], tubes[j]));
    }
    expect(closest >= 22, `${id}: two tubes are only ΔE ${closest.toFixed(1)} apart — players will confuse them`);
    const emptyL = lab(Number.parseInt(empty, 16))[0];
    for (const tube of tubes) {
        expect(lab(tube)[0] - emptyL >= 40, `${id}: a tube is too dark against the empty cell`);
    }
}

function lab(hex) {
    const channel = (value) => {
        const c = value / 255;
        return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
    };
    const r = channel((hex >> 16) & 255);
    const g = channel((hex >> 8) & 255);
    const b = channel(hex & 255);
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE(a, b) {
    const [l1, a1, b1] = lab(a);
    const [l2, a2, b2] = lab(b);
    return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ---------------------------------------------------------------------------
// Store art
// ---------------------------------------------------------------------------

const thumbnail = path.join(root, "public", "thumbnail.jpg");
expect(fs.existsSync(thumbnail), "public/thumbnail.jpg is missing — run `npm run thumbnail`");
if (fs.existsSync(thumbnail)) {
    const bytes = fs.readFileSync(thumbnail);
    expect(bytes.subarray(0, 2).toString("hex") === "ffd8", "public/thumbnail.jpg is not a JPEG");
    const size = jpegSize(bytes);
    expect(
        size?.width === 512 && size?.height === 512,
        `thumbnail must be 512x512, found ${size ? `${size.width}x${size.height}` : "unreadable"}`,
    );
    expect(bytes.length > 8_000, `thumbnail looks empty (${bytes.length} bytes)`);
}

// ---------------------------------------------------------------------------

function jpegSize(bytes) {
    let offset = 2;
    while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1];
        const length = bytes.readUInt16BE(offset + 2);
        // SOF0..SOF15, excluding the DHT/DAC/RST markers in that range.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
    }
    return null;
}

/** Minimal RFC-4180 parser, matching systems/localization.ts. */
function parseCsv(input) {
    const result = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < input.length; index++) {
        const character = input[index];
        if (quoted) {
            if (character === '"' && input[index + 1] === '"') {
                value += '"';
                index++;
            } else if (character === '"') quoted = false;
            else value += character;
        } else if (character === '"') quoted = true;
        else if (character === ",") {
            row.push(value);
            value = "";
        } else if (character === "\n" || character === "\r") {
            if (character === "\r" && input[index + 1] === "\n") index++;
            row.push(value);
            result.push(row);
            row = [];
            value = "";
        } else value += character;
    }
    if (value || row.length > 0) {
        row.push(value);
        result.push(row);
    }
    return result;
}

if (failures.length > 0) {
    console.error("FLOW CONNECT invariant check failed:");
    for (const failure of failures) console.error(`  FAIL  ${failure}`);
    process.exit(1);
}
console.log(
    `FLOW CONNECT invariants intact: ${sources.length} sources, ${shop.items.length} shop items, ${keys.size} localized strings, ${tubeLists.length} tube sets.`,
);
