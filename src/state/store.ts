/**
 * Global UI state.
 *
 * The Pixi scene never renders from React and React never renders per frame:
 * the scene pushes the handful of numbers the HUD needs into this store after
 * each committed change, and the store is the only channel between them.
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_PALETTE, type PaletteId } from "../game/art/palette.ts";
import type { LevelRef } from "../game/flow/levels.ts";
import { STARTING_SPARKS } from "../game/flow/scoring.ts";

export type MenuScreen = "main" | "levels" | "studio" | "daily-rewards" | "daily-quests" | "stats" | "settings";

export interface PendingPurchaseIntent {
    productId: string;
    catalogItemId: string;
    idempotencyKey: string;
    startedAt: number;
}

/** Best result on one level. Keyed by `levelKey()` in `levelRecords`. */
export interface LevelRecord {
    /** Fewest moves the level has been solved in. */
    best: number;
    /** Solved in one move per flow without a hint, at least once. */
    perfect: boolean;
}

/** Shown on the level-complete card. */
export interface LevelSummary {
    ref: LevelRef;
    title: string;
    moves: number;
    flows: number;
    best: number;
    perfect: boolean;
    newBest: boolean;
    hintsUsed: number;
    sparks: number;
    firstSolve: boolean;
    /** The Daily Flow streak after this solve, for the daily card. */
    streak: number;
}

export interface AppState {
    /** Boot and navigation state */
    phase: "loading" | "menu" | "playing";
    loadProgress: number;
    /** Game is paused by host lifecycle */
    paused: boolean;
    menuScreen: MenuScreen;
    /** The pack the Levels screen is showing. */
    browsingPack: string;

    /** The level on the board. Meaningless outside `phase: playing`. */
    level: LevelRef | null;
    /** Live board, mirrored from the scene. */
    moves: number;
    flowsConnected: number;
    flowCount: number;
    /** 0..100: covered cells, the "pipe" readout Flow players watch. */
    pipePercent: number;
    canUndo: boolean;
    hintsThisLevel: number;
    solved: boolean;
    /** True while a finger is drawing on the board — the HUD steps back. */
    dragging: boolean;
    /** Set when a level is solved and its celebration has played. */
    levelSummary: LevelSummary | null;
    /** The level-complete doubling has been taken for this solve. */
    sparksDoubled: boolean;

    /** Persisted progress */
    sparks: number;
    levelRecords: Record<string, LevelRecord>;
    /** Lifetime completed solves, replays included — the ad and offer cadence. */
    levelsCompleted: number;
    hintsUsedTotal: number;
    dailyStreak: number;
    dailyBestStreak: number;
    dailyLastSolved: string | null;
    ownedPalettes: PaletteId[];
    selectedPalette: PaletteId;

    /** Player settings mirrored from save */
    musicEnabled: boolean;
    musicVolume: number;
    sfxEnabled: boolean;
    sfxVolume: number;
    /** Derived each boot from the host permission and the opt-out below. */
    notificationsEnabled: boolean;
    /**
     * The player's own "not in this game" choice, set only from Settings.
     * Separate from the host permission because that permission is shared by
     * every RUN game: turning reminders off here must not silence the others.
     */
    notificationsOptOut: boolean;
    notificationsConsent: "unknown" | "granted" | "denied";
    hapticsEnabled: boolean;
    reducedMotion: boolean;
    locale: string;
    quality: "high" | "low";

    /** One-time toasts surfaced from systems/purchases/helpers */
    toast: string | null;

    /** Retention state */
    dailyRewardLastClaimDay: string | null;
    dailyRewardStreak: number;
    dailyRewardClaimIds: string[];
    dailyQuestDay: string | null;
    dailyQuestProgress: Record<string, number>;
    dailyQuestClaimIds: string[];

    /** Commerce */
    pendingPurchaseIntent: PendingPurchaseIntent | null;

    runtimeReady: boolean;
    runtimeConfigVersion: string | null;
    trustedTimeReady: boolean;
}

const listeners = new Set<() => void>();

let state: AppState = {
    phase: "loading",
    loadProgress: 0,
    paused: false,
    menuScreen: "main",
    browsingPack: "spark",

    level: null,
    moves: 0,
    flowsConnected: 0,
    flowCount: 0,
    pipePercent: 0,
    canUndo: false,
    hintsThisLevel: 0,
    solved: false,
    dragging: false,
    levelSummary: null,
    sparksDoubled: false,

    sparks: STARTING_SPARKS,
    levelRecords: {},
    levelsCompleted: 0,
    hintsUsedTotal: 0,
    dailyStreak: 0,
    dailyBestStreak: 0,
    dailyLastSolved: null,
    ownedPalettes: [DEFAULT_PALETTE],
    selectedPalette: DEFAULT_PALETTE,

    musicEnabled: true,
    musicVolume: 0.4,
    sfxEnabled: true,
    sfxVolume: 0.72,
    notificationsEnabled: false,
    notificationsOptOut: false,
    notificationsConsent: "unknown",
    hapticsEnabled: true,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    locale: "English",
    quality: "high",

    toast: null,
    dailyRewardLastClaimDay: null,
    dailyRewardStreak: 0,
    dailyRewardClaimIds: [],
    dailyQuestDay: null,
    dailyQuestProgress: {},
    dailyQuestClaimIds: [],

    pendingPurchaseIntent: null,

    runtimeReady: false,
    runtimeConfigVersion: null,
    trustedTimeReady: false,
};

export const store = {
    get(): AppState {
        return state;
    },

    patch(partial: Partial<AppState>): void {
        state = { ...state, ...partial };
        for (const l of listeners) l();
    },

    subscribe(l: () => void): () => void {
        listeners.add(l);
        return () => listeners.delete(l);
    },
};

export function useStore<T = AppState>(selector: (s: AppState) => T = (s) => s as unknown as T): T {
    return useSyncExternalStore(store.subscribe, () => selector(state));
}
