import { serveWithCors, jsonOk, jsonError, requireAuth } from "../_shared/serve-with-cors.ts";
import { sendSms } from "../_shared/twilio.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

serveWithCors(async (req, { supabase, corsHeaders }) => {
    // This is called internally by pg triggers via service role, but we also allow admin.
    // However, the caller usually invokes with service role key, so we check if standard
    // auth logic passes or if it's service role (which passes auth check but userId is 'service_role').
    
    // Auth Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonError("Missing Authorization header", corsHeaders, 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    let adminId: string | null = null;
    if (!isServiceRole) {
      const auth = await requireAuth(req, supabase, corsHeaders);
      if (auth instanceof Response) return auth;
      adminId = auth;
    }

    const bodyPayload = await req.json().catch(() => null);
    // Handle both direct API calls (userId/message) and Database Triggers (userIds/body)
    const userId = bodyPayload?.userId || (bodyPayload?.userIds && bodyPayload.userIds[0]);
    const message = bodyPayload?.message || bodyPayload?.body;
    const linkUrl = bodyPayload?.linkUrl || bodyPayload?.url;

    if (!userId || !message) {
        return jsonError("userId and message are required", corsHeaders, 400);
    }

    // Must be superadmin or service role
    if (!isServiceRole && adminId) {
       return jsonError("Only service_role can dispatch SMS", corsHeaders, 403);
    }

    // ── Global Feature Flag Check ──
    // SMS notifications are gated by ENABLE_SMS_NOTIFICATIONS (server-side)
    // or NEXT_PUBLIC_ENABLE_SMS_NOTIFICATIONS (client-side).
    // This is SEPARATE from ENABLE_PHONE_VERIFICATION which gates OTP/Verify.
    const enableSms = Deno.env.get("ENABLE_SMS_NOTIFICATIONS") === "true" || Deno.env.get("NEXT_PUBLIC_ENABLE_SMS_NOTIFICATIONS") === "true";
    if (!enableSms) {
        return jsonOk({ success: true, message: "Skipped: SMS notifications feature flag is disabled" }, corsHeaders);
    }

    // ── Check if user is eligible for SMS ──
    // SMS is an independent channel: sent to any user who has opted in,
    // regardless of push subscription status. The user controls SMS via
    // phone_verified + sms_enabled + not twilio_blocked.
    // NOTE: To re-gate SMS behind push (cost savings), uncomment the push
    // subscription check that was previously here.
    const { data: profile } = await supabase
        .from("profiles")
        .select("phone_number, phone_verified, sms_enabled, twilio_blocked")
        .eq("id", userId)
        .single();

    if (!profile) {
        return jsonError("Profile not found", corsHeaders, 404);
    }

    if (!profile.phone_verified || !profile.sms_enabled || !profile.phone_number) {
        return jsonOk({ success: true, message: "Skipped: user not SMS-eligible" }, corsHeaders);
    }

    if (profile.twilio_blocked) {
        return jsonOk({ success: true, message: "Skipped: user has opted out (STOP)" }, corsHeaders);
    }



    // ── Prepare SMS body ──
    let smsBody = `CasaGrown: ${message}`;
    if (linkUrl) {
       smsBody += `\nView: https://casagrown.com${linkUrl}`;
    }
    
    smsBody += `\nReply STOP to cancel`;

    // ── Send SMS ──
    const result = await sendSms(profile.phone_number, smsBody);

    // ── Log SMS dispatch (using service role client directly) ──
    const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (result.success) {
        await adminClient.from("sms_notification_log").insert({
            user_id: userId,
            phone_number: profile.phone_number,
            message: smsBody,
            status: "sent",
        });
        return jsonOk({ success: true }, corsHeaders);
    } else {
        await adminClient.from("sms_notification_log").insert({
            user_id: userId,
            phone_number: profile.phone_number,
            message: smsBody,
            status: "failed",
        });
        return jsonError(`SMS delivery failed: ${result.error}`, corsHeaders, 500);
    }
});
