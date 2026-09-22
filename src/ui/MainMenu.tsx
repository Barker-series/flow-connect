import packageJson from "../../package.json";
import { audioManager } from "../audio/audioManager.ts";
import { GAME_NAME, GAME_TAGLINE } from "../game/constants.ts";
import { dailyPuzzle, type LevelRef } from "../game/flow/levels.ts";
import { levelTitle, nextLevel } from "../game/levelController.ts";
import { type MenuScreen, store, useStore } from "../state/store.ts";
import { dailySystems } from "../systems/dailySystems.ts";
import { t } from "../systems/localization.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import { saveSystem } from "../systems/save.ts";
import GearIcon from "./GearIcon.tsx";
import { SparkGlyph } from "./Icons.tsx";

type MenuIconName = "levels" | "studio" | "calendar" | "quests" | "stats" | "settings";

const destinations: Array<{ screen: MenuScreen; icon: MenuIconName; label: string }> = [
    { screen: "levels", icon: "levels", label: "MenuLevels" },
    { screen: "studio", icon: "studio", label: "MenuStudio" },
    { screen: "daily-rewards", icon: "calendar", label: "MenuDailyRewards" },
    { screen: "daily-quests", icon: "quests", label: "MenuDailyQuests" },
    { screen: "stats", icon: "stats", label: "MenuStats" },
    { screen: "settings", icon: "settings", label: "MenuSettings" },
];

function MenuIcon({ name }: { name: MenuIconName }) {
    if (name === "levels") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
            </svg>
        );
    }
    if (name === "studio") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="6" cy="5" r="2.4" />
                <circle cx="18" cy="19" r="2.4" />
                <path d="M8.4 5H15a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h6.6" />
            </svg>
        );
    }
    if (name === "calendar") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 3v3M18 3v3M4 8h16M5 5h14a2 2 0 0 1 2 2v12H3V7a2 2 0 0 1 2-2Z" />
                <path d="m8 14 2 2 5-5" />
            </svg>
        );
    }
    if (name === "quests") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" />
            </svg>
        );
    }
    if (name === "stats") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 19V9h4v10M10 19V5h4v14M15 19v-7h4v7M3 19h18" />
            </svg>
        );
    }
    return <GearIcon />;
}

/**
 * Every menu action unlocks audio first: browsers only allow an AudioContext to
 * start inside a real gesture, and the first tap is the only one guaranteed to
 * be one.
 */
async function activate(action: () => void): Promise<void> {
    action();
    void audioManager.unlock().then(() => {
        audioManager.play("tap");
        void runtimeServices.haptic("light");
    });
}

/** Start a level from any menu surface. */
export function startLevel(ref: LevelRef): void {
    void activate(() => {
        audioManager.play("start");
        store.patch({
            phase: "playing",
            level: ref,
            levelSummary: null,
            sparksDoubled: false,
            solved: false,
            moves: 0,
            flowsConnected: 0,
            pipePercent: 0,
            canUndo: false,
        });
        void saveSystem.flush();
    });
}

export default function MainMenu() {
    useStore((state) => state.locale);
    useStore((state) => state.trustedTimeReady);
    const sparks = useStore((state) => state.sparks);
    const records = useStore((state) => state.levelRecords);
    const dailyStreak = useStore((state) => state.dailyStreak);
    const dailyLastSolved = useStore((state) => state.dailyLastSolved);

    const next = nextLevel();
    const today = dailySystems.today();
    const dailyReady = today !== null && dailyPuzzle(today) !== null;
    const dailyDone = today !== null && Boolean(records[`daily:${today}`]);
    // A streak shows as alive only if yesterday or today was solved.
    const streakAlive =
        today !== null && (dailyLastSolved === today || dailyLastSolved === dailySystems.previousDay(today));
    const solvedCount = Object.keys(records).filter((key) => !key.startsWith("daily:")).length;

    return (
        <main className="menu-shell pt-safe-top pb-safe-bottom">
            <header className="menu-header">
                <p className="eyebrow">{GAME_TAGLINE}</p>
                <div className="menu-logo">
                    <h1>
                        <span className="logo-flow">FLOW</span>
                        <span className="logo-connect">CONNECT</span>
                    </h1>
                </div>
                <p className="menu-subtitle">{t("MenuSubtitle")}</p>
                <span className="sr-only">{GAME_NAME}</span>
            </header>

            <section className="player-strip" aria-label={t("PlayerSummary")}>
                <div className="player-best">
                    <span>{t("LabelSolved")}</span>
                    <strong data-numeric>{solvedCount}</strong>
                </div>
                <div className="player-currency">
                    <SparkGlyph />
                    <strong data-numeric>{sparks.toLocaleString()}</strong>
                </div>
            </section>

            <button type="button" className="play-button" onClick={() => startLevel(next)}>
                <span className="play-copy">
                    <span>{solvedCount === 0 ? t("ButtonPlay") : t("ButtonContinue")}</span>
                    <small>{levelTitle(next)}</small>
                </span>
                <span className="play-glyph" aria-hidden="true">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m9 6 9 6-9 6V6Z" />
                    </svg>
                </span>
            </button>

            <button
                type="button"
                className={`daily-button${dailyDone ? " done" : ""}`}
                disabled={!dailyReady}
                onClick={() => today && startLevel({ kind: "daily", day: today })}
            >
                <span className="daily-copy">
                    <span>{t("DailyFlow")}</span>
                    <small>{!dailyReady ? t("DailyWaiting") : dailyDone ? t("DailyDone") : t("DailyFresh")}</small>
                </span>
                <span className={`daily-streak${streakAlive && dailyStreak > 0 ? " lit" : ""}`}>
                    <strong data-numeric>{streakAlive ? dailyStreak : 0}</strong>
                    <small>{t("LabelStreak")}</small>
                </span>
            </button>

            <nav className="menu-grid" aria-label={t("MenuNavLabel")}>
                {destinations.map(({ screen, icon, label }) => (
                    <button
                        type="button"
                        className="menu-tile"
                        key={screen}
                        onClick={() => void activate(() => store.patch({ menuScreen: screen }))}
                    >
                        <span className="menu-icon" aria-hidden="true">
                            <MenuIcon name={icon} />
                        </span>
                        <span>{t(label)}</span>
                    </button>
                ))}
            </nav>

            <p className="build-stamp">v{packageJson.version}</p>
        </main>
    );
}
