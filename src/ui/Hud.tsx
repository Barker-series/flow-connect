/**
 * In-level HUD: a React overlay above the Pixi canvas.
 *
 * The overlay itself is pointer-events-none so drags fall through to the
 * canvas; each control opts back in. The level-complete card DOES capture
 * input — it is modal by intent.
 */
import { useState } from "react";
import { audioManager } from "../audio/audioManager.ts";
import { getLevelController } from "../game/GameCanvas.tsx";
import { HINT_COST, levelAfter } from "../game/levelController.ts";
import { levelTitle } from "../game/levelController.ts";
import { store, useStore } from "../state/store.ts";
import { rewardedAvailable } from "../systems/ads.ts";
import { t } from "../systems/localization.ts";
import { PLACEMENT } from "../systems/monetization/config.ts";
import { monetizationTelemetry } from "../systems/monetization/runtime.ts";
import { saveSystem } from "../systems/save.ts";
import GearIcon from "./GearIcon.tsx";
import { HintIcon, RestartIcon, SparkGlyph, UndoIcon } from "./Icons.tsx";
import SettingToggle from "./SettingToggle.tsx";
import { resumeFromPause, usePauseGate } from "./usePauseGate.ts";

export default function Hud() {
    const level = useStore((s) => s.level);
    const moves = useStore((s) => s.moves);
    const flowsConnected = useStore((s) => s.flowsConnected);
    const flowCount = useStore((s) => s.flowCount);
    const pipePercent = useStore((s) => s.pipePercent);
    const canUndo = useStore((s) => s.canUndo);
    const sparks = useStore((s) => s.sparks);
    const dragging = useStore((s) => s.dragging);
    const solved = useStore((s) => s.solved);
    const summary = useStore((s) => s.levelSummary);
    const record = useStore((s) => (s.level ? s.levelRecords[levelKeyOf(s.level)] : undefined));
    useStore((s) => s.locale);
    const showPause = usePauseGate();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [hintBusy, setHintBusy] = useState(false);

    const leave = (): void => {
        audioManager.play("tap");
        store.patch({
            phase: "menu",
            menuScreen: level?.kind === "daily" ? "main" : "levels",
            levelSummary: null,
        });
        void saveSystem.flush();
    };

    const hint = (): void => {
        const controller = getLevelController();
        if (!controller || hintBusy) return;
        audioManager.play("tap");
        if (sparks >= HINT_COST) {
            controller.hint();
            return;
        }
        // Too poor: the rewarded hint is the offer, and it is only ever made
        // from a direct tap on the hint button.
        if (!controller.freeHintOffered()) {
            store.patch({ toast: t("HintTooPoor", { cost: HINT_COST }) });
            return;
        }
        void (async () => {
            setHintBusy(true);
            monetizationTelemetry.record("offer_shown", { placement_id: PLACEMENT.freeHint, surface: "hud" });
            const outcome = await controller.watchForHint();
            setHintBusy(false);
            if (outcome === "unavailable") store.patch({ toast: t("AdUnavailable") });
        })();
    };

    const freeHint = sparks < HINT_COST && rewardedAvailable(PLACEMENT.freeHint);

    return (
        <div
            className={`pointer-events-none absolute inset-0${dragging ? " drawing" : ""}${summary ? " complete" : ""}`}
        >
            <div className="game-hud">
                <div className="hud-top">
                    <button
                        type="button"
                        className="hud-back pointer-events-auto"
                        onClick={leave}
                        aria-label={t("ButtonBack")}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m15 5-7 7 7 7" />
                        </svg>
                    </button>
                    <div className="hud-title">
                        <span className="eyebrow">
                            {level?.kind === "daily" ? t("DailyEyebrow") : t("LevelEyebrow")}
                        </span>
                        <strong>{level ? levelTitle(level) : ""}</strong>
                    </div>
                    <div className="hud-sparks" role="status" aria-label={t("LabelSparks")}>
                        <SparkGlyph />
                        <strong data-numeric>{sparks.toLocaleString()}</strong>
                    </div>
                    <button
                        type="button"
                        className="hud-settings pointer-events-auto"
                        aria-label={t("MenuSettings")}
                        onClick={() => {
                            audioManager.play("tap");
                            setSettingsOpen(true);
                        }}
                    >
                        <GearIcon />
                    </button>
                </div>
                <dl className="hud-stats" aria-live="polite">
                    <div>
                        <dt>{t("LabelFlows")}</dt>
                        <dd data-numeric>
                            {flowsConnected}
                            <small>/{flowCount}</small>
                        </dd>
                    </div>
                    <div>
                        <dt>{t("LabelMoves")}</dt>
                        <dd data-numeric>
                            {moves}
                            <small>
                                {" "}
                                · {t("LabelBest")} {record ? record.best : "—"}
                            </small>
                        </dd>
                    </div>
                    <div>
                        <dt>{t("LabelPipe")}</dt>
                        <dd data-numeric>
                            {pipePercent}
                            <small>%</small>
                        </dd>
                    </div>
                </dl>
                <div className="pipe-meter" aria-hidden="true">
                    <span style={{ width: `${pipePercent}%` }} />
                </div>
            </div>

            {!summary && (
                <div className="action-bar">
                    <ActionButton
                        label={t("ActionUndo")}
                        disabled={!canUndo || solved}
                        onPress={() => {
                            audioManager.play("tap");
                            getLevelController()?.undo();
                        }}
                    >
                        <UndoIcon />
                    </ActionButton>
                    <ActionButton
                        label={t("ActionRestart")}
                        disabled={pipePercent === 0 || solved}
                        onPress={() => {
                            audioManager.play("tap");
                            getLevelController()?.restart();
                        }}
                    >
                        <RestartIcon />
                    </ActionButton>
                    <ActionButton
                        label={hintBusy ? t("AdLoading") : t("ActionHint")}
                        disabled={solved || hintBusy}
                        accent
                        onPress={hint}
                        badge={
                            freeHint ? (
                                <span className="action-badge free">{t("ActionHintFree")}</span>
                            ) : (
                                <span className={`action-badge${sparks < HINT_COST ? " short" : ""}`}>
                                    <SparkGlyph small />
                                    {HINT_COST}
                                </span>
                            )
                        }
                    >
                        <HintIcon />
                    </ActionButton>
                </div>
            )}

            {summary && <LevelCompleteCard />}
            {settingsOpen && <GameSettingsCard onClose={() => setSettingsOpen(false)} />}

            {/* The host owns the pause, but it must not own the ONLY way out.
                A tap is the safe escape hatch precisely because it proves the
                host is not covering us. */}
            {showPause && (
                <button type="button" className="pause-overlay pointer-events-auto" onClick={resumeFromPause}>
                    <div>
                        <p className="eyebrow">{t("PausedEyebrow")}</p>
                        <strong>{t("Paused")}</strong>
                        <span className="pause-hint">{t("PausedResume")}</span>
                    </div>
                </button>
            )}
        </div>
    );
}

function levelKeyOf(ref: NonNullable<ReturnType<typeof store.get>["level"]>): string {
    return ref.kind === "daily" ? `daily:${ref.day}` : `${ref.packId}:${ref.index}`;
}

function ActionButton({
    label,
    disabled,
    accent = false,
    onPress,
    badge,
    children,
}: {
    label: string;
    disabled: boolean;
    accent?: boolean;
    onPress: () => void;
    badge?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className={`action-button pointer-events-auto${accent ? " accent" : ""}`}
            disabled={disabled}
            onClick={onPress}
        >
            <span className="action-icon" aria-hidden="true">
                {children}
            </span>
            <span className="action-label">{label}</span>
            {badge}
        </button>
    );
}

/**
 * The in-level settings card. Leaving to the menu's Settings screen would
 * abandon the board, so the play-relevant toggles live here.
 */
function GameSettingsCard({ onClose }: { onClose: () => void }) {
    const musicEnabled = useStore((s) => s.musicEnabled);
    const sfxEnabled = useStore((s) => s.sfxEnabled);
    const hapticsEnabled = useStore((s) => s.hapticsEnabled);
    const reducedMotion = useStore((s) => s.reducedMotion);
    const quality = useStore((s) => s.quality);

    const apply = (patch: Parameters<typeof store.patch>[0]) => {
        store.patch(patch);
        void saveSystem.flush();
    };

    return (
        <div className="run-card pointer-events-auto" role="dialog" aria-modal="true" aria-label={t("MenuSettings")}>
            <div className="run-card-body settings-card">
                <p className="eyebrow">{t("KickerSettings")}</p>
                <h2>{t("MenuSettings")}</h2>
                <div className="settings-list">
                    <SettingToggle
                        label={t("SettingsMusic")}
                        checked={musicEnabled}
                        onChange={(value) => apply({ musicEnabled: value })}
                    />
                    <SettingToggle
                        label={t("SettingsSfx")}
                        checked={sfxEnabled}
                        onChange={(value) => apply({ sfxEnabled: value })}
                    />
                    <SettingToggle
                        label={t("SettingsHaptics")}
                        checked={hapticsEnabled}
                        onChange={(value) => apply({ hapticsEnabled: value })}
                    />
                    <SettingToggle
                        label={t("SettingsReducedMotion")}
                        checked={reducedMotion}
                        onChange={(value) => {
                            document.documentElement.dataset.reducedMotion = String(value);
                            apply({ reducedMotion: value });
                        }}
                    />
                    <div className="setting-row">
                        <span>{t("SettingsQuality")}</span>
                        <div className="segmented">
                            <button
                                type="button"
                                className={quality === "low" ? "active" : ""}
                                onClick={() => apply({ quality: "low" })}
                            >
                                {t("SettingsLow")}
                            </button>
                            <button
                                type="button"
                                className={quality === "high" ? "active" : ""}
                                onClick={() => apply({ quality: "high" })}
                            >
                                {t("SettingsHigh")}
                            </button>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    className="card-action primary"
                    onClick={() => {
                        audioManager.play("tap");
                        onClose();
                    }}
                >
                    {t("ButtonDone")}
                </button>
            </div>
        </div>
    );
}

/** The level-complete card — the solve's payoff and the only rewarded upsell. */
function LevelCompleteCard() {
    const summary = useStore((s) => s.levelSummary);
    const sparksDoubled = useStore((s) => s.sparksDoubled);
    const [busy, setBusy] = useState(false);
    const controller = getLevelController();
    if (!summary) return null;

    const doubleOffered = !sparksDoubled && summary.sparks > 0 && rewardedAvailable(PLACEMENT.doubleSparks);
    const hasNext = levelAfter(summary.ref) !== null;
    const daily = summary.ref.kind === "daily";
    const eyebrow = summary.perfect
        ? t("SolvedPerfect")
        : summary.newBest
          ? t("SolvedNewBest")
          : summary.hintsUsed > 0
            ? t("SolvedWithHint")
            : t("SolvedEyebrow");

    return (
        <div
            className="run-card solved-sheet pointer-events-auto"
            role="dialog"
            aria-modal="true"
            aria-label={t("SolvedTitle")}
        >
            <div className={`run-card-body solved-card${summary.perfect ? " perfect" : ""}`}>
                <p className="eyebrow">{eyebrow}</p>
                <h2>{summary.perfect ? t("SolvedTitlePerfect") : t("SolvedTitle")}</h2>
                <p className="solved-level">{summary.title}</p>

                <dl className="results-grid">
                    <div>
                        <dt>{t("LabelMoves")}</dt>
                        <dd data-numeric>{summary.moves}</dd>
                    </div>
                    <div>
                        <dt>{t("LabelPar")}</dt>
                        <dd data-numeric>{summary.flows}</dd>
                    </div>
                    <div>
                        <dt>{daily ? t("LabelStreak") : t("LabelBest")}</dt>
                        <dd data-numeric>{daily ? summary.streak : summary.best}</dd>
                    </div>
                    <div>
                        <dt>{t("LabelSparks")}</dt>
                        <dd data-numeric>
                            +{sparksDoubled ? summary.sparks * 2 : summary.sparks}
                            {sparksDoubled && <span className="doubled"> {t("ResultsDoubled")}</span>}
                        </dd>
                    </div>
                </dl>

                {doubleOffered && (
                    <button
                        type="button"
                        className="card-action rewarded"
                        disabled={busy}
                        onClick={() => {
                            void (async () => {
                                setBusy(true);
                                monetizationTelemetry.record("offer_shown", {
                                    placement_id: PLACEMENT.doubleSparks,
                                    surface: "level_complete",
                                });
                                const outcome = await controller?.watchDoubleSparks();
                                setBusy(false);
                                if (outcome === "unavailable") store.patch({ toast: t("AdUnavailable") });
                            })();
                        }}
                    >
                        {busy ? t("AdLoading") : t("ResultsDoubleSparks", { sparks: summary.sparks })}
                    </button>
                )}

                {hasNext && (
                    <button
                        type="button"
                        className="card-action primary"
                        disabled={busy}
                        onClick={() => {
                            audioManager.play("start");
                            void controller?.leaveSolved("next");
                        }}
                    >
                        {daily ? t("ResultsContinuePacks") : t("ResultsNext")}
                    </button>
                )}
                <button
                    type="button"
                    className="card-action quiet"
                    disabled={busy}
                    onClick={() => {
                        audioManager.play("tap");
                        void controller?.leaveSolved(daily ? "menu" : "levels");
                    }}
                >
                    {daily ? t("ResultsMenu") : t("ResultsLevels")}
                </button>
            </div>
        </div>
    );
}
