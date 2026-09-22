import { store } from "../../state/store.ts";
import { createKvMirror } from "../../sdk/kvMirror.ts";
import { recordAnalytics, recordFunnelStep } from "../../sdk/runSdk.ts";
import packageJson from "../../../package.json";
import { countedSteps, createAnalytics } from "./analytics.ts";

/**
 * FLOW CONNECT funnel registry.
 *
 * `flowconnect_first_level` is the onboarding funnel: from the loaded menu to
 * the first solved board. `flowconnect_first_level_detail` puts the beats
 * inside that first level between those steps — first flow drawn, first flow
 * connected, board solved — so a drop can be read as "never touched the board"
 * versus "drew but never connected" versus "connected but never finished".
 *
 * Step names and numbers are frozen once shipped: add new beats at the end,
 * never renumber.
 */
/** The once-ever funnel marks, mirrored from appStorage (hydrated at boot). */
export const funnelMarks = createKvMirror("flowconnect:funnel-marks");

export const analytics = createAnalytics({
    emitEvent: (name, payload) => {
        void recordAnalytics(name, { ...payload, build_version: packageJson.version });
    },
    emitFunnelStep: (step, name, funnel, order) => {
        // Return the delivery promise so once-ever marks persist only after
        // the SDK confirms the step (see AnalyticsConfig.emitFunnelStep).
        return recordFunnelStep(step, name, funnel, order);
    },
    funnels: {
        /**
         * The loading phase itself, ahead of the first-run funnel (order 0).
         *
         * The first-run funnel starts at "the game finished loading", so a player
         * who closed the tab during boot never appeared in it at all — a load
         * regression and a retention problem looked identical. Step 1 fires on the
         * first executable line, before any await, and is buffered until the SDK
         * transport is up.
         *
         * A separate funnel rather than steps prepended to the existing one,
         * because shipped step numbers must never be renumbered.
         */
        load: {
            order: 0,
            onceEver: true,
            steps: [
                "load_started", // first line of script execution
                "load_sdk_ready", // host handshake resolved
                "load_save_ready", // progress restored
                "load_assets_ready", // playable frame reachable
            ],
        },
        flowconnect_first_level: {
            order: 1,
            onceEver: true,
            steps: ["game_loaded", "level_started", "level_solved"],
        },
        flowconnect_first_level_detail: {
            order: 2,
            onceEver: true,
            steps: [
                "detail_level_started", // same moment as step 2 above
                "detail_first_flow_drawn", // first core-verb action
                "detail_first_flow_connected", // first payoff
                "detail_half_connected", // settled into the board
                "detail_level_solved", // same moment as step 3 above
            ],
        },
        // Repeatable: how deep players get across their first 25 solves.
        engagement: { order: 3, steps: countedSteps("level_solved_", 25) },
        /**
         * Store conversion. Every step below is an event this game was already
         * firing; without the declaration the dashboard could show that purchases
         * happened but not where the other players dropped out of the flow.
         *
         * Repeatable (not onceEver): a player can buy more than once, and each
         * pass through the store should count.
         */
        purchase: {
            order: 3,
            steps: [
                "monetization_surface_viewed", // the store/offer was actually seen
                "purchase_tapped", // a specific product was chosen
                "checkout_started", // the host purchase sheet was requested
                "checkout_result", // the host returned a verdict
            ],
        },
    },
    enrich: () => {
        const state = store.get();
        return {
            levels_completed: state.levelsCompleted,
            daily_streak: state.dailyStreak,
        };
    },
    marksStore: funnelMarks,
    debug: import.meta.env.DEV,
});
