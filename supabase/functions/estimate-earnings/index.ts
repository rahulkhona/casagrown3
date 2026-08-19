import { handleLeadIngestion, CORS } from "../_shared/funnel_processor.ts";
import { wrapInBrandedTemplate, actionButton } from "../_shared/email-templates.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // Check payload before doing ingestion to maintain 400 response for missing inputs
  let payload: any = {};
  let newReq = req;
  try {
    const clone = req.clone();
    payload = await clone.json();

    let lat = payload.latitude ?? req.headers.get('x-vercel-ip-latitude');
    let lng = payload.longitude ?? req.headers.get('x-vercel-ip-longitude');
    let zip = payload.zipcode || req.headers.get('x-vercel-ip-postal-code');

    payload.latitude = lat ? parseFloat(lat) : null;
    payload.longitude = lng ? parseFloat(lng) : null;
    if (!payload.zipcode && zip) {
      payload.zipcode = zip;
    }

    if (!payload.zipcode || !payload.size) {
      return new Response(JSON.stringify({ error: "Missing required inputs" }), {
        status: 400, headers: CORS,
      });
    }

    newReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(payload)
    });
  } catch (e) {
    // let handleLeadIngestion deal with bad json
  }

  return await handleLeadIngestion(newReq, {
    formVersion: 'v1-earnings-estimator',
    hasBackyard: true,
    resultKey: 'ai_estimate_result',
    extractInterests: (payload) => {
      const plants = (payload.plants || []).map((p: string) => p.replace(/\s*\([xX]?\d+\)/g, '').trim());
      const trees = (payload.trees || []).map((t: string) => t.replace(/\s*\([xX]?\d+\)/g, '').trim());
      return [...new Set([...plants, ...trees])].filter(Boolean).join(', ');
    },
    buildMetadata: (payload) => ({
      garden_size: payload.size || payload.lead?.garden_size || null,
      plants: payload.plants || payload.lead?.plants || [],
      trees: payload.trees || payload.lead?.trees || [],
      selling_comfort: payload.selling_comfort || payload.lead?.selling_comfort || null,
      excess_handling: payload.excess_handling || payload.lead?.excess_handling || null,
      latitude: payload.latitude,
      longitude: payload.longitude
    }),
    mergeAiResult: (payload, aiResult) => {
      const plants = payload.plants || [];
      const trees = payload.trees || [];
      const allItems = [...plants, ...trees].join(', ');
      return {
        ...aiResult,
        _selected_items: allItems
      };
    },
    getAiPrompt: (payload) => {
      const pStr = (payload.plants || []).join(', ');
      const tStr = (payload.trees || []).join(', ');
      const zip = payload.zipcode || '90210';
      const size = payload.size || 'Medium';

      return `Given a residential garden in US ZIP code ${zip} with size "${size}", plants [${pStr}], and fruit trees [${tStr}]:

Estimate the potential excess seasonal produce and its financial value if sold locally on a peer-to-peer marketplace.

CRITICAL INSTRUCTIONS:
1. You MUST calculate and include projected excess yields for EVERY SINGLE plant and tree item listed in the input above. Do not skip or omit any selected fruit trees or plants.
2. YIELD REALISM & QUANTITY SCALING:
   - Calculate yields by multiplying the user's exact item quantity (xN) by realistic suburban backyard amateur yields.
   - Vegetable plants (tomatoes, peppers, zucchini, cucumbers, eggplants): ~3–8 lbs surplus PER PLANT.
   - Residential fruit trees (citrus, stone fruits, avocados, apples, pears, figs): ~20–40 excess fruits (or ~15–30 lbs) PER MATURE TREE.
   - Berry bushes & plants (strawberries, blueberries, blackberries): ~1–3 lbs surplus PER BUSH/PLANT.
   - Leafy greens & herbs (basil, kale, spinach, mint): ~5–10 bunches/lbs surplus PER PLANT.
   - DO NOT generate commercial farm yields (such as 45 lbs for a single tomato plant). Keep calculations realistic for suburban backyard growers.

Return JSON with exactly these fields:
1. "excess_produce": string (comma-separated list of estimated excess yield for ALL selected items, e.g. "8 lbs tomatoes, 3 lbs peppers, 30 lemons")
2. "estimated_annual_earnings": number (realistic annual $ total earnings from selling all surplus produce, e.g. 120)
3. "analogies": array of 3 strings (fun relatable things that amount of money pays for, e.g. ["A week of organic groceries", "3 months of Netflix & Spotify", "A nice dinner out for two"])
4. "reasoning": string (1 concise sentence explaining the estimate based on local market prices)

Respond ONLY with the JSON object for the provided details (no markdown, no code fences):`;
    },
    emailSubject: "Your CasaGrown Backyard Earnings Report is Ready! 🌿",
    getSuccessHtml: (firstName: string, leadId: string, result: any) => {
      const analogiesHtml = (result.analogies || []).map((a: string) => `
        <li style="margin-bottom: 8px; color: #4b5563; font-size: 14px;">🎯 ${a}</li>
      `).join('');

      const selectedItems = result._selected_items || "";

      const bodyHtml = `
        <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">Our AI has analyzed the potential of your backyard garden based on local demand and pricing for all your selected crops & fruit trees.</p>

        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <p style="margin: 0; color: #166534; font-weight: bold; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">Estimated Annual Earnings</p>
          <div style="font-size: 44px; color: #14532d; font-weight: 900; margin: 6px 0;">$${result.estimated_annual_earnings}</div>
          <p style="margin: 0; color: #15803d; font-style: italic; font-size: 13px;">${result.reasoning}</p>
        </div>

        ${selectedItems ? `
        <div style="margin-bottom: 16px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 16px;">
          <h3 style="color: #14532d; font-size: 14px; margin: 0 0 6px;">🌳 Selected Garden Crops & Trees</h3>
          <p style="color: #166534; margin: 0; font-size: 13px; font-weight: 600; line-height: 1.5;">${selectedItems}</p>
        </div>` : ''}

        <div style="margin-bottom: 20px;">
          <h3 style="color: #166534; font-size: 15px; margin: 0 0 6px;">🍅 Projected Surplus Yield</h3>
          <p style="color: #374151; font-weight: bold; margin: 0; font-size: 14px; line-height: 1.5;">${result.excess_produce}</p>
        </div>

        <div style="margin-bottom: 24px;">
          <p style="color: #374151; font-weight: bold; margin-bottom: 8px; font-size: 14px;">That's enough extra cash per year to pay for:</p>
          <ul style="list-style-type: none; padding: 0; margin: 0;">
            ${analogiesHtml}
          </ul>
        </div>

        ${actionButton("Start Selling on CasaGrown →", "https://casagrown.com/create-listing")}
      `;

      return wrapInBrandedTemplate({
        title: "Backyard Potential Report",
        greeting: `Hi ${firstName},`,
        bodyHtml
      });
    }
  });
});
