import { serveWithCors, requireAuth, jsonOk, jsonError } from "../_shared/serve-with-cors.ts";

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
  // 1. Authenticate caller (require service_role to ensure only crons or admins can trigger)
  const auth = await requireAuth(req, supabase, corsHeaders);
  if (auth instanceof Response) return auth;
  if (auth !== "service_role") {
    return jsonError("Unauthorized: service_role required", corsHeaders, 403);
  }

  const hubspotToken = env("HUBSPOT_ACCESS_TOKEN");
  if (!hubspotToken) {
    const supaUrl = Deno.env.get("SUPABASE_URL") || "";
    const isLocal = supaUrl.includes("localhost") || supaUrl.includes("127.0.0.1") || supaUrl.includes("kong:");
    if (isLocal) {
      console.log("Skipping HubSpot leads sync in local development because HUBSPOT_ACCESS_TOKEN is not set.");
      return jsonOk({
        success: true,
        synced: 0,
        note: "Skipped local sync (no HUBSPOT_ACCESS_TOKEN set)"
      }, corsHeaders);
    }
    return jsonError("Missing HUBSPOT_ACCESS_TOKEN environment variable", corsHeaders);
  }

  // 2. Determine last sync watermark based on the most recently modified HubSpot lead in our DB
  const lastSyncTimeRes = await supabase
    .from("crm_leads")
    .select("metadata")
    .eq("metadata->>ingested_from", "hubspot")
    .order("metadata->>hubspot_modified_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastHubspotModifiedAt = lastSyncTimeRes.data?.metadata?.hubspot_modified_at;
  
  // If no leads exist, sync contacts modified in the last 24 hours
  let lastSyncTime = lastHubspotModifiedAt
    ? new Date(lastHubspotModifiedAt).getTime()
    : Date.now() - 24 * 60 * 60 * 1000;

  // 3. Prepare search query for HubSpot CRM Search API
  const hubspotSearchUrl = "https://api.hubapi.com/crm/v3/objects/contacts/search";
  const searchPayload = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "lastmodifieddate",
            operator: "GT",
            value: String(lastSyncTime),
          },
        ],
      },
    ],
    properties: [
      "email",
      "firstname",
      "lastname",
      "phone",
      "mobilephone",
      "zip",
      "address",
      "city",
      "state",
      "ip_city",
      "ip_state",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ],
    limit: 100,
  };

  let after: string | undefined = undefined;
  let totalSynced = 0;
  const debugLog: string[] = [];

  do {
    const res = await fetch(hubspotSearchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hubspotToken}`,
      },
      body: JSON.stringify({
        ...searchPayload,
        ...(after ? { after } : {}),
      }),
    });

    if (!res.ok) {
      const errorMsg = await res.text();
      console.error(`HubSpot Search API error: ${res.status} - ${errorMsg}`);
      return jsonError(`HubSpot API returned error: ${errorMsg}`, corsHeaders);
    }

    const data = await res.json();
    const contacts = data.results || [];
    debugLog.push(`Fetched page with ${contacts.length} contacts`);

    for (const contact of contacts) {
      const props = contact.properties || {};
      const email = props.email;
      if (!email) {
        debugLog.push(`Skipping contact ${contact.id}: missing email`);
        continue;
      }

      const firstName = props.firstname || "";
      const lastName = props.lastname || "";
      const fullName = `${firstName} ${lastName}`.trim() || "Unknown";
      
      const city = props.city || props.ip_city || null;
      const state = props.state || props.ip_state || null;

      // Map HubSpot properties to crm_leads schema
      const leadData = {
        name: fullName,
        email: email,
        phone: props.phone || props.mobilephone || null,
        zipcode: props.zip || null,
        source_platform: props.utm_source || "direct", // Maintains original marketing channel
        utm_medium: props.utm_medium || null,
        utm_campaign: props.utm_campaign || null,
        utm_content: props.utm_content || null,
        utm_term: props.utm_term || null,
        status: "new",
        accepts_email: true,  // HubSpot contacts opted in by submitting a form
        accepts_sms: true,    // They can always unsubscribe later
        metadata: {
          ingested_from: "hubspot",
          hubspot_contact_id: contact.id,
          hubspot_modified_at: props.lastmodifieddate || new Date().toISOString(),
          address: props.address || null,
          city: city,
          state: state,
        },
      };

      // Upsert using email as unique identifier
      const { error } = await supabase.from("crm_leads").upsert(leadData, {
        onConflict: "email",
        ignoreDuplicates: false,
      });

      if (error) {
        console.error(`Error upserting lead <${email}>:`, error.message);
        debugLog.push(`Upsert error for <${email}>: ${error.message}`);
      } else {
        totalSynced++;
      }
    }

    after = data.paging?.next?.after;
  } while (after);

  return jsonOk(
    {
      success: true,
      synced: totalSynced,
      last_sync_timestamp: new Date(lastSyncTime).toISOString(),
      log: debugLog,
    },
    corsHeaders
  );
});
