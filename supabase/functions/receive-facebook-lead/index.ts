/**
 * receive-facebook-lead
 *
 * Handles Facebook Lead Ads webhook events.
 * Facebook sends a POST when someone fills a native FB lead form.
 *
 * Verification (GET): Returns hub.challenge to prove ownership.
 * Lead event (POST): Verifies signature, maps fields → crm_leads.
 *
 * Env vars:
 *   FB_VERIFY_TOKEN  — arbitrary secret set in FB webhook settings
 *   FB_APP_SECRET    — Facebook App Secret for signature verification
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  // ── CORS preflight ───────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── GET: Facebook webhook verification challenge ─────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("FB_VERIFY_TOKEN");
    if (mode === "subscribe" && token === verifyToken && challenge) {
      console.log("[FB-LEAD] Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ── POST: Incoming lead event ────────────────────────────────────
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify FB signature (X-Hub-Signature-256)
  const appSecret = Deno.env.get("FB_APP_SECRET");
  if (appSecret) {
    const rawBody = await req.clone().text();
    const signature = req.headers.get("X-Hub-Signature-256");
    if (!signature) {
      return new Response("Missing signature", { status: 401 });
    }
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(rawBody),
    );
    const hexSig = "sha256=" +
      Array.from(new Uint8Array(sig)).map((b) =>
        b.toString(16).padStart(2, "0")
      ).join("");
    if (hexSig !== signature) {
      console.error("[FB-LEAD] Invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Process each lead entry
  const object = body.object as string;
  if (object !== "page") {
    return Response.json({ received: true, skipped: "not a page event" });
  }

  const entries = (body.entry as Record<string, unknown>[]) ?? [];
  let inserted = 0;
  let errors = 0;

  for (const entry of entries) {
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];
    for (const change of changes) {
      if (change.field !== "leadgen") continue;

      const val = change.value as Record<string, unknown>;
      const leadId = val.leadgen_id as string;
      const adId = val.ad_id as string;
      const formId = val.form_id as string;

      // Field data: array of { name, values } objects
      const fieldData = (val.field_data as Record<string, unknown>[]) ?? [];
      const fields: Record<string, string> = {};
      for (const f of fieldData) {
        const name = (f.name as string).toLowerCase().replace(/\s+/g, "_");
        const values = f.values as string[];
        fields[name] = values?.[0] ?? "";
      }

      // Map FB fields to crm_leads schema
      const name =
        fields["full_name"] ||
        `${fields["first_name"] || ""} ${fields["last_name"] || ""}`.trim() ||
        fields["name"] ||
        "Unknown";

      const record = {
        name,
        email: fields["email"] || null,
        phone: fields["phone_number"] || fields["phone"] || null,
        source_platform: "facebook",
        source_ad_id: adId || leadId || null,
        utm_campaign: (val.campaign_name as string) || null,
        form_version: formId || null,
        accepts_email: true, // FB lead forms include consent by default
        accepts_sms: !!(fields["phone_number"] || fields["phone"]),
        status: "new",
        metadata: {
          fb_leadgen_id: leadId,
          fb_ad_id: adId,
          fb_form_id: formId,
          fb_page_id: entry.id as string,
          raw_fields: fields,
        },
      };

      const { error } = await supabase.from("crm_leads").insert(record);
      if (error) {
        console.error("[FB-LEAD] Insert error:", error.message);
        errors++;
      } else {
        console.log(`[FB-LEAD] Lead inserted: ${name} <${record.email}>`);
        inserted++;
      }
    }
  }

  return Response.json({
    received: true,
    inserted,
    errors,
  });
});
