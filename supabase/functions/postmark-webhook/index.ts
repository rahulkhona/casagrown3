/**
 * postmark-webhook
 *
 * Receives Postmark webhook events for email tracking.
 * Updates crm_campaign_sends with opened_at and bounced_at timestamps.
 *
 * Postmark fires these events for campaigns sent via the Broadcast stream.
 * Configure the webhook URL in Postmark dashboard → Settings → Webhooks.
 *
 * No JWT required — Postmark calls this endpoint from its own servers.
 * We verify authenticity via POSTMARK_WEBHOOK_TOKEN header check.
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

  // Optional: verify Postmark webhook token
  const expectedToken = Deno.env.get("POSTMARK_WEBHOOK_TOKEN");
  if (expectedToken) {
    const receivedToken = req.headers.get("X-Postmark-Token");
    if (receivedToken !== expectedToken) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let event: Record<string, unknown>;
  try {
    event = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const recordType = event.RecordType as string;
  const recipient = event.Recipient as string | undefined;
  const metadata = event.Metadata as Record<string, string> | undefined;
  const sendId = metadata?.send_id;

  if (!recipient) {
    return Response.json({ ok: true, skipped: "no recipient" });
  }

  console.log(`[POSTMARK-WEBHOOK] Event: ${recordType} for ${recipient} (SendID: ${sendId ?? 'none'})`);

  switch (recordType) {
    case "Open": {
      if (sendId) {
        await supabase
          .from("crm_campaign_sends")
          .update({ opened_at: new Date().toISOString() })
          .eq("id", sendId)
          .is("opened_at", null);
      } else {
        // Fallback for legacy sends without unique send_ids
        await supabase
          .from("crm_campaign_sends")
          .update({ opened_at: new Date().toISOString() })
          .eq("email", recipient)
          .is("opened_at", null)
          .order("sent_at", { ascending: false })
          .limit(1);
      }
      break;
    }

    case "Bounce":
    case "SpamComplaint": {
      if (sendId) {
        await supabase
          .from("crm_campaign_sends")
          .update({ bounced_at: new Date().toISOString() })
          .eq("id", sendId)
          .is("bounced_at", null);
      } else {
        await supabase
          .from("crm_campaign_sends")
          .update({ bounced_at: new Date().toISOString() })
          .eq("email", recipient)
          .is("bounced_at", null);
      }
      break;
    }

    case "SubscriptionChange": {
      if (event.SuppressSending === true) {
        if (sendId) {
          await supabase
            .from("crm_campaign_sends")
            .update({ unsubscribed_at: new Date().toISOString() })
            .eq("id", sendId)
            .is("unsubscribed_at", null);
        } else {
          await supabase
            .from("crm_campaign_sends")
            .update({ unsubscribed_at: new Date().toISOString() })
            .eq("email", recipient)
            .is("unsubscribed_at", null);
        }

        // Always update crm_leads consent irrespective of send_id
        await supabase
          .from("crm_leads")
          .update({ accepts_email: false })
          .eq("email", recipient);
      }
      break;
    }

    default:
      console.log(`[POSTMARK-WEBHOOK] Unhandled event type: ${recordType}`);
  }

  return Response.json({ ok: true, processed: recordType });
});
