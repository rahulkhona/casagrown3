/**
 * verify-phone-otp — Edge Function (Twilio Verify API)
 *
 * Checks the OTP code via Twilio Verify's VerificationCheck endpoint.
 * If approved, updates the user's profile to mark phone as verified.
 *
 * Lockout: After 5 failed attempts, locks for 30 minutes.
 *
 * Request body: { "phoneNumber": "+15551234567", "code": "123456" }
 * Response:     { "success": true, "verified": true }
 *            or { "success": false, "error": "..." }
 */

import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { checkVerification, isValidE164 } from "../_shared/twilio.ts";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

serveWithCors(async (req, { supabase, corsHeaders }) => {
    // ── Auth ────────────────────────────────────────────────────────────
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const userId = auth;

    // ── Parse request ──────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    const phoneNumber = body?.phoneNumber?.trim();
    const code = body?.code?.trim();

    if (!phoneNumber || !code) {
        return jsonError(
            "phoneNumber and code are required",
            corsHeaders,
            400,
        );
    }

    if (!isValidE164(phoneNumber)) {
        return jsonError(
            "Invalid phone number format",
            corsHeaders,
            400,
        );
    }

    if (!/^\d{4,8}$/.test(code)) {
        return jsonError(
            "Invalid code format (4-8 digits)",
            corsHeaders,
            400,
        );
    }

    // ── Check lockout ──────────────────────────────────────────────────
    const { data: profile } = await supabase
        .from("profiles")
        .select(
            "phone_number, phone_verified, phone_verification_attempts, phone_verification_locked_until",
        )
        .eq("id", userId)
        .single();

    if (!profile) {
        return jsonError("Profile not found", corsHeaders, 404);
    }

    if (profile.phone_verification_locked_until) {
        const lockedUntil = new Date(profile.phone_verification_locked_until);
        if (lockedUntil > new Date()) {
            const minutesLeft = Math.ceil(
                (lockedUntil.getTime() - Date.now()) / 60000,
            );
            return jsonError(
                `Too many failed attempts. Try again in ${minutesLeft} minutes.`,
                corsHeaders,
                429,
            );
        }
    }

    // ── Phone number must match what was sent ──────────────────────────
    if (profile.phone_number !== phoneNumber) {
        return jsonError(
            "Phone number does not match the number that was sent a code",
            corsHeaders,
            400,
        );
    }

    // ── Already verified? ──────────────────────────────────────────────
    if (profile.phone_verified) {
        return jsonOk(
            { success: true, verified: true, message: "Already verified" },
            corsHeaders,
        );
    }

    // ── Check code via Twilio Verify ───────────────────────────────────
    const result = await checkVerification(phoneNumber, code);

    if (result.success && result.status === "approved") {
        // ✅ Verified — update profile
        await supabase
            .from("profiles")
            .update({
                phone_verified: true,
                phone_verified_at: new Date().toISOString(),
                phone_verification_code: null,
                phone_verification_expires_at: null,
                phone_verification_attempts: 0,
                phone_verification_locked_until: null,
            })
            .eq("id", userId);

        return jsonOk(
            { success: true, verified: true },
            corsHeaders,
        );
    }

    // ❌ Wrong code — increment attempts
    const attempts = (profile.phone_verification_attempts ?? 0) + 1;
    const updates: Record<string, unknown> = {
        phone_verification_attempts: attempts,
    };

    if (attempts >= MAX_ATTEMPTS) {
        updates.phone_verification_locked_until = new Date(
            Date.now() + LOCKOUT_MINUTES * 60 * 1000,
        ).toISOString();
    }

    await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId);

    if (attempts >= MAX_ATTEMPTS) {
        return jsonError(
            `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
            corsHeaders,
            429,
        );
    }

    return jsonError(
        `Invalid verification code. ${
            MAX_ATTEMPTS - attempts
        } attempts remaining.`,
        corsHeaders,
        400,
    );
});
