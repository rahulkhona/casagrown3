import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { sendBroadcastEmail } from "../_shared/postmark.ts";

const AI_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
const AI_URL = Deno.env.get("AI_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemma-4-31b-it";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Ensure this is called securely via Service Role / internal cron
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
    // 1. Fetch up to 50 leads that:
    //    - came from the earnings estimator funnel
    //    - have not yet received an AI estimate (success or abandoned)
    const { data: leads, error: fetchErr } = await supabase
      .from('crm_leads')
      .select('id, name, email, zipcode, metadata')
      .eq('form_version', 'v1-earnings-estimator')
      .is('metadata->ai_estimate_result', null)
      .is('metadata->ai_estimate_abandoned', null)
      .not('email', 'is', null)
      .limit(50);

    if (fetchErr) throw fetchErr;

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ processed: 0, abandoned: 0, message: "No queued leads found" }), { status: 200 });
    }

    let processedCount = 0;
    let abandonedCount = 0;
    const now = Date.now();

    // 2. Process each lead
    for (const lead of leads) {
      try {
        // Track when we first attempted this lead
        const firstQueuedAt: number = lead.metadata?.first_queued_at ?? now;
        const isFirstAttempt = !lead.metadata?.first_queued_at;
        const ageMs = now - firstQueuedAt;
        const firstName = lead.name?.split(' ')[0] || "there";

        // ── Give up after 24 hours ──────────────────────────────────────────
        if (!isFirstAttempt && ageMs > RETRY_WINDOW_MS) {
          console.warn(`Lead ${lead.id} has been queued for ${Math.round(ageMs / 3600000)}h — abandoning and sending fallback email`);

          const fallbackHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
              <h2 style="color: #166534; text-align: center;">Your CasaGrown Report is Taking Longer Than Expected</h2>
              <p>Hi ${firstName},</p>
              <p>We ran into a temporary issue generating your personalized earnings estimate — we're sorry for the delay!</p>
              <p>The great news is that you don't need a report to start earning from your garden. Neighbors in your area are already looking for fresh, locally-grown produce.</p>
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                <div style="font-size: 18px; font-weight: 700; color: #166534; margin-bottom: 8px;">Create your free listing in 2 minutes</div>
                <div style="font-size: 14px; color: #4b5563;">No report needed — just list what you're growing and start connecting with buyers.</div>
              </div>
              <div style="text-align: center; margin-top: 32px;">
                <a href="https://casagrown.com/create-listing?email=${encodeURIComponent(lead.email)}&name=${encodeURIComponent(lead.name || '')}&zipcode=${encodeURIComponent(lead.zipcode || '')}"
                   style="display: inline-block; background-color: #16a34a; color: white; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold; font-size: 16px;">
                  Start Selling Today →
                </a>
              </div>
            </div>
          `;

          await sendBroadcastEmail({
            to: lead.email,
            subject: "About your CasaGrown earnings estimate 🌿",
            htmlBody: fallbackHtml,
          });

          // Mark as abandoned so this lead is never picked up again
          await supabase.from('crm_leads').update({
            metadata: { ...lead.metadata, ai_estimate_abandoned: new Date().toISOString() }
          }).eq('id', lead.id);

          abandonedCount++;
          continue;
        }

        // ── Record first_queued_at on first attempt ─────────────────────────
        if (isFirstAttempt) {
          await supabase.from('crm_leads').update({
            metadata: { ...lead.metadata, first_queued_at: firstQueuedAt }
          }).eq('id', lead.id);
        }

        // ── Call Gemini (same prompt as estimate-earnings edge function) ─────
        const size = lead.metadata?.garden_size || "Medium";
        const plants: string[] = lead.metadata?.plants || [];
        const trees: string[] = lead.metadata?.trees || [];
        const plantsList = plants.length ? plants.join(", ") : "None";
        const treesList = trees.length ? trees.join(", ") : "None";

        const prompt = `You are an expert agricultural and economic estimator for CasaGrown, a neighborhood backyard produce marketplace.

A home grower has provided the following details about their garden:
- Zipcode: ${lead.zipcode || "Unknown"}
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
            max_tokens: 300,
            temperature: 0.7,
          }),
        });

        if (!aiRes.ok) {
          // AI is unavailable (rate limit, outage, etc.) — leave in queue, retry next cron run
          console.warn(`AI failed for lead ${lead.id}: HTTP ${aiRes.status} — will retry (queued ${Math.round(ageMs / 60000)}min ago)`);
          continue;
        }

        const aiData = await aiRes.json();
        const raw = aiData.choices?.[0]?.message?.content ?? "";
        const jsonStr = raw
          .replace(/```json\n?/g, "").replace(/```\n?/g, "")
          .replace(/<thought>[\s\S]*?<\/thought>/g, "")
          .trim();

        const result = JSON.parse(jsonStr);

        // ── Send success email (matches on-screen results layout) ───────────
        const successHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
            <h2 style="color: #166534; text-align: center;">Your CasaGrown Backyard Estimate is Ready!</h2>
            <p>Hi ${firstName},</p>
            <p>Our AI has finished analyzing the market data for your <strong>${size}</strong> garden in <strong>${lead.zipcode}</strong>. Here is your potential:</p>

            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
              <div style="font-size: 14px; color: #166534; font-weight: bold; text-transform: uppercase;">Estimated Annual Earnings <span style="background: #dcfce7; padding: 2px 6px; border-radius: 8px; font-size: 10px;">AI ESTIMATED</span></div>
              <div style="font-size: 48px; font-weight: 800; color: #15803d; margin: 12px 0;">$${result.estimated_annual_earnings}</div>
              <div style="font-size: 16px; color: #4b5563;">${result.excess_produce}</div>
            </div>

            <h3 style="color: #374151;">That's enough to pay for:</h3>
            <ul style="color: #4b5563; font-size: 16px;">
              ${result.analogies.map((a: string) => `<li style="margin-bottom: 8px;">${a}</li>`).join('')}
            </ul>

            <div style="background-color: #f9fafb; border-left: 4px solid #16a34a; padding: 16px; margin: 24px 0; font-size: 14px; color: #6b7280;">
              <strong>How we calculated this:</strong> ${result.reasoning}
            </div>

            <div style="text-align: center; margin-top: 32px;">
              <a href="https://casagrown.com/create-listing?email=${encodeURIComponent(lead.email)}&name=${encodeURIComponent(lead.name || '')}&zipcode=${encodeURIComponent(lead.zipcode || '')}"
                 style="display: inline-block; background-color: #16a34a; color: white; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Start Selling Today →
              </a>
            </div>
          </div>
        `;

        await sendBroadcastEmail({
          to: lead.email,
          subject: "Your CasaGrown Earnings Estimate is Ready! 🌿",
          htmlBody: successHtml,
        });

        // Mark as done so this lead is never picked up again
        await supabase.from('crm_leads').update({
          metadata: { ...lead.metadata, ai_estimate_result: result }
        }).eq('id', lead.id);

        processedCount++;

        // Minor delay to prevent API flooding
        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        // JSON parse failure or unexpected error — leave in queue, retry next cron run
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
});
