/**
 * parse-listing-text
 *
 * Accepts free-form text + optional photos and uses Gemini to extract
 * structured product listing data (name, category, price, delivery prefs, etc.).
 *
 * Payload: { text: string, images?: string[], seller_state?: string, seller_city?: string }
 * Response: { name, category, description, quantity, unit, price_usd, is_free,
 *             offers_delivery, offers_pickup, delivery_radius_miles, delivery_days,
 *             delivery_time_of_day, pickup_days, pickup_time_of_day,
 *             delivery_zipcodes, suggested_unit }
 */

const AI_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
const AI_URL = Deno.env.get("AI_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemma-4-31b-it";
const IS_LOCAL = (Deno.env.get("SUPABASE_URL") ?? "").includes("localhost") ||
  (Deno.env.get("SUPABASE_URL") ?? "").includes("127.0.0.1") ||
  (Deno.env.get("SUPABASE_URL") ?? "").includes("kong:8000");

const SKIP_AI = Deno.env.get("SKIP_AI") === "true";

const VALID_CATEGORIES = [
  "produce", "flowers", "flower_arrangements",
  "garden_equipment", "pots", "soil",
  "seeds", "eggs", "honey",
];

const VALID_UNITS = [
  "each", "bunch", "dozen", "jar", "loaf",
  "bag", "box", "basket", "flat", "pint", "lb",
];

const VALID_DAYS = [
  "monday", "tuesday", "wednesday", "thursday",
  "friday", "saturday", "sunday",
];

const VALID_TIMES = ["morning", "afternoon", "evening"];

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
    const { text, images, seller_state, seller_city } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400, headers: CORS,
      });
    }

    // Skip Gemini API only when SKIP_AI=true (automated E2E tests)
    if (SKIP_AI) {
      console.log("[SKIP_AI] Returning mock parsed listing for automated tests");
      return new Response(JSON.stringify({
        name: "Local Test Product",
        category: "produce",
        description: "AI parsing skipped (SKIP_AI=true). Please fill in manually.",
        quantity: 1,
        unit: "each",
        price_usd: 5.00,
        is_free: false,
        offers_delivery: true,
        offers_pickup: true,
        delivery_radius_miles: null,
        delivery_days: [],
        delivery_time_of_day: [],
        pickup_days: [],
        pickup_time_of_day: [],
        delivery_zipcodes: [],
        suggested_unit: "each",
      }), { headers: CORS });
    }

    const IS_MOCKED = Deno.env.get("AI_MOCK") === "true";
    if (IS_MOCKED) {
      console.log("[AI_MOCK] Extracting mock listing data via heuristics");
      const normalized = text.toLowerCase();
      
      // Extract quantity
      let quantity = 1;
      const qtyMatch = normalized.match(/(\d+)\s*(dozen|bunch|jar|bag|box|lb|each|pint|basket|flat|roses|oranges|tomatoes|eggs|honey)/);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1]);
      } else {
        const simpleQtyMatch = normalized.match(/\b(\d+)\b/);
        if (simpleQtyMatch) quantity = parseInt(simpleQtyMatch[1]);
      }

      // Extract price
      let price = 5.00;
      const priceMatch = normalized.match(/\$\s*(\d+(\.\d{2})?)/);
      if (priceMatch) {
        price = parseFloat(priceMatch[1]);
      } else {
        const forMatch = normalized.match(/for\s*(\d+(\.\d{2})?)/);
        if (forMatch) price = parseFloat(forMatch[1]);
      }

      // Extract unit
      let unit = "each";
      for (const u of VALID_UNITS) {
        if (normalized.includes(u)) {
          unit = u;
          break;
        }
      }

      // Extract category
      let category = "produce";
      if (normalized.includes("rose") || normalized.includes("flower") || normalized.includes("bouquet") || normalized.includes("tulip")) {
        category = "flowers";
      } else if (normalized.includes("seed")) {
        category = "seeds";
      } else if (normalized.includes("egg")) {
        category = "eggs";
      } else if (normalized.includes("honey")) {
        category = "honey";
      }

      // Extract name
      let name = "Fresh Produce";
      if (normalized.includes("rose")) name = "Fresh Roses";
      else if (normalized.includes("orange")) name = "Fresh Oranges";
      else if (normalized.includes("tomato")) name = "Heirloom Tomatoes";
      else if (normalized.includes("egg")) name = "Fresh Farm Eggs";
      else if (normalized.includes("honey")) name = "Local Wildflower Honey";
      else {
        const words = text.trim().split(/\s+/);
        if (words.length > 0) {
          name = words.slice(0, 3).join(" ");
        }
      }

      // Extract fulfillment
      const offers_delivery = !normalized.includes("pickup only") && (normalized.includes("deliver") || normalized.includes("shipping") || !normalized.includes("pickup"));
      const offers_pickup = !normalized.includes("delivery only") && (normalized.includes("pickup") || normalized.includes("pick up") || !normalized.includes("deliver"));

      // Extract radius
      let delivery_radius_miles = null;
      const radiusMatch = normalized.match(/(\d+)\s*mile/);
      if (radiusMatch) {
        delivery_radius_miles = parseInt(radiusMatch[1]);
      } else if (offers_delivery) {
        delivery_radius_miles = 5;
      }

      // Extract days
      const delivery_days: string[] = [];
      const pickup_days: string[] = [];
      for (const day of VALID_DAYS) {
        if (normalized.includes(day)) {
          if (offers_delivery) delivery_days.push(day);
          if (offers_pickup) pickup_days.push(day);
        }
      }
      if (normalized.includes("weekend")) {
        if (offers_delivery) { delivery_days.push("saturday"); delivery_days.push("sunday"); }
        if (offers_pickup) { pickup_days.push("saturday"); pickup_days.push("sunday"); }
      }

      // Extract time of day
      const delivery_time_of_day: string[] = [];
      const pickup_time_of_day: string[] = [];
      for (const time of VALID_TIMES) {
        if (normalized.includes(time)) {
          if (offers_delivery) delivery_time_of_day.push(time);
          if (offers_pickup) pickup_time_of_day.push(time);
        }
      }

      return new Response(JSON.stringify({
        name,
        category,
        description: `Freshly harvested ${name.toLowerCase()} from my backyard garden. Great quality, grown naturally.`,
        quantity,
        unit,
        price_usd: price,
        is_free: price === 0,
        offers_delivery,
        offers_pickup,
        delivery_radius_miles,
        delivery_days,
        delivery_time_of_day,
        pickup_days,
        pickup_time_of_day,
        delivery_zipcodes: [],
        suggested_unit: unit,
      }), { headers: CORS });
    }

    if (!AI_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: CORS,
      });
    }

    // Build message content — multimodal if images are provided
    const content: any[] = [];

    // Add images (same pattern as analyze-product-photo)
    if (images && Array.isArray(images)) {
      for (const image of images) {
        if (typeof image !== "string") continue;
        if (image.startsWith("data:")) {
          content.push({ type: "image_url", image_url: { url: image } });
        } else if (image.startsWith("http")) {
          // Fetch and convert to base64
          try {
            const imgRes = await fetch(image);
            if (imgRes.ok) {
              const imgBuf = await imgRes.arrayBuffer();
              const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
              const mime = imgRes.headers.get("content-type") || "image/jpeg";
              content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } });
            }
          } catch {
            console.warn("Could not fetch image URL:", image.slice(0, 100));
          }
        }
      }
    }

    const geography = [seller_city, seller_state].filter(Boolean).join(", ") || "United States";

    content.push({
      type: "text",
      text: `You are a listing creation assistant for CasaGrown, a neighborhood backyard produce marketplace in ${geography}.

A seller has written the following description of what they want to sell:
"""
${text.trim()}
"""

${content.length > 1 ? "The seller has also provided photos of the product. Use both the text and photos to identify the product.\n" : ""}Extract all the structured listing information from the text${content.length > 1 ? " and photos" : ""}.

Respond ONLY with a JSON object (no markdown, no code fences):
{
  "name": "appealing product name for a marketplace listing (e.g. 'Fresh Oranges', 'Heirloom Tomatoes')",
  "category": "one of: ${VALID_CATEGORIES.join(" | ")}",
  "description": "2-3 sentence appealing marketplace description. If the seller provided a good description, enhance it. Otherwise, generate one mentioning freshness, quality, and best uses.",
  "quantity": <number, how many units available. Default 1 if not specified>,
  "unit": "one of: ${VALID_UNITS.join(" | ")}. Choose the best unit based on the product and text.",
  "price_usd": <number, price per unit in USD. null if not mentioned>,
  "is_free": <boolean, true only if the seller explicitly says free>,
  "offers_delivery": <boolean, true if delivery is mentioned or not specified (default true)>,
  "offers_pickup": <boolean, true if pickup is mentioned or not specified (default true)>,
  "delivery_radius_miles": <number or null, delivery radius if mentioned>,
  "delivery_days": [<lowercase day names like "monday", "saturday", etc. Empty array if not specified>],
  "delivery_time_of_day": [<"morning" | "afternoon" | "evening". Empty array if not specified>],
  "pickup_days": [<lowercase day names. Empty array if not specified>],
  "pickup_time_of_day": [<"morning" | "afternoon" | "evening". Empty array if not specified>],
  "delivery_zipcodes": [<string zip codes if mentioned. Empty array if not specified>],
  "suggested_unit": "one of: ${VALID_UNITS.join(" | ")}. The most natural unit for this product."
}

Rules:
- Use common, recognizable product names buyers would search for
- Category MUST be one of the exact values listed above
- Description should be warm, local, and appetizing
- If price is mentioned (e.g. "$5 per dozen"), extract price_usd as the number (5.00) and unit accordingly
- If the text says "free", set is_free to true and price_usd to 0
- Default offers_delivery and offers_pickup to true if not explicitly mentioned
- Days must be lowercase: monday, tuesday, wednesday, thursday, friday, saturday, sunday
- Time of day values: morning, afternoon, evening
- If you can't determine the product from text alone, use your best guess
- Default to "produce" category if unsure`,
    });

    // Retry once on rate limit (429) or server error (503)
    let aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
        "HTTP-Referer": "https://casagrown.com",
        "X-Title": "CasaGrown Listing Parser",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "user", content }],
        max_tokens: 4096,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429 || aiRes.status === 503) {
      console.warn(`Gemini ${aiRes.status}, retrying after 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
      aiRes = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_KEY}`,
          "HTTP-Referer": "https://casagrown.com",
          "X-Title": "CasaGrown Listing Parser",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [{ role: "user", content }],
          max_tokens: 4096,
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      });
    }

    // If primary model fails, try backup model before giving up
    if (!aiRes.ok) {
      console.warn("Primary model HTTP error:", aiRes.status, "— trying backup model");
      const BACKUP_MODEL = "gemma-4-31b-it";
      aiRes = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_KEY}`,
          "HTTP-Referer": "https://casagrown.com",
          "X-Title": "CasaGrown Listing Parser",
        },
        body: JSON.stringify({
          model: BACKUP_MODEL,
          messages: [{ role: "user", content }],
          max_tokens: 4096,
          temperature: 0.3,
        }),
      });
      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error("Both models failed:", aiRes.status, errText);
        return new Response(JSON.stringify({ error: `AI error ${aiRes.status}: ${errText.slice(0, 200)}` }), {
          status: 200, headers: CORS,
        });
      }
    }

    const aiData = await aiRes.json();

    // Parse JSON from response — robust extraction for various model output formats
    const raw = aiData.choices?.[0]?.message?.content ?? "";
    console.log("[AI-RESPONSE] model:", aiData.model, "raw:", raw.slice(0, 500));

    let result;
    const tryParse = (s: string) => {
      try { return JSON.parse(s.trim()); } catch { return null; }
    };

    // 1. Try direct parse
    result = tryParse(raw);

    // 2. Strip markdown fences, thought tags, and other model artifacts
    if (!result) {
      const cleaned = raw
        .replace(/```json\n?/g, "").replace(/```\n?/g, "")
        .replace(/<thought>[\s\S]*?<\/thought>/g, "")
        .replace(/<start_of_turn>[\s\S]*?<end_of_turn>/g, "")
        .replace(/<[^>]+>/g, "")  // strip any remaining XML-like tags
        .trim();
      result = tryParse(cleaned);
    }

    // 3. Extract first JSON object {...} from anywhere in the response
    if (!result) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        result = tryParse(match[0]);
      }
    }

    if (!result) {
      // ── Fallback: retry with backup model ──
      const BACKUP_MODEL = "gemma-4-31b-it";
      console.warn("Primary model parse failed, retrying with", BACKUP_MODEL, "raw:", raw.slice(0, 300));
      const backupRes = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_KEY}`,
          "HTTP-Referer": "https://casagrown.com",
          "X-Title": "CasaGrown Listing Parser",
        },
        body: JSON.stringify({
          model: BACKUP_MODEL,
          messages: [{ role: "user", content }],
          max_tokens: 4096,
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      });
      if (backupRes.ok) {
        const backupData = await backupRes.json();
        const backupRaw = backupData.choices?.[0]?.message?.content ?? "";
        result = tryParse(backupRaw);
        if (!result) {
          const backupMatch = backupRaw.match(/\{[\s\S]*\}/);
          if (backupMatch) result = tryParse(backupMatch[0]);
        }
      }
    }

    if (!result) {
      console.warn("Failed to parse AI response (both models):", raw.slice(0, 500));
      return new Response(JSON.stringify({ error: "Could not parse AI response", raw_preview: raw.slice(0, 200) }), {
        status: 200, headers: CORS,
      });
    }

    // ── Validate and sanitize fields ──

    // Category
    if (!result.category || !VALID_CATEGORIES.includes(result.category)) {
      result.category = "produce";
    }

    // Unit
    if (!result.unit || !VALID_UNITS.includes(result.unit)) {
      result.unit = "each";
    }
    if (!result.suggested_unit || !VALID_UNITS.includes(result.suggested_unit)) {
      result.suggested_unit = result.unit;
    }

    // Numeric fields
    if (typeof result.quantity !== "number" || result.quantity < 0) result.quantity = 1;
    if (typeof result.price_usd !== "number" && result.price_usd !== null) result.price_usd = null;
    if (typeof result.delivery_radius_miles !== "number" && result.delivery_radius_miles !== null) {
      result.delivery_radius_miles = null;
    }

    // Boolean fields
    if (typeof result.is_free !== "boolean") result.is_free = false;
    if (typeof result.offers_delivery !== "boolean") result.offers_delivery = true;
    if (typeof result.offers_pickup !== "boolean") result.offers_pickup = true;

    // Array fields — filter to valid values
    const filterArray = (arr: any, valid: string[]) =>
      Array.isArray(arr) ? arr.filter((v: string) => valid.includes(v)) : [];

    result.delivery_days = filterArray(result.delivery_days, VALID_DAYS);
    result.delivery_time_of_day = filterArray(result.delivery_time_of_day, VALID_TIMES);
    result.pickup_days = filterArray(result.pickup_days, VALID_DAYS);
    result.pickup_time_of_day = filterArray(result.pickup_time_of_day, VALID_TIMES);
    result.delivery_zipcodes = Array.isArray(result.delivery_zipcodes) ? result.delivery_zipcodes : [];

    return new Response(JSON.stringify(result), { headers: CORS });
  } catch (err: any) {
    console.error("parse-listing-text error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 200, headers: CORS,
    });
  }
});
