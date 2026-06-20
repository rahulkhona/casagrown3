/**
 * send-crm-campaign
 *
 * Resolves a campaign's audience, rewrites links to branded short URLs,
 * sends via Postmark batch (email) or Twilio (SMS), and tracks sends.
 *
 * Triggered by:
 *   - pg_cron job every 15 minutes (for scheduled campaigns)
 *   - Manual POST from admin UI (for immediate send)
 *
 * Body (optional): { campaign_id: string } — if omitted, processes all
 *   campaigns with status='scheduled' and scheduled_at <= now().
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import Mustache from "https://esm.sh/mustache@4.2.0";
import { sendBroadcastEmailBatch, sendBroadcastTemplateBatch } from "../_shared/postmark.ts";
import { sendMarketingSms } from "../_shared/twilio.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { buildTemplateModel } from "../_shared/template-interpolation.ts";
import { rewriteLinks, rewriteLinksText } from "../_shared/short-links.ts";

// Safety guard: never use localhost URLs in production emails
const _rawSiteUrl = Deno.env.get("SITE_URL") ?? "https://casagrown.com";
const SITE_URL = (
  _rawSiteUrl.includes("localhost") && Deno.env.get("POSTMARK_SERVER_TOKEN")
) ? "https://casagrown.com" : _rawSiteUrl;
const BATCH_SIZE = 500;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let campaignId: string | null = null;
  let systemAlias: string | null = null;
  let subjectOverride: string | null = null;
  let templateOverride: string | null = null;
  let audienceOverride: any[] | null = null; // direct array of { email, phone, name... }
  
  let isTest = false;
  
  if (req.method === "POST" && req.headers.get("content-type")?.includes("json")) {
    try {
      const body = await req.json();
      campaignId = body.campaign_id ?? null;
      systemAlias = body.system_alias ?? null;
      subjectOverride = body.subject ?? null;
      templateOverride = body.template_alias ?? null;
      audienceOverride = body.audience ?? null;
      isTest = body.is_test === true;
    } catch { /* ignore */ }
  }

  // ── Auto-Create System Alias logic ──────────────────────────────────
  if (systemAlias && !campaignId) {
    const { data: existing } = await supabase
      .from("crm_campaigns")
      .select("id")
      .eq("system_alias", systemAlias)
      .single();

    if (existing) {
      campaignId = existing.id;
    } else {
      console.log(`[SEND-CAMPAIGN] Auto-creating campaign for alias: ${systemAlias}`);
      const { data: inserted, error: insertErr } = await supabase
        .from("crm_campaigns")
        .insert({
          system_alias: systemAlias,
          name: `Auto-created: ${systemAlias}`,
          subject: subjectOverride ?? `Campaign: ${systemAlias}`,
          postmark_template_alias: templateOverride ?? systemAlias,
          channel: "email",
          status: "sending"
        })
        .select()
        .single();
        
      if (insertErr) {
        return Response.json({ error: `Auto-create failed: ${insertErr.message}` }, { status: 500, headers: corsHeaders });
      }
      campaignId = inserted.id;
    }
  }

  // ── Load campaigns to send ──────────────────────────────────────────
  const campaignQuery = supabase
    .from("crm_campaigns")
    .select("*, crm_audiences(*), crm_data_sources(*)");

  // If a specific ID is queried (from manual POST or auto-create), only process that one.
  // Otherwise, fallback to cron-mode (look for scheduled items)
  if (campaignId) {
    campaignQuery.eq("id", campaignId);
  } else {
    campaignQuery.in("status", ["scheduled", "sending"]).lte("scheduled_at", new Date().toISOString());
  }

  const { data: campaigns, error: campErr } = await campaignQuery;
  if (campErr) {
    return Response.json({ error: campErr.message }, { status: 500, headers: corsHeaders });
  }
  if (!campaigns || campaigns.length === 0) {
    return Response.json({ processed: 0, message: "No campaigns to send" }, { headers: corsHeaders });
  }

  let totalProcessed = 0;
  let totalErrors = 0;

  for (const campaign of campaigns) {
    console.log(`[SEND-CAMPAIGN] Processing campaign: ${campaign.name} (${campaign.id})`);

    // Mark as sending only if it's not a test
    if (!isTest) {
      await supabase.from("crm_campaigns").update({ status: "sending" }).eq("id", campaign.id);
    }

    try {
      // ── Resolve audience ──────────────────────────────────────────
      const audience = campaign.crm_audiences;
      let recipients: AudienceRow[] = [];

      if (isTest) {
        if (campaign.channel === "sms") {
          if (campaign.test_phones && campaign.test_phones.length > 0) {
            recipients = campaign.test_phones.map((phone: string) => ({
              id: crypto.randomUUID(),
              recipient_type: 'user',
              email: null,
              phone: phone.trim(),
              name: 'Test User',
              state_code: null,
              city: null,
              zip_code: null,
              community_h3: null,
              joined_at: new Date().toISOString(),
              accepts_email: false,
              accepts_sms: true,
            }));
          }
        } else {
          if (campaign.test_emails && campaign.test_emails.length > 0) {
            recipients = campaign.test_emails.map((email: string) => ({
              id: crypto.randomUUID(),
              recipient_type: 'user',
              email: email.trim(),
              phone: null,
              name: 'Test User',
              state_code: null,
              city: null,
              zip_code: null,
              community_h3: null,
              joined_at: new Date().toISOString(),
              accepts_email: true,
              accepts_sms: false,
            }));
          }
        }
      } else if (audienceOverride && audienceOverride.length > 0) {
         // Direct audience passing via API for 1-off trigger scenarios
         recipients = audienceOverride;
      } else if (audience?.audience_rpc_name) {
        const { data, error } = await supabase.rpc(audience.audience_rpc_name);
        if (error) throw new Error(`Audience RPC failed: ${error.message}`);
        recipients = data as AudienceRow[];
      } else {
        // Explicitly require an audience. If they selected "None", this array stays empty,
        // and the campaign will only send to test_emails or test_phones if any, or no one.
        console.log(`[SEND-CAMPAIGN] No audience selected. Skipping global fallback.`);
      }

      // Apply behavioral filter_criteria (if any remain)
      // Only filter if not directly overridden
      if (!audienceOverride && audience?.filter_criteria) {
        recipients = applyFilters(recipients, audience.filter_criteria);
      }

      // Apply Multi-Geo targets mapped directly from the Campaign object
      if (!audienceOverride) {
         recipients = applyGeoTargets(recipients, campaign);
      }

      // Filter by channel consent
      if (campaign.channel === "email" && !audienceOverride) {
        recipients = recipients.filter((r) => r.email && r.accepts_email !== false);
      } else if (campaign.channel === "sms" && !audienceOverride) {
        recipients = recipients.filter((r) => r.phone && r.accepts_sms !== false);
      }

      // ── Resolve Data Source (if registered) ───────────────────────
      let dynamicModel: any = null;
      if (campaign.crm_data_sources?.rpc_name) {
        const { data, error } = await supabase.rpc(campaign.crm_data_sources.rpc_name);
        if (error) {
           console.error(`[SEND-CAMPAIGN] Data Source RPC Error (${campaign.crm_data_sources.rpc_name}):`, error);
        } else {
           dynamicModel = data;
        }
      }

      console.log(`[SEND-CAMPAIGN] ${recipients.length} recipients for campaign ${campaign.id}`);

      // ── Send in batches ───────────────────────────────────────────
      let sent = 0;
      let failed = 0;

      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);

        // Bulk fetch metadata for interpolation
        const recipientIds = batch.map(r => r.id);
        const { data: userMetadataList } = await supabase.from('crm_user_metadata').select('*').in('recipient_id', recipientIds);
        const metadataMap = new Map(userMetadataList?.map(m => [m.recipient_id, m]) || []);

        if (campaign.channel === "email") {
          let result;
          const sendRecords: any[] = [];

          if (campaign.postmark_template_alias) {
            // ── Postmark Template API Mode ──
            const templatePayloads = batch.map(r => {
              const sendId = crypto.randomUUID();
              return {
                to: r.email!,
                templateAlias: campaign.postmark_template_alias!,
                templateModel: {
                  recipient_id: r.id,
                  ...buildTemplateModel(r, metadataMap.get(r.id) || {}, dynamicModel)
                },
                metadata: { send_id: sendId },
                _sendId: sendId // temporary for local mapping
              };
            });

            result = await sendBroadcastTemplateBatch(templatePayloads.map(({ _sendId, ...rest }) => rest));
            
            sendRecords.push(...templatePayloads.map(p => ({
              id: p._sendId,
              campaign_id: campaign.id,
              recipient_type: batch.find(r => r.email === p.to)?.recipient_type ?? "user",
              recipient_id: p.templateModel.recipient_id,
              email: p.to,
              sent_at: result?.success ? new Date().toISOString() : null,
              error: result?.success ? null : result?.error,
            })));
            
          } else {
            // ── Standard Custom HTML Mode ──
            const emailPayloads = await Promise.all(
              batch.map(async (r) => {
                const rawBody = campaign.content_html ?? "";
                const rawText = campaign.content_text ?? "";
                const model = buildTemplateModel(r, metadataMap.get(r.id) || {}, dynamicModel);
                
                const renderedHtml = Mustache.render(rawBody, model);
                const renderedText = rawText ? Mustache.render(rawText, model) : "";
                
                const personalizedHtml = await rewriteLinks(
                  renderedHtml,
                  r.id,
                  r.recipient_type,
                  supabase,
                  { campaignId: campaign.id }
                );

                const personalizedText = renderedText ? await rewriteLinksText(
                  renderedText,
                  r.id,
                  r.recipient_type,
                  supabase,
                  { campaignId: campaign.id }
                ) : undefined;

                const sendId = crypto.randomUUID();
                return {
                  to: r.email!,
                  subject: Mustache.render(campaign.subject ?? "Message from CasaGrown", model),
                  htmlBody: personalizedHtml,
                  textBody: personalizedText,
                  recipientId: r.id,
                  metadata: { send_id: sendId },
                  _sendId: sendId
                };
              }),
            );

            result = await sendBroadcastEmailBatch(
              emailPayloads.map((p) => ({
                to: p.to,
                subject: p.subject,
                htmlBody: p.htmlBody,
                ...(p.textBody && { textBody: p.textBody }),
                metadata: p.metadata
              })),
            );

            sendRecords.push(...emailPayloads.map(p => ({
              id: p._sendId,
              campaign_id: campaign.id,
              recipient_type: batch.find((r) => r.email === p.to)?.recipient_type ?? "user",
              recipient_id: p.recipientId,
              email: p.to,
              sent_at: result?.success ? new Date().toISOString() : null,
              error: result?.success ? null : result?.error,
            })));
          }

          await supabase.from("crm_campaign_sends").insert(sendRecords);
          if (result?.success) sent += batch.length;
          else failed += batch.length;

        } else {
          // SMS: send one by one (Twilio doesn't have batch API)
          for (const r of batch) {
            const rawText = campaign.content_text ?? "";
            const model = buildTemplateModel(r, metadataMap.get(r.id) || {}, dynamicModel);
            const renderedText = Mustache.render(rawText, model);

            const smsBody = await rewriteLinksText(
              renderedText,
              r.id,
              r.recipient_type,
              supabase,
              { campaignId: campaign.id }
            );

            const result = await sendMarketingSms(r.phone!, smsBody);
            await supabase.from("crm_campaign_sends").insert({
              campaign_id: campaign.id,
              recipient_type: r.recipient_type,
              recipient_id: r.id,
              phone: r.phone,
              sent_at: result.success ? new Date().toISOString() : null,
              error: result.success ? null : result.error,
            });

            if (result.success) sent++;
            else failed++;
          }
        }
      }

      // ── Update campaign stats ─────────────────────────────────────
      if (!isTest) {
        await supabase.from("crm_campaigns").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          stats: { total_sent: sent, failed, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
        }).eq("id", campaign.id);
      } else {
        // Just revert to draft/scheduled if it was a test
        await supabase.from("crm_campaigns").update({
          status: campaign.status === 'sending' ? 'scheduled' : campaign.status
        }).eq("id", campaign.id);
      }

      totalProcessed++;
      console.log(`[SEND-CAMPAIGN] Done: ${sent} sent, ${failed} failed`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SEND-CAMPAIGN] Campaign ${campaign.id} failed: ${msg}`);
      if (!isTest) {
        await supabase.from("crm_campaigns").update({
          status: "scheduled", // revert so it retries
          stats: { error: msg },
        }).eq("id", campaign.id);
      }
      totalErrors++;
    }
  }

  return Response.json({
    processed: totalProcessed,
    errors: totalErrors,
  }, { headers: corsHeaders });
});

// ── Types ────────────────────────────────────────────────────────────────────

interface AudienceRow {
  id: string;
  recipient_type: "lead" | "user";
  email: string | null;
  phone: string | null;
  name: string | null;
  state_code: string | null;
  city: string | null;
  zip_code: string | null;
  community_h3: string | null;
  joined_at: string;
  accepts_email: boolean;
  accepts_sms: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Apply structured filter_criteria JSONB to in-memory audience rows */
function applyFilters(
  rows: AudienceRow[],
  criteria: Record<string, unknown>,
): AudienceRow[] {
  return rows.filter((r) => {
    // Geo variables have been moved to Campaign Target Arrays, only process behavioral criteria here
    if (criteria.accepts_email === true && !r.accepts_email) return false;
    if (criteria.accepts_sms === true && !r.accepts_sms) return false;
    if (criteria.joined_after && new Date(r.joined_at) < new Date(criteria.joined_after as string)) return false;
    if (criteria.joined_before && new Date(r.joined_at) > new Date(criteria.joined_before as string)) return false;
    return true;
  });
}

/** Apply Campaign-level Geographic Target Arrays */
function applyGeoTargets(
  rows: AudienceRow[],
  campaign: Record<string, any>,
): AudienceRow[] {
  const hasStates   = Array.isArray(campaign.target_states)   && campaign.target_states.length > 0;
  const hasCities   = Array.isArray(campaign.target_cities)   && campaign.target_cities.length > 0;
  const hasCounties = Array.isArray(campaign.target_counties) && campaign.target_counties.length > 0;
  const hasZips     = Array.isArray(campaign.target_zips)     && campaign.target_zips.length > 0;
  const hasH3s      = Array.isArray(campaign.target_h3s)      && campaign.target_h3s.length > 0;

  // If no inclusive targets are set, allow all global recipients to pass
  if (!hasStates && !hasCities && !hasCounties && !hasZips && !hasH3s) {
    return rows;
  }

  return rows.filter((r) => {
    // If a recipient matches ANY of the target arrays, they are included (OR logic bounding box)
    if (hasStates   && r.state_code             && campaign.target_states.includes(r.state_code)) return true;
    if (hasCities   && r.city                   && campaign.target_cities.some((c: string) => c.toLowerCase() === r.city?.toLowerCase())) return true;
    if (hasZips     && r.zip_code               && campaign.target_zips.includes(r.zip_code)) return true;
    if (hasH3s      && r.community_h3           && campaign.target_h3s.includes(r.community_h3)) return true;
    
    // Recipient failed to map against any of the requested geo boundaries
    return false;
  });
}


