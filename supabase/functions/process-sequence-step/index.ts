import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts"
import { corsHeaders } from '../_shared/cors.ts'

const SequenceNodeSchema = z.object({ 
  id: z.string(), 
  type: z.string(), 
  data: z.any().optional() 
});

const EdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional()
});

const DefinitionSchema = z.object({
  nodes: z.array(SequenceNodeSchema),
  edges: z.array(EdgeSchema),
  startNodeId: z.string()
});

function evaluateRule(rule: any, data: any): boolean {
  if ('combinator' in rule) {
    return evaluateQuery(rule, data);
  }
  const { field, operator, value } = rule;
  const dataValue = data[field];
  
  // Handle empty or boolean fields effectively
  if (value === 'true' || value === true) return dataValue === true || String(dataValue).toLowerCase() === 'true';
  if (value === 'false' || value === false) return dataValue === false || String(dataValue).toLowerCase() === 'false';

  switch (operator) {
    case '=': return dataValue == value;
    case '!=': return dataValue != value;
    case '<': return Number(dataValue) < Number(value);
    case '>': return Number(dataValue) > Number(value);
    case '<=': return Number(dataValue) <= Number(value);
    case '>=': return Number(dataValue) >= Number(value);
    case 'contains': 
      if (Array.isArray(dataValue)) return dataValue.includes(value);
      return String(dataValue).toLowerCase().includes(String(value).toLowerCase());
    case 'doesNotContain':
      if (Array.isArray(dataValue)) return !dataValue.includes(value);
      return !String(dataValue).toLowerCase().includes(String(value).toLowerCase());
    case 'beginsWith': return String(dataValue).toLowerCase().startsWith(String(value).toLowerCase());
    case 'endsWith': return String(dataValue).toLowerCase().endsWith(String(value).toLowerCase());
    case 'null': return dataValue === null || dataValue === undefined;
    case 'notNull': return dataValue !== null && dataValue !== undefined;
    default: return false;
  }
}

function evaluateQuery(query: any, data: any): boolean {
  if (!query || !query.rules || query.rules.length === 0) return true;
  
  if (query.combinator === 'and') {
    return query.rules.every((r: any) => evaluateRule(r, data));
  } else {
    return query.rules.some((r: any) => evaluateRule(r, data));
  }
}
import { buildTemplateModel, interpolateTemplate } from "../_shared/template-interpolation.ts";
import { sendBroadcastEmail, sendBroadcastEmailBatch } from "../_shared/postmark.ts";
import { sendMarketingSms } from "../_shared/twilio.ts";
import { rewriteLinks, rewriteLinksText } from "../_shared/short-links.ts";

// Map US state codes to their primary IANA timezone
const STATE_TIMEZONE_MAP: Record<string, string> = {
  'AL': 'America/Chicago', 'AK': 'America/Anchorage', 'AZ': 'America/Phoenix',
  'AR': 'America/Chicago', 'CA': 'America/Los_Angeles', 'CO': 'America/Denver',
  'CT': 'America/New_York', 'DE': 'America/New_York', 'FL': 'America/New_York',
  'GA': 'America/New_York', 'HI': 'Pacific/Honolulu', 'ID': 'America/Boise',
  'IL': 'America/Chicago', 'IN': 'America/Indiana/Indianapolis', 'IA': 'America/Chicago',
  'KS': 'America/Chicago', 'KY': 'America/New_York', 'LA': 'America/Chicago',
  'ME': 'America/New_York', 'MD': 'America/New_York', 'MA': 'America/New_York',
  'MI': 'America/Detroit', 'MN': 'America/Chicago', 'MS': 'America/Chicago',
  'MO': 'America/Chicago', 'MT': 'America/Denver', 'NE': 'America/Chicago',
  'NV': 'America/Los_Angeles', 'NH': 'America/New_York', 'NJ': 'America/New_York',
  'NM': 'America/Denver', 'NY': 'America/New_York', 'NC': 'America/New_York',
  'ND': 'America/Chicago', 'OH': 'America/New_York', 'OK': 'America/Chicago',
  'OR': 'America/Los_Angeles', 'PA': 'America/New_York', 'RI': 'America/New_York',
  'SC': 'America/New_York', 'SD': 'America/Chicago', 'TN': 'America/Chicago',
  'TX': 'America/Chicago', 'UT': 'America/Denver', 'VT': 'America/New_York',
  'VA': 'America/New_York', 'WA': 'America/Los_Angeles', 'WV': 'America/New_York',
  'WI': 'America/Chicago', 'WY': 'America/Denver', 'DC': 'America/New_York',
  'PR': 'America/Puerto_Rico', 'VI': 'America/Virgin', 'GU': 'Pacific/Guam',
};

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

async function resolveTimezone(metadata: any, supabase: any): Promise<string> {
  if (metadata?.state_code && STATE_TIMEZONE_MAP[metadata.state_code]) {
    return STATE_TIMEZONE_MAP[metadata.state_code];
  }
  
  const zip = metadata?.zipcode || metadata?.zip_code;
  if (zip) {
    try {
      const { data, error } = await supabase
        .from('zip_codes')
        .select('cities(states(code))')
        .eq('zip_code', zip)
        .maybeSingle();

      if (!error && data) {
        const rawCities = data.cities;
        const citiesObj = Array.isArray(rawCities) ? rawCities[0] : rawCities;
        const rawStates = citiesObj?.states;
        const statesObj = Array.isArray(rawStates) ? rawStates[0] : rawStates;
        const stateCode = statesObj?.code;

        if (stateCode && STATE_TIMEZONE_MAP[stateCode]) {
          return STATE_TIMEZONE_MAP[stateCode];
        }
      }
    } catch (e) {
      console.error("[TIMEZONE RESOLUTION ERROR]", e);
    }
  }
  
  return 'America/Los_Angeles'; // default system timezone (Pacific Time)
}

interface SendSlot {
  day?: string;    // new per-row format: "mon", "tue", etc.
  days?: string[]; // legacy multi-day format: ["mon","tue","wed"]
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

/** Get the list of matching day names for a slot (supports both day and days formats) */
function slotDays(slot: SendSlot): string[] {
  if (slot.day) return [slot.day];
  if (slot.days) return slot.days;
  return [];
}

function isWithinSlot(now: Date, tz: string, slots: SendSlot[]): boolean {
  const localStr = now.toLocaleString('en-US', { timeZone: tz });
  const local = new Date(localStr);
  const dayName = DAY_NAMES[local.getDay()];
  const timeMinutes = local.getHours() * 60 + local.getMinutes();
  
  for (const slot of slots) {
    if (!slotDays(slot).includes(dayName)) continue;
    const [startH, startM] = slot.start.split(':').map(Number);
    const [endH, endM] = slot.end.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;
    if (timeMinutes >= startMin && timeMinutes < endMin) return true;
  }
  return false;
}

export function getNextSlotTime(now: Date, tz: string, slots: SendSlot[]): Date {
  // Try up to 8 days ahead to find the next matching slot
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const localStr = candidate.toLocaleString('en-US', { timeZone: tz });
    const local = new Date(localStr);
    const dayName = DAY_NAMES[local.getDay()];
    
    for (const slot of slots) {
      if (!slotDays(slot).includes(dayName)) continue;
      const [startH, startM] = slot.start.split(':').map(Number);
      const startMin = startH * 60 + startM;
      const currentMin = local.getHours() * 60 + local.getMinutes();
      
      if (dayOffset === 0 && startMin <= currentMin) {
        // Already past the slot today
        continue;
      }
      
      const localSlot = new Date(local.getTime());
      localSlot.setHours(startH, startM, 0, 0);
      const offsetMs = local.getTime() - candidate.getTime();
      return new Date(localSlot.getTime() - offsetMs);
    }
  }
  // Fallback: 1 hour from now
  return new Date(now.getTime() + 60 * 60 * 1000);
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Parse optional request body for test_run_all mode
  let testRunAll = false;
  let filterSequenceId: string | null = null;
  let isTest = false;
  try {
    const body = await req.json();
    testRunAll = body?.test_run_all === true;
    filterSequenceId = body?.sequence_id || null;
    isTest = body?.is_test === true || filterSequenceId !== null;
  } catch {
    // No body or invalid JSON — normal cron invocation
  }

  const MAX_TEST_ITERATIONS = 50; // Safety cap to prevent infinite loops
  let iterationCount = 0;
  const allResults: any[] = [];

  // Outer loop: in test_run_all mode, keep processing until all enrollments complete
  do {
    iterationCount++;

    // 1. Fetch pending enrollments
    let query = supabase
      .from('crm_sequence_enrollments')
      .select('*, crm_sequences(id, definition, status)')
      .eq('status', 'active');

    if (testRunAll && filterSequenceId) {
      // In test mode: only this sequence, ignore next_evaluation_at (skip wait delays)
      query = query.eq('sequence_id', filterSequenceId);
    } else {
      // Normal cron mode: only process enrollments whose wait has elapsed
      query = query.lte('next_evaluation_at', new Date().toISOString());
    }

    const { data: enrollments, error } = await query.limit(100);

    if (error || !enrollments) {
      console.error("Error fetching enrollments", error);
      return new Response(JSON.stringify({ error: error?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (enrollments.length === 0) break; // No more active enrollments to process

  const results: any[] = [];
  const emailsToBatch: any[] = [];

  for (const enrollment of enrollments) {
    const sequence = enrollment.crm_sequences;
    if (sequence.status !== 'active' && !isTest) continue;

    try {
      const def = DefinitionSchema.parse(sequence.definition);
      const currentNodeId = enrollment.current_node_id || def.startNodeId;
      const node = def.nodes.find((n: any) => n.id === currentNodeId);

      if (!node) {
        // Complete the sequence if no node found (end of flow)
        await supabase.from('crm_sequence_enrollments').update({ status: 'completed' }).eq('id', enrollment.id);
        results.push({ id: enrollment.id, action: 'completed' });
        continue;
      }

      let nextNodeId: string | null = null;
      let nextEvalAt = new Date();

      const nodeLogicType = node.data?.type || node.type;

      // ── Fetch Metadata for Interpolation & Conditions ──
      let metaRes: any = {}, profileRes: any = {}, enrolledPromoRes: any = {};
      let acceptsEmail = true;
      let acceptsSms = true;

      if (enrollment.recipient_type === 'user') {
        const [mRes, pRes, epRes] = await Promise.all([
          supabase.from('crm_user_metadata').select('*').eq('recipient_id', enrollment.recipient_id).single(),
          supabase.from('profiles').select('full_name, email, phone_number, tos_accepted_at').eq('id', enrollment.recipient_id).single(),
          supabase.from('crm_promo_enrollments').select('promotion_id').eq('user_id', enrollment.recipient_id)
        ]);
        if (mRes.data) metaRes.data = mRes.data;
        if (pRes.data) profileRes.data = pRes.data;
        if (epRes.data) enrolledPromoRes.data = epRes.data;

        acceptsEmail = metaRes.data?.email_enabled !== false;
        acceptsSms = metaRes.data?.sms_enabled === true;
      } else if (enrollment.recipient_type === 'member') {
        // Market members — fetch directly from profiles, no CRM metadata
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone_number, tos_accepted_at')
          .eq('id', enrollment.recipient_id)
          .single();
        if (data) {
          profileRes.data = { full_name: data.full_name, email: data.email, phone_number: data.phone_number };
          metaRes.data = {};
        }
        acceptsEmail = true;
        acceptsSms = true;
      } else {
        // Default: lead recipient
        const { data } = await supabase.from('crm_leads').select('*').eq('id', enrollment.recipient_id).single();
        if (data) {
          profileRes.data = { full_name: data.name, email: data.email, phone_number: data.phone };
          metaRes.data = {
            ...data,
            ...(data.metadata || {})
          };
          acceptsEmail = data.accepts_email !== false;
          acceptsSms = data.accepts_sms !== false;
        }
      }


      if (nodeLogicType === 'input') {
        const edge = def.edges.find((e: any) => e.source === node.id);
        if (edge) nextNodeId = edge.target;
      } else if (nodeLogicType === 'wait') {
        if (testRunAll) {
          // In test mode: skip all wait delays — advance immediately
          console.log(`[TEST MODE] Skipping wait node ${node.id} (${node.data.delayDays || 0}d ${node.data.delayHours || 0}h ${node.data.delayMinutes || 0}m)`);
        } else {
          const days = node.data.delayDays || 0;
          const hours = node.data.delayHours || 0;
          const minutes = node.data.delayMinutes || 0;
          nextEvalAt.setUTCDate(nextEvalAt.getUTCDate() + days);
          nextEvalAt.setUTCHours(nextEvalAt.getUTCHours() + hours);
          nextEvalAt.setUTCMinutes(nextEvalAt.getUTCMinutes() + minutes);
        }
        
        const edge = def.edges.find((e: any) => e.source === node.id);
        if (edge) nextNodeId = edge.target;
      } else if (nodeLogicType === 'wait_for_slot') {
        if (testRunAll) {
          console.log(`[TEST MODE] Skipping wait_for_slot node ${node.id}`);
        } else {
          const slots: SendSlot[] = node.data.slots || [];
          if (slots.length > 0) {
            const tz = await resolveTimezone(metaRes.data, supabase);
            const now = new Date();
            if (!isWithinSlot(now, tz, slots)) {
              nextEvalAt = getNextSlotTime(now, tz, slots);
              console.log(`[WAIT_FOR_SLOT] Outside slot window for ${enrollment.recipient_id} (tz=${tz}), next eval: ${nextEvalAt.toISOString()}`);
            } else {
              console.log(`[WAIT_FOR_SLOT] Within slot window for ${enrollment.recipient_id} (tz=${tz}), advancing immediately`);
            }
          }
        }
        
        const edge = def.edges.find((e: any) => e.source === node.id);
        if (edge) nextNodeId = edge.target;
      } else if (nodeLogicType === 'action_email') {
        const model = buildTemplateModel(profileRes.data, metaRes.data);
        const subject = interpolateTemplate(node.data.subject || '', model);
        let htmlBody = interpolateTemplate(node.data.html || '', model);

        // Rewrite links to short URLs with sequence tracking
        htmlBody = await rewriteLinks(
          htmlBody,
          enrollment.recipient_id,
          enrollment.recipient_type,
          supabase,
          { sequenceId: sequence.id, nodeId: node.id }
        );

        const email = profileRes.data?.email;
        let nextNodeId: string | null = null;
        const edge = def.edges.find((e: any) => e.source === node.id);
        if (edge) nextNodeId = edge.target;

        if (!email) {
          await supabase.from('crm_campaign_sends').insert({
            campaign_id: null,
            sequence_id: sequence.id,
            node_id: node.id,
            recipient_type: enrollment.recipient_type,
            recipient_id: enrollment.recipient_id,
            email: null,
            sent_at: null,
            error: 'missing_email',
          });
          if (nextNodeId) {
            await supabase.from('crm_sequence_enrollments').update({
              current_node_id: nextNodeId,
              next_evaluation_at: nextEvalAt.toISOString()
            }).eq('id', enrollment.id);
            results.push({ id: enrollment.id, action: 'advanced', to: nextNodeId, node_type: 'action_email' });
          } else {
            await supabase.from('crm_sequence_enrollments').update({ status: 'completed' }).eq('id', enrollment.id);
            results.push({ id: enrollment.id, action: 'completed', node_type: 'action_email' });
          }
        } else if (!acceptsEmail) {
          await supabase.from('crm_campaign_sends').insert({
            campaign_id: null,
            sequence_id: sequence.id,
            node_id: node.id,
            recipient_type: enrollment.recipient_type,
            recipient_id: enrollment.recipient_id,
            email,
            sent_at: null,
            error: 'opted_out',
          });
          if (nextNodeId) {
            await supabase.from('crm_sequence_enrollments').update({
              current_node_id: nextNodeId,
              next_evaluation_at: nextEvalAt.toISOString()
            }).eq('id', enrollment.id);
            results.push({ id: enrollment.id, action: 'advanced', to: nextNodeId, node_type: 'action_email' });
          } else {
            await supabase.from('crm_sequence_enrollments').update({ status: 'completed' }).eq('id', enrollment.id);
            results.push({ id: enrollment.id, action: 'completed', node_type: 'action_email' });
          }
        } else {
          emailsToBatch.push({
            payload: { to: email, subject, htmlBody },
            enrollmentId: enrollment.id,
            sequenceId: sequence.id,
            nodeId: node.id,
            recipientType: enrollment.recipient_type,
            recipientId: enrollment.recipient_id,
            email,
            nextNodeId,
            nextEvalAt
          });
        }
        continue;
      } else if (nodeLogicType === 'action_sms') {
        const model = buildTemplateModel(profileRes.data, metaRes.data);
        let textBody = interpolateTemplate(node.data.text || '', model);

        // Rewrite links to short URLs with sequence tracking
        textBody = await rewriteLinksText(
          textBody,
          enrollment.recipient_id,
          enrollment.recipient_type,
          supabase,
          { sequenceId: sequence.id, nodeId: node.id }
        );

        const phone = profileRes.data?.phone_number;

        let errorMsg: string | null = null;
        let sentAt: string | null = null;

        if (!phone) {
          errorMsg = 'missing_phone';
        } else if (!acceptsSms) {
          errorMsg = 'opted_out';
        } else {
          console.log(`[TWILIO STUB] Sending Sequence SMS: ${textBody} to ${phone}${testRunAll ? ' (TEST MODE)' : ''}`);
          const res = await sendMarketingSms(phone, textBody);
          if (res.success) {
            sentAt = new Date().toISOString();
          } else {
            errorMsg = res.error || 'send_failed';
          }
        }

        const { error: insertError } = await supabase.from('crm_campaign_sends').insert({
          campaign_id: null,
          sequence_id: sequence.id,
          node_id: node.id,
          recipient_type: enrollment.recipient_type,
          recipient_id: enrollment.recipient_id,
          phone: phone || null,
          sent_at: sentAt,
          error: errorMsg,
        });
        if (insertError) console.error("Insert error:", insertError);
        
        const edge = def.edges.find((e: any) => e.source === node.id);
        if (edge) nextNodeId = edge.target;
      } else if (nodeLogicType === 'condition') {
        // Evaluate Condition via AST query against user/lead metadata
        let conditionMet = false;
        if (node.data.conditionMode === 'ai' && node.data.aiSql) {
          // AI condition: check if this recipient appears in the AI SQL results
          const checkSql = `SELECT * FROM (${node.data.aiSql}) AS aq WHERE aq.id = '${enrollment.recipient_id}'::uuid`;
          const { data: matchResult, error: matchError } = await supabase.rpc('execute_audience_query', {
            p_query: checkSql
          });
          if (matchError) {
            console.error(`[AI CONDITION ERR] ${matchError.message}`);
          } else {
            conditionMet = Array.isArray(matchResult) && matchResult.length > 0;
          }
          console.log(`[AI CONDITION] ${enrollment.recipient_id} matched=${conditionMet}`);
        } else if (metaRes.data && node.data.query) {
           const metadata = metaRes.data;
           const profile = profileRes.data || {};
           
           // Compute dynamic context variables
           const now = new Date().getTime();
           const lastActiveTime = metadata.last_active_at ? new Date(metadata.last_active_at).getTime() : now;
           const daysSinceActive = Math.floor((now - lastActiveTime) / (1000 * 60 * 60 * 24));
           
           const hasSignedTos = !!profile.tos_accepted_at;
           const hasCompletedProfile = !!metadata.profile_completed_at;
           
           let macroState = 'unknown';
           if (hasSignedTos && hasCompletedProfile) {
             macroState = 'signup_completed';
           } else if (!hasSignedTos || !hasCompletedProfile) {
             macroState = 'signup_abandoned';
           }
           
           let enrolledPromotionIds = enrolledPromoRes?.data ? enrolledPromoRes.data.map((r:any) => r.promotion_id) : [];
            if (enrollment.recipient_type === 'lead' && metadata.enrolled_promotion_ids) {
              enrolledPromotionIds = Array.isArray(metadata.enrolled_promotion_ids) ? metadata.enrolled_promotion_ids : [metadata.enrolled_promotion_ids];
            }
           
            let enrolledSequenceIds: string[] = [];
            const { data: enrRes } = await supabase
              .from('crm_sequence_enrollments')
              .select('sequence_id')
              .eq('recipient_id', enrollment.recipient_id);
            if (enrRes) {
              enrolledSequenceIds = enrRes.map((e: any) => e.sequence_id);
            }

            // Fetch send engagement data for this enrollment
            const { data: sendData } = await supabase
              .from('crm_campaign_sends')
              .select('node_id, email, phone, sent_at, delivered_at, opened_at, clicked_at, bounced_at')
              .eq('sequence_id', sequence.id)
              .eq('recipient_id', enrollment.recipient_id)
              .not('sent_at', 'is', null);

            const sends = sendData || [];
            const emailSends = sends.filter((s: any) => s.email);
            const smsSends = sends.filter((s: any) => s.phone);

            // Aggregate engagement metrics
            const sendEngagement = {
              last_email_opened: emailSends.some((s: any) => s.opened_at) || false,
              last_email_clicked: emailSends.some((s: any) => s.clicked_at) || false,
              last_email_bounced: emailSends.some((s: any) => s.bounced_at) || false,
              last_email_delivered: emailSends.some((s: any) => s.delivered_at) || false,
              last_sms_delivered: smsSends.some((s: any) => s.delivered_at) || false,
              last_sms_bounced: smsSends.some((s: any) => s.bounced_at) || false,
              emails_opened_count: emailSends.filter((s: any) => s.opened_at).length,
              emails_clicked_count: emailSends.filter((s: any) => s.clicked_at).length,
              emails_bounced_count: emailSends.filter((s: any) => s.bounced_at).length,
              total_sends_in_sequence: sends.length,
            };

            // Node-specific engagement — creates fields like node_<nodeId>_opened
            const nodeEngagement: Record<string, boolean> = {};
            for (const s of sends) {
              if (s.node_id) {
                const prefix = `node_${s.node_id}`;
                if (s.opened_at) nodeEngagement[`${prefix}_opened`] = true;
                if (s.clicked_at) nodeEngagement[`${prefix}_clicked`] = true;
                if (s.bounced_at) nodeEngagement[`${prefix}_bounced`] = true;
                if (s.delivered_at) nodeEngagement[`${prefix}_delivered`] = true;
              }
            }

            const emailVal = profile.email || null;
            const phoneVal = profile.phone_number || null;

            const hasEmail = typeof emailVal === 'string' && emailVal.trim().length > 0;
            const hasPhone = typeof phoneVal === 'string' && phoneVal.trim().length > 0;
            
            const hasOnlyEmail = hasEmail && !hasPhone;
            const hasOnlyPhone = hasPhone && !hasEmail;
            const hasBothEmailAndPhone = hasEmail && hasPhone;

            let hasCreatedListings = false;
            const sellerId = (enrollment.recipient_type === 'user' || enrollment.recipient_type === 'member')
              ? enrollment.recipient_id
              : null;
            if (sellerId) {
              const { count, error: countErr } = await supabase
                .from('market_products')
                .select('id', { count: 'exact', head: true })
                .eq('seller_id', sellerId);
              if (!countErr && count !== null && count > 0) {
                hasCreatedListings = true;
              }
            }

            const evalContext = {
              ...metadata,
              has_signed_tos: hasSignedTos,
              has_completed_profile: hasCompletedProfile,
              days_since_last_active: daysSinceActive,
              user_macro_state: macroState,
              enrolled_promotion_ids: enrolledPromotionIds,
              enrolled_sequence_ids: enrolledSequenceIds,
              has_only_email: hasOnlyEmail,
              has_only_phone: hasOnlyPhone,
              has_both_email_and_phone: hasBothEmailAndPhone,
              has_created_listings: hasCreatedListings,
              ...sendEngagement,
              ...nodeEngagement
            };
            
            conditionMet = evaluateQuery(node.data.query, evalContext);
            console.log(`[CONDITION MET] Ruleset Evaluated for ${enrollment.recipient_id}: ${conditionMet}`);
        } else if (metaRes.error) {
           console.error(`[CONDITION ERR] Failed to fetch metadata for ${enrollment.recipient_id}: ${metaRes.error.message}`);
        }
        
        const edge = def.edges.find((e: any) => e.source === node.id && e.label === (conditionMet ? 'true' : 'false'));
        // Fallback to any edge if no label matches
        const fallbackEdge = def.edges.find((e: any) => e.source === node.id);
        
        if (edge) nextNodeId = edge.target;
        else if (fallbackEdge) nextNodeId = fallbackEdge.target;
      } else if (nodeLogicType === 'fork') {
        // Fork creates sub-enrollments, one per outbound edge
        const forkEdges = def.edges.filter((e: any) => e.source === node.id);
        console.log(`[FORK] Creating ${forkEdges.length} sub-enrollments from node ${node.id} for ${enrollment.recipient_id}`);
        
        for (const forkEdge of forkEdges) {
          const { error: subError } = await supabase.from('crm_sequence_enrollments').insert({
            sequence_id: enrollment.sequence_id,
            recipient_type: enrollment.recipient_type,
            recipient_id: enrollment.recipient_id,
            current_node_id: forkEdge.target,
            next_evaluation_at: new Date().toISOString(),
            status: 'active',
            parent_enrollment_id: enrollment.id,
            fork_node_id: node.id,
          });
          if (subError) {
            console.error(`[FORK] Sub-enrollment error:`, subError.message);
          }
        }
        
        // Pause the parent enrollment — it will be resumed by the join node
        await supabase.from('crm_sequence_enrollments').update({ status: 'paused' }).eq('id', enrollment.id);
        results.push({ id: enrollment.id, action: 'forked', node_type: 'fork', branches: forkEdges.length });
        continue; // Skip the normal advance logic below
      } else if (nodeLogicType === 'join') {
        // Join waits for all sibling sub-enrollments from the same fork to complete
        const parentId = enrollment.parent_enrollment_id;
        const forkNodeId = enrollment.fork_node_id;
        
        if (!parentId || !forkNodeId) {
          console.error(`[JOIN] Enrollment ${enrollment.id} reached join without parent/fork reference`);
          const edge = def.edges.find((e: any) => e.source === node.id);
          if (edge) nextNodeId = edge.target;
        } else {
          // Mark this sub-enrollment as completed
          await supabase.from('crm_sequence_enrollments').update({ status: 'completed' }).eq('id', enrollment.id);
          
          // Check if all siblings from the same fork have reached a join (completed)
          const { data: siblings } = await supabase
            .from('crm_sequence_enrollments')
            .select('id, status')
            .eq('parent_enrollment_id', parentId)
            .eq('fork_node_id', forkNodeId);
          
          const allDone = siblings?.every((s: any) => s.status === 'completed') ?? false;
          
          if (allDone) {
            console.log(`[JOIN] All branches complete for fork ${forkNodeId}, resuming parent ${parentId}`);
            // Resume the parent enrollment and advance past the join
            const joinEdge = def.edges.find((e: any) => e.source === node.id);
            await supabase.from('crm_sequence_enrollments').update({
              status: 'active',
              current_node_id: joinEdge?.target || null,
              next_evaluation_at: new Date().toISOString()
            }).eq('id', parentId);
            
            if (!joinEdge?.target) {
              // No outbound edge from join — complete the parent
              await supabase.from('crm_sequence_enrollments').update({ status: 'completed' }).eq('id', parentId);
            }
          } else {
            console.log(`[JOIN] Waiting for other branches for fork ${forkNodeId} (parent=${parentId})`);
          }
          
          results.push({ id: enrollment.id, action: 'joined', allDone, node_type: 'join' });
          continue; // Skip the normal advance logic
        }
      } else if (nodeLogicType === 'terminal') {
        console.log(`[TERMINAL] Reached terminal node ${node.id} for ${enrollment.recipient_id}`);
      }

      if (nextNodeId) {
        await supabase.from('crm_sequence_enrollments').update({
          current_node_id: nextNodeId,
          next_evaluation_at: nextEvalAt.toISOString()
        }).eq('id', enrollment.id);
        results.push({ id: enrollment.id, action: 'advanced', to: nextNodeId, node_type: nodeLogicType });
      } else {
        await supabase.from('crm_sequence_enrollments').update({ status: 'completed' }).eq('id', enrollment.id);
        results.push({ id: enrollment.id, action: 'completed', node_type: nodeLogicType });
      }

    } catch (e: any) {
      console.error(`Error processing enrollment ${enrollment.id}:`, e);
      results.push({ id: enrollment.id, error: e.message });
    }
  }

  if (emailsToBatch.length > 0) {
    const payloads = emailsToBatch.map(item => item.payload);
    console.log(`[POSTMARK BATCH EMIT] Sending Sequence Emails: Batch of ${payloads.length} emails`);
    const batchRes = await sendBroadcastEmailBatch(payloads);
    
    if (batchRes.success) {
      const campaignSends = emailsToBatch.map(item => ({
        campaign_id: null,
        sequence_id: item.sequenceId,
        node_id: item.nodeId,
        recipient_type: item.recipientType,
        recipient_id: item.recipientId,
        email: item.email,
        sent_at: new Date().toISOString(),
        error: null,
      }));
      const { error: insertErr } = await supabase.from('crm_campaign_sends').insert(campaignSends);
      if (insertErr) {
        console.error("[BATCH DB ERROR] Failed to insert campaign sends:", insertErr);
      }
      
      const updatePromises = emailsToBatch.map(async (item) => {
        if (item.nextNodeId) {
          return supabase.from('crm_sequence_enrollments').update({
            current_node_id: item.nextNodeId,
            next_evaluation_at: item.nextEvalAt.toISOString()
          }).eq('id', item.enrollmentId);
        } else {
          return supabase.from('crm_sequence_enrollments').update({
            status: 'completed'
          }).eq('id', item.enrollmentId);
        }
      });
      
      const updateResults = await Promise.all(updatePromises);
      for (let i = 0; i < updateResults.length; i++) {
        const res = updateResults[i];
        if (res.error) {
          console.error(`[BATCH DB ERROR] Failed to update enrollment ${emailsToBatch[i].enrollmentId}:`, res.error);
        } else {
          results.push({
            id: emailsToBatch[i].enrollmentId,
            action: emailsToBatch[i].nextNodeId ? 'advanced' : 'completed',
            to: emailsToBatch[i].nextNodeId || undefined,
            node_type: 'action_email'
          });
        }
      }
    } else {
      console.error(`[BATCH SEND FAILED]`, batchRes.error);
      const campaignSends = emailsToBatch.map(item => ({
        campaign_id: null,
        sequence_id: item.sequenceId,
        node_id: item.nodeId,
        recipient_type: item.recipientType,
        recipient_id: item.recipientId,
        email: item.email,
        sent_at: null,
        error: batchRes.error || 'batch_send_failed',
      }));
      const { error: insertErr } = await supabase.from('crm_campaign_sends').insert(campaignSends);
      if (insertErr) {
        console.error("[BATCH DB ERROR] Failed to insert campaign sends:", insertErr);
      }
    }
  }

    allResults.push(...results);

    // In normal mode, only run once. In test_run_all mode, loop until done.
    if (!testRunAll) break;

  } while (iterationCount < MAX_TEST_ITERATIONS);

  if (testRunAll) {
    console.log(`[TEST MODE] Completed after ${iterationCount} iteration(s), ${allResults.length} step(s) processed`);
  }

  return new Response(JSON.stringify({ success: true, processed: allResults.length, results: allResults, ...(testRunAll ? { iterations: iterationCount } : {}) }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

