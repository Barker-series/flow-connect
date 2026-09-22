/**
 * Every RUN identifier FLOW CONNECT uses, in one registry.
 *
 * Where each id actually comes from:
 *
 * - `gameId` — written by `rundot init` (mirrored in game.config.prod.json).
 * - Ad placement ids — SELF-AUTHORED plain strings passed as `adDisplayId` to
 *   showRewardedAdAsync/showInterstitialAd. There is no platform-side
 *   "create a placement" step; invent a stable name and ship it.
 * - Shop item / entitlement ids — SELF-AUTHORED in `rundot/shop.config.json`,
 *   which registers the catalog at deploy. These strings must match that file
 *   exactly, and `npm run test` checks that they still do.
 *
 * Untouched `REPLACE_WITH_` values fail closed: the surfaces that depend on
 * them stay hidden rather than pretending to work.
 */
export const PLATFORM_IDS = Object.freeze({
    gameId: "Ak3Kb62EmmlSygOUzRDj",

    /** Rewarded: one free hint, offered when the player cannot afford one. */
    rewardedFreeHint: "flowconnect_free_hint_rewarded",
    /** Rewarded: doubles the sparks on the level-complete card. */
    rewardedDoubleSparks: "flowconnect_double_sparks_rewarded",
    /** Interstitial: after the level-complete card, every fourth solve. */
    interstitialBetweenLevels: "flowconnect_between_levels_interstitial",

    /** Shop items (rundot/shop.config.json → items[].itemId). */
    tubePackItem: "flowconnect_tube_pack_nightlife",
    adFreeItem: "flowconnect_no_interstitials",
    powerPassItem: "flowconnect_power_pass",

    /** Entitlements granted by those items. */
    tubePackEntitlement: "flowconnect_tube_pack_nightlife",
    adFreeEntitlement: "flowconnect_no_interstitials",
    prismTubesEntitlement: "flowconnect_tubes_prism",
});

export function isConfiguredPlatformId(value: string): boolean {
    return value.length > 0 && !value.startsWith("REPLACE_WITH_");
}
