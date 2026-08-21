import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { sendBroadcastEmail } from "./postmark.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const AI_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
const AI_URL = Deno.env.get("AI_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemini-3.5-flash-lite";

/** Default fallback chain: fast → medium → strong */
const DEFAULT_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemma-4-31b-it"
];

/**
 * Strip markdown code fences, <thought> tags, and extract the outermost JSON object.
 * Exported so edge functions can reuse this for their own response parsing.
 */
export function cleanJsonText(raw: string): string {
  let text = raw.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    text = match[0];
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace !== -1) {
      text = text.substring(0, lastBrace + 1);
    }
  }
  return text;
}

export type AiCompletionOptions = {
  /** Text prompt string, or multimodal content array (for vision/photo) */
  content: string | Array<{type: string; text?: string; image_url?: {url: string}}>;
  /** Timeout per model attempt in ms (default 8000) */
  timeoutMs?: number;
  /** Max tokens to generate (default 1500) */
  maxTokens?: number;
  /** Temperature (default 0.3) */
  temperature?: number;
  /** Optional response format constraint */
  responseFormat?: {type: string};
  /** Optional model chain override (defaults to DEFAULT_MODELS) */
  models?: string[];
};

/**
 * Invoke LLM with model fallback chain and per-model timeout ceiling.
 * Supports both text-only and multimodal (image+text) content.
 */
export async function fetchAiCompletion(options: AiCompletionOptions): Promise<Response | null>;
/** @deprecated Legacy signature — use options object instead */
export async function fetchAiCompletion(prompt: string, timeoutMs?: number): Promise<Response | null>;
export async function fetchAiCompletion(
  promptOrOptions: string | AiCompletionOptions,
  legacyTimeoutMs?: number
): Promise<Response | null> {
  // Normalize legacy (string, number) calls to options object
  const opts: AiCompletionOptions = typeof promptOrOptions === "string"
    ? { content: promptOrOptions, timeoutMs: legacyTimeoutMs }
    : promptOrOptions;

  const {
    content,
    timeoutMs = 8000,
    maxTokens = 1500,
    temperature = 0.3,
    responseFormat,
    models,
  } = opts;

  const currentKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? AI_KEY;
  if (!currentKey || Deno.env.get('AI_MOCK') === 'true') return null;

  const candidateModels = models ?? DEFAULT_MODELS;

  // Build messages array — supports both string content and multimodal content arrays
  const messages = [{ role: "user", content }];

  for (const modelName of candidateModels) {
    try {
      const bodyObj: Record<string, any> = {
        model: modelName,
        messages,
        max_tokens: maxTokens,
        temperature,
      };
      if (responseFormat) {
        bodyObj.response_format = responseFormat;
      }

      const fetchPromise = fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentKey}`,
          "HTTP-Referer": "https://casagrown.com",
          "X-Title": "CasaGrown AI",
        },
        body: JSON.stringify(bodyObj),
      });

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error(`AI timeout (${modelName})`)), timeoutMs)
      );

      const res = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      if (res && res.ok) {
        return res;
      }
      console.warn(`Model ${modelName} returned HTTP ${res?.status} — trying next candidate`);
    } catch (err: any) {
      console.warn(`Model ${modelName} failed/timed out (${err.message}) — trying next candidate`);
    }
  }
  return null;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

export type IngestionConfig = {
  formVersion: string;
  extractInterests: (payload: any) => string;
  buildMetadata: (payload: any, existingLead?: any) => Record<string, any>;
  hasBackyard: boolean;
  resultKey: string;
  getAiPrompt: (payload: any) => string;
  emailSubject?: string;
  getSuccessHtml?: (leadName: string, leadId: string, result: any) => string;
  getCacheQuery?: (supabaseAdmin: any, payload: any) => Promise<any>;
  saveCacheResults?: (supabaseAdmin: any, payload: any, aiResult: any) => Promise<void>;
  mergeAiResult?: (payload: any, aiResult: any) => any;
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
            ...config.buildMetadata(payload, existingLead),
            referrer: payload.lead?.referrer || existingLead.metadata?.referrer,
            ...(skip_ai && prefetched_result ? { [config.resultKey]: prefetched_result } : {})
          };

          const { data } = await supabaseAdmin.from('crm_leads').update({
            name: (payload.lead?.name && payload.lead.name.trim()) ? payload.lead.name.trim() : existingLead.name,
            phone: payload.lead?.phone || existingLead.phone,
            has_backyard: config.hasBackyard,
            produce_interests: mergedInterests,
            accepts_email: existingLead.accepts_email || !!payload.lead?.marketingConsent,
            accepts_sms: existingLead.accepts_sms || !!payload.lead?.marketingConsent,
            ip_address: ip_address || existingLead.ip_address,
            form_version: config.formVersion,
            source_platform: (existingLead.source_platform && existingLead.source_platform !== 'direct') ? existingLead.source_platform : (payload.lead?.utm_source || 'direct'),
            source_url: existingLead.source_url || payload.lead?.current_url,
            utm_source: existingLead.utm_source || payload.lead?.utm_source,
            utm_campaign: existingLead.utm_campaign || payload.lead?.utm_campaign,
            utm_medium: existingLead.utm_medium || payload.lead?.utm_medium,
            utm_content: existingLead.utm_content || payload.lead?.utm_content,
            utm_term: existingLead.utm_term || payload.lead?.utm_term,
            metadata
          }).eq('id', existingLead.id).select('id, metadata').single();
          
          if (data) {
            leadId = data.id;
            finalLeadMetadata = data.metadata;
          }
        } else {
          // Insert new
          const metadata = { 
            ...config.buildMetadata(payload, null),
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
            utm_source: payload.lead?.utm_source,
            utm_campaign: payload.lead?.utm_campaign,
            utm_medium: payload.lead?.utm_medium,
            utm_content: payload.lead?.utm_content,
            utm_term: payload.lead?.utm_term,
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

    // If this lead already has a result from a previous submission, return it inline
    if (leadId && finalLeadMetadata?.[config.resultKey]) {
      const cachedResult = finalLeadMetadata[config.resultKey];
      // Re-merge with current payload to ensure _selected_items reflects current selections
      const result = config.mergeAiResult ? config.mergeAiResult(payload, cachedResult) : cachedResult;

      // Re-send email with current selections
      if (payload.lead?.email && config.getSuccessHtml) {
        const rawName = (payload.lead?.name || "").trim();
        const firstName = rawName ? rawName.split(' ')[0] : "there";
        try {
          await sendBroadcastEmail({
            to: payload.lead.email,
            subject: config.emailSubject || "Your CasaGrown Report",
            htmlBody: config.getSuccessHtml(firstName, leadId, result),
          });
        } catch (e) {
          console.error("Failed to send cached result email:", e);
        }
      }

      return new Response(JSON.stringify({ [config.resultKey]: result }), {
        status: 200, headers: CORS,
      });
    }

    // Inline AI race
    if (leadId && !skip_ai) {
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

        const currentKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? AI_KEY;
        if (currentKey && Deno.env.get('AI_MOCK') !== 'true') {
          const prompt = config.getAiPrompt(payload);
          const aiRes = await fetchAiCompletion({
            content: prompt,
            timeoutMs: 8000,
            models: ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemma-4-31b-it"]
          });
          
          if (aiRes && aiRes.ok) {
            const aiData = await aiRes.json();
            const raw = aiData.choices?.[0]?.message?.content ?? "";
            const parsedResult = JSON.parse(cleanJsonText(raw));
            const result = config.mergeAiResult ? config.mergeAiResult(payload, parsedResult) : parsedResult;
            
            const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            
            if (config.saveCacheResults) {
              try {
                // saveCacheResults should only save the newly generated parsedResult, not the merged result
                await config.saveCacheResults(supabaseAdmin, payload, parsedResult);
              } catch (cacheSaveErr) {
                console.error("Failed to save to global cache:", cacheSaveErr);
              }
            }

            await supabaseAdmin.from('crm_leads').update({
              metadata: { ...finalLeadMetadata, [config.resultKey]: result }
            }).eq('id', leadId);

            if (payload.lead?.email && config.getSuccessHtml) {
              const rawName = (payload.lead?.name || "").trim();
              const firstName = rawName ? rawName.split(' ')[0] : "there";
              try {
                await sendBroadcastEmail({
                  to: payload.lead.email,
                  subject: config.emailSubject || "Your CasaGrown Report",
                  htmlBody: config.getSuccessHtml(firstName, leadId, result),
                });
              } catch (e) {
                console.error("Failed to send inline report email:", e);
              }
            }
            
            return new Response(JSON.stringify({ [config.resultKey]: result }), {
              status: 200, headers: CORS,
            });
          }
        } else if (Deno.env.get('AI_MOCK') === 'true') {
          // AI_MOCK mode: generate synthetic results for local dev/testing
          const produceList: string[] = payload.__missing_produce || payload.produce || [];
          let parsedResult: any = null;

          if (produceList.length > 0) {
            const mockItems = produceList.map((p: string) => ({
              name: p.toLowerCase().trim().replace(/ies$/, 'y').replace(/(?<!s)s$/, ''),
              time_to_shelf: "3-7 Days",
              nutrient_loss_pct: "25%-40%",
              impacted_nutrients: "Vitamin C, Folate",
              evidence_link: "https://mock.test/study"
            }));
            parsedResult = {
              summary: "Mock: Store-bought produce loses nutrients between harvest and shelf.",
              items: mockItems,
            };
          } else {
            // Synthetic estimate-earnings result for local dev testing
            parsedResult = {
              excess_produce: "20 lbs of tomatoes and 40 lbs of lemons",
              estimated_annual_earnings: 240,
              analogies: [
                "About 4 months of your favorite coffee subscription",
                "A nice dinner out for two at a local farm-to-table restaurant",
                "Your annual organic soil and seed budget"
              ],
              reasoning: `In ${payload.zipcode || '95125'}, local organic prices and typical backyard yields generate about $240 in annual value.`
            };
          }

          const result = config.mergeAiResult ? config.mergeAiResult(payload, parsedResult) : parsedResult;

          const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          if (config.saveCacheResults) {
            try {
              await config.saveCacheResults(supabaseAdmin, payload, parsedResult);
            } catch (cacheSaveErr) {
              console.error("Mock: Failed to save to cache:", cacheSaveErr);
            }
          }
          await supabaseAdmin.from('crm_leads').update({
            metadata: { ...finalLeadMetadata, [config.resultKey]: result }
          }).eq('id', leadId);

          if (payload.lead?.email && config.getSuccessHtml) {
            const rawName = (payload.lead?.name || "").trim();
            const firstName = rawName ? rawName.split(' ')[0] : "there";
            try {
              await sendBroadcastEmail({
                to: payload.lead.email,
                subject: config.emailSubject || "Your CasaGrown Report",
                htmlBody: config.getSuccessHtml(firstName, leadId, result),
              });
            } catch (e) {
              console.error("Failed to send mock inline report email:", e);
            }
          }

          return new Response(JSON.stringify({ [config.resultKey]: result }), {
            status: 200, headers: CORS,
          });
        }
        
        // Fast local fallback for local development or when AI key is missing/timed out
        const produceList: string[] = payload.__missing_produce || payload.produce || [];
        let fallbackResult: any = null;

        if (produceList.length > 0) {
          const mockItems = produceList.map((p: string) => ({
            name: p.toLowerCase().trim().replace(/ies$/, 'y').replace(/(?<!s)s$/, ''),
            time_to_shelf: "3-7 Days",
            nutrient_loss_pct: "25%-40%",
            impacted_nutrients: "Vitamin C, Folate",
            evidence_link: "https://mock.test/study"
          }));
          fallbackResult = {
            summary: "Store-bought produce loses nutrients between harvest and shelf.",
            items: mockItems,
          };
        } else {
          fallbackResult = {
            excess_produce: "20 lbs of tomatoes and 40 lbs of lemons",
            estimated_annual_earnings: 240,
            analogies: [
              "About 4 months of your favorite coffee subscription",
              "A nice dinner out for two at a local farm-to-table restaurant",
              "Your annual organic soil and seed budget"
            ],
            reasoning: `In ${payload.zipcode || '95125'}, local organic prices and typical backyard yields generate about $240 in annual value.`
          };
        }

        const result = config.mergeAiResult ? config.mergeAiResult(payload, fallbackResult) : fallbackResult;

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        if (config.saveCacheResults) {
          try {
            await config.saveCacheResults(supabaseAdmin, payload, fallbackResult);
          } catch (cacheSaveErr) {
            console.error("Failed to save fallback to cache:", cacheSaveErr);
          }
        }
        await supabaseAdmin.from('crm_leads').update({
          metadata: { ...finalLeadMetadata, [config.resultKey]: result }
        }).eq('id', leadId);

        if (payload.lead?.email && config.getSuccessHtml) {
          const rawName = (payload.lead?.name || "").trim();
          const firstName = rawName ? rawName.split(' ')[0] : "there";
          try {
            await sendBroadcastEmail({
              to: payload.lead.email,
              subject: config.emailSubject || "Your CasaGrown Report",
              htmlBody: config.getSuccessHtml(firstName, leadId, result),
            });
          } catch (e) {
            console.error("Failed to send fallback inline report email:", e);
          }
        }

        return new Response(JSON.stringify({ [config.resultKey]: result }), {
          status: 200, headers: CORS,
        });

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
          const aiRes = await fetchAiCompletion(prompt, 15000);

          if (!aiRes || !aiRes.ok) {
            console.warn(`AI failed for lead ${lead.id} — will retry on next cron run`);
            continue;
          }

          const aiData = await aiRes.json();
          const raw = aiData.choices?.[0]?.message?.content ?? "";
          result = JSON.parse(cleanJsonText(raw));
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
