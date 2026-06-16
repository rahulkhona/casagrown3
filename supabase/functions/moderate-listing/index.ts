/**
 * moderate-listing
 *
 * Called when a market_products row is created or updated (name/description/photo changed).
 * Uses Gemini 2.0 Flash to check:
 *   1. Photo safety (explicit, unrelated, misleading)
 *   2. Text safety (profanity, scam, prohibited)
 *   3. Photo-description match
 *   4. Price sanity for the category
 *
 * Sets moderation_status = 'approved' | 'flagged' on the product.
 * If flagged, sends in-app notification to seller with reasons.
 *
 * Payload (from Supabase webhook or direct call):
 *   { product_id, seller_id, name, description, price_usd, category, photo_url }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── AI config ────────────────────────────────────────────────────────────────
// Uses Google Gemini API directly (free tier: 15 RPM, no credits needed).
// The OpenAI-compatible endpoint means the rest of the code stays the same.
const AI_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
const AI_URL = Deno.env.get("AI_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemma-4-31b-it";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const IS_LOCAL = SUPABASE_URL.includes("localhost") || SUPABASE_URL.includes("127.0.0.1");

// Price sanity ranges by category ($/unit rough bounds)
const PRICE_RANGES: Record<string, [number, number]> = {
  vegetables: [0.25, 30],
  citrus: [0.5, 40],
  herbs: [0.5, 20],
  fruits: [0.5, 50],
  produce: [0.1, 200],
  flowers: [0.5, 100],
  flower_arrangements: [1, 200],
  garden_equipment: [0.5, 500],
  pots: [0.5, 300],
  soil: [0.5, 100],
  seeds: [0.1, 50],
  eggs: [0.5, 30],
  honey: [1, 100],
  other: [0.1, 500],
};

// Profanity keyword check — deterministic, no LLM needed
const PROFANITY_PATTERNS = [
  /\bf+u+c+k+\w*/i, /\bsh[i!1]+t\b/i, /\bass+h+ol+e/i, /\bb[i!1]+tch\b/i,
  /\bc+u+n+t\b/i, /\bd[i!1]+ck\b/i, /\bpussy\b/i, /\bcrap\b/i,
  /\bmother\s*f/i, /\bmf+\b/i, /\bwtf\b/i, /\bstfu\b/i,
];
function containsProfanity(text: string): boolean {
  return PROFANITY_PATTERNS.some(p => p.test(text));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  try {
    const { product_id, seller_id, name, description, price_usd, category, photo_url } =
      await req.json();

    if (!product_id || !name) {
      return new Response(JSON.stringify({ error: "Missing product_id or name" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 1. Price sanity (no API call needed) ──────────────────────────────────
    const range = PRICE_RANGES[category] || PRICE_RANGES["other"] || [0.1, 200];
    const [minP, maxP] = range;
    // $0 is valid — CasaGrown allows free giveaways
    const priceOk = price_usd == null || price_usd === 0 || (price_usd >= minP && price_usd <= maxP);

    // ── 2. Content hash — skip if identical to last check ───────────────────
    const contentHash = await sha256(`${name}|${description}|${photo_url}`);
    const { data: existing } = await supabase
      .from("market_products")
      .select("moderation_content_hash, moderation_status")
      .eq("id", product_id)
      .single();

    if (existing?.moderation_content_hash === contentHash && existing?.moderation_status === "approved") {
      console.log(`⏭️ Skipping moderation for ${product_id} — content unchanged`);
      return new Response(JSON.stringify({ skipped: true, status: "approved" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── 2b. Profanity pre-check (no LLM needed) ──────────────────────────────
    const textToCheck = `${name} ${description ?? ""}`;
    if (containsProfanity(textToCheck)) {
      const flags = {
        issues: ["profanity_offensive_language"],
        issue_messages: {
          profanity_offensive_language:
            "Your listing contains inappropriate language. Please use respectful, family-friendly language to describe your product.",
        },
        confidence: 1.0,
        reason: "Listing contains profanity or offensive language.",
      };
      await supabase.from("market_products").update({
        moderation_status: "flagged",
        is_active: false,
        moderation_flags: flags,
        moderation_checked_at: new Date().toISOString(),
        moderation_content_hash: contentHash,
      }).eq("id", product_id);
      return new Response(JSON.stringify({ status: "flagged", flags }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── 2c. Quarantine check ──────────────────────────────────────────────────
    let quarantineInjection = "";
    try {
      const { data: qStatus } = await supabase.rpc('check_quarantine_for_seller', {
        p_seller_id: seller_id,
        p_category: category,
      });
      if (qStatus && qStatus.length > 0) {
        const pests = qStatus.map((q: any) => q.pest_name).join(', ');
        quarantineInjection = `\n\nCRITICAL SYSTEM WARNING: The seller operates inside active Agricultural Quarantine Zones for the following pests: ${pests}. Use your vast botanical knowledge to determine if the listed product (or its soil/leaves/seeds) is a known host or vector for any of these specific pests. If it is a biological host, shipping it is legally prohibited — you MUST FLAG IT with approved: false and issue 'quarantine_violation'. If the product is biologically completely unrelated to the pests (e.g., selling carrots during a citrus fly quarantine), you may APPROVE it.`;
      }
    } catch (e) {
      console.warn("Quarantine check failed in moderation:", e);
    }

    // ── 3. Gemini 2.0 Flash moderation ───────────────────────────────────────
    const parts: any[] = [
      {
        text: `You are a content moderator for CasaGrown, a neighborhood backyard produce marketplace.
Check this listing and respond ONLY with a JSON object (no markdown):
{
  "approved": true|false,
  "issues": [],
  "issue_messages": {},
  "confidence": 0.0-1.0,
  "reason": "one sentence overall summary if not approved, empty string if approved"
}

"issues" = array of exact violation codes (see below).
"issue_messages" = object mapping each violation code to a friendly sentence shown to the seller explaining what to fix.
Example: { "drugs_banned_substances": "Your listing appears to contain cannabis products which are not permitted on CasaGrown. Please remove any references to controlled substances." }

Valid issues (use exact strings):
"drugs_banned_substances" | "alcohol" | "tobacco_cigarettes_vaping" | "weapons_dangerous_items" |
"sexually_explicit" | "hate_speech_abusive" | "threats_violence" | "spam_scam" |
"profanity_offensive_language" | "category_mismatch" | "not_homegrown_produce" | "photo_mismatch" | "price_unrealistic" | "misleading" | "quarantine_violation"

Listing:
Name: ${name}
Category: ${category}
Description: ${description || "(none)"}
Price: $${price_usd ?? "not set"} per unit${price_usd === 0 ? " (FREE giveaway — this is allowed and encouraged)" : ""}
Price sanity: ${priceOk ? "OK" : "SUSPICIOUS — outside normal range for " + category}${quarantineInjection}

APPROVE if the listing is:
- Fresh fruits, vegetables, herbs, citrus, edible plants, or other homegrown food products (produce, eggs, honey, preserves)
- Flowers, flower arrangements, or ornamental plants
- Garden supplies: pots, planters, soil, compost, mulch, seeds, seedlings, garden tools, or equipment
- Any item that fits the CasaGrown marketplace categories: produce, flowers, flower_arrangements, garden_equipment, pots, soil, seeds, eggs, honey
- Described in normal, polite language
- Photo shows the actual product or a reasonable representation of it

FLAG (set approved=false) if the listing contains:
- Drugs, cannabis, marijuana, controlled substances, or banned substances of any kind
- Alcohol, wine, beer, spirits, or fermented beverages sold as a product
- Tobacco, cigarettes, vaping products, or nicotine products
- Weapons, knives (beyond kitchen/garden tools), firearms, ammunition, or dangerous items
- Sexually explicit language, nudity, or adult content in text or photo
- Hate speech, racial slurs, abusive language, or personal attacks
- Threats of violence or intimidation language
- Profanity, swear words, obscene or vulgar language of any kind (e.g. f-word, s-word, or similar offensive terms) — use code "profanity_offensive_language"
- Products that are clearly commercial electronics, clothing, furniture, vehicles, or other items completely unrelated to gardening, growing, or homemade goods
- Scam patterns (fake contact info, "DM for real price", guaranteed income claims)
- Photo that clearly shows something entirely unrelated to the listing name

IMPORTANT: Be LENIENT. Small growers may have imperfect photos or simple descriptions.
Garden-related items like pots, tools, soil, and seeds are ALWAYS allowed — they are core marketplace categories.
When in doubt, APPROVE. Only flag clear violations.
NOTE: $0 (free) listings are VALID — CasaGrown encourages free sharing and giveaways. Do NOT flag a $0 price as "price_unrealistic".`,
      },
    ];

    let moderationResult = {
      approved: true,
      issues: [] as string[],
      issue_messages: {} as Record<string, string>,
      confidence: 1.0,
      reason: "",
    };

    const SKIP_AI = Deno.env.get("SKIP_AI") === "true";
    if (SKIP_AI) {
      // Skip Gemini only during automated E2E tests — auto-approve
      console.log(`⏭️ [SKIP_AI] Skipping Gemini moderation for "${name}" — auto-approving`);
    } else if (AI_KEY) {
      // Build message content — text + optional image
      const content: any[] = [];

      // Attach image first if available
      if (photo_url && photo_url.startsWith("http")) {
        try {
          const imgRes = await fetch(photo_url);
          if (imgRes.ok) {
            const imgBuf = await imgRes.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
            const mime = imgRes.headers.get("content-type") || "image/jpeg";
            content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } });
          }
        } catch {
          console.warn("⚠️ Could not fetch image for moderation:", photo_url);
        }
      }

      content.push({ type: "text", text: parts[0].text });

      const aiRes = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${AI_KEY}`,
          "HTTP-Referer": "https://casagrown.com",
          "X-Title": "CasaGrown Listing Moderation",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [{ role: "user", content }],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const raw = aiData?.choices?.[0]?.message?.content ?? "{}";
        try {
          moderationResult = JSON.parse(raw);
        } catch {
          console.warn("⚠️ Could not parse AI response:", raw);
        }
      } else {
        const errText = await aiRes.text();
        console.warn("⚠️ AI returned", aiRes.status, "— defaulting to approved:", errText);
      }
    } else {
      console.warn("⚠️ OPENROUTER_API_KEY not set — auto-approving");
    }

    // ── 4. Apply result ───────────────────────────────────────────────────────
    if (!priceOk && !moderationResult.issues.includes("price_unrealistic")) {
      moderationResult.issues.push("price_unrealistic");
      moderationResult.approved = false;
    }

    const newStatus: string = moderationResult.approved ? "approved" : "flagged";
    const flags = moderationResult.approved
      ? null
      : {
          issues: moderationResult.issues,
          issue_messages: moderationResult.issue_messages,
          confidence: moderationResult.confidence,
          reason: moderationResult.reason,
        };

    const updatePayload: any = {
      moderation_status: newStatus,
      moderation_flags: flags,
      moderation_content_hash: contentHash,
      moderation_checked_at: new Date().toISOString(),
    };

    if (newStatus === "flagged") {
      updatePayload.is_active = false;
    }

    await supabase.from("market_products").update(updatePayload).eq("id", product_id);

    // ── 5. Notify seller if approved or flagged ──────────────────────────────
    const edgeFnBase = SUPABASE_URL.replace("/rest/v1", "") + "/functions/v1";
    const authHeader = { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` };

    if (newStatus === "approved") {
      const isNewApproval = existing?.moderation_status !== "approved";
      if (isNewApproval) {
        // 5a. In-app notification
        await supabase.from("notifications").insert({
          user_id: seller_id,
          content: `🎉 Your listing "${name}" is live! Share it with your neighborhood groups and let your neighbors know.`,
          link_url: `/my-booth/products?share=${product_id}`,
        });

        // 5b. Push notification (non-blocking)
        fetch(`${edgeFnBase}/send-push-notification`, {
          method: "POST",
          headers: authHeader,
          body: JSON.stringify({
            user_ids: [seller_id],
            title: "🚀 Listing Live!",
            body: `🚀 "${name}" is live! Share it with your neighborhood groups and let your neighbors know.`,
            url: `/my-booth/products?share=${product_id}`,
            tag: `product-approved-${product_id}`,
          }),
        }).catch(e => console.warn("⚠️ Push notification failed (non-blocking):", e));

        // 5c. Email notification (non-blocking)
        const { data: seller } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", seller_id)
          .single();

        if (seller?.email) {
          fetch(`${edgeFnBase}/notify-product-approved`, {
            method: "POST",
            headers: authHeader,
            body: JSON.stringify({
              seller_id,
              seller_email: seller.email,
              seller_name: seller.full_name ?? "Seller",
              product_name: name,
              product_id,
            }),
          }).catch(e => console.warn("⚠️ Email notification failed (non-blocking):", e));
        }
      }
    } else if (newStatus === "flagged") {
      // 5a. In-app notification
      await supabase.from("notifications").insert({
        user_id: seller_id,
        content: `Your listing "${name}" needs some edits before it can go live. Tap to review.`,
        link_url: `/my-booth/products/${product_id}`,
      });

      // 5b. Push notification (non-blocking)
      fetch(`${edgeFnBase}/send-push-notification`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({
          user_ids: [seller_id],
          title: "⚠️ Listing Needs Edits",
          body: `Your listing "${name}" was flagged and is hidden from the market. Tap to edit and republish.`,
          url: `/my-booth/products/${product_id}`,
          tag: `ai-flagged-${product_id}`,
        }),
      }).catch(e => console.warn("⚠️ Push notification failed (non-blocking):", e));

      // 5c. Email notification (non-blocking)
      const { data: seller } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", seller_id)
        .single();

      if (seller?.email) {
        fetch(`${edgeFnBase}/notify-product-flagged`, {
          method: "POST",
          headers: authHeader,
          body: JSON.stringify({
            seller_id,
            seller_email: seller.email,
            seller_name: seller.full_name ?? "Seller",
            product_name: name,
            product_id,
            flag_count: 0,           // 0 = AI-flagged (not community-flagged)
            ai_flagged: true,
            ai_reason: flags?.reason ?? "Content policy violation",
          }),
        }).catch(e => console.warn("⚠️ Email notification failed (non-blocking):", e));
      }
    }


    console.log(`✅ Moderated "${name}" (${product_id}): ${newStatus}`, flags ?? "");
    return new Response(JSON.stringify({ status: newStatus, flags }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ moderate-listing error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
