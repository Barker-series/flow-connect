import { dailyPuzzle } from "../game/flow/levels.ts";
import { type MenuScreen, store } from "../state/store.ts";
import { dailySystems } from "../systems/dailySystems.ts";

const MENU_SCREENS = new Set<MenuScreen>([
    "main",
    "levels",
    "studio",
    "daily-rewards",
    "daily-quests",
    "stats",
    "settings",
]);

/**
 * Development-only deep link for visual review and automated browser checks.
 *
 *   ?screen=game               the first Spark level
 *   ?screen=game&level=grid:4  a specific pack level (zero-based index)
 *   ?screen=game&level=daily   today's Daily Flow
 *
 * The query changes local in-memory navigation only; it never bypasses a RUN
 * permission, purchase, ad, entitlement, or other authoritative outcome.
 */
export function applyDevelopmentScreenPreview(): void {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("screen");
    if (!requested) return;
    if (requested === "game") {
        const level = params.get("level") ?? "spark:0";
        const today = dailySystems.today();
        const ref =
            level === "daily" && today && dailyPuzzle(today)
                ? ({ kind: "daily", day: today } as const)
                : ({
                      kind: "pack",
                      packId: level.split(":")[0] ?? "spark",
                      index: Number(level.split(":")[1] ?? 0) || 0,
                  } as const);
        store.patch({ phase: "playing", menuScreen: "main", paused: false, level: ref });
        return;
    }
    if (MENU_SCREENS.has(requested as MenuScreen)) {
        store.patch({ phase: "menu", menuScreen: requested as MenuScreen, paused: false });
        return;
    }
    console.warn(`[dev] Unknown screen preview "${requested}".`);
}
