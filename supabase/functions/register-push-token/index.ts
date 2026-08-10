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
    // Parse request
    const body = await req.json().catch(() => ({}));
    const { token, platform, endpoint, guest_id, timezone: bodyTimezone, zip_code: bodyZip, city: bodyCity, state_code: bodyState } = body;

    // Detect timezone & location from Vercel Edge Request Headers or Request Body
    const vercelTimezone = req.headers.get("x-vercel-ip-timezone");
    const vercelZip = req.headers.get("x-vercel-ip-postal-code");
    const vercelCity = req.headers.get("x-vercel-ip-city");
    const vercelState = req.headers.get("x-vercel-ip-country-region");

    const timezone = bodyTimezone || vercelTimezone || "America/Los_Angeles";
    const zipCode = bodyZip || vercelZip || null;
    const city = bodyCity || vercelCity || null;
    const stateCode = bodyState || vercelState || null;

    // Authenticate user or fallback to guest_id
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader && !authHeader.includes("anon")) {
      const auth = await requireAuth(req, supabase, corsHeaders);
      if (!(auth instanceof Response)) {
        userId = auth;
      }
    }

    if (!userId && !guest_id) {
      return jsonError("Authentication or guest_id is required", 401, corsHeaders);
    }

    // Validate
    if (!token) throw new Error("token is required");
    if (!["web", "ios", "android", "expo"].includes(platform)) {
        throw new Error("platform must be 'web', 'ios', 'android', or 'expo'");
    }

    // Upsert subscription with location & timezone
    const payload = userId
      ? { user_id: userId, token, platform, endpoint: endpoint || null, timezone, zip_code: zipCode, city, state_code: stateCode, updated_at: new Date().toISOString() }
      : { guest_id, token, platform, endpoint: endpoint || null, timezone, zip_code: zipCode, city, state_code: stateCode, updated_at: new Date().toISOString() };

    const { error } = await supabase.from("push_subscriptions").upsert(
        payload,
        {
            onConflict: userId ? "user_id,token" : "guest_id,token",
        },
    );

    if (error) {
        throw new Error(`Failed to register push token: ${error.message}`);
    }

    console.log(
        `✅ Push token registered: user=${userId || guest_id}, platform=${platform}`,
    );

    return jsonOk({ success: true }, corsHeaders);
});
