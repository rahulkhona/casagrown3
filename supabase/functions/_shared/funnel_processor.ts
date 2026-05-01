import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { sendBroadcastEmail } from "./postmark.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AI_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
const AI_URL = Deno.env.get("AI_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemma-4-31b-it";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

export type IngestionConfig = {
  formVersion: string;
  extractInterests: (payload: any) => string;
  buildMetadata: (payload: any) => Record<string, any>;
  hasBackyard: boolean;
  resultKey: string;
  getAiPrompt: (payload: any) => string;
  getCacheQuery?: (supabaseAdmin: any, payload: any) => Promise<any>;
};

export async function handleLeadIngestion(req: Request, config: IngestionConfig): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const xForwarded = req.headers.get("x-forwarded-for");
    const ip_address = (xForwarded ? xForwarded.split(',')[0] : req.headers.get("x-real-ip"))?.trim() || null;
    const payload = await req.json();
    const { skip_ai, prefetched_result } = payload;
    
    // Save to database
    let leadId = null;
    let finalLeadMetadata: any = null;
    
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const email = payload.lead?.email;
        
        let existingLead: any = null;
        if (email) {
          const { data } = await supabaseAdmin.from('crm_leads').select('*').eq('email', email).maybeSingle();
          existingLead = data;
        }
        
        const produce_interests = config.extractInterests(payload);

        if (existingLead) {
          const mergedInterests = Array.from(new Set([
            ...(existingLead.produce_interests ? existingLead.produce_interests.split(', ') : []),
            ...(produce_interests.split(', '))
          ])).filter(Boolean).join(', ');

          const metadata = { 
            ...existingLead.metadata,
            ...config.buildMetadata(payload),
            referrer: payload.lead?.referrer || existingLead.metadata?.referrer,
            ...(skip_ai && prefetched_result ? { [config.resultKey]: prefetched_result } : {})
          };

          const { data } = await supabaseAdmin.from('crm_leads').update({
            name: payload.lead?.name || existingLead.name,
            phone: payload.lead?.phone || existingLead.phone,
            has_backyard: config.hasBackyard,
            produce_interests: mergedInterests,
            accepts_email: existingLead.accepts_email || !!payload.lead?.marketingConsent,
            accepts_sms: existingLead.accepts_sms || !!payload.lead?.marketingConsent,
            ip_address: ip_address || existingLead.ip_address,
            form_version: config.formVersion,
            source_platform: (existingLead.source_platform && existingLead.source_platform !== 'direct') ? existingLead.source_platform : (payload.lead?.utm_source || 'direct'),
            source_url: existingLead.source_url || payload.lead?.current_url,
            utm_campaign: existingLead.utm_campaign || payload.lead?.utm_campaign,
            utm_medium: existingLead.utm_medium || payload.lead?.utm_medium,
            utm_content: existingLead.utm_content || payload.lead?.utm_content,
            metadata
          }).eq('id', existingLead.id).select('id, metadata').single();
          
          if (data) {
            leadId = data.id;
            finalLeadMetadata = data.metadata;
          }
        } else {
          // Insert new
          const metadata = { 
            ...config.buildMetadata(payload),
            referrer: payload.lead?.referrer,
            ...(skip_ai && prefetched_result ? { [config.resultKey]: prefetched_result } : {})
          };
          
          const { data } = await supabaseAdmin.from('crm_leads').insert({
            name: payload.lead?.name || 'Unknown',
            email: email,
            phone: payload.lead?.phone,
            has_backyard: config.hasBackyard,
            produce_interests: produce_interests,
            accepts_email: !!payload.lead?.marketingConsent,
            accepts_sms: !!payload.lead?.marketingConsent,
            ip_address: ip_address,
            form_version: config.formVersion,
            source_platform: payload.lead?.utm_source || 'direct',
            source_url: payload.lead?.current_url,
            utm_campaign: payload.lead?.utm_campaign,
            utm_medium: payload.lead?.utm_medium,
            utm_content: payload.lead?.utm_content,
            status: 'new',
            metadata
          }).select('id, metadata').single();
          
          if (data) {
            leadId = data.id;
            finalLeadMetadata = data.metadata;
          }
        }
      } catch (dbErr) {
        console.error(`Failed to save lead to crm_leads (${config.formVersion}):`, dbErr);
      }
    }

    if (skip_ai && prefetched_result) {
      return new Response(JSON.stringify(prefetched_result), { headers: CORS });
    }

    // Inline AI race
    if (leadId && !finalLeadMetadata?.[config.resultKey] && !skip_ai) {
      try {
        let cachedResult = null;
        if (config.getCacheQuery && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
           const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
           try {
             cachedResult = await config.getCacheQuery(supabaseAdmin, payload);
           } catch (cacheErr) {
             console.warn("Cache query failed:", cacheErr);
           }
        }
        
        if (cachedResult) {
            const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            await supabaseAdmin.from('crm_leads').update({
              metadata: { ...finalLeadMetadata, [config.resultKey]: cachedResult }
            }).eq('id', leadId);
            
            return new Response(JSON.stringify({ [config.resultKey]: cachedResult }), {
              status: 200, headers: CORS,
            });
        }

        if (AI_KEY) {
          const prompt = config.getAiPrompt(payload);
          
          const fetchPromise = fetch(AI_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${AI_KEY}`,
              "HTTP-Referer": "https://casagrown.com",
              "X-Title": "CasaGrown Background Estimator",
            },
            body: JSON.stringify({
              model: AI_MODEL,
              messages: [{ role: "user", content: prompt }],
              max_tokens: 1000,
              temperature: 0.3,
            }),
          });
          
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("AI timeout")), 45000));
          
          const aiRes = await Promise.race([fetchPromise, timeoutPromise]) as Response;
          
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const raw = aiData.choices?.[0]?.message?.content ?? "";
            const jsonStr = raw
              .replace(/```json\n?/g, "").replace(/```\n?/g, "")
              .replace(/<thought>[\s\S]*?<\/thought>/g, "")
              .trim();
    
            const result = JSON.parse(jsonStr);
            
            const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            await supabaseAdmin.from('crm_leads').update({
              metadata: { ...finalLeadMetadata, [config.resultKey]: result }
            }).eq('id', leadId);
            
            return new Response(JSON.stringify({ [config.resultKey]: result }), {
              status: 200, headers: CORS,
            });
          }
        }
      } catch (aiErr) {
        console.log("Inline AI failed or timed out, falling back to queue.", aiErr);
      }
    }

    return new Response(JSON.stringify({ queued: true }), {
      status: 200, headers: CORS,
    });
  } catch (err: any) {
    console.error(`Error in handleLeadIngestion (${config.formVersion}):`, err);
    return new Response(JSON.stringify({ queued: true }), {
      status: 200, headers: CORS,
    });
  }
}

export type QueueConfig = {
  formVersion: string;
  resultKey: string;
  emailSentKey: string;
  abandonedKey: string;
  emailSubject: string;
  getAiPrompt: (metadata: any) => string;
  getSuccessHtml: (leadName: string, leadId: string, result: any) => string;
  getFallbackHtml: (leadName: string) => string;
  getCacheQuery?: (supabaseAdmin: any, metadata: any) => Promise<any>;
};

const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function handleBackgroundQueue(req: Request, config: QueueConfig): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)) {
    console.warn("Unauthorized execution attempt");
    return new Response("Unauthorized", { status: 401 });
  }

  if (!AI_KEY) {
    return new Response(JSON.stringify({ error: "AI credentials not configured" }), { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: leads, error: fetchErr } = await supabase
      .from('crm_leads')
      .select('id, name, email, metadata')
      .eq('form_version', config.formVersion)
      .is(`metadata->${config.emailSentKey}`, null)
      .is(`metadata->${config.abandonedKey}`, null)
      .not('email', 'is', null)
      .limit(50);

    if (fetchErr) throw fetchErr;

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ processed: 0, abandoned: 0, message: "No queued leads found" }), { status: 200 });
    }

    let processedCount = 0;
    let abandonedCount = 0;
    const now = Date.now();

    for (const lead of leads) {
      try {
        const firstQueuedAt: number = lead.metadata?.first_queued_at ?? now;
        const isFirstAttempt = !lead.metadata?.first_queued_at;
        const ageMs = now - firstQueuedAt;
        const firstName = lead.name?.split(' ')[0] || "there";

        if (!isFirstAttempt && ageMs > RETRY_WINDOW_MS) {
          console.warn(`Lead ${lead.id} has been queued for >24h — abandoning and sending fallback email`);

          await sendBroadcastEmail({
            to: lead.email,
            subject: config.emailSubject,
            htmlBody: config.getFallbackHtml(firstName),
          });

          await supabase.from('crm_leads').update({
            metadata: { ...lead.metadata, [config.abandonedKey]: new Date().toISOString() }
          }).eq('id', lead.id);

          abandonedCount++;
          continue;
        }

        if (isFirstAttempt) {
          await supabase.from('crm_leads').update({
            metadata: { ...lead.metadata, first_queued_at: firstQueuedAt }
          }).eq('id', lead.id);
        }

        let result = lead.metadata?.[config.resultKey];
        
        if (!result && config.getCacheQuery) {
           try {
             result = await config.getCacheQuery(supabase, lead.metadata);
           } catch (cacheErr) {
             console.warn("Background cache query failed:", cacheErr);
           }
        }
        
        if (!result) {
          const prompt = config.getAiPrompt(lead.metadata);

          const aiRes = await fetch(AI_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${AI_KEY}`,
              "HTTP-Referer": "https://casagrown.com",
              "X-Title": "CasaGrown Background Estimator",
            },
            body: JSON.stringify({
              model: AI_MODEL,
              messages: [{ role: "user", content: prompt }],
              max_tokens: 1000,
              temperature: 0.3,
            }),
          });

          if (!aiRes.ok) {
            console.warn(`AI failed for lead ${lead.id}: HTTP ${aiRes.status} — will retry`);
            continue;
          }

          const aiData = await aiRes.json();
          const raw = aiData.choices?.[0]?.message?.content ?? "";
          const jsonStr = raw
            .replace(/```json\n?/g, "").replace(/```\n?/g, "")
            .replace(/<thought>[\s\S]*?<\/thought>/g, "")
            .trim();

          result = JSON.parse(jsonStr);
        }

        await sendBroadcastEmail({
          to: lead.email,
          subject: config.emailSubject,
          htmlBody: config.getSuccessHtml(firstName, lead.id, result),
        });

        await supabase.from('crm_leads').update({
          metadata: { 
            ...lead.metadata, 
            [config.resultKey]: result,
            [config.emailSentKey]: new Date().toISOString() 
          }
        }).eq('id', lead.id);

        processedCount++;

        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        console.error(`Failed processing lead ${lead.id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ processed: processedCount, abandoned: abandonedCount }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Queue processing error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
