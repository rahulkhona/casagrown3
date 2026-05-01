/**
 * estimate-earnings
 *
 * Called from the /sell landing page questionnaire. Uses Gemma/Gemini to estimate
 * excess produce amounts and earnings potential based on user garden inputs.
 *
 * Payload: { zipcode: string, size: string, plants: string[], trees: string[], lead: { name, email, phone, marketingConsent } }
 * Response: { excess_produce: string, estimated_annual_earnings: number, analogy: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const AI_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
const AI_URL = Deno.env.get("AI_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemma-4-31b-it";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const IS_LOCAL = SUPABASE_URL.includes("localhost") || SUPABASE_URL.includes("127.0.0.1");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const xForwarded = req.headers.get("x-forwarded-for");
    const ip_address = (xForwarded ? xForwarded.split(',')[0] : req.headers.get("x-real-ip"))?.trim() || null;
    const payload = await req.json();
    const { zipcode, size, plants, trees, skip_ai, prefetched_result } = payload;

    if (!size || (!plants?.length && !trees?.length)) {
      return new Response(JSON.stringify({ error: "Missing required inputs" }), {
        status: 400, headers: CORS,
      });
    }

    // Save the lead to the database FIRST so we don't lose them if AI fails
    let leadId = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const produce_interests = [ ...(plants || []), ...(trees || []) ].join(', ');
        const email = payload.lead?.email;
        
        let existingLead: any = null;
        if (email) {
          const { data } = await supabaseAdmin.from('crm_leads').select('*').eq('email', email).maybeSingle();
          existingLead = data;
        }
        
        let finalLead: any = null;
        
        if (existingLead) {
          // Merge logic
          const mergedInterests = Array.from(new Set([
            ...(existingLead.produce_interests ? existingLead.produce_interests.split(', ') : []),
            ...(plants || []),
            ...(trees || [])
          ])).filter(Boolean).join(', ');

          const { data: updatedLead } = await supabaseAdmin.from('crm_leads').update({
            name: payload.lead?.name || existingLead.name,
            phone: payload.lead?.phone || existingLead.phone,
            zipcode: zipcode || existingLead.zipcode,
            has_backyard: true,
            produce_interests: mergedInterests,
            accepts_email: existingLead.accepts_email || !!payload.lead?.marketingConsent,
            accepts_sms: existingLead.accepts_sms || !!payload.lead?.marketingConsent,
            ip_address: ip_address || existingLead.ip_address,
            form_version: 'v1-earnings-estimator',
            source_platform: (existingLead.source_platform && existingLead.source_platform !== 'direct') ? existingLead.source_platform : (payload.lead?.utm_source || 'direct'),
            source_url: existingLead.source_url || payload.lead?.current_url,
            utm_campaign: existingLead.utm_campaign || payload.lead?.utm_campaign,
            utm_medium: existingLead.utm_medium || payload.lead?.utm_medium,
            utm_content: existingLead.utm_content || payload.lead?.utm_content,
            metadata: { 
              ...existingLead.metadata,
              garden_size: size,
              plants: plants || [],
              trees: trees || [],
              referrer: payload.lead?.referrer || existingLead.metadata?.referrer,
              ...(skip_ai && prefetched_result ? { ai_estimate_result: prefetched_result } : {})
            }
          }).eq('id', existingLead.id).select('id').single();
          
          finalLead = updatedLead;
        } else {
          // Insert new
          const { data: insertedLead } = await supabaseAdmin.from('crm_leads').insert({
            name: payload.lead?.name || 'Unknown',
            email: email,
            phone: payload.lead?.phone,
            zipcode: zipcode,
            has_backyard: true,
            produce_interests: produce_interests,
            accepts_email: !!payload.lead?.marketingConsent,
            accepts_sms: !!payload.lead?.marketingConsent,
            ip_address: ip_address,
            form_version: 'v1-earnings-estimator',
            source_platform: payload.lead?.utm_source || 'direct',
            source_url: payload.lead?.current_url,
            utm_campaign: payload.lead?.utm_campaign,
            utm_medium: payload.lead?.utm_medium,
            utm_content: payload.lead?.utm_content,
            status: 'new',
            metadata: { 
              garden_size: size,
              plants: plants || [],
              trees: trees || [],
              referrer: payload.lead?.referrer,
              ...(skip_ai && prefetched_result ? { ai_estimate_result: prefetched_result } : {})
            }
          }).select('id').single();
          
          finalLead = insertedLead;
        }
        
        if (finalLead) leadId = finalLead.id;
      } catch (dbErr) {
        console.error("Failed to save lead to crm_leads:", dbErr);
      }
    }

    if (skip_ai && prefetched_result) {
      return new Response(JSON.stringify(prefetched_result), { headers: CORS });
    }

    // Return queued true so the background queue can process it
    return new Response(JSON.stringify({ queued: true }), {
      status: 200, headers: CORS,
    });
  } catch (err: any) {
    console.error("estimate-earnings error:", err);
    return new Response(JSON.stringify({ queued: true }), {
      status: 200, headers: CORS,
    });
  }
});
