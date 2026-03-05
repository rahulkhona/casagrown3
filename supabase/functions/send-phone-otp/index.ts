/**
 * send-phone-otp — Edge Function (Twilio Verify API)
 *
 * Starts a phone verification via Twilio Verify. Twilio generates and
 * delivers the OTP — we don't store the code, only track rate limits.
 *
 * Rate limiting (on top of Twilio Verify's built-in fraud detection):
 *   1. Per-IP:     5 requests / 15 minutes
 *   2. Per-phone:  3 verifications / hour
 *   3. Per-user:   5 verifications / 24 hours
 *   4. Cooldown:   60s between sends to same phone
 *   5. Phone dedup: reject if phone already verified by another user
 *   6. Lockout:    respect phone_verification_locked_until from failed attempts
 *
 * Request body: { "phoneNumber": "+15551234567" }
 * Response:     { "success": true } or { "success": false, "error": "..." }
 */

import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { isValidE164, startVerification } from "../_shared/twilio.ts";

// ── Rate limit thresholds ──────────────────────────────────────────────────

const LIMITS = {
    perIp: { max: 5, windowMinutes: 15 },
    perPhone: { max: 3, windowMinutes: 60 },
    perUser: { max: 5, windowMinutes: 1440 }, // 24 hours
    cooldownSeconds: 60,
} as const;

serveWithCors(async (req, { supabase, corsHeaders }) => {
    // ── Auth ────────────────────────────────────────────────────────────
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const userId = auth;

    // ── Parse request ──────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    const phoneNumber = body?.phoneNumber?.trim();

    if (!phoneNumber) {
        return jsonError("phoneNumber is required", corsHeaders, 400);
    }

    if (!isValidE164(phoneNumber)) {
        return jsonError(
            "Invalid phone number format. Use E.164 (e.g., +15551234567)",
            corsHeaders,
            400,
        );
    }

    // ── Check lockout from failed verification attempts ─────────────────
    const { data: profile } = await supabase
        .from("profiles")
        .select(
            "phone_verification_locked_until, phone_number, phone_verified",
        )
        .eq("id", userId)
        .single();

    if (profile?.phone_verification_locked_until) {
        const lockedUntil = new Date(profile.phone_verification_locked_until);
        if (lockedUntil > new Date()) {
            return jsonError(
                `Account locked due to too many failed attempts. Try again later.`,
                corsHeaders,
                429,
            );
        }
    }

    // ── Phone already verified for this user? ───────────────────────────
    if (profile?.phone_verified && profile?.phone_number === phoneNumber) {
        return jsonError(
            "This phone number is already verified",
            corsHeaders,
            400,
        );
    }

    // ── Phone dedup: check if another user already verified this number ─
    const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone_number", phoneNumber)
        .eq("phone_verified", true)
        .neq("id", userId)
        .maybeSingle();

    if (existingUser) {
        return jsonError(
            "This phone number is already verified by another account",
            corsHeaders,
            409,
        );
    }

    // ── Rate limiting ──────────────────────────────────────────────────
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]
        ?.trim() ||
        req.headers.get("cf-connecting-ip") ||
        "unknown";

    // 1. Per-IP rate limit
    const ipCutoff = new Date(
        Date.now() - LIMITS.perIp.windowMinutes * 60 * 1000,
    ).toISOString();
    const { count: ipCount } = await supabase
        .from("sms_rate_limits")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", clientIp)
        .gte("created_at", ipCutoff);

    if ((ipCount ?? 0) >= LIMITS.perIp.max) {
        return jsonError(
            "Too many requests from this IP. Try again later.",
            corsHeaders,
            429,
        );
    }

    // 2. Per-phone rate limit
    const phoneCutoff = new Date(
        Date.now() - LIMITS.perPhone.windowMinutes * 60 * 1000,
    ).toISOString();
    const { count: phoneCount } = await supabase
        .from("sms_rate_limits")
        .select("id", { count: "exact", head: true })
        .eq("phone_number", phoneNumber)
        .gte("created_at", phoneCutoff);

    if ((phoneCount ?? 0) >= LIMITS.perPhone.max) {
        return jsonError(
            "Too many codes sent to this number. Try again later.",
            corsHeaders,
            429,
        );
    }

    // 3. Per-user rate limit
    const userCutoff = new Date(
        Date.now() - LIMITS.perUser.windowMinutes * 60 * 1000,
    ).toISOString();
    const { count: userCount } = await supabase
        .from("sms_rate_limits")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", userCutoff);

    if ((userCount ?? 0) >= LIMITS.perUser.max) {
        return jsonError(
            "Daily OTP limit reached. Try again tomorrow.",
            corsHeaders,
            429,
        );
    }

    // 4. Cooldown — must wait 60s between sends to same phone
    const cooldownCutoff = new Date(
        Date.now() - LIMITS.cooldownSeconds * 1000,
    ).toISOString();
    const { count: recentCount } = await supabase
        .from("sms_rate_limits")
        .select("id", { count: "exact", head: true })
        .eq("phone_number", phoneNumber)
        .gte("created_at", cooldownCutoff);

    if ((recentCount ?? 0) > 0) {
        return jsonError(
            `Please wait ${LIMITS.cooldownSeconds} seconds before requesting another code.`,
            corsHeaders,
            429,
        );
    }

    // ── Update phone number on profile (before sending) ────────────────
    await supabase
        .from("profiles")
        .update({
            phone_number: phoneNumber,
            phone_verification_attempts: 0,
            phone_verification_locked_until: null,
        })
        .eq("id", userId);

    // ── Start Twilio Verify ────────────────────────────────────────────
    const result = await startVerification(phoneNumber);

    if (!result.success) {
        console.error("Twilio Verify failed:", result.error);
        return jsonError(
            "Failed to send verification code. Please check the phone number and try again.",
            corsHeaders,
            502,
        );
    }

    // ── Log rate limit entry ───────────────────────────────────────────
    await supabase.from("sms_rate_limits").insert({
        phone_number: phoneNumber,
        user_id: userId,
        ip_address: clientIp,
    });

    return jsonOk(
        {
            success: true,
            message: "Verification code sent",
            status: result.status, // "pending"
        },
        corsHeaders,
    );
});
