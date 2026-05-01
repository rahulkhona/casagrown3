import { handleLeadIngestion, CORS } from "../_shared/funnel_processor.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  return await handleLeadIngestion(req, {
    formVersion: 'v1-nutrition-estimator',
    hasBackyard: false,
    resultKey: 'ai_nutrition_result',
    extractInterests: (payload) => (payload.produce || []).join(', '),
    buildMetadata: (payload) => {
      const produceList = payload.produce || [];
      return {
        nutrition_produce: produceList,
        nutrition_produce_sorted: [...produceList].sort().join(','),
      };
    },
    getCacheQuery: async (supabaseAdmin, payload) => {
      const sortedProduce = [...(payload.produce || [])].sort().join(',');
      const { data } = await supabaseAdmin
        .from('crm_leads')
        .select('metadata')
        .eq('form_version', 'v1-nutrition-estimator')
        .eq('metadata->>nutrition_produce_sorted', sortedProduce)
        .not('metadata->ai_nutrition_result', 'is', null)
        .limit(1)
        .maybeSingle();
      
      return data?.metadata?.ai_nutrition_result || null;
    },
    getAiPrompt: (payload) => {
      const produceList = payload.produce || [];
      const produceStr = produceList.length ? produceList.join(", ") : "general produce";

      return `You are an expert agricultural scientist specializing in post-harvest nutrient degradation.
A user has asked for a nutrition loss analysis on the following store-bought produce they frequently buy: ${produceStr}

Task:
For EACH of the provided produce items, estimate the nutrient loss that occurs between the time it is harvested and the time it typically reaches a retail grocery shelf.
Base your estimates on established agricultural research and typical cold-chain supply timelines.

Provide your response as a JSON object with two properties:
1. "summary": A brief 1-2 sentence explanation of why store-bought produce loses nutrients and why buying local (shorter time to shelf) is healthier.
2. "items": An array of objects, one for each produce item requested. Each object must have:
   - "name": The name of the produce.
   - "time_to_shelf": Typical estimated time from harvest to grocery shelf (e.g., "3-7 Days", "2-4 Weeks").
   - "nutrient_loss_pct": Estimated average percentage of nutrient loss (e.g., "30%-50%").
   - "impacted_nutrients": The primary nutrients lost (e.g., "Vitamin C, Folate").
   - "evidence_link": A real URL or reference to a study or USDA data supporting this (e.g., "https://www.ncbi.nlm.nih.gov/...").

Respond ONLY with the JSON object. Do not use markdown blocks or code fences.`;
    }
  });
});
