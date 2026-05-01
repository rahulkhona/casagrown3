import { handleLeadIngestion, CORS } from "../_shared/funnel_processor.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // Check payload before doing ingestion to maintain 400 response for missing inputs
  try {
    const clone = req.clone();
    const payload = await clone.json();
    if (!payload.zipcode || !payload.size) {
      return new Response(JSON.stringify({ error: "Missing required inputs" }), {
        status: 400, headers: CORS,
      });
    }
  } catch (e) {
    // let handleLeadIngestion deal with bad json
  }

  return await handleLeadIngestion(req, {
    formVersion: 'v1-earnings-estimator',
    hasBackyard: true,
    resultKey: 'ai_estimate_result',
    extractInterests: (payload) => {
      const plants = payload.plants || [];
      const trees = payload.trees || [];
      return [...plants, ...trees].join(', ');
    },
    buildMetadata: (payload) => ({
      garden_size: payload.size,
      plants: payload.plants || [],
      trees: payload.trees || []
    }),
    getAiPrompt: (payload) => {
      const produceList = [ ...(payload.plants || []), ...(payload.trees || []) ];
      const produceStr = produceList.length ? produceList.join(", ") : "None";

      return `You are an expert agricultural and economic estimator for CasaGrown, a neighborhood backyard produce marketplace.

A home grower has provided the following details about their garden:
- Zipcode: ${payload.zipcode || "Unknown"}
- Garden Space: ${payload.size}
- Selected Produce: ${produceStr}

Task:
1. The user has explicitly provided the specific quantities of each plant and tree they are growing (indicated by 'xN' in the input). Use these EXACT quantities to calculate their yield. Do not estimate different plant counts. Account for the local climate and typical amateur yields for this area, which are much lower than professional farms.
2. Based on their provided plant/tree counts and local climate, estimate the EXCESS produce this garden might yield in a typical growing season that a family couldn't eat themselves.
3. Estimate the total potential earnings in USD if they sold this excess to neighbors at fair local organic market prices for this specific zipcode. Keep this grounded in reality based on their specific plant quantities.
4. Provide exactly 3 fun, relatable financial analogies for these earnings PER YEAR. Keep them short.
5. Briefly explain the reasoning behind this estimate based on the local market value and the yields expected from their provided plant quantities. Keep it to 1-2 short sentences.

Example Input context:
Zipcode: 90210, Space: Small Backyard, Selected Produce: Tomatoes (x2), Peppers (x1), Lemons (x1)
Example Output:
{
  "excess_produce": "15 lbs of tomatoes, 10 lbs of peppers, and 30 lbs of lemons",
  "estimated_annual_earnings": 250,
  "analogies": ["1 car payment", "Your streaming subscriptions for the year", "A weekend getaway"],
  "reasoning": "In 90210, local organic prices for these yields from 2 tomato plants, 1 pepper plant, and 1 dwarf lemon tree average $250."
}

Respond ONLY with the JSON object for the provided details (no markdown, no code fences):`;
    }
  });
});
