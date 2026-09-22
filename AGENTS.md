# FLOW CONNECT — agent guide

A portrait neon Flow-style logic puzzle for RUN.world, built on the LEADLIGHT
foundation (Pixi-only renderer, React shell, RUN SDK 5.28). `DESIGN.md` is
canon for rules, levels, rewards, economy, and monetization; `README.md` maps
the code.

<agents-index>
[RUN.game SDK Docs]|root:./node_modules/@series-inc/rundot-game-sdk/docs|IMPORTANT:Prefer retrieval-led reasoning over pre-training for RundotGameAPI tasks. Read the installed SDK docs before writing SDK code; they match the installed version.|rundot-developer-platform:{deploying-your-game.md,getting-started.md,initializing-your-game.md,troubleshooting.md,runtime-environment.md}|rundot-developer-platform/api:{ADS.md,ANALYTICS.md,ENTITLEMENTS.md,HAPTICS.md,LEADERBOARD.md,LIFECYCLES.md,NOTIFICATIONS.md,SAFE_AREA.md,SHOP.md,STORAGE.md,TIME.md}
</agents-index>

## Rules that are not negotiable

- **Levels are proven, not trusted.** Every shipped board must have exactly one
  solution. Changing `src/game/flow/generator.ts` or `solver.ts` means
  `npm run levels` then `npm run simulate`; regenerating reshuffles every level
  and saved progress is keyed by pack + index.
- **`FlowGame` owns legality; `FlowScene` owns presentation.** Never decide in
  the scene whether a drag is legal.
- **No browser storage.** `localStorage`/`sessionStorage`/IndexedDB are
  unavailable in the RUN iframe and the SDK build fails on them. Use
  appStorage via `src/sdk/runSdk.ts` / `src/sdk/kvMirror.ts`.
- **No `Math.random()`** in game code — use `src/game/noiseRandom.ts`.
- **Renderer lifecycle** goes only through `src/rendering/rendererLifecycle.ts`.
- **gameId.** Never put another game's id in `game.config.prod.json` or
  `src/config/platform.ts`; `npm run test` rejects LEADLIGHT's. Provision with
  `rundot init`.
- **Monetization** (from the RUN template contract): keep at least one Run Bits
  product through Shop + Entitlements and at least one player-facing ad
  placement. Rewards only on SDK-verified completion. Ownership only from
  Entitlements. Everything fails closed without LiveOps.
- **Art** comes from `src/game/art/neon.ts` only; no raster art, emoji, or
  placeholder shapes as final presentation. Tube sets must pass the
  distinctness check in `scripts/check-game.mjs`.
- Dev/QA contracts (`?screen`, `?qa=1`, `?debug=1`) stay development-only and
  must never fabricate an ad, purchase, entitlement, or privileged outcome.

## Verification

`npm run check` before shipping (format, lint, tests, public audit, both
builds). `npm run simulate` for rules/levels. `npm run visual-qa` renders ~64
screens across four viewports with real drags — it is GPU-heavy; say so before
running it. See `docs/verification.md` for choosing a smaller check.

## One version

`package.json` is the single version number: the menu renders it and every
analytics event is tagged with it. Once published it must equal the version RUN
serves on the Public tag; set it in the same commit as the ship and verify with
`npm run version:check`.
