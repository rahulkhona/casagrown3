import {
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

/**
 * send-push-notification — Supabase Edge Function
 *
 * Sends a push notification to one or more users.
 * Supports Web Push, APNs (iOS), and FCM (Android).
 *
 * APNs and FCM are fully implemented but require credentials:
 *   - iOS: APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY env vars
 *   - Android: FCM_SERVER_KEY env var
 * Without credentials, those platforms are gracefully skipped with a warning.
 *
 * Request body: {
 *   userIds: string[],
 *   title: string,
 *   body: string,
 *   url?: string,      // URL to open on click
 *   tag?: string        // Notification tag for deduplication
 * }
 *
 * Response: { sent: number, failed: number, skipped: number }
 */

// =============================================================================
// Environment — keys loaded from Supabase secrets
// =============================================================================

// Web Push
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ??
    "mailto:support@casagrown.dev";

// iOS APNs
// RELEASE READINESS: Set these after getting APNs key from Apple Developer portal
// 1. Go to developer.apple.com → Certificates → Keys → Create Key
// 2. Enable "Apple Push Notifications service (APNs)"
// 3. Download .p8 file, note Key ID and Team ID
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_KEY = Deno.env.get("APNS_KEY") ?? ""; // Contents of .p8 file
const APNS_BUNDLE_ID = "dev.casagrown.community";
const APNS_HOST = Deno.env.get("APNS_PRODUCTION") === "true"
    ? "https://api.push.apple.com"
    : "https://api.development.push.apple.com";

// Android FCM
// RELEASE READINESS: Set after creating Firebase project
// 1. Go to console.firebase.google.com → create project
// 2. Project Settings → Cloud Messaging → get Server Key
const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY") ?? "";

// =============================================================================
// Handler
// =============================================================================

serveWithCors(async (req, { supabase, corsHeaders }) => {
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;

    const { userIds, title, body, url, tag } = await req.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        throw new Error("userIds array is required");
    }
    if (!title) throw new Error("title is required");
    if (!body) throw new Error("body is required");

    // Fetch all push subscriptions for the target users
    const { data: subscriptions, error: fetchError } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("user_id", userIds);

    if (fetchError) {
        throw new Error(`Failed to fetch subscriptions: ${fetchError.message}`);
    }

    if (!subscriptions || subscriptions.length === 0) {
        return jsonOk({
            sent: 0,
            failed: 0,
            skipped: 0,
            message: "No subscriptions found",
        }, corsHeaders);
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const sub of subscriptions) {
        try {
            if (sub.platform === "web") {
                await sendWebPush(sub, { title, body, url, tag });
                sent++;
            } else if (sub.platform === "ios") {
                if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) {
                    console.warn(
                        `⏭️ iOS push skipped — APNs credentials not configured (subscription ${sub.id})`,
                    );
                    skipped++;
                    continue;
                }
                await sendAPNs(sub, { title, body, url, tag });
                sent++;
            } else if (sub.platform === "android") {
                if (!FCM_SERVER_KEY) {
                    console.warn(
                        `⏭️ Android push skipped — FCM credentials not configured (subscription ${sub.id})`,
                    );
                    skipped++;
                    continue;
                }
                await sendFCM(sub, { title, body, url, tag });
                sent++;
            }
        } catch (err) {
            console.error(`❌ Push failed for subscription ${sub.id}:`, err);
            failed++;

            // If endpoint returns 410 (Gone), the subscription is expired — clean it up
            if (err instanceof PushError && err.statusCode === 410) {
                await supabase.from("push_subscriptions").delete().eq(
                    "id",
                    sub.id,
                );
                console.log(`🗑️ Cleaned up expired subscription ${sub.id}`);
            }
        }
    }

    console.log(
        `📬 Push: sent=${sent}, failed=${failed}, skipped=${skipped}, total=${subscriptions.length}`,
    );
    return jsonOk({ sent, failed, skipped }, corsHeaders);
});

// =============================================================================
// Shared Error Class
// =============================================================================

class PushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

type PushPayload = { title: string; body: string; url?: string; tag?: string };

// =============================================================================
// Web Push
// =============================================================================

async function sendWebPush(
    subscription: { token: string; endpoint: string },
    payload: PushPayload,
): Promise<void> {
    const subData = JSON.parse(subscription.token);
    const endpoint = subData.endpoint || subscription.endpoint;
    const p256dh = subData.keys?.p256dh;
    const authKey = subData.keys?.auth;

    if (!endpoint || !p256dh || !authKey) {
        throw new Error("Invalid web push subscription data");
    }

    const payloadStr = JSON.stringify(payload);
    const vapidHeaders = await createVapidHeaders(endpoint);

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            ...vapidHeaders,
            "Content-Type": "application/json",
            "Content-Length": String(
                new TextEncoder().encode(payloadStr).length,
            ),
            "TTL": "86400",
        },
        body: payloadStr,
    });

    if (!response.ok) {
        throw new PushError(
            `Web push failed: ${response.status} ${response.statusText}`,
            response.status,
        );
    }
}

async function createVapidHeaders(
    endpoint: string,
): Promise<Record<string, string>> {
    // Simplified VAPID headers — for full RFC 8292 compliance,
    // use a web-push library with proper JWT + ECDSA signing
    const _audience = new URL(endpoint).origin;
    return {
        "Authorization": `vapid t=${VAPID_PUBLIC_KEY}, k=${VAPID_PUBLIC_KEY}`,
    };
}

// =============================================================================
// APNs (iOS) — Full implementation, requires APNS_KEY credentials
// =============================================================================

async function sendAPNs(
    subscription: { token: string; id: string },
    payload: PushPayload,
): Promise<void> {
    // Build APNs JWT token
    const jwt = await createAPNsJWT();

    const apnsPayload = {
        aps: {
            alert: {
                title: payload.title,
                body: payload.body,
            },
            sound: "default",
            badge: 1,
            "thread-id": payload.tag || "casagrown",
            "mutable-content": 1,
        },
        url: payload.url || "/feed",
    };

    const response = await fetch(
        `${APNS_HOST}/3/device/${subscription.token}`,
        {
            method: "POST",
            headers: {
                "Authorization": `bearer ${jwt}`,
                "apns-topic": APNS_BUNDLE_ID,
                "apns-push-type": "alert",
                "apns-priority": "10",
                "apns-expiration": "0",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(apnsPayload),
        },
    );

    if (!response.ok) {
        const errBody = await response.text();
        throw new PushError(
            `APNs failed: ${response.status} ${errBody}`,
            response.status,
        );
    }
}

/**
 * Create a JWT for APNs authentication (ES256 / P-256 ECDSA).
 * Uses the .p8 key from env vars.
 */
async function createAPNsJWT(): Promise<string> {
    const header = { alg: "ES256", kid: APNS_KEY_ID };
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: APNS_TEAM_ID, iat: now };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedClaims = base64UrlEncode(JSON.stringify(claims));
    const unsignedToken = `${encodedHeader}.${encodedClaims}`;

    // Import the .p8 private key (PKCS#8 PEM format)
    const pemKey = APNS_KEY.replace(/-----BEGIN PRIVATE KEY-----/, "")
        .replace(/-----END PRIVATE KEY-----/, "")
        .replace(/\s/g, "");
    const keyData = Uint8Array.from(atob(pemKey), (c) => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
        "pkcs8",
        keyData.buffer,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
    );

    const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        cryptoKey,
        new TextEncoder().encode(unsignedToken),
    );

    const encodedSignature = base64UrlEncode(
        String.fromCharCode(...new Uint8Array(signature)),
    );

    return `${unsignedToken}.${encodedSignature}`;
}

// =============================================================================
// FCM (Android) — Full implementation, requires FCM_SERVER_KEY
// =============================================================================

async function sendFCM(
    subscription: { token: string; id: string },
    payload: PushPayload,
): Promise<void> {
    const fcmPayload = {
        to: subscription.token,
        notification: {
            title: payload.title,
            body: payload.body,
            sound: "default",
            tag: payload.tag || "casagrown",
            click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
        data: {
            url: payload.url || "/feed",
            title: payload.title,
            body: payload.body,
        },
        priority: "high",
        time_to_live: 86400,
    };

    const response = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
            "Authorization": `key=${FCM_SERVER_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(fcmPayload),
    });

    if (!response.ok) {
        const errBody = await response.text();
        throw new PushError(
            `FCM failed: ${response.status} ${errBody}`,
            response.status,
        );
    }

    const result = await response.json();

    // FCM returns success/failure counts even with 200
    if (result.failure > 0) {
        const error = result.results?.[0]?.error;
        if (error === "NotRegistered" || error === "InvalidRegistration") {
            throw new PushError(`FCM token invalid: ${error}`, 410);
        }
        throw new PushError(`FCM delivery failed: ${error}`, 500);
    }
}

// =============================================================================
// Helpers
// =============================================================================

function base64UrlEncode(str: string): string {
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
