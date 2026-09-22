/**
 * Loading screen shown while warmAssets() runs. Rendered by React, revealed
 * when the boot cover lifts, driven by store.loadProgress.
 *
 * The mark is a tiny 3x3 board with two flows that light in turn — the verb of
 * the game in nine cells, so the first thing the player sees is already it.
 */

import { GAME_NAME, GAME_TAGLINE } from "../game/constants.ts";
import { useStore } from "../state/store.ts";
import { t } from "../systems/localization.ts";

/** Two flows over a 3x3 board: red along the top and down, blue the rest. */
const MARK: ReadonlyArray<{ id: string; flow: "a" | "b"; end: boolean; order: number }> = [
    { id: "c0", flow: "a", end: true, order: 0 },
    { id: "c1", flow: "a", end: false, order: 1 },
    { id: "c2", flow: "a", end: false, order: 2 },
    { id: "c3", flow: "b", end: true, order: 0 },
    { id: "c4", flow: "b", end: false, order: 1 },
    { id: "c5", flow: "a", end: true, order: 3 },
    { id: "c6", flow: "b", end: false, order: 3 },
    { id: "c7", flow: "b", end: false, order: 2 },
    { id: "c8", flow: "b", end: true, order: 4 },
];

export default function LoadingScreen() {
    const progress = useStore((s) => s.loadProgress);
    const pct = Math.round(progress * 100);
    return (
        <main className="loading-screen pt-safe-top pb-safe-bottom">
            <div className="loading-mark" aria-hidden="true">
                {MARK.map((cell) => (
                    <span
                        key={cell.id}
                        className={`loading-cell ${cell.flow}${cell.end ? " end" : ""}`}
                        style={{ animationDelay: `${cell.order * 120 + (cell.flow === "b" ? 500 : 0)}ms` }}
                    />
                ))}
            </div>
            <div className="loading-title">
                <strong>{GAME_NAME}</strong>
                <span>{GAME_TAGLINE}</span>
            </div>
            <div className="loading-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="loading-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="loading-copy">
                {t("LoadingCopy")} {pct}%
            </p>
        </main>
    );
}
