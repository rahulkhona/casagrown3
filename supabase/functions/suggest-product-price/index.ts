/**
 * suggest-product-price  (AI fallback only)
 *
 * Called when the client-side PostgREST query couldn't find enough local
 * products to compute a meaningful average.  Uses Gemma to estimate a
 * fair price for a given product name + US geography.
 *
 * Payload: { name: string, state?: string, city?: string }
 * Response: { price_usd: number, unit: string, source: "ai_estimate" }
 */

import { fetchAiCompletion, cleanJsonText, CORS } from "../_shared/funnel_processor.ts";

const IS_LOCAL = (Deno.env.get("SUPABASE_URL") ?? "").includes("localhost") ||
  (Deno.env.get("SUPABASE_URL") ?? "").includes("127.0.0.1");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { name, state, city, unit } = await req.json();
    const validUnits = ["each", "bunch", "dozen", "jar", "bag", "box", "basket"];

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Missing product name" }), {
        status: 400, headers: CORS,
      });
    }

    // Skip AI only when SKIP_AI=true (automated E2E tests)
    const SKIP_AI = Deno.env.get("SKIP_AI") === "true";
    if (SKIP_AI) {
      console.log(`[SKIP_AI] suggest-product-price mock for "${name}"`);
      return new Response(JSON.stringify({
        price_usd: 4.50,
        unit: "each",
        source: "ai_estimate",
      }), { headers: CORS });
    }



    const geography = [city, state].filter(Boolean).join(", ") || "United States";
    const requestedUnit = unit && validUnits.includes(unit) ? unit : null;

    const unitConstraint = requestedUnit 
      ? `\n- The user has requested the price for the specific unit: "${requestedUnit}". You MUST estimate the price per ${requestedUnit}.\n- IMPORTANT: The "unit" field in your JSON response MUST exactly match "${requestedUnit}".`
      : `\n- Price per individual item ("each"), per bunch, per dozen, per jar, etc.\n- For produce typically sold by weight (e.g. plums, apples), estimate the price PER ITEM, not per pound.\n- IMPORTANT: CasaGrown does NOT use weight-based units (no lb, oz, kg, g). All products are sold by countable units.`;

    const prompt = `You are a produce pricing assistant for CasaGrown, a neighborhood backyard produce marketplace in ${geography}.

A seller wants to list "${name.trim()}" for sale. Suggest a fair retail price that a home grower would charge a neighbor.

Consider:
- Local farmers market prices for this region
- The product is homegrown / backyard quality (not commercial)
- Prices should be reasonable for neighbor-to-neighbor sales${unitConstraint}

Respond ONLY with a JSON object (no markdown, no code fences):
{
  "price_usd": <number, e.g. 4.50>,
  "unit": "${requestedUnit ? requestedUnit : '<one of: each | bunch | dozen | jar | bag | box | basket>'}"
}`;

    const aiRes = await fetchAiCompletion({
      content: prompt,
      maxTokens: 100,
      timeoutMs: 8000
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI API error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: `AI ${aiRes.status}` }), {
        status: 200, headers: CORS,
      });
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "";
    const jsonStr = cleanJsonText(raw);

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      console.warn("Failed to parse AI response:", raw);
      return new Response(JSON.stringify({ error: "Could not parse AI response" }), {
        status: 200, headers: CORS,
      });
    }

    // Validate
    // If AI returned a weight-based unit despite instructions, discard — price would be misleading
    if (!validUnits.includes(result.unit)) {
      console.warn(`AI returned unsupported unit "${result.unit}", discarding suggestion`);
      return new Response(JSON.stringify({ error: "Unsupported unit" }), {
        status: 200, headers: CORS,
      });
    }
    if (typeof result.price_usd !== "number" || result.price_usd <= 0) result.price_usd = 3.00;

    return new Response(JSON.stringify({
      price_usd: Math.round(result.price_usd * 100) / 100,
      unit: result.unit,
      source: "ai_estimate",
    }), { headers: CORS });

  } catch (err: any) {
    console.error("suggest-product-price error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 200, headers: CORS,
    });
  }
});
