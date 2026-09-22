#!/usr/bin/env node
/**
 * Headless visual QA.
 *
 * Boots a dev server, drives the game through every screen at four real device
 * viewports, and writes PNGs to `tmp/visual-qa/`. The run FAILS on any page or
 * console error, because the failure mode this game is most exposed to — a Pixi
 * scene that throws while generating its textures — leaves a blank canvas
 * with the React shell still painted on top. That is invisible to a glance and
 * obvious here.
 *
 *   node scripts/visual-qa.mjs            all viewports
 *   node scripts/visual-qa.mjs --phone    just the tall phone
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const root = process.cwd();
const outputDir = path.join(root, "tmp", "visual-qa");
const PORT = 5397;

const VIEWPORTS = [
    { name: "phone-tall", width: 393, height: 852, scale: 2 },
    { name: "phone-short", width: 360, height: 640, scale: 2 },
    { name: "tablet", width: 820, height: 1180, scale: 2 },
    { name: "desktop", width: 1440, height: 900, scale: 1 },
];

const SCREENS = [
    { name: "01-menu", screen: "" },
    { name: "02-levels", screen: "levels" },
    { name: "03-studio", screen: "studio" },
    { name: "04-daily-sparks", screen: "daily-rewards" },
    { name: "05-daily-jobs", screen: "daily-quests" },
    { name: "06-record", screen: "stats" },
    { name: "07-settings", screen: "settings" },
];

/**
 * Solve the board on screen by dragging every flow along its intended path.
 *
 * Every position comes from `__gameQa.geometry()`, which asks the live scene.
 * Computing it from the viewport instead lands on empty stage: in `vite dev`
 * the SDK mock reports a phone-shaped safe area, which shifts the whole layout
 * by tens of design units. `FLOWS` caps how many flows are drawn, so a partial
 * solve can be photographed.
 */
const SOLVE = `(async () => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return "no canvas";
    const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: "touch", clientX: x, clientY: y,
        bubbles: true, cancelable: true, isPrimary: true,
    }));
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let geometry = null;
    for (let attempt = 0; attempt < 30; attempt++) {
        geometry = globalThis.__gameQa?.geometry();
        if (geometry?.solution?.length) break;
        await wait(150);
    }
    if (!geometry) return "no geometry";
    let drawn = 0;
    for (const path of geometry.solution.slice(0, FLOWS)) {
        send("pointerdown", path[0].clientX, path[0].clientY);
        await wait(20);
        for (let i = 1; i < path.length; i++) {
            const a = path[i - 1], b = path[i];
            // Two moves per cell: a drag that jumps a whole cell per event is
            // not what a finger produces.
            send("pointermove", (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
            send("pointermove", b.clientX, b.clientY);
            await wait(12);
        }
        send("pointerup", path[path.length - 1].clientX, path[path.length - 1].clientY);
        await wait(90);
        drawn += 1;
    }
    return "drawn:" + drawn;
})()`;

function solveScript(flows = 99) {
    return SOLVE.replace("FLOWS", String(flows));
}

/**
 * The gates a screenshot cannot cover: audio actually starts and actually
 * stops, the host lifecycle freezes the game, settings survive a reload, and
 * the board is still playable with reduced motion on.
 */
async function checkBehaviour(page, problems) {
    const note = (message) => problems.push(`behaviour: ${message}`);

    await page.goto(`http://localhost:${PORT}/?screen=game&qa=1`, { waitUntil: "load" });
    await page.waitForFunction(() => globalThis.__gameQa !== undefined, null, { timeout: 10_000 });

    // --- audio starts, and muting actually silences the synth ---------------
    await page.evaluate(() => globalThis.__gameQa.unlockAudio());
    await page.waitForTimeout(900);
    let audio = (await page.evaluate(() => globalThis.__gameQa.snapshot())).audio;
    if (audio.contextState !== "running") note(`audio context is "${audio.contextState}", expected running`);
    if (!audio.ambienceRunning) note("the ambience scheduler never started after unlocking");

    await page.evaluate(() => globalThis.__gameQa.setSetting("musicEnabled", false));
    await page.waitForTimeout(600);
    if ((await page.evaluate(() => globalThis.__gameQa.snapshot())).audio.ambienceRunning) {
        note("the ambience scheduler is still running while muted");
    }
    await page.evaluate(() => globalThis.__gameQa.setSetting("musicEnabled", true));

    // --- host lifecycle: hiding the page must suspend audio -----------------
    await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(600);
    audio = (await page.evaluate(() => globalThis.__gameQa.snapshot())).audio;
    if (audio.contextState === "running") note("audio kept running while the page was hidden");
    await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(600);
    audio = (await page.evaluate(() => globalThis.__gameQa.snapshot())).audio;
    if (audio.contextState !== "running") note(`audio did not resume when the page came back (${audio.contextState})`);

    // --- settings and progress survive a reload -----------------------------
    await page.evaluate(async () => {
        await globalThis.__gameQa.setSetting("reducedMotion", true);
        await globalThis.__gameQa.setSetting("hapticsEnabled", false);
        await globalThis.__gameQa.setSetting("quality", "low");
        globalThis.__gameQa.grantSparks(500);
        globalThis.__gameQa.markSolved("spark", 4, true);
        await globalThis.__gameQa.setSetting("levelsCompleted", 4);
    });
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => globalThis.__gameQa !== undefined, null, { timeout: 10_000 });
    const restored = await page.evaluate(() => globalThis.__gameQa.snapshot());
    if (restored.reducedMotion !== true) note("reduced motion did not persist across a reload");
    if (restored.levelsCompleted !== 4) note(`progress did not persist (got ${restored.levelsCompleted})`);
    if (!(restored.sparks >= 500)) note(`sparks did not persist (got ${restored.sparks})`);

    // --- reduced motion is still playable -----------------------------------
    await page.goto(`http://localhost:${PORT}/?screen=game&level=spark:5&qa=1`, { waitUntil: "load" });
    await page.waitForTimeout(900);
    const progressed = await page.evaluate(solveScript());
    if (!String(progressed).startsWith("drawn")) note(`reduced motion could not drive the board (${progressed})`);
    await page.waitForTimeout(900);
    const reduced = await page.evaluate(() => globalThis.__gameQa.snapshot());
    if (!reduced.solved) note("a full solve did not complete with reduced motion enabled");
    await page.screenshot({ path: path.join(outputDir, "20-reduced-motion.png") });

    // Leave the profile as it was found so a later run starts clean.
    await page.evaluate(async () => {
        await globalThis.__gameQa.setSetting("reducedMotion", false);
        await globalThis.__gameQa.setSetting("hapticsEnabled", true);
        await globalThis.__gameQa.setSetting("quality", "high");
    });
}

const onlyPhone = process.argv.includes("--phone");
const viewports = onlyPhone ? VIEWPORTS.slice(0, 1) : VIEWPORTS;

fs.mkdirSync(outputDir, { recursive: true });

const server = await createServer({
    configFile: path.join(root, "vite.config.js"),
    logLevel: "silent",
    server: { port: PORT, strictPort: true },
});
await server.listen();

let browser;
const problems = [];
let shots = 0;

try {
    // Headless Chromium blocks audio until a user gesture, and there is no real
    // gesture here. Allowing autoplay is what makes the audio assertions above
    // measure the actual synth graph rather than a permanently locked context.
    browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

    for (const viewport of viewports) {
        const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: viewport.scale,
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => problems.push(`${viewport.name}: page error: ${error.stack ?? error.message}`));
        page.on("console", (message) => {
            if (message.type() !== "error") return;
            problems.push(`${viewport.name}: console error: ${message.text()}`);
        });

        for (const shot of SCREENS) {
            const query = shot.screen ? `?screen=${shot.screen}&qa=1` : "?qa=1";
            await page.goto(`http://localhost:${PORT}/${query}`, { waitUntil: "load" });
            await page.waitForTimeout(800);
            await page.screenshot({ path: path.join(outputDir, `${viewport.name}-${shot.name}.png`) });
            shots += 1;

            // Long screens hide their tail below the fold, and the tail is where
            // the products and the safety notes live. Photograph the bottom too,
            // or half of a scrolling screen is never reviewed.
            const scrolled = await page.evaluate(() => {
                const region = document.querySelector("[data-testid='screen-scroll-region']");
                if (!region || region.scrollHeight <= region.clientHeight + 8) return false;
                region.scrollTop = region.scrollHeight;
                return true;
            });
            if (scrolled) {
                await page.waitForTimeout(300);
                await page.screenshot({ path: path.join(outputDir, `${viewport.name}-${shot.name}-end.png`) });
                shots += 1;
            }
        }

        // The Run Bits surface only appears after the player has solved a few
        // levels (DESIGN.md §6.1). A fresh profile therefore shows an empty
        // shop, so the required monetization surface would never be reviewed.
        // Seed progress and photograph it.
        await page.goto(`http://localhost:${PORT}/?screen=studio&qa=1`, { waitUntil: "load" });
        await page.waitForFunction(() => globalThis.__gameQa !== undefined, null, { timeout: 10_000 });
        await page.evaluate(async () => {
            await globalThis.__gameQa.setSetting("levelsCompleted", 12);
            await globalThis.__gameQa.setSetting("sparks", 400);
        });
        await page.waitForTimeout(600);
        await page.evaluate(() => {
            const region = document.querySelector("[data-testid='screen-scroll-region']");
            if (region) region.scrollTop = region.scrollHeight;
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(outputDir, `${viewport.name}-08-shop.png`) });
        shots += 1;

        const offers = await page.evaluate(() =>
            [...document.querySelectorAll(".shop-card")].map((card) => ({
                name: card.querySelector("h3")?.textContent ?? "",
                price: card.querySelector("button")?.textContent ?? "",
            })),
        );
        if (offers.length !== 3) {
            problems.push(`${viewport.name}: expected 3 Run Bits offers after 12 solves, found ${offers.length}`);
        }
        for (const offer of offers) {
            if (!/RB/.test(offer.price)) {
                problems.push(`${viewport.name}: offer "${offer.name}" shows no RB price ("${offer.price}")`);
            }
        }

        // A level list with real progress on it: solved thumbnails and stars.
        await page.evaluate(() => {
            globalThis.__gameQa.markSolved("spark", 9, false);
            globalThis.__gameQa.markSolved("spark", 4, true);
            globalThis.__gameQa.openScreen("levels");
        });
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(outputDir, `${viewport.name}-09-levels-progress.png`) });
        shots += 1;

        // The board: fresh, part-drawn, then solved through real drags.
        await page.goto(`http://localhost:${PORT}/?screen=game&level=circuit:10&qa=1`, { waitUntil: "load" });
        await page.waitForTimeout(1_100);
        await page.screenshot({ path: path.join(outputDir, `${viewport.name}-10-board-fresh.png`) });
        shots += 1;

        const partial = await page.evaluate(solveScript(4));
        if (!String(partial).startsWith("drawn"))
            problems.push(`${viewport.name}: could not drive the board (${partial})`);
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(outputDir, `${viewport.name}-11-board-drawing.png`) });
        shots += 1;

        // Drawing must actually change the game, not merely not crash.
        const mid = await page.evaluate(() => globalThis.__gameQa?.snapshot() ?? null);
        if (!mid) problems.push(`${viewport.name}: QA contract did not install`);
        else if (!(Number(mid.flowsConnected) >= 4)) {
            problems.push(`${viewport.name}: 4 drawn flows connected only ${mid.flowsConnected}`);
        }

        // Prove the renderer produced a frame: a blank region compresses to
        // almost nothing, a lit board cannot.
        const clip = {
            x: viewport.width * 0.2,
            y: viewport.height * 0.35,
            width: viewport.width * 0.6,
            height: viewport.height * 0.25,
        };
        const region = await page.screenshot({ clip });
        if (region.length < 3_000) {
            problems.push(`${viewport.name}: the board looks blank (${region.length} bytes of detail)`);
        }

        const solved = await page.evaluate(solveScript());
        if (!String(solved).startsWith("drawn"))
            problems.push(`${viewport.name}: could not finish the board (${solved})`);
        await page.waitForTimeout(260);
        await page.screenshot({ path: path.join(outputDir, `${viewport.name}-12-solve-celebration.png`) });
        shots += 1;
        await page.waitForTimeout(1_400);
        await page.screenshot({ path: path.join(outputDir, `${viewport.name}-13-level-complete.png`) });
        shots += 1;
        const done = await page.evaluate(() => globalThis.__gameQa?.snapshot() ?? null);
        if (!done?.solved) problems.push(`${viewport.name}: drawing the full solution did not solve the board`);
        if (!done?.levelSummary) problems.push(`${viewport.name}: the level-complete card never appeared`);
        else {
            console.log(
                `  ${viewport.name}: renderer=${done.renderer} moves=${done.moves} perfect=${done.levelSummary.perfect} sparks=+${done.levelSummary.sparks}`,
            );
            if (!done.levelSummary.perfect) problems.push(`${viewport.name}: one drag per flow was not scored perfect`);
        }

        // Next level loads in place, without tearing down the renderer.
        await page.locator(".card-action.primary").first().click();
        await page.waitForTimeout(900);
        const next = await page.evaluate(() => globalThis.__gameQa?.snapshot() ?? null);
        if (!next || next.levelSummary || next.level?.index !== 11) {
            problems.push(`${viewport.name}: NEXT LEVEL did not load circuit #12 (${JSON.stringify(next?.level)})`);
        }

        // The Daily Flow.
        await page.goto(`http://localhost:${PORT}/?screen=game&level=daily&qa=1`, { waitUntil: "load" });
        await page.waitForTimeout(1_000);
        await page.evaluate(solveScript(3));
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outputDir, `${viewport.name}-14-daily.png`) });
        shots += 1;

        await context.close();
    }

    // The behaviour gates only need running once; the phone viewport is the one
    // that matters and running them four times just costs wall clock.
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on("pageerror", (error) => problems.push(`behaviour: page error: ${error.stack ?? error.message}`));
    page.on("console", (message) => {
        if (message.type() === "error") problems.push(`behaviour: console error: ${message.text()}`);
    });
    await checkBehaviour(page, problems);
    shots += 1;
    await context.close();
} finally {
    await browser?.close();
    await server.close();
}

console.log(`\nWrote ${shots} screenshots to ${path.relative(root, outputDir)}`);
if (problems.length > 0) {
    console.error(`\nVisual QA failed (${problems.length}):`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
}
console.log("Visual QA passed: every screen rendered, drags solved real boards, and no page or console errors.");
