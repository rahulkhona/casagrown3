import { handleLeadIngestion, CORS } from "../_shared/funnel_processor.ts";
import { wrapInBrandedTemplate, actionButton } from "../_shared/email-templates.ts";
import pluralize from "https://esm.sh/pluralize@8.0.0";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  return await handleLeadIngestion(req, {
    formVersion: 'v1-nutrition-estimator',
    hasBackyard: false,
    resultKey: 'ai_nutrition_result',
    extractInterests: (payload) => (payload.produce || []).join(', '),
    buildMetadata: (payload, existingLead) => {
      const produceList = payload.produce || [];
      const newSorted = [...produceList].sort().join(',');
      const oldSorted = existingLead?.metadata?.nutrition_produce_sorted;

      return {
        nutrition_produce: produceList,
        nutrition_produce_sorted: newSorted,
        ...(existingLead && newSorted !== oldSorted ? { ai_nutrition_result: null } : {}),
        neighbor_buying_comfort: payload.neighbor_buying_comfort || payload.lead?.neighbor_buying_comfort || null,
        store_types: payload.store_types || payload.lead?.store_types || [],
        fulfillment_modes: payload.fulfillment_modes || payload.lead?.fulfillment_modes || [],
        buying_frequency: payload.buying_frequency || payload.lead?.buying_frequency || null,
      };
    },
    getCacheQuery: async (supabaseAdmin, payload) => {
      const produceList: string[] = payload.produce || [];
      if (produceList.length === 0) return null;

      // Normalize all inputs to lowercase singular (e.g., "Strawberries" -> "strawberry")
      const requestedKeys = produceList.map(p => pluralize.singular(p.toLowerCase().trim()));
      
      const { data: cachedItems } = await supabaseAdmin
        .from('nutrition_item_cache')
        .select('*')
        .in('name', requestedKeys);

      const foundItems = cachedItems || [];
      const foundKeys = foundItems.map(i => i.name);
      
      const missingKeys = requestedKeys.filter(k => !foundKeys.includes(k));

      if (missingKeys.length === 0) {
        // 100% Cache Hit
        return {
          summary: "Store-bought produce loses significant nutrition between harvest and the retail shelf due to extended cold-chain transit times. Buying local minimizes this degradation.",
          items: foundItems
        };
      }

      // Partial Cache Hit (or 0% Hit)
      // Store state in payload for getAiPrompt and mergeAiResult
      payload.__cached_nutrition_items = foundItems;
      payload.__missing_produce = missingKeys;
      
      // Return null to trigger AI for the missing items
      return null;
    },
    getAiPrompt: (payload) => {
      // Only ask the AI about the items that were missing from the cache
      const produceList = payload.__missing_produce || payload.produce || [];
      const produceStr = produceList.length ? produceList.join(", ") : "general produce";

      return `You are an expert agricultural scientist specializing in post-harvest nutrient degradation.
A user has asked for a nutrition loss analysis on the following store-bought produce they frequently buy: ${produceStr}

Task:
For EACH of the provided produce items, estimate the nutrient loss that occurs between the time it is harvested and the time it typically reaches a retail grocery shelf.
Base your estimates on established agricultural research and typical cold-chain supply timelines.

Provide your response as a JSON object with two properties:
1. "summary": A brief 1-2 sentence explanation of why store-bought produce loses nutrients and why buying local (shorter time to shelf) is healthier.
2. "items": An array of objects, one for each produce item requested. Each object must have:
   - "name": The lowercase singular name of the produce (e.g. "apple", "strawberry").
   - "time_to_shelf": Typical estimated time from harvest to grocery shelf (e.g., "3-7 Days", "2-4 Weeks").
   - "nutrient_loss_pct": Estimated average percentage of nutrient loss (e.g., "30%-50%").
   - "impacted_nutrients": The primary nutrients lost (e.g., "Vitamin C, Folate").
   - "evidence_link": A real URL or reference to a study or USDA data supporting this (e.g., "https://www.ncbi.nlm.nih.gov/...").

Respond ONLY with the JSON object. Do not use markdown blocks or code fences.`;
    },
    mergeAiResult: (payload, aiResult) => {
      // Merge the AI's newly generated items with the items we already found in the cache
      const cachedItems = payload.__cached_nutrition_items || [];
      const generatedItems = aiResult.items || [];
      return {
        summary: aiResult.summary || "Store-bought produce loses significant nutrition between harvest and the retail shelf.",
        items: [...cachedItems, ...generatedItems]
      };
    },
    saveCacheResults: async (supabaseAdmin, payload, aiResult) => {
      const generatedItems = aiResult.items || [];
      if (generatedItems.length === 0) return;

      // Upsert the newly generated items into the global cache
      await supabaseAdmin
        .from('nutrition_item_cache')
        .upsert(
          generatedItems.map((item: any) => ({
            name: pluralize.singular(item.name.toLowerCase().trim()),
            time_to_shelf: item.time_to_shelf,
            nutrient_loss_pct: item.nutrient_loss_pct,
            impacted_nutrients: item.impacted_nutrients,
            evidence_link: item.evidence_link
          })),
          { onConflict: 'name' }
        );
    },
    emailSubject: "Your Post-Harvest Grocery Nutrition Loss Report is Ready! 🥬",
    getSuccessHtml: (firstName: string, leadId: string, result: any) => {
      const itemsHtml = (result.items || []).map((item: any) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px; font-weight: bold; text-transform: capitalize; font-size: 13px;">${item.name}</td>
          <td style="padding: 10px; color: #dc2626; font-weight: bold; font-size: 13px;">${item.nutrient_loss_pct}</td>
          <td style="padding: 10px; color: #4b5563; font-size: 13px;">${item.time_to_shelf}</td>
          <td style="padding: 10px; color: #4b5563; font-size: 13px;">${item.impacted_nutrients}</td>
        </tr>
      `).join('');

      const bodyHtml = `
        <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">${result.summary || 'Store-bought produce loses significant nutrition between harvest and retail shelves.'}</p>

        <div style="margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
            <thead>
              <tr style="background-color: #f9fafb; color: #374151;">
                <th style="padding: 10px;">Produce</th>
                <th style="padding: 10px;">Loss</th>
                <th style="padding: 10px;">Transit</th>
                <th style="padding: 10px;">Impacted Nutrients</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>

        ${actionButton("Find Fresh Local Harvest Near You →", "https://casagrown.com/market?utm_source=email&utm_medium=report_email&utm_campaign=nutrition_loss_report&utm_content=find_fresh_harvest")}
      `;

      return wrapInBrandedTemplate({
        title: "Grocery Nutrition Loss Report",
        greeting: `Hi ${firstName},`,
        bodyHtml
      });
    }
  });
});
