/**
 * Shared helper for sending push notifications from edge functions.
 *
 * Usage:
 *   import { sendPushNotification } from "../_shared/push-notify.ts";
 *   await sendPushNotification(supabase, { ... });
 *
 * This is a fire-and-forget helper — errors are logged but never thrown,
 * so the calling edge function's response is never blocked or failed by push.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PushNotificationPayload {
    /** User IDs to notify */
    userIds: string[];
    /** Notification title */
    title: string;
    /** Notification body text */
    body: string;
    /** URL to open when notification is clicked */
    url?: string;
    /** Tag for notification collapsing (same tag = replace previous) */
    tag?: string;
}

/**
 * Send a push notification to one or more users.
 * Fire-and-forget — errors are caught and logged, never thrown.
 *
 * @param supabase - Service-role Supabase client
 * @param payload  - Notification content
 */
export async function sendPushNotification(
    supabase: SupabaseClient,
    payload: PushNotificationPayload,
): Promise<void> {
    try {
        const { data, error } = await supabase.functions.invoke(
            "send-push-notification",
            { body: payload },
        );

        if (error) {
            console.warn(
                `⚠️ Push notification failed (non-blocking): ${error.message}`,
            );
            return;
        }

        console.log(
            `📬 Push sent: ${JSON.stringify(data)} → ${
                payload.userIds.join(", ")
            }`,
        );
    } catch (err) {
        // Never let push failures affect the calling function
        console.warn(
            `⚠️ Push notification error (non-blocking):`,
            err,
        );
    }
}

/**
 * Look up a user's display name from the profiles table.
 * Returns "Someone" as fallback.
 */
export async function getUserDisplayName(
    supabase: SupabaseClient,
    userId: string,
): Promise<string> {
    try {
        const { data } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", userId)
            .single();
        return data?.full_name || "Someone";
    } catch {
        return "Someone";
    }
}
