import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

/**
 * register-push-token — Supabase Edge Function
 *
 * Stores a push notification token/subscription for the authenticated user.
 * Upserts on (user_id, token) to handle duplicates gracefully.
 *
 * Request body: {
 *   token: string,       // Push token (native) or JSON subscription (web)
 *   platform: 'web' | 'ios' | 'android',
 *   endpoint?: string    // Web Push endpoint URL
 * }
 *
 * Response: { success: true }
 */

serveWithCors(async (req, { supabase, corsHeaders }) => {
    // Authenticate
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const userId = auth;

    // Parse request
    const { token, platform, endpoint } = await req.json();

    // Validate
    if (!token) throw new Error("token is required");
    if (!platform || !["web", "ios", "android"].includes(platform)) {
        throw new Error("platform must be 'web', 'ios', or 'android'");
    }

    // Upsert subscription (update timestamp if already exists)
    const { error } = await supabase.from("push_subscriptions").upsert(
        {
            user_id: userId,
            token,
            platform,
            endpoint: endpoint || null,
            updated_at: new Date().toISOString(),
        },
        {
            onConflict: "user_id,token",
        },
    );

    if (error) {
        throw new Error(`Failed to register push token: ${error.message}`);
    }

    console.log(
        `✅ Push token registered: user=${userId}, platform=${platform}`,
    );

    return jsonOk({ success: true }, corsHeaders);
});
