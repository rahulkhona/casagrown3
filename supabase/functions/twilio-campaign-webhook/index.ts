/**
 * twilio-campaign-webhook
 *
 * Receives Twilio delivery status callbacks for SMS campaign messages.
 * Updates crm_campaign_sends.bounced_at on failed/undelivered statuses.
 *
 * Configure in Twilio Messaging Services → Status Callback URL.
 * No JWT — Twilio calls this from Twilio's servers.
 * (Twilio signature validation is optional for local testing.)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Twilio sends form-encoded body
  let body: URLSearchParams;
  try {
    const text = await req.text();
    body = new URLSearchParams(text);
  } catch {
    return new Response("Invalid body", { status: 400 });
  }

  const messageSid = body.get("MessageSid");
  const messagingStatus = body.get("MessageStatus");
  const to = body.get("To"); // recipient phone number

  console.log(`[TWILIO-WEBHOOK] SID=${messageSid} Status=${messagingStatus} To=${to}`);

  if (!to || !messagingStatus) {
    return new Response("Missing required fields", { status: 400 });
  }

  // Failed statuses → mark bounced
  const failedStatuses = ["failed", "undelivered"];

  if (failedStatuses.includes(messagingStatus)) {
    const { error } = await supabase
      .from("crm_campaign_sends")
      .update({
        bounced_at: new Date().toISOString(),
        error: `SMS ${messagingStatus}: ${messageSid}`,
      })
      .eq("phone", to)
      .is("bounced_at", null)
      .order("sent_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[TWILIO-WEBHOOK] Update error:", error.message);
    }
  }

  // Twilio expects an empty 200 or TwiML response
  return new Response("", { status: 200 });
});
