/**
 * Shared Twilio Verify API helper for Supabase Edge Functions.
 *
 * Uses the Twilio Verify API (v2) instead of raw Messages API.
 * Verify handles OTP generation, delivery, and fraud detection.
 * No "From" number required — Verify manages its own senders.
 *
 * Env vars required:
 *   TWILIO_ACCOUNT_SID          — Twilio Account SID
 *   TWILIO_AUTH_TOKEN            — Twilio Auth Token
 *   TWILIO_VERIFY_SERVICE_SID   — Verify Service SID (create at console.twilio.com)
 *
 * Twilio Verify magic numbers (test credentials):
 *   +15005550006  → approved (success)
 *   +15005550001  → invalid number
 *   +15005550009  → unreachable
 */

const VERIFY_BASE = "https://verify.twilio.com/v2";

interface VerifyResult {
    success: boolean;
    status?: string; // "pending", "approved", "canceled"
    sid?: string;
    error?: string;
}

/**
 * Start a phone verification — sends an OTP via SMS.
 * Twilio generates and delivers the code; we don't store it.
 */
export async function startVerification(
    to: string,
    channel: "sms" | "call" = "sms",
): Promise<VerifyResult> {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const serviceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

    if (!accountSid || !authToken || !serviceSid) {
        return {
            success: false,
            error:
                "Twilio Verify not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID)",
        };
    }

    const url = `${VERIFY_BASE}/Services/${serviceSid}/Verifications`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const params = new URLSearchParams();
    params.set("To", to);
    params.set("Channel", channel);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        });

        const data = await res.json();

        if (res.ok) {
            return { success: true, status: data.status, sid: data.sid };
        }

        return {
            success: false,
            error: data.message || `Twilio Verify error (${res.status})`,
        };
    } catch (err) {
        return {
            success: false,
            error: `Network error: ${(err as Error).message}`,
        };
    }
}

/**
 * Check a verification code — validates the OTP the user entered.
 * Returns status "approved" on success, "pending" if code is wrong.
 */
export async function checkVerification(
    to: string,
    code: string,
): Promise<VerifyResult> {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const serviceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

    if (!accountSid || !authToken || !serviceSid) {
        return {
            success: false,
            error: "Twilio Verify not configured",
        };
    }

    const url = `${VERIFY_BASE}/Services/${serviceSid}/VerificationCheck`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const params = new URLSearchParams();
    params.set("To", to);
    params.set("Code", code);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        });

        const data = await res.json();

        if (res.ok && data.status === "approved") {
            return { success: true, status: "approved", sid: data.sid };
        }

        if (res.ok && data.status === "pending") {
            return { success: false, status: "pending", error: "Invalid code" };
        }

        return {
            success: false,
            status: data.status,
            error: data.message || `Verification failed (${data.status})`,
        };
    } catch (err) {
        return {
            success: false,
            error: `Network error: ${(err as Error).message}`,
        };
    }
}

/**
 * Validate E.164 phone number format.
 * Must start with + followed by 7-15 digits.
 */
export function isValidE164(phone: string): boolean {
    return /^\+[1-9]\d{6,14}$/.test(phone);
}
