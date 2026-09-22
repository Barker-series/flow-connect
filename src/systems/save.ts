/**
 * Versioned persistence — DESIGN.md §9.
 *
 * RUN appStorage (the SDK mock's locally), and a migrator that drops anything
 * it does not recognise instead of trusting it.
 *
 * Ownership is deliberately absent from this file. Which tube sets the player
 * BOUGHT is read from Entitlements every session; the save only remembers
 * which sets they earned with sparks and which one they selected.
 */
import { DEFAULT_PALETTE, isPaletteId, PALETTES, type PaletteId } from "../game/art/palette.ts";
import { getRunCapabilities, readAppStorage, writeAppStorage } from "../sdk/runSdk.ts";
import { type AppState, type LevelRecord, type PendingPurchaseIntent, store } from "../state/store.ts";

const SAVE_KEY = "flowconnect:save";
export const SAVE_VERSION = 1;

/** Quest ids the migrator will accept; anything else is discarded. */
const QUEST_IDS = ["solve", "perfect", "daily"] as const;

export interface GameSaveV1 {
    version: 1;
    settings: Pick<
        AppState,
        | "musicEnabled"
        | "musicVolume"
        | "sfxEnabled"
        | "sfxVolume"
        | "notificationsEnabled"
        | "notificationsOptOut"
        | "notificationsConsent"
        | "hapticsEnabled"
        | "reducedMotion"
        | "locale"
        | "quality"
    >;
    progress: Pick<
        AppState,
        | "sparks"
        | "levelRecords"
        | "levelsCompleted"
        | "hintsUsedTotal"
        | "dailyStreak"
        | "dailyBestStreak"
        | "dailyLastSolved"
        | "ownedPalettes"
        | "selectedPalette"
    >;
    retention: Pick<
        AppState,
        | "dailyRewardLastClaimDay"
        | "dailyRewardStreak"
        | "dailyRewardClaimIds"
        | "dailyQuestDay"
        | "dailyQuestProgress"
        | "dailyQuestClaimIds"
    >;
    commerce: { pendingPurchaseIntent: PendingPurchaseIntent | null };
}

export type SaveSource = "run" | "local" | "defaults";

function clamp01(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function enumOr<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(number))) : fallback;
}

function dayKeyOrNull(value: unknown): string | null {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function recentStrings(value: unknown, limit: number): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length <= 160).slice(-limit);
}

/**
 * Level records: `pack:index` or `daily:YYYY-MM-DD` keys only, each with a
 * positive best and a boolean perfect. The daily history is capped so a
 * years-long player's save stays small.
 */
function levelRecords(value: unknown): Record<string, LevelRecord> {
    if (!value || typeof value !== "object") return {};
    const entries = Object.entries(value as Record<string, unknown>).filter(
        ([key]) => /^[a-z]{2,16}:\d{1,3}$/.test(key) || /^daily:\d{4}-\d{2}-\d{2}$/.test(key),
    );
    const kept: Array<[string, LevelRecord]> = [];
    for (const [key, raw] of entries) {
        if (!raw || typeof raw !== "object") continue;
        const record = raw as Partial<LevelRecord>;
        const best = nonNegativeInteger(record.best);
        if (best <= 0) continue;
        kept.push([key, { best, perfect: record.perfect === true }]);
    }
    const daily = kept.filter(([key]) => key.startsWith("daily:")).sort(([a], [b]) => a.localeCompare(b));
    const dropped = new Set(daily.slice(0, Math.max(0, daily.length - 120)).map(([key]) => key));
    return Object.fromEntries(kept.filter(([key]) => !dropped.has(key)));
}

/** Earned tube sets only. A set the player bought is proven by entitlement. */
function paletteList(value: unknown): PaletteId[] {
    const known = new Set(PALETTES.map((entry) => entry.id));
    const list = Array.isArray(value) ? value.filter((entry): entry is PaletteId => isPaletteId(entry)) : [];
    const unique = [...new Set([DEFAULT_PALETTE, ...list])].filter((entry) => known.has(entry));
    return unique;
}

function pendingIntent(value: unknown): PendingPurchaseIntent | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<PendingPurchaseIntent>;
    if (
        typeof candidate.productId !== "string" ||
        typeof candidate.catalogItemId !== "string" ||
        typeof candidate.idempotencyKey !== "string" ||
        candidate.idempotencyKey.length === 0
    ) {
        return null;
    }
    return {
        productId: candidate.productId.slice(0, 64),
        catalogItemId: candidate.catalogItemId.slice(0, 128),
        idempotencyKey: candidate.idempotencyKey.slice(0, 128),
        startedAt: nonNegativeInteger(candidate.startedAt),
    };
}

function snapshot(): GameSaveV1 {
    const s = store.get();
    return {
        version: SAVE_VERSION,
        settings: {
            musicEnabled: s.musicEnabled,
            musicVolume: s.musicVolume,
            sfxEnabled: s.sfxEnabled,
            sfxVolume: s.sfxVolume,
            notificationsEnabled: s.notificationsEnabled,
            notificationsOptOut: s.notificationsOptOut,
            notificationsConsent: s.notificationsConsent,
            hapticsEnabled: s.hapticsEnabled,
            reducedMotion: s.reducedMotion,
            locale: s.locale,
            quality: s.quality,
        },
        progress: {
            sparks: s.sparks,
            levelRecords: s.levelRecords,
            levelsCompleted: s.levelsCompleted,
            hintsUsedTotal: s.hintsUsedTotal,
            dailyStreak: s.dailyStreak,
            dailyBestStreak: s.dailyBestStreak,
            dailyLastSolved: s.dailyLastSolved,
            ownedPalettes: s.ownedPalettes,
            selectedPalette: s.selectedPalette,
        },
        retention: {
            dailyRewardLastClaimDay: s.dailyRewardLastClaimDay,
            dailyRewardStreak: s.dailyRewardStreak,
            dailyRewardClaimIds: s.dailyRewardClaimIds,
            dailyQuestDay: s.dailyQuestDay,
            dailyQuestProgress: s.dailyQuestProgress,
            dailyQuestClaimIds: s.dailyQuestClaimIds,
        },
        commerce: { pendingPurchaseIntent: s.pendingPurchaseIntent },
    };
}

function migrate(raw: unknown): GameSaveV1 | null {
    if (!raw || typeof raw !== "object") return null;
    const candidate = raw as { version?: number } & Partial<Omit<GameSaveV1, "version">>;
    if (candidate.version !== SAVE_VERSION || !candidate.settings || !candidate.progress) return null;

    const defaults = snapshot();
    const retention: Partial<GameSaveV1["retention"]> =
        candidate.retention && typeof candidate.retention === "object" ? candidate.retention : {};
    const questProgress =
        retention.dailyQuestProgress && typeof retention.dailyQuestProgress === "object"
            ? Object.fromEntries(
                  Object.entries(retention.dailyQuestProgress)
                      .filter(
                          ([key, value]) =>
                              (QUEST_IDS as readonly string[]).includes(key) && Number.isFinite(Number(value)),
                      )
                      .map(([key, value]) => [key, nonNegativeInteger(value)]),
              )
            : {};

    const owned = paletteList(candidate.progress.ownedPalettes);
    const selected = isPaletteId(candidate.progress.selectedPalette)
        ? candidate.progress.selectedPalette
        : DEFAULT_PALETTE;

    return {
        version: SAVE_VERSION,
        settings: {
            musicEnabled: booleanOr(candidate.settings.musicEnabled, defaults.settings.musicEnabled),
            musicVolume: clamp01(candidate.settings.musicVolume, defaults.settings.musicVolume),
            sfxEnabled: booleanOr(candidate.settings.sfxEnabled, defaults.settings.sfxEnabled),
            sfxVolume: clamp01(candidate.settings.sfxVolume, defaults.settings.sfxVolume),
            hapticsEnabled: booleanOr(candidate.settings.hapticsEnabled, defaults.settings.hapticsEnabled),
            reducedMotion: booleanOr(candidate.settings.reducedMotion, defaults.settings.reducedMotion),
            locale: enumOr(
                candidate.settings.locale,
                ["English", "PortugueseBR", "SpanishLA"] as const,
                defaults.settings.locale,
            ),
            quality: enumOr(candidate.settings.quality, ["high", "low"] as const, defaults.settings.quality),
            notificationsConsent: enumOr(
                candidate.settings.notificationsConsent,
                ["unknown", "granted", "denied"] as const,
                defaults.settings.notificationsConsent,
            ),
            // Consent is the gate: an "enabled" flag without granted consent is
            // exactly the state a stale save would restore, so it is dropped.
            // Additive back-fill: saves written before the opt-out existed have
            // no field, and "absent" must mean "has not opted out" — defaulting
            // the other way would re-silence every existing player.
            notificationsOptOut: booleanOr(candidate.settings.notificationsOptOut, false),
            // Restored only so Settings paints something sane before the boot
            // probe lands; runtimeServices re-derives it from the live host
            // permission on the first refresh.
            notificationsEnabled: booleanOr(candidate.settings.notificationsEnabled, false),
        },
        progress: {
            sparks: nonNegativeInteger(candidate.progress.sparks, defaults.progress.sparks),
            levelRecords: levelRecords(candidate.progress.levelRecords),
            levelsCompleted: nonNegativeInteger(candidate.progress.levelsCompleted),
            hintsUsedTotal: nonNegativeInteger(candidate.progress.hintsUsedTotal),
            dailyStreak: nonNegativeInteger(candidate.progress.dailyStreak),
            dailyBestStreak: nonNegativeInteger(candidate.progress.dailyBestStreak),
            dailyLastSolved: dayKeyOrNull(candidate.progress.dailyLastSolved),
            ownedPalettes: owned,
            // A selection the player cannot prove they own reverts on load; the
            // entitlement pass in `commerce.ts` re-checks it once ownership syncs.
            selectedPalette: owned.includes(selected) ? selected : DEFAULT_PALETTE,
        },
        retention: {
            dailyRewardLastClaimDay: dayKeyOrNull(retention.dailyRewardLastClaimDay),
            dailyRewardStreak: nonNegativeInteger(retention.dailyRewardStreak),
            dailyRewardClaimIds: recentStrings(retention.dailyRewardClaimIds, 90),
            dailyQuestDay: dayKeyOrNull(retention.dailyQuestDay),
            dailyQuestProgress: questProgress,
            dailyQuestClaimIds: recentStrings(retention.dailyQuestClaimIds, 180),
        },
        commerce: { pendingPurchaseIntent: pendingIntent(candidate.commerce?.pendingPurchaseIntent) },
    };
}

function parse(raw: string | null): GameSaveV1 | null {
    if (!raw) return null;
    try {
        return migrate(JSON.parse(raw));
    } catch {
        return null;
    }
}

function apply(save: GameSaveV1): void {
    store.patch({ ...save.settings, ...save.progress, ...save.retention, ...save.commerce });
}

let lastSaved = "";
let pendingSave: string | null = null;
let flushInFlight: Promise<boolean> | null = null;

/**
 * Every save goes through RUN appStorage — the host's in production, the SDK
 * mock's in local development (which persists on this device). Browser
 * storage is not an option at all: it is unavailable in the RUN iframe, and
 * the SDK build check refuses to ship it. With no storage capability at all
 * the game still plays; progress simply lasts for this page life.
 */
async function persist(serialized: string): Promise<boolean> {
    if (!getRunCapabilities().storage) return false;
    return writeAppStorage(SAVE_KEY, serialized);
}

export const saveSystem = {
    async load(): Promise<SaveSource> {
        const capabilities = getRunCapabilities();
        const remote = await readAppStorage(SAVE_KEY);
        const save = remote.ok ? parse(remote.value) : null;
        if (save) apply(save);
        lastSaved = JSON.stringify(snapshot());
        if (!save) return "defaults";
        return capabilities.mock ? "local" : "run";
    },

    /**
     * Coalesce rapid changes and serialize remote writes, so an older, slower
     * RPC can never land after and overwrite a newer one.
     */
    async flush(): Promise<boolean> {
        const serialized = JSON.stringify(snapshot());
        if (serialized === lastSaved && pendingSave === null) return true;
        pendingSave = serialized;
        if (flushInFlight) return flushInFlight;

        flushInFlight = (async () => {
            let allSucceeded = true;
            while (pendingSave !== null) {
                const next = pendingSave;
                pendingSave = null;
                if (next === lastSaved) continue;
                const saved = await persist(next);
                if (saved) lastSaved = next;
                else allSucceeded = false;
            }
            return allSucceeded;
        })().finally(() => {
            flushInFlight = null;
        });
        return flushInFlight;
    },
};
