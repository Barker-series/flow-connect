/**
 * The bridge between the rules, the scene, and everything outside the canvas.
 *
 * `FlowGame` owns legality. `FlowScene` owns presentation. This owns the
 * consequences: what a committed move does to the store, what a hint costs,
 * what a solve pays, which level comes next, and which ad may be offered where.
 *
 * Every grant here is one-way: sparks are debited before a hint is laid, and an
 * ad reward is applied only on an SDK-confirmed completion.
 */
import { showContextualLikePrompt } from "../sdk/runSdk.ts";
import { audioManager, type SfxCue } from "../audio/audioManager.ts";
import { analytics } from "../systems/analytics/analyticsConfig.ts";
import { type LevelSummary, store } from "../state/store.ts";
import { maybeShowInterstitial, recordCompletedLevel, rewardedAvailable, showRewarded } from "../systems/ads.ts";
import { dailySystems } from "../systems/dailySystems.ts";
import { t } from "../systems/localization.ts";
import { PLACEMENT } from "../systems/monetization/config.ts";
import { monetizationTelemetry } from "../systems/monetization/runtime.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import { saveSystem } from "../systems/save.ts";
import { FlowGame, type MoveResult } from "./flow/game.ts";
import {
    type LevelRef,
    LEVELS_PER_PACK,
    levelKey,
    PACK_UNLOCK_SOLVES,
    PACKS,
    packById,
    packLevelCount,
    puzzleFor,
} from "./flow/levels.ts";
import { HINT_COST, levelReward } from "./flow/scoring.ts";
import type { FlowScene, SceneHaptic, SceneSfx } from "./scene/flowScene.ts";

export { HINT_COST };

export type HintResult = "done" | "too-poor" | "nothing" | "unavailable";

/** Human title for a level: "SPARK 7" or "DAILY FLOW". */
export function levelTitle(ref: LevelRef): string {
    if (ref.kind === "daily") return t("DailyFlow");
    const pack = packById(ref.packId);
    return `${pack ? t(pack.nameKey) : ref.packId.toUpperCase()} ${ref.index + 1}`;
}

/** Solved-level count for one pack. */
export function packSolvedCount(packId: string): number {
    const records = store.get().levelRecords;
    let count = 0;
    for (let index = 0; index < LEVELS_PER_PACK; index++) if (records[`${packId}:${index}`]) count++;
    return count;
}

/** A pack is open when the one before it has PACK_UNLOCK_SOLVES solves. */
export function packUnlocked(packId: string): boolean {
    const index = PACKS.findIndex((pack) => pack.id === packId);
    if (index <= 0) return index === 0;
    const previous = PACKS[index - 1];
    return previous ? packSolvedCount(previous.id) >= PACK_UNLOCK_SOLVES : false;
}

/**
 * A level is open when it is the first of an open pack, or the level before it
 * is solved. Two levels ahead are always open so one stubborn board never
 * walls a player off from the rest of the pack.
 */
export function levelUnlocked(packId: string, index: number): boolean {
    if (!packUnlocked(packId)) return false;
    if (index <= 2) return true;
    const records = store.get().levelRecords;
    for (let back = 1; back <= 3; back++) if (records[`${packId}:${index - back}`]) return true;
    return false;
}

/** The first unsolved, unlocked level in progression order — the PLAY button. */
export function nextLevel(): LevelRef {
    const records = store.get().levelRecords;
    for (const pack of PACKS) {
        if (!packUnlocked(pack.id)) break;
        for (let index = 0; index < packLevelCount(pack.id); index++) {
            if (!records[`${pack.id}:${index}`] && levelUnlocked(pack.id, index)) {
                return { kind: "pack", packId: pack.id, index };
            }
        }
    }
    const last = PACKS[PACKS.length - 1];
    return { kind: "pack", packId: last?.id ?? "spark", index: 0 };
}

/** The level after `ref` in its pack, or the first of the next pack. */
export function levelAfter(ref: LevelRef): LevelRef | null {
    if (ref.kind === "daily") return nextLevel();
    if (ref.index + 1 < packLevelCount(ref.packId)) return { ...ref, index: ref.index + 1 };
    const at = PACKS.findIndex((pack) => pack.id === ref.packId);
    const following = PACKS[at + 1];
    if (following && packUnlocked(following.id)) return { kind: "pack", packId: following.id, index: 0 };
    return null;
}

const SFX_FOR_SCENE: Readonly<Record<SceneSfx, SfxCue>> = {
    grab: "grab",
    step: "step",
    cut: "cut",
    connect: "connect",
    blocked: "reject",
    solve: "solve",
    perfect: "perfect",
    almost: "almost",
    hint: "hint",
};

export class LevelController {
    private game: FlowGame;
    private ref: LevelRef;
    private scene: FlowScene | null = null;
    private startedAt = performance.now();
    private finished = false;

    constructor(ref: LevelRef) {
        const puzzle = puzzleFor(ref);
        if (!puzzle) throw new Error(`No puzzle for ${levelKey(ref)}`);
        this.ref = ref;
        this.game = new FlowGame(puzzle);
    }

    get flowGame(): FlowGame {
        return this.game;
    }

    get level(): LevelRef {
        return this.ref;
    }

    attach(scene: FlowScene): void {
        this.scene = scene;
        this.begin();
    }

    detach(): void {
        this.scene = null;
    }

    /** Swap to another level in place — the renderer stays up. */
    load(ref: LevelRef): boolean {
        const puzzle = puzzleFor(ref);
        if (!puzzle) return false;
        this.ref = ref;
        this.game = new FlowGame(puzzle);
        this.finished = false;
        this.startedAt = performance.now();
        this.scene?.loadGame(this.game);
        this.begin();
        return true;
    }

    private begin(): void {
        store.patch({ level: this.ref, levelSummary: null, sparksDoubled: false, hintsThisLevel: 0, solved: false });
        this.publish();
        runtimeServices.track("level_started", {
            level: levelKey(this.ref),
            size: this.game.size,
            flows: this.game.flowCount,
        });
        analytics.funnelStep("flowconnect_first_level", 2);
        analytics.funnelStep("flowconnect_first_level_detail", 1);
    }

    // -----------------------------------------------------------------------
    // Scene callbacks
    // -----------------------------------------------------------------------

    readonly sceneCallbacks = {
        onBoardChanged: (result: MoveResult): void => {
            analytics.funnelStep("flowconnect_first_level_detail", 2);
            if (result.newlyConnected.length > 0) analytics.funnelStep("flowconnect_first_level_detail", 3);
            if (this.game.connectedCount() * 2 >= this.game.flowCount) {
                analytics.funnelStep("flowconnect_first_level_detail", 4);
            }
            this.publish();
            if (result.status === "solved") store.patch({ solved: true });
        },
        onDragChanged: (active: boolean): void => {
            store.patch({ dragging: active });
            if (!active) this.publish();
        },
        onSolvedShown: (): void => {
            this.finish();
        },
        sfx: (cue: SceneSfx, pitch?: number): void => {
            audioManager.play(SFX_FOR_SCENE[cue], pitch);
        },
        haptic: (style: SceneHaptic): void => {
            void runtimeServices.haptic(style);
        },
    };

    /** Mirror the board into the store so the DOM HUD can render it. */
    private publish(): void {
        // Endpoints are not pipe: an untouched board reads 0%, as the genre's
        // players expect, and only a full board reads 100%.
        const endpoints = this.game.flowCount * 2;
        const pipe = (this.game.filledCount() - endpoints) / Math.max(1, this.game.cells - endpoints);
        store.patch({
            moves: this.game.moves,
            flowsConnected: this.game.connectedCount(),
            flowCount: this.game.flowCount,
            pipePercent: Math.round(Math.max(0, Math.min(1, pipe)) * 100),
            canUndo: this.game.canUndo,
        });
    }

    // -----------------------------------------------------------------------
    // Actions from the HUD
    // -----------------------------------------------------------------------

    undo(): void {
        const result = this.game.undo();
        if (!result) {
            audioManager.play("reject");
            return;
        }
        audioManager.play("undo");
        void runtimeServices.haptic("light");
        this.scene?.commitExternal(result);
        this.publish();
    }

    restart(): void {
        const result = this.game.restart();
        if (!result.changed) return;
        audioManager.play("undo");
        void runtimeServices.haptic("medium");
        this.scene?.commitExternal(result);
        this.publish();
    }

    /** Spend sparks on a hint. */
    hint(): HintResult {
        if (!this.scene || this.game.status === "solved") return "unavailable";
        const flow = this.game.hintFlow();
        if (flow < 0) return "nothing";
        if (store.get().sparks < HINT_COST) {
            audioManager.play("reject");
            return "too-poor";
        }
        store.patch({ sparks: store.get().sparks - HINT_COST });
        this.layHint(flow, "sparks");
        void saveSystem.flush();
        return "done";
    }

    /** The rewarded hint. Nothing is laid unless the SDK confirms the video. */
    async watchForHint(): Promise<"granted" | "declined" | "unavailable"> {
        if (this.game.status === "solved" || this.game.hintFlow() < 0) return "unavailable";
        monetizationTelemetry.record("offer_shown", { placement_id: PLACEMENT.freeHint });
        const result = await showRewarded(PLACEMENT.freeHint);
        if (result !== "verified") {
            if (result === "cancelled") {
                monetizationTelemetry.record("offer_dismissed", {
                    placement_id: PLACEMENT.freeHint,
                    reason: "player_cancelled",
                });
            }
            return result === "cancelled" ? "declined" : "unavailable";
        }
        const flow = this.game.hintFlow();
        if (flow < 0) return "unavailable";
        monetizationTelemetry.record("reward_claimed", { placement_id: PLACEMENT.freeHint, reward_id: "free_hint" });
        this.layHint(flow, "rewarded");
        return "granted";
    }

    freeHintOffered(): boolean {
        return this.game.status !== "solved" && rewardedAvailable(PLACEMENT.freeHint);
    }

    private layHint(flow: number, source: "sparks" | "rewarded"): void {
        const result = this.game.applyHint(flow);
        store.patch({
            hintsThisLevel: this.game.hintsUsed,
            hintsUsedTotal: store.get().hintsUsedTotal + 1,
        });
        void runtimeServices.haptic("medium");
        runtimeServices.track("hint_used", { level: levelKey(this.ref), source, sparks_after: store.get().sparks });
        this.scene?.commitExternal(result, flow);
        this.publish();
    }

    // -----------------------------------------------------------------------
    // Solving
    // -----------------------------------------------------------------------

    /** Pay out a solve and raise the level-complete card. Idempotent. */
    private finish(): void {
        if (this.finished || this.game.status !== "solved") return;
        this.finished = true;

        const state = store.get();
        const key = levelKey(this.ref);
        const previous = state.levelRecords[key];
        const daily = this.ref.kind === "daily";
        const reward = levelReward({
            size: this.game.size,
            daily,
            moves: this.game.moves,
            flows: this.game.flowCount,
            hintsUsed: this.game.hintsUsed,
            solvedBefore: Boolean(previous),
            perfectBefore: previous?.perfect === true,
        });
        const best = previous ? Math.min(previous.best, this.game.moves) : this.game.moves;
        const record = { best, perfect: (previous?.perfect ?? false) || reward.perfect };

        let dailyStreak = state.dailyStreak;
        let dailyBestStreak = state.dailyBestStreak;
        let dailyLastSolved = state.dailyLastSolved;
        if (daily && this.ref.kind === "daily" && state.dailyLastSolved !== this.ref.day) {
            const yesterday = dailySystems.previousDay(this.ref.day);
            dailyStreak = state.dailyLastSolved === yesterday ? state.dailyStreak + 1 : 1;
            dailyBestStreak = Math.max(dailyBestStreak, dailyStreak);
            dailyLastSolved = this.ref.day;
        }

        const summary: LevelSummary = {
            ref: this.ref,
            title: levelTitle(this.ref),
            moves: this.game.moves,
            flows: this.game.flowCount,
            best,
            perfect: reward.perfect,
            newBest: previous !== undefined && this.game.moves < previous.best,
            hintsUsed: this.game.hintsUsed,
            sparks: reward.total,
            firstSolve: !previous,
            streak: dailyStreak,
        };

        store.patch({
            levelSummary: summary,
            sparksDoubled: false,
            sparks: state.sparks + reward.total,
            levelRecords: { ...state.levelRecords, [key]: record },
            levelsCompleted: state.levelsCompleted + 1,
            dailyStreak,
            dailyBestStreak,
            dailyLastSolved,
        });

        dailySystems.recordQuestProgress("solve");
        if (reward.perfect) dailySystems.recordQuestProgress("perfect");
        if (daily && !previous) dailySystems.recordQuestProgress("daily");

        recordCompletedLevel();
        if (reward.perfect) audioManager.play("perfect");
        void showContextualLikePrompt();
        const durationMs = Math.round(performance.now() - this.startedAt);
        runtimeServices.track("level_completed", {
            level: key,
            moves: this.game.moves,
            flows: this.game.flowCount,
            perfect: reward.perfect,
            hints: this.game.hintsUsed,
            first_solve: !previous,
            sparks: reward.total,
            duration_ms: durationMs,
        });
        analytics.funnelStep("flowconnect_first_level", 3);
        analytics.funnelStep("flowconnect_first_level_detail", 5, { moves: this.game.moves });
        analytics.funnelStep("engagement", store.get().levelsCompleted, { level: key });
        void saveSystem.flush();
    }

    /** Double the sparks this solve paid. Verified completion only, once. */
    async watchDoubleSparks(): Promise<"granted" | "declined" | "unavailable"> {
        const state = store.get();
        const summary = state.levelSummary;
        if (!summary || state.sparksDoubled || summary.sparks <= 0) return "unavailable";
        monetizationTelemetry.record("offer_shown", { placement_id: PLACEMENT.doubleSparks });
        const result = await showRewarded(PLACEMENT.doubleSparks);
        if (result !== "verified") return result === "cancelled" ? "declined" : "unavailable";
        monetizationTelemetry.record("reward_claimed", {
            placement_id: PLACEMENT.doubleSparks,
            reward_id: "sparks_double",
            amount: summary.sparks,
        });
        store.patch({ sparksDoubled: true, sparks: store.get().sparks + summary.sparks });
        audioManager.play("reward");
        void runtimeServices.haptic("success");
        void saveSystem.flush();
        return "granted";
    }

    /**
     * Leave the level-complete card, to the next level or to the list. This is
     * the interstitial's only natural break, and it runs AFTER the navigation
     * so the ad never sits between the player and the button they pressed.
     */
    async leaveSolved(destination: "next" | "levels" | "menu"): Promise<void> {
        const next = destination === "next" ? levelAfter(this.ref) : null;
        if (next && this.load(next)) {
            // Stays on the board.
        } else {
            store.patch({
                levelSummary: null,
                phase: "menu",
                menuScreen: destination === "menu" || this.ref.kind === "daily" ? "main" : "levels",
            });
        }
        await saveSystem.flush();
        await maybeShowInterstitial();
    }
}
