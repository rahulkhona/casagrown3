/**
 * analyze-product-photo
 *
 * Accepts a base64 image and/or text description and uses Gemini to identify
 * the product, returning suggested name, category, description, and unit.
 * When text is provided, also extracts price, quantity, and fulfillment preferences.
 *
 * Payload: { image?: "data:image/jpeg;base64,...", text?: "...", seller_state?: "CA", seller_city?: "San Jose" }
 * Response: { name, category, description, suggested_unit, price_usd?, quantity?, ... }
 */

import { fetchAiCompletion, cleanJsonText } from "../_shared/funnel_processor.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  try {
    const { image, text, seller_state, seller_city } = await req.json();

    if (!image && (!text || typeof text !== "string" || text.trim().length < 2)) {
      return new Response(JSON.stringify({ error: "Missing image or text" }), {
        status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const hasText = text && typeof text === "string" && text.trim().length >= 2;

    // Skip Gemini API only when SKIP_AI=true (automated E2E tests)
    if (SKIP_AI) {
      console.log("[SKIP_AI] Returning mock product analysis for automated tests");
      return new Response(JSON.stringify({
        name: "Local Test Product",
        category: "produce",
        description: "AI analysis skipped (SKIP_AI=true). Please fill in manually.",
        suggested_unit: "each",
        ...(hasText ? {
          price_usd: 5.00, quantity: 1, unit: "each", is_free: false,
          offers_delivery: true, offers_pickup: true,
          delivery_radius_miles: 5, delivery_days: [], delivery_time_of_day: [],
          pickup_days: [], pickup_time_of_day: [], delivery_zipcodes: [],
        } : {}),
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Build message content
    const content: any[] = [];

    // Add image if present
    if (image) {
      if (image.startsWith("data:")) {
        content.push({ type: "image_url", image_url: { url: image } });
      } else if (image.startsWith("http")) {
        try {
          const imgRes = await fetch(image);
          if (imgRes.ok) {
            const imgBuf = await imgRes.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
            const mime = imgRes.headers.get("content-type") || "image/jpeg";
            content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } });
          }
        } catch {
          console.warn("Could not fetch image URL");
        }
      }
    }

    // Build prompt based on whether text context is provided
    if (hasText) {
      // Enhanced prompt: text + optional photo → full listing extraction
      const locationCtx = seller_state ? `\nSeller location: ${seller_city || ""}, ${seller_state}` : "";
      content.push({
        type: "text",
        text: `You are a product listing assistant for CasaGrown, a neighborhood backyard produce marketplace.

The seller described their listing as:
"${text.trim()}"${locationCtx}${image ? "\n\nThey also provided a photo of the product." : ""}

Extract product information and respond ONLY with a JSON object (no markdown, no code fences):
{
  "name": "appealing product name for the marketplace",
  "category": "one of: ${VALID_CATEGORIES.join(" | ")}",
  "description": "2-3 sentence marketplace description. Mention freshness, quality, and appeal.",
  "suggested_unit": "one of: ${VALID_UNITS.join(" | ")}",
  "price_usd": 5.00,
  "quantity": 1,
  "unit": "one of: ${VALID_UNITS.join(" | ")}",
  "is_free": false,
  "offers_delivery": true,
  "offers_pickup": true,
  "delivery_radius_miles": 5,
  "delivery_days": ["sunday"],
  "delivery_time_slots": ["16-18"],
  "pickup_days": ["saturday"],
  "pickup_time_slots": ["8-10", "10-12"],
  "delivery_zipcodes": [],
  "pickup_address": {
    "street": "970 Wallace Dr.",
    "city": "San Jose",
    "state": "CA",
    "zip": "95120"
  },
  "base_address": {
    "street": "970 Wallace Dr.",
    "city": "San Jose",
    "state": "CA",
    "zip": "95120"
  }
}

Rules:
- Extract price, quantity, and unit from the text. If not specified, make a reasonable guess.
- Ensure that 'unit' (the pricing unit) matches the denomination of 'price_usd'. For example, if the user says "at $2 per piece", 'unit' MUST be "each" and 'price_usd' MUST be 2.00.
- If the quantity unit in the text (e.g., "5 dozen") is different from the pricing unit (e.g., "$2 per piece", which is "each"), convert the 'quantity' to be in terms of the pricing 'unit'. For example:
  - "5 dozen at $2 per piece" -> unit: "each", price_usd: 2.00, quantity: 60 (since 5 dozen = 60 each).
  - "2 bunches at $5/each (where 1 bunch = 5 pieces)" -> unit: "each", price_usd: 5.00, quantity: 10.
  - "10 lbs at $2 per lb" -> unit: "lb", price_usd: 2.00, quantity: 10 (units match).
- ALWAYS represent the returned 'quantity' value in terms of the pricing 'unit' so that they are mathematically consistent.
- Extract delivery/pickup preferences from text. If not mentioned, default both to true.
- If a specific address is mentioned in the text for pickup (e.g., 'pickup ... from 970 Wallace Dr. San Jose, CA 95120'), extract it into the 'pickup_address' object. If no pickup address is specified, set 'pickup_address' to null.
- If a specific general address is mentioned for delivery or selling location (e.g., 'deliver from 970 Wallace Dr' or 'my home at ...'), extract it into the 'base_address' object. If no general address is specified, set 'base_address' to null.
- Time slots are 2-hour windows. Available slots: "8-10", "10-12", "12-14", "14-16", "16-18", "18-20"
  - "morning" means ["8-10", "10-12"]
  - "afternoon" means ["12-14", "14-16"]
  - "evening" means ["16-18", "18-20"]
  - For specific times like "10am to 3pm", select all slots that overlap: ["10-12", "12-14", "14-16"]
  - For specific times like "9am to noon", select: ["8-10", "10-12"]
- Days: lowercase like "monday", "saturday"
- Strictly separate delivery and pickup days (supporting multiple days for each):
  - If the user says they can deliver on certain days (e.g. Wednesday and Friday), add them to 'delivery_days' (do NOT add them to 'pickup_days').
  - If the user says buyers can pick up on certain days (e.g. Saturday and Sunday), add them to 'pickup_days' (do NOT add them to 'delivery_days').
  - Never mix or combine delivery and pickup days. For example, if they deliver on Monday/Wednesday and allow pickup on Saturday/Sunday, 'delivery_days' must be ["monday", "wednesday"] and 'pickup_days' must be ["saturday", "sunday"].
- Category MUST be one of the exact values listed
- Generate an appealing marketplace description
- Use the photo (if provided) to improve product identification. If the photo is unclear, blurry, or does not clearly show the product, rely entirely on the text description to identify the product and extract all fields (including name, category, description, price_usd, quantity, unit, offers_delivery, offers_pickup, delivery_days, pickup_days, delivery_time_of_day, delivery_time_slots, delivery_zipcodes, base_address, and pickup_address). Do NOT return an error or fail.`,
      });
    } else {
      // Original prompt: photo-only → basic product info
      content.push({
        type: "text",
        text: `You are a product identification assistant for CasaGrown, a neighborhood backyard produce marketplace.

Look at this photo and identify the produce, plant, or product shown.

Respond ONLY with a JSON object (no markdown, no code fences):
{
  "name": "product name (e.g. 'Heirloom Tomatoes', 'Meyer Lemons', 'Fresh Basil')",
  "category": "one of: ${VALID_CATEGORIES.join(" | ")}",
  "description": "2-3 sentence appealing description for a marketplace listing. Mention freshness, flavor, and best uses.",
  "suggested_unit": "one of: each | lb | bunch | pint | dozen | jar | bag | flat"
}

Rules:
- Use common, recognizable product names buyers would search for
- Category MUST be one of the exact values listed above
- Description should be warm, local, and appetizing
- If you can't identify the product, use your best guess from the visual appearance
- Default to "produce" category if unsure`,
      });
    }

    const aiRes = await fetchAiCompletion({
      content,
      maxTokens: 4096,
      responseFormat: { type: "json_object" },
      timeoutMs: 10000,
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI failed:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: `AI error ${aiRes.status}: ${errText.slice(0, 200)}` }), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "";
    console.log("[AI-RESPONSE] model:", aiData.model, "raw:", raw.slice(0, 500));

    let result;
    try {
      result = JSON.parse(cleanJsonText(raw));
    } catch (e) {
      console.warn("Failed to parse AI response:", raw.slice(0, 500));
      return new Response(JSON.stringify({ error: "Could not parse AI response", raw_preview: raw.slice(0, 200) }), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Validate category
    if (result.category && !VALID_CATEGORIES.includes(result.category)) {
      result.category = "produce";
    }

    // Validate extended fields when text was provided
    if (hasText) {
      if (result.unit && !VALID_UNITS.includes(result.unit)) result.unit = "each";
      if (result.suggested_unit && !VALID_UNITS.includes(result.suggested_unit)) result.suggested_unit = "each";
      if (result.delivery_days) result.delivery_days = result.delivery_days.filter((d: string) => VALID_DAYS.includes(d));
      if (result.pickup_days) result.pickup_days = result.pickup_days.filter((d: string) => VALID_DAYS.includes(d));
      if (result.delivery_time_of_day) result.delivery_time_of_day = result.delivery_time_of_day.filter((t: string) => VALID_TIMES.includes(t));
      if (result.pickup_time_of_day) result.pickup_time_of_day = result.pickup_time_of_day.filter((t: string) => VALID_TIMES.includes(t));
      if (typeof result.price_usd === "string") result.price_usd = parseFloat(result.price_usd) || 0;
      if (typeof result.quantity === "string") result.quantity = parseInt(result.quantity) || 1;
    }

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    console.error("analyze-product-photo error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
