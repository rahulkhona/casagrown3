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
import { sendBroadcastEmail } from "../_shared/postmark.ts";
import { sendMarketingSms } from "../_shared/twilio.ts";
import { rewriteLinks, rewriteLinksText } from "../_shared/short-links.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 1. Fetch pending enrollments
  const { data: enrollments, error } = await supabase
    .from('crm_sequence_enrollments')
    .select('*, crm_sequences(id, definition, status)')
    .eq('status', 'active')
    .lte('next_evaluation_at', new Date().toISOString())
    .limit(100)

  if (error || !enrollments) {
    console.error("Error fetching enrollments", error);
    return new Response(JSON.stringify({ error: error?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const results: any[] = [];

  for (const enrollment of enrollments) {
    const sequence = enrollment.crm_sequences;
    if (sequence.status !== 'active') continue;

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
          metaRes.data = data.metadata || {};
          acceptsEmail = data.accepts_email !== false;
          acceptsSms = data.accepts_sms !== false;
        }
      }


      if (nodeLogicType === 'input') {
        const edge = def.edges.find((e: any) => e.source === node.id);
        if (edge) nextNodeId = edge.target;
      } else if (nodeLogicType === 'wait') {
        const days = node.data.delayDays || 0;
        const hours = node.data.delayHours || 0;
        const minutes = node.data.delayMinutes || 0;
        nextEvalAt.setUTCDate(nextEvalAt.getUTCDate() + days);
        nextEvalAt.setUTCHours(nextEvalAt.getUTCHours() + hours);
        nextEvalAt.setUTCMinutes(nextEvalAt.getUTCMinutes() + minutes);
        
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

        let errorMsg: string | null = null;
        let sentAt: string | null = null;

        if (!email) {
          errorMsg = 'missing_email';
        } else if (!acceptsEmail) {
          errorMsg = 'opted_out';
        } else {
          console.log(`[POSTMARK EMIT] Sending Sequence Email: ${subject} to ${email}`);
          const res = await sendBroadcastEmail({
            to: email,
            subject,
            htmlBody,
          });
          if (res.success) {
            sentAt = new Date().toISOString();
          } else {
            errorMsg = res.error || 'send_failed';
          }
        }

        await supabase.from('crm_campaign_sends').insert({
          campaign_id: null,
          sequence_id: sequence.id,
          node_id: node.id,
          recipient_type: enrollment.recipient_type,
          recipient_id: enrollment.recipient_id,
          email: email || null,
          sent_at: sentAt,
          error: errorMsg,
        });
        
        const edge = def.edges.find((e: any) => e.source === node.id);
        if (edge) nextNodeId = edge.target;
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
          console.log(`[TWILIO STUB] Sending Sequence SMS: ${textBody} to ${phone}`);
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
        if (metaRes.data && node.data.query) {
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

            const evalContext = {
             ...metadata,
             has_signed_tos: hasSignedTos,
             has_completed_profile: hasCompletedProfile,
             days_since_last_active: daysSinceActive,
             user_macro_state: macroState,
             enrolled_promotion_ids: enrolledPromotionIds,
             enrolled_sequence_ids: enrolledSequenceIds
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
      }

      if (nextNodeId) {
        await supabase.from('crm_sequence_enrollments').update({
          current_node_id: nextNodeId,
          next_evaluation_at: nextEvalAt.toISOString()
        }).eq('id', enrollment.id);
        results.push({ id: enrollment.id, action: 'advanced', to: nextNodeId });
      } else {
        await supabase.from('crm_sequence_enrollments').update({ status: 'completed' }).eq('id', enrollment.id);
        results.push({ id: enrollment.id, action: 'completed' });
      }

    } catch (e: any) {
      console.error(`Error processing enrollment ${enrollment.id}:`, e);
      results.push({ id: enrollment.id, error: e.message });
    }
  }

  return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

