import { handleBackgroundQueue } from "../_shared/funnel_processor.ts";

Deno.serve(async (req: Request) => {
  return await handleBackgroundQueue(req, {
    formVersion: 'v1-nutrition-estimator',
    resultKey: 'ai_nutrition_result',
    emailSentKey: 'ai_nutrition_email_sent',
    abandonedKey: 'ai_nutrition_abandoned',
    emailSubject: "Your Nutrition Loss Report is Ready! 🍎",
    getCacheQuery: async (supabaseAdmin, metadata) => {
      const sortedProduce = metadata.nutrition_produce_sorted;
      if (!sortedProduce) return null;
      
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
    getFallbackHtml: (firstName: string) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h2 style="color: #166534; text-align: center;">Your CasaGrown Report is Taking Longer Than Expected</h2>
        <p>Hi ${firstName},</p>
        <p>We ran into a temporary issue generating your personalized nutrition loss report — we're sorry for the delay!</p>
        <p>The great news is that you don't need a report to start accessing fresh, hyper-local produce. Neighbors in your area are already growing!</p>
        <div style="text-align: center; margin-top: 32px;">
          <a href="https://casagrown.com/community"
             style="display: inline-block; background-color: #16a34a; color: white; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Join Your Local CasaGrown Community →
          </a>
        </div>
      </div>
    `,
    getSuccessHtml: (firstName: string, leadId: string, result: any) => {
      const itemsHtml = (result.items || []).map((item: any) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #374151;">
            ${item.name}
            <div style="font-size: 12px; color: #6b7280; font-weight: normal; margin-top: 4px;">Impacts: ${item.impacted_nutrients || "Vitamins"}</div>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">${item.time_to_shelf}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #b91c1c; font-weight: bold;">${item.nutrient_loss_pct}</td>
        </tr>
      `).join('');

      return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h2 style="color: #166534; text-align: center;">Your Nutrition Loss Report is Ready!</h2>
        <p>Hi ${firstName},</p>
        <p>Our AI has finished analyzing the grocery store supply chain for the produce you regularly buy.</p>

        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
          <p style="margin: 0; color: #166534; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Scientific Summary</p>
          <p style="margin: 8px 0; color: #15803d; font-style: italic; font-size: 14px;">${result.summary}</p>
        </div>
        
        <p style="color: #374151;">Here is the specific breakdown of how many vitamins are degrading before your produce even hits the shelf:</p>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f0fdf4; color: #166534; text-align: left; border-bottom: 2px solid #bbf7d0;">
              <th style="padding: 12px;">Produce</th>
              <th style="padding: 12px;">Est. Time to Shelf</th>
              <th style="padding: 12px;">Nutrient Loss</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="text-align: center; margin-top: 32px;">
          <a href="https://casagrown.com/market"
             style="display: inline-block; background-color: #16a34a; color: white; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold; font-size: 16px;">
            🔔 Notify me when local sellers have what I want →
          </a>
        </div>
      </div>
    `;
    },
    getAiPrompt: (metadata: any) => {
      const produceList: string[] = metadata.nutrition_produce || [];
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
