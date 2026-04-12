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

const AI_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
const AI_URL = Deno.env.get("AI_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemma-4-31b-it";
const IS_LOCAL = (Deno.env.get("SUPABASE_URL") ?? "").includes("localhost") ||
  (Deno.env.get("SUPABASE_URL") ?? "").includes("127.0.0.1");

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
    const { name, state, city } = await req.json();

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Missing product name" }), {
        status: 400, headers: CORS,
      });
    }

    // In local dev, return a reasonable mock to save API tokens
    if (IS_LOCAL) {
      console.log(`[LOCAL] suggest-product-price mock for "${name}"`);
      return new Response(JSON.stringify({
        price_usd: 4.50,
        unit: "each",
        source: "ai_estimate",
      }), { headers: CORS });
    }

    if (!AI_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 200, headers: CORS,
      });
    }

    const geography = [city, state].filter(Boolean).join(", ") || "United States";

    const prompt = `You are a produce pricing assistant for CasaGrown, a neighborhood backyard produce marketplace in ${geography}.

A seller wants to list "${name.trim()}" for sale. Suggest a fair retail price that a home grower would charge a neighbor.

Consider:
- Local farmers market prices for this region
- The product is homegrown / backyard quality (not commercial)
- Prices should be reasonable for neighbor-to-neighbor sales
- IMPORTANT: CasaGrown does NOT use weight-based units (no lb, oz, kg, g). All products are sold by countable units.
- Price per individual item ("each"), per bunch, per dozen, per jar, etc.
- For produce typically sold by weight (e.g. plums, apples), estimate the price PER ITEM, not per pound.

Respond ONLY with a JSON object (no markdown, no code fences):
{
  "price_usd": <number, e.g. 4.50>,
  "unit": "<one of: each | bunch | dozen | jar | bag | box | basket>"
}`;

    let aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
        "HTTP-Referer": "https://casagrown.com",
        "X-Title": "CasaGrown Price Suggestion",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    // Retry once on 429/503
    if (aiRes.status === 429 || aiRes.status === 503) {
      console.warn(`Gemma ${aiRes.status}, retrying after 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
      aiRes = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_KEY}`,
          "HTTP-Referer": "https://casagrown.com",
          "X-Title": "CasaGrown Price Suggestion",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 100,
          temperature: 0.3,
        }),
      });
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Gemma API error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: `AI ${aiRes.status}` }), {
        status: 200, headers: CORS,
      });
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "";
    const jsonStr = raw
      .replace(/```json\n?/g, "").replace(/```\n?/g, "")
      .replace(/<thought>[\s\S]*?<\/thought>/g, "")
      .trim();

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
    const validUnits = ["each", "bunch", "dozen", "jar", "bag", "box", "basket"];
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
