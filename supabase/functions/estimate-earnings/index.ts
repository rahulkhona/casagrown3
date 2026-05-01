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

    if (!AI_KEY) {
      return new Response(JSON.stringify({ queued: true, message: "AI not configured, queued for email" }), {
        status: 200, headers: CORS,
      });
    }

    const plantsList = plants?.length ? plants.join(", ") : "None";
    const treesList = trees?.length ? trees.join(", ") : "None";

    const prompt = `You are an expert agricultural and economic estimator for CasaGrown, a neighborhood backyard produce marketplace.

A home grower has provided the following details about their garden:
- Zipcode: ${zipcode || "Unknown"}
- Garden Space: ${size}
- Vegetables/Plants Selected: ${plantsList}
- Fruit Trees Selected: ${treesList}

Task:
1. The user has explicitly provided the specific quantities of each plant and tree they are growing (indicated by 'xN' in the input). Use these EXACT quantities to calculate their yield. Do not estimate different plant counts. Account for the local climate and typical amateur yields for this area, which are much lower than professional farms.
2. Based on their provided plant/tree counts and local climate, estimate the EXCESS produce this garden might yield in a typical growing season that a family couldn't eat themselves.
3. Estimate the total potential earnings in USD if they sold this excess to neighbors at fair local organic market prices for this specific zipcode. Keep this grounded in reality based on their specific plant quantities.
4. Provide exactly 3 fun, relatable financial analogies for these earnings PER YEAR. Keep them short.
5. Briefly explain the reasoning behind this estimate based on the local market value and the yields expected from their provided plant quantities. Keep it to 1-2 short sentences.

Example Input context:
Zipcode: 90210, Space: Small Backyard, Plants: Tomatoes (x2), Peppers (x1), Trees: Lemons (x1)
Example Output:
{
  "excess_produce": "15 lbs of tomatoes, 10 lbs of peppers, and 30 lbs of lemons",
  "estimated_annual_earnings": 250,
  "analogies": ["1 car payment", "Your streaming subscriptions for the year", "A weekend getaway"],
  "reasoning": "In 90210, local organic prices for these yields from 2 tomato plants, 1 pepper plant, and 1 dwarf lemon tree average $250."
}

Respond ONLY with the JSON object for the provided details (no markdown, no code fences):`;

    let aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
        "HTTP-Referer": "https://casagrown.com",
        "X-Title": "CasaGrown Earnings Estimator",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (aiRes.status === 429 || aiRes.status === 503) {
      await new Promise((r) => setTimeout(r, 2000));
      aiRes = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_KEY}`,
          "HTTP-Referer": "https://casagrown.com",
          "X-Title": "CasaGrown Earnings Estimator",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Gemma API error:", aiRes.status, errText);
      return new Response(JSON.stringify({ queued: true }), {
        status: 200, headers: CORS,
      });
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "";
    const jsonStr = raw
      .replace(/\`\`\`json\n?/g, "").replace(/\`\`\`\n?/g, "")
      .replace(/<thought>[\s\S]*?<\/thought>/g, "")
      .trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      console.warn("Failed to parse AI response:", raw);
      return new Response(JSON.stringify({ queued: true }), {
        status: 200, headers: CORS,
      });
    }

    if (typeof result.estimated_annual_earnings !== "number") {
      result.estimated_annual_earnings = parseInt(result.estimated_annual_earnings) || 200;
    }

    // Update the lead with the AI results if we successfully generated them
    if (leadId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabaseAdmin.from('crm_leads').update({
          metadata: {
            garden_size: size,
            ai_estimate_result: result
          }
        }).eq('id', leadId);
      } catch (dbErr) {
        console.error("Failed to update lead with AI results:", dbErr);
      }
    }

    return new Response(JSON.stringify({
      excess_produce: result.excess_produce || "A healthy bounty of fresh produce",
      estimated_annual_earnings: result.estimated_annual_earnings,
      analogies: result.analogies || [
        "A nice bonus for your backyard efforts!",
        "Extra cash for seeds next season"
      ],
      reasoning: result.reasoning || "Based on typical seasonal yields and local organic market prices.",
    }), { headers: CORS });

  } catch (err: any) {
    console.error("estimate-earnings error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 200, headers: CORS,
    });
  }
});
