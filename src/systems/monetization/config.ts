/**
 * FLOW CONNECT's monetization decisions, in code.
 *
 * These are the values from DESIGN.md §6. Nothing else in the game may invent a
 * placement id, a cap, a product id, or an unlock gate — if it is not here, it
 * does not exist.
 */
import { PLATFORM_IDS } from "../../config/platform.ts";
import { createMonetizationPlan } from "./monetizationPlan.ts";
import { createPlacementRegistry } from "./placementRegistry.ts";
import { createProductRegistry } from "./productRegistry.ts";

export const monetizationPlan = createMonetizationPlan({
    model: "hybrid",
    nonPayerPromise:
        "Nothing purchasable changes a level, a hint, or a reward. Every level is solvable without a hint, three of the six tube sets are earnable with sparks, and the only ad a non-payer cannot decline is one interstitial after every fourth solved level, from their second session onward.",
    purchaseArchitecture: "shop-entitlements",
    architectureRationale:
        "Durable cosmetic and ad-free unlocks need cross-device ownership, an order ledger, and refund handling; a client-owned grant loses all three the first time the player changes device.",
    firstExposure: {
        valueMoment:
            "The Studio, once the player has solved three levels and seen what a tube set changes on their own board.",
        minCompletedSessions: 1,
        minProgression: 3,
    },
    primaryKpis: ["game_payer_conversion", "rewarded_completion_rate"],
    guardrails: {
        retention: "D1/D7 retention split by first-interstitial exposure cohort",
        sessionHealth: "levels per session before and after the first interstitial",
        economyHealth: "share of sparks earned from rewarded video versus play",
        reliability: "purchase and ad error rate excluding player cancellation",
    },
});

/** Placement ids used by `systems/ads.ts`. */
export const PLACEMENT = {
    freeHint: "free_hint",
    doubleSparks: "double_sparks",
    betweenLevels: "between_levels",
} as const;

export type PlacementId = (typeof PLACEMENT)[keyof typeof PLACEMENT];

/** Placement id → the self-authored `adDisplayId` handed to the SDK. */
export const PLACEMENT_DISPLAY_ID: Readonly<Record<PlacementId, string>> = {
    [PLACEMENT.freeHint]: PLATFORM_IDS.rewardedFreeHint,
    [PLACEMENT.doubleSparks]: PLATFORM_IDS.rewardedDoubleSparks,
    [PLACEMENT.betweenLevels]: PLATFORM_IDS.interstitialBetweenLevels,
};

export const placements = createPlacementRegistry([
    {
        id: PLACEMENT.freeHint,
        displayName: "Free Hint",
        type: "rewarded",
        enabledByDefault: false,
        unlock: { minCompletedSessions: 2, minProgression: 2, requireValueMoment: true },
        cooldownSeconds: 45,
        sessionCap: 4,
        dailyCap: 10,
        subscriberPolicy: "same-as-free",
        noAdFallback: "disable-with-message",
        rewardId: "free_hint",
        rewardAmount: 1,
    },
    {
        id: PLACEMENT.doubleSparks,
        displayName: "Double the Sparks",
        type: "rewarded",
        enabledByDefault: false,
        unlock: { minCompletedSessions: 2, minProgression: 2, requireValueMoment: true },
        cooldownSeconds: 30,
        sessionCap: 4,
        dailyCap: 12,
        subscriberPolicy: "same-as-free",
        noAdFallback: "disable-with-message",
        rewardId: "sparks_double",
        rewardAmount: 1,
    },
    {
        id: PLACEMENT.betweenLevels,
        displayName: "Between Levels",
        type: "interstitial",
        enabledByDefault: false,
        unlock: { minCompletedSessions: 8, minProgression: 8, requireValueMoment: true },
        cooldownSeconds: 120,
        sessionCap: 3,
        dailyCap: 6,
        subscriberPolicy: "skip",
        noAdFallback: "hide",
        naturalBreak: "The player leaves the level-complete card for the next level or the level list",
        excludeFirstSession: true,
    },
]);

/** Only every Nth completed level may show the interstitial. */
export const INTERSTITIAL_LEVEL_INTERVAL = 4;

export const products = createProductRegistry([
    {
        id: "tube_pack",
        catalogItemId: PLATFORM_IDS.tubePackItem,
        kind: "durable",
        expectedEntitlementIds: [PLATFORM_IDS.tubePackEntitlement],
        unique: true,
        unlockDescription: "Offered once the player has solved three levels and opened the Studio",
    },
    {
        id: "ad_free",
        catalogItemId: PLATFORM_IDS.adFreeItem,
        kind: "durable",
        expectedEntitlementIds: [PLATFORM_IDS.adFreeEntitlement],
        unique: true,
        unlockDescription: "Offered once the player has reached the interstitial cadence",
    },
    {
        id: "power_pass",
        catalogItemId: PLATFORM_IDS.powerPassItem,
        kind: "bundle",
        expectedEntitlementIds: [
            PLATFORM_IDS.tubePackEntitlement,
            PLATFORM_IDS.adFreeEntitlement,
            PLATFORM_IDS.prismTubesEntitlement,
        ],
        unique: true,
        unlockDescription: "Offered alongside its two component products once either is eligible",
    },
]);

export type ProductId = "tube_pack" | "ad_free" | "power_pass";

export const PRODUCT_IDS: readonly ProductId[] = ["tube_pack", "ad_free", "power_pass"];

/**
 * Prices shown in local development only, where no live catalog exists. They
 * mirror `rundot/shop.config.json` and are always labelled PREVIEW in the UI so
 * they can never be mistaken for a resolved live price.
 */
export const DEV_PREVIEW_PRICES: Readonly<Record<ProductId, string>> = {
    tube_pack: "199 RB",
    ad_free: "249 RB",
    power_pass: "399 RB",
};

/** Levels solved before a product is offered at all — DESIGN.md §6.1. */
export const PRODUCT_UNLOCK_LEVELS: Readonly<Record<ProductId, number>> = {
    tube_pack: 3,
    ad_free: 8,
    power_pass: 8,
};
