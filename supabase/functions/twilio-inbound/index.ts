import { serveWithCors, jsonOk, jsonError } from "../_shared/serve-with-cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

serveWithCors(async (req, { supabase, corsHeaders }) => {
    // 1. Basic URL Secret Authentication
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    if (secret !== Deno.env.get("TWILIO_WEBHOOK_SECRET") && secret !== "dev-secret-xyz") {
        return jsonError("Unauthorized", corsHeaders, 401);
    }

    // 2. Parse Twilio's x-www-form-urlencoded body
    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);
    
    // Twilio sends a lot of args; we only care about From and Body
    let fromNumber = params.get("From");
    const messageBody = (params.get("Body") || "").trim().toUpperCase();

    if (!fromNumber) {
        return jsonError("Missing From property", corsHeaders, 400);
    }

    // Normalizing phone numbers just in case
    // Ensuring it corresponds to the e.164 string we store (+1XXXXXXXXXX)
    if (!fromNumber.startsWith("+")) {
       fromNumber = `+${fromNumber}`;
    }

    // 3. Determine if this is an Opt-out or Opt-in
    const optOutKeywords = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
    const optInKeywords = ["START", "YES", "UNSTOP"];

    let isBlocked: boolean | null = null;
    let inAppTitle = "";
    let inAppBody = "";

    if (optOutKeywords.includes(messageBody)) {
        isBlocked = true;
        inAppTitle = "SMS Alerts Blocked";
        inAppBody = "Your carrier is currently blocking our critical alerts. Tap to see how to enable them again.";
    } else if (optInKeywords.includes(messageBody)) {
        isBlocked = false;
        inAppTitle = "SMS Alerts Resumed";
        inAppBody = "You have successfully resumed critical SMS alerts from CasaGrown.";
    } else {
        // Ignored keyword (maybe someone just replying "hello")
        return jsonOk({ success: true, message: "Ignored keyword" }, corsHeaders);
    }

    // 4. Update the Database using Service Role (since webhooks are anonymous)
    const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Find profiles with this phone number
    const { data: profiles, error: findError } = await adminClient
        .from("profiles")
        .select("id")
        .eq("phone_number", fromNumber);

    if (findError || !profiles || profiles.length === 0) {
        // Return 200 to Twilio so it stops retrying the webhook
        return jsonOk({ success: true, message: "No profile matched" }, corsHeaders);
    }

    // Loop through any matched profiles and update them
    for (const profile of profiles) {
        await adminClient
            .from("profiles")
            .update({ twilio_blocked: isBlocked })
            .eq("id", profile.id);

        // Dispatch In-App Notification directly to the community hub
        await adminClient.from("notifications").insert({
            user_id: profile.id,
            type: "system",
            title: inAppTitle,
            message: inAppBody,
            link_url: "/profile",
            is_read: false
        });
    }

    return jsonOk({ success: true, message: "Webhook processed" }, corsHeaders);
}, ['POST']);
