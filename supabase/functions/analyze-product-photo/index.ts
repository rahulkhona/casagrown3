/**
 * analyze-product-photo
 *
 * Accepts a base64 image and uses Gemini to identify the product,
 * returning suggested name, category, description, and unit.
 *
 * Payload: { image: "data:image/jpeg;base64,..." }
 * Response: { name, category, description, suggested_unit }
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  try {
    const { image } = await req.json();

    if (!image) {
      return new Response(JSON.stringify({ error: "Missing image" }), {
        status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Skip Gemini API only when SKIP_AI=true (automated E2E tests)
    if (SKIP_AI) {
      console.log("[SKIP_AI] Returning mock product analysis for automated tests");
      return new Response(JSON.stringify({
        name: "Local Test Product",
        category: "produce",
        description: "AI analysis skipped (SKIP_AI=true). Please fill in manually.",
        suggested_unit: "each",
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    if (!AI_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Build message with image
    const content: any[] = [];

    // Add image
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
        console.warn("Could not fetch image URL");
      }
    }

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

    // Retry once on rate limit (429) or server error (503)
    let aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
        "HTTP-Referer": "https://casagrown.com",
        "X-Title": "CasaGrown Product Analysis",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "user", content }],
        max_tokens: 300,
        temperature: 0.3,
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
          "X-Title": "CasaGrown Product Analysis",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [{ role: "user", content }],
          max_tokens: 300,
          temperature: 0.3,
        }),
      });
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Gemini API error:", aiRes.status, errText);
      // Return 200 with error body — HTTP 500 causes supabase.functions.invoke
      // to put response in res.error instead of res.data, hiding the actual message
      return new Response(JSON.stringify({ error: `Gemini ${aiRes.status}: ${errText.slice(0, 200)}` }), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const aiData = await aiRes.json();

    // Parse JSON from response — robust extraction for various model output formats
    const raw = aiData.choices?.[0]?.message?.content ?? "";

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
      console.warn("Failed to parse AI response:", raw.slice(0, 500));
      return new Response(JSON.stringify({ error: "Could not parse AI response", raw_preview: raw.slice(0, 200) }), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Validate category
    if (result.category && !VALID_CATEGORIES.includes(result.category)) {
      result.category = "produce";
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
