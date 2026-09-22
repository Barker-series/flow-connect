import { getRunCapabilities } from "../sdk/runSdk.ts";
import { store } from "../state/store.ts";
import { runtimeServices } from "./runtimeServices.ts";
import { saveSystem } from "./save.ts";
import { hasServerTime, localDayKey, serverNow } from "./serverTime.ts";

import { returnReminders } from "./retention/retentionConfig.ts";
/** The seven-day spark ladder — DESIGN.md §7. */
export const DAILY_REWARD_LADDER = [10, 12, 15, 18, 22, 26, 45] as const;
const REWARDS = DAILY_REWARD_LADDER;
const inFlight = new Set<string>();

export interface TimeGate {
    ready: boolean;
    authoritative: boolean;
    day: string | null;
    label: string;
}

export interface QuestView {
    id: string;
    label: string;
    value: number;
    target: number;
    reward: number;
    claimed: boolean;
    claimable: boolean;
}

function gate(): TimeGate {
    const capabilities = getRunCapabilities();
    // The SDK's browser mock is useful for exercising API shapes, but its
    // clock is not authoritative. Treat it like local development so preview
    // claims remain usable and are labelled non-authoritative.
    const host = capabilities.host && !capabilities.mock;
    if (host && !hasServerTime())
        return { ready: false, authoritative: true, day: null, label: "WAITING FOR TRUSTED RUN TIME" };
    return {
        ready: true,
        authoritative: host,
        day: localDayKey(serverNow()),
        label: host ? "TRUSTED RUN TIME" : "LOCAL DEV FALLBACK · NON-AUTHORITATIVE",
    };
}

function previousDay(day: string): string {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
}

function ensureQuestDay(day: string): void {
    const state = store.get();
    if (state.dailyQuestDay === day) return;
    store.patch({ dailyQuestDay: day, dailyQuestProgress: {} });
    void saveSystem.flush();
}

async function commitGrant(id: string, sparks: number, patch: Parameters<typeof store.patch>[0]): Promise<boolean> {
    if (inFlight.has(id)) return false;
    inFlight.add(id);
    const before = store.get();
    store.patch({ ...patch, sparks: before.sparks + sparks });
    const saved = await saveSystem.flush();
    if (!saved) {
        // Revert by DELTA against the current state, not by restoring the
        // `before` snapshot wholesale: a reward claim and a quest claim can
        // overlap on one failed flush, and absolute restores would each wipe
        // the other's revert (and any spark change made during the await).
        // Scalar reward fields are safe to restore from `before` — only a
        // reward claim writes them, and its claim id dedupes concurrency.
        const current = store.get();
        const revert: Parameters<typeof store.patch>[0] = {
            sparks: Math.max(0, current.sparks - sparks),
        };
        if ("dailyRewardClaimIds" in patch) {
            revert.dailyRewardClaimIds = current.dailyRewardClaimIds.filter((claimId) => claimId !== id);
            revert.dailyRewardLastClaimDay = before.dailyRewardLastClaimDay;
            revert.dailyRewardStreak = before.dailyRewardStreak;
        }
        if ("dailyQuestClaimIds" in patch) {
            revert.dailyQuestClaimIds = current.dailyQuestClaimIds.filter((claimId) => claimId !== id);
        }
        store.patch(revert);
    }
    inFlight.delete(id);
    return saved;
}

export const dailySystems = {
    timeGate(): TimeGate {
        return gate();
    },

    /** Today's day key, or null while trusted time has not arrived. */
    today(): string | null {
        const time = gate();
        return time.ready ? time.day : null;
    },

    previousDay(day: string): string {
        return previousDay(day);
    },

    rewardView() {
        const time = gate();
        const state = store.get();
        if (!time.ready || !time.day)
            return { ...time, claimed: false, streak: state.dailyRewardStreak, reward: REWARDS[0] };
        const claimId = `daily-reward:${time.day}`;
        const claimed = state.dailyRewardClaimIds.includes(claimId);
        const nextStreak = state.dailyRewardLastClaimDay === previousDay(time.day) ? state.dailyRewardStreak + 1 : 1;
        const rewardIndex = (Math.max(1, nextStreak) - 1) % REWARDS.length;
        return {
            ...time,
            claimed,
            streak: claimed ? state.dailyRewardStreak : nextStreak,
            reward: REWARDS[rewardIndex] ?? REWARDS[0],
        };
    },

    async claimDailyReward(): Promise<{ ok: boolean; reason: string; sparks: number }> {
        const view = this.rewardView();
        if (!runtimeServices.config.dailyRewardsEnabled) return { ok: false, reason: "DISABLED BY LIVEOPS", sparks: 0 };
        if (!view.ready || !view.day) return { ok: false, reason: view.label, sparks: 0 };
        const claimId = `daily-reward:${view.day}`;
        if (view.claimed || store.get().dailyRewardClaimIds.includes(claimId))
            return { ok: false, reason: "ALREADY CLAIMED", sparks: 0 };
        const state = store.get();
        const ok = await commitGrant(claimId, view.reward, {
            dailyRewardLastClaimDay: view.day,
            dailyRewardStreak: view.streak,
            dailyRewardClaimIds: [...state.dailyRewardClaimIds, claimId].slice(-90),
        });
        if (ok)
            runtimeServices.track("daily_reward_claimed", {
                streak: view.streak,
                sparks: view.reward,
                authoritative: view.authoritative,
            });
        // Kill switch: the 24h reminder promises this reward. Leaving it scheduled
        // pings the player about something they just claimed, which is exactly how
        // a useful notification becomes a muted one.
        void returnReminders.cancel("d1");
        return { ok, reason: ok ? "CLAIMED" : "SAVE FAILED", sparks: ok ? view.reward : 0 };
    },

    recordQuestProgress(id: "solve" | "perfect" | "daily", amount = 1): void {
        const time = gate();
        if (!time.ready || !time.day || !runtimeServices.config.dailyQuestsEnabled) return;
        ensureQuestDay(time.day);
        const state = store.get();
        const progress = {
            ...state.dailyQuestProgress,
            [id]: Math.max(0, (state.dailyQuestProgress[id] ?? 0) + amount),
        };
        store.patch({ dailyQuestProgress: progress });
        void saveSystem.flush();
    },

    quests(): QuestView[] {
        const time = gate();
        const state = store.get();
        // Only recordQuestProgress rolls dailyQuestDay forward, so right after
        // midnight the stored progress still belongs to YESTERDAY while the
        // claim ids are already built for today. Counting that stale progress
        // let every completed-but-unreset quest pay out a second time each day.
        const progressIsToday = state.dailyQuestDay === time.day;
        const definitions = [
            { id: "solve", label: "SOLVE 5 LEVELS", target: 5, reward: 15 },
            { id: "perfect", label: "SOLVE 3 LEVELS PERFECTLY", target: 3, reward: 20 },
            { id: "daily", label: "SOLVE THE DAILY FLOW", target: 1, reward: 15 },
        ];
        return definitions.map((quest) => {
            const claimId = `daily-quest:${time.day ?? "untrusted"}:${quest.id}`;
            const value = progressIsToday ? (state.dailyQuestProgress[quest.id] ?? 0) : 0;
            const claimed = state.dailyQuestClaimIds.includes(claimId);
            return { ...quest, value, claimed, claimable: time.ready && !claimed && value >= quest.target };
        });
    },

    async claimQuest(questId: string): Promise<{ ok: boolean; reason: string; sparks: number }> {
        const time = gate();
        if (!runtimeServices.config.dailyQuestsEnabled) return { ok: false, reason: "DISABLED BY LIVEOPS", sparks: 0 };
        if (!time.ready || !time.day) return { ok: false, reason: time.label, sparks: 0 };
        const quest = this.quests().find((entry) => entry.id === questId);
        if (!quest || !quest.claimable)
            return { ok: false, reason: quest?.claimed ? "ALREADY CLAIMED" : "NOT COMPLETE", sparks: 0 };
        const claimId = `daily-quest:${time.day}:${quest.id}`;
        const state = store.get();
        const ok = await commitGrant(claimId, quest.reward, {
            dailyQuestClaimIds: [...state.dailyQuestClaimIds, claimId].slice(-180),
        });
        if (ok)
            runtimeServices.track("daily_quest_claimed", {
                quest_id: quest.id,
                sparks: quest.reward,
                authoritative: time.authoritative,
            });
        return { ok, reason: ok ? "CLAIMED" : "SAVE FAILED", sparks: ok ? quest.reward : 0 };
    },
};
