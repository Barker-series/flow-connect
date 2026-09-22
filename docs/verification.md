# Verification workflow

Use the smallest check that can reliably detect the failure a change could
introduce, then retain the broader release gates. Report what changed, what was
run, which viewports or host conditions were exercised, and what remains
unverified.

| Change | Minimum reliable check |
| --- | --- |
| Copy, spacing, colour, or one-screen layout | `npm run visual-qa` and read the PNGs |
| Drag rules, rewards, the solver, or the generator | `npm run simulate` |
| Reward values or the hint price | `npm run balance` — and re-read DESIGN.md §5 |
| The generator (regenerates every level) | `npm run levels` then `npm run simulate` |
| Tube, board, or backdrop art | `npm run thumbnail` plus `npm run visual-qa` |
| Persistence, lifecycle, or settings | `npm run visual-qa` (its behaviour gates cover reload, mute, and page-hide) |
| Shop, entitlements, ads, storage, or notifications | `npm run dev:playground` against a real host — the local build cannot prove these |
| Renderer, build, or dependency change | `npm run check` (both production builds) |
| Release preparation | `npm run check`, the readiness audit, and fresh visual evidence |

## What each command actually proves

- **`npm run simulate`** — every shipped level is well-formed, has exactly one
  solution, matches its stored answer, and plays to a perfect through the real
  drag rules; drag/cut/restore/undo/restart/hint semantics; 120 Daily Flows are
  unique and fast to generate; reward arithmetic. A two-answer level still
  looks fine on screen, so this is the only thing that catches it.
- **`npm run balance`** — the spark economy guardrail: no level pays a whole
  hint, and perfect play funds only a limited stock of hints.
- **`npm run visual-qa`** — four viewports, real pointer drags driven from the
  scene's own geometry, and the gates a screenshot cannot cover: audio starts
  and stops, hiding the page suspends it, settings and progress survive a
  reload, and a board is still solvable with reduced motion on. It drags the
  intended solution through real pointer events and fails unless the board is
  solved, scored perfect, and NEXT LEVEL loads. GPU-heavy: it renders ~64
  screens across four viewports.
- **`npm run check`** — format, lint, the tests above, the public-repository
  audit, and both production builds with their chunk budgets.

## Local visual review

Development-only screen deep links avoid repetitive navigation:

```text
?screen=main
?screen=levels
?screen=studio
?screen=daily-rewards
?screen=daily-quests
?screen=stats
?screen=settings
?screen=game&level=grid:4
?screen=game&level=daily
```

Add `?debug=1` for the diagnostics panel, `?qa=1` for the `__gameQa` contract,
and `?renderer=webgpu` or `?renderer=webgl` to force a backend strictly — in
forced mode an unexpected renderer error is a failure rather than a fallback.

## What local verification cannot prove

Headless Chromium reports the WebGL backend on this machine, so real WebGPU
behaviour needs a device. Ads, purchases, entitlements, RUN storage, trusted
time, and notifications all fail closed without a host: locally they are
correctly invisible or clearly marked PREVIEW, which is the honest state, not
evidence that they work. Those belong to a RUN Playground or production-host
pass.
