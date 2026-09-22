import { analytics } from "../analytics/analyticsConfig";
import {
    cancelLocalNotification,
    notificationsEnabled,
    rearmLocalNotification,
    resolveLaunchIntent,
} from "../../sdk/runSdk";
import { RETURN_DELAYS_SECONDS, createReturnReminders } from "./returnReminders";
import { store } from "../../state/store";

/**
 * Return reminders for FLOW CONNECT.
 *
 * Before this, the game had no way to reach a player once they closed it —
 * onboarding could convert perfectly and still produce no second session.
 *
 * The copy below is the actual product. Each body names the specific thing
 * waiting for this player; a generic "come back and play" is the wording that
 * gets muted, and muting is permanent. The cadence stops at 72h because a
 * fourth ping converts nobody and costs the permission the first three need.
 */

// Permission is read once at startup rather than per-schedule: the check is an
// async host round-trip and scheduling happens on the session-end path.
let notificationsGranted = false;

/** Refresh the cached permission. Call at startup and after any consent change. */
export async function refreshNotificationPermission(): Promise<boolean> {
    notificationsGranted = await notificationsEnabled();
    return notificationsGranted;
}

export const returnReminders = createReturnReminders({
    idPrefix: "flowconnect",
    reminders: () => [
        {
            id: "d1",
            title: "Today's Daily Flow is live",
            body: "One fresh board, the same for everyone. Keep your streak lit.",
            delaySeconds: RETURN_DELAYS_SECONDS[0],
        },
        {
            id: "d2",
            title: "Your next level is waiting",
            body: "The pack is right where you left it.",
            delaySeconds: RETURN_DELAYS_SECONDS[1],
        },
        {
            id: "d3",
            title: "One perfect away",
            body: "Every flow in one stroke — go clean up a level.",
            delaySeconds: RETURN_DELAYS_SECONDS[2],
        },
    ],
    schedule: (input) => rearmLocalNotification(input),
    cancel: (id) => cancelLocalNotification(id),
    resolveLaunch: () => resolveLaunchIntent(),
    // The cached permission annotates the scheduled event; it must never gate
    // scheduling. A stale or failed boot probe would otherwise silence the
    // whole cadence for the session, and a mid-session grant would never arm.
    // The settings toggle is a real player choice and does gate.
    // Reads the explicit opt-out, NOT `notificationsEnabled` — that field
    // mirrors the app-wide host permission, and gating on it would make an
    // unread or not-yet-granted permission indistinguishable from a player who
    // asked us to stop.
    isOptedOut: () => store.get().notificationsOptOut,
    permissionHint: () => notificationsGranted,
    track: (event, payload) => analytics.event(event, payload),
});

/**
 * Resolve a notification-driven launch and record it. Call once at startup so
 * the return can be attributed to the reminder copy that earned it.
 */
export async function resolveReturnLaunch(): Promise<string | null> {
    const reminderId = await returnReminders.resolveLaunch();
    if (reminderId) analytics.event("retention_notification_return_play", { reminder_id: reminderId });
    return reminderId;
}
