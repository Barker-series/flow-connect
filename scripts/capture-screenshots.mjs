#!/usr/bin/env node
/**
 * README screenshots, taken from the real game.
 *
 * Boots the dev server, opens a mid-pack level, and draws most of its flows
 * through real pointer drags via the QA contract, so the board is part-solved.
 * One shot per orientation. Regenerate whenever the look changes — a README
 * showing art the game no longer has is worse than no README image.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const PORT = 5453;
const outputDir = path.join(process.cwd(), "docs", "screenshots");
const SHOTS = [
    { name: "gameplay.png", width: 393, height: 852, flows: 5 },
    { name: "gameplay-landscape.png", width: 880, height: 412, flows: 5 },
];

fs.mkdirSync(outputDir, { recursive: true });
const server = await createServer({ root: process.cwd(), server: { port: PORT, strictPort: true } });
await server.listen();
const browser = await chromium.launch();

for (const shot of SHOTS) {
    const context = await browser.newContext({
        viewport: { width: shot.width, height: shot.height },
        deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/?screen=game&level=circuit:10&qa=1`, { waitUntil: "load" });
    await page.waitForFunction(() => (globalThis.__gameQa?.geometry?.()?.solution ?? []).length > 0, null, {
        timeout: 20000,
    });
    await page.waitForTimeout(900);
    const geometry = await page.evaluate(() => globalThis.__gameQa.geometry());
    for (const flow of geometry.solution.slice(0, shot.flows)) {
        await page.evaluate((points) => {
            const canvas = document.querySelector("canvas");
            const send = (type, p) =>
                canvas.dispatchEvent(
                    new PointerEvent(type, {
                        pointerId: 1,
                        pointerType: "touch",
                        clientX: p.clientX,
                        clientY: p.clientY,
                        bubbles: true,
                        isPrimary: true,
                    }),
                );
            send("pointerdown", points[0]);
            for (const point of points.slice(1)) send("pointermove", point);
            send("pointerup", points[points.length - 1]);
        }, flow);
        await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(outputDir, shot.name), animations: "disabled" });
    console.log(`wrote docs/screenshots/${shot.name}`);
    await context.close();
}

await browser.close();
await server.close();
