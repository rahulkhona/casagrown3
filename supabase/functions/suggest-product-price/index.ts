/**
 * suggest-product-price
 *
 * Multi-Tier Produce Price Recommendation Engine:
 * 1. Database Benchmark Cache: checks `public.get_suggested_produce_price` RPC (7-day freshness)
 * 2. Empirical Benchmark Engine: queries Kroger API (-20% discount) or USDA AMS MARS API (+50% markup)
 * 3. Canonical Catalog Defaults: matches against known crop definitions
 * 4. AI Completion Fallback: uses Gemini/Gemma for unlisted or rare backyard items
 *
 * Payload: { name: string, state?: string, city?: string, zip_code?: string, unit?: string }
 * Response: { price_usd: number, unit: string, source: "kroger" | "usda_ams" | "catalog_default" | "ai_estimate" }
 */

import { fetchAiCompletion, cleanJsonText, CORS } from "../_shared/funnel_processor.ts";
import { resolveBenchmark, TOP_PRODUCE_ITEMS, getKrogerToken } from "../sync-produce-benchmarks/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || 
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const KROGER_CLIENT_ID = Deno.env.get("KROGER_CLIENT_ID") || "";
const KROGER_CLIENT_SECRET = Deno.env.get("KROGER_CLIENT_SECRET") || "";
const USDA_AMS_API_KEY = Deno.env.get("USDA_AMS_API_KEY") || "";

const validUnits = ["each", "bunch", "dozen", "jar", "bag", "box", "basket", "lb", "oz"];

export async function handleSuggestPrice(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { name, state, city, zip_code, unit } = await req.json();

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Missing product name" }), {
        status: 400,
        headers: CORS,
      });
    }

    const trimmedName = name.trim();
    const effectiveZip = zip_code || "95120"; // Fallback to regional default if not provided
    const isMock = Deno.env.get("AI_MOCK") === "true" || Deno.env.get("SKIP_AI") === "true";

    // ── Tier 1: Check Database Benchmark Cache via RPC ──
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: cached, error: rpcErr } = await supabase.rpc("get_suggested_produce_price", {
          p_produce_name: trimmedName,
          p_zip_code: effectiveZip,
        });

        if (!rpcErr && cached && cached.found && typeof cached.suggested_price === "number" && cached.suggested_price > 0) {
          return new Response(JSON.stringify({
            price_usd: cached.suggested_price,
            unit: unit && validUnits.includes(unit) ? unit : (cached.unit || "each"),
            source: cached.source || "kroger",
          }), { headers: CORS });
        }
      } catch (cacheErr) {
        console.warn("[suggest-product-price] Cache lookup failed:", cacheErr);
      }
    }

    // ── Tier 2: Empirical Kroger / USDA AMS Benchmark Lookup ──
    try {
      const krogerToken = isMock ? "mock_token" : (KROGER_CLIENT_ID && KROGER_CLIENT_SECRET ? await getKrogerToken(KROGER_CLIENT_ID, KROGER_CLIENT_SECRET) : null);
      const benchmark = await resolveBenchmark(
        trimmedName,
        effectiveZip,
        krogerToken,
        USDA_AMS_API_KEY,
        isMock
      );

      if (benchmark && benchmark.suggested_price > 0 && benchmark.source !== "catalog_default") {
        // Cache to database asynchronously if service client available
        if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && !isMock) {
          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          supabase.from("market_price_benchmarks").upsert({
            produce_name: benchmark.produce_name,
            zip_code: benchmark.zip_code,
            avg_retail_price: benchmark.avg_retail_price,
            suggested_price: benchmark.suggested_price,
            unit: benchmark.unit,
            source: benchmark.source,
            updated_at: new Date().toISOString(),
          }, { onConflict: "produce_name,zip_code" }).then();
        }

        return new Response(JSON.stringify({
          price_usd: benchmark.suggested_price,
          unit: unit && validUnits.includes(unit) ? unit : benchmark.unit,
          source: benchmark.source,
        }), { headers: CORS });
      }
    } catch (benchErr) {
      console.warn("[suggest-product-price] Empirical benchmark failed:", benchErr);
    }

    // ── Tier 3: Match Known Canonical Produce Catalog ──
    const lower = trimmedName.toLowerCase();
    const matchedCatalogItem = TOP_PRODUCE_ITEMS.find(
      (item) => lower.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(lower)
    );

    if (matchedCatalogItem) {
      const suggested = Math.round(matchedCatalogItem.defaultRetail * 0.80 * 100) / 100;
      return new Response(JSON.stringify({
        price_usd: suggested,
        unit: unit && validUnits.includes(unit) ? unit : matchedCatalogItem.unit,
        source: "catalog_default",
      }), { headers: CORS });
    }

    // ── Tier 4: AI Completion Fallback (Gemma / Gemini) ──
    if (isMock) {
      console.log(`[SKIP_AI / MOCK] suggest-product-price fallback for "${trimmedName}"`);
      return new Response(JSON.stringify({
        price_usd: 3.50,
        unit: unit && validUnits.includes(unit) ? unit : "each",
        source: "ai_estimate",
      }), { headers: CORS });
    }

    const geography = [city, state].filter(Boolean).join(", ") || "United States";
    const requestedUnit = unit && validUnits.includes(unit) ? unit : null;

    const unitConstraint = requestedUnit 
      ? `\n- The user has requested the price for the specific unit: "${requestedUnit}". You MUST estimate the price per ${requestedUnit}.\n- IMPORTANT: The "unit" field in your JSON response MUST exactly match "${requestedUnit}".`
      : `\n- Price per individual item ("each"), per bunch, per dozen, per jar, etc.\n- For produce typically sold by weight (e.g. plums, apples), estimate the price PER ITEM, not per pound.\n- IMPORTANT: CasaGrown does NOT use weight-based units (no lb, oz, kg, g). All products are sold by countable units.`;

    const prompt = `You are a produce pricing assistant for CasaGrown, a neighborhood backyard produce marketplace in ${geography}.

A seller wants to list "${trimmedName}" for sale. Suggest a fair retail price that a home grower would charge a neighbor.

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
      timeoutMs: 8000,
    });

    if (!aiRes || !aiRes.ok) {
      const errText = aiRes ? await aiRes.text() : "No AI response";
      console.error("AI API error:", aiRes?.status, errText);
      return new Response(JSON.stringify({
        price_usd: 3.00,
        unit: unit && validUnits.includes(unit) ? unit : "each",
        source: "fallback_default",
      }), { headers: CORS });
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "";
    const jsonStr = cleanJsonText(raw);

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      console.warn("Failed to parse AI response:", raw);
      return new Response(JSON.stringify({
        price_usd: 3.00,
        unit: unit && validUnits.includes(unit) ? unit : "each",
        source: "fallback_default",
      }), { headers: CORS });
    }

    if (!validUnits.includes(result.unit)) {
      result.unit = unit && validUnits.includes(unit) ? unit : "each";
    }
    if (typeof result.price_usd !== "number" || result.price_usd <= 0) {
      result.price_usd = 3.00;
    }

    return new Response(JSON.stringify({
      price_usd: Math.round(result.price_usd * 100) / 100,
      unit: result.unit,
      source: "ai_estimate",
    }), { headers: CORS });

  } catch (err: any) {
    console.error("suggest-product-price error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 200,
      headers: CORS,
    });
  }
}

if (import.meta.main) {
  Deno.serve(handleSuggestPrice);
}
