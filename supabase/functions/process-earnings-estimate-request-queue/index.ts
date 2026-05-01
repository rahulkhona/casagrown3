import { handleBackgroundQueue } from "../_shared/funnel_processor.ts";

Deno.serve(async (req: Request) => {
  return await handleBackgroundQueue(req, {
    formVersion: 'v1-earnings-estimator',
    resultKey: 'ai_estimate_result',
    emailSentKey: 'ai_estimate_email_sent',
    abandonedKey: 'ai_estimate_abandoned',
    emailSubject: "Your CasaGrown Estimate is Ready! 🌿",
    getFallbackHtml: (firstName: string) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h2 style="color: #166534; text-align: center;">Your CasaGrown Estimate is Taking Longer Than Expected</h2>
        <p>Hi ${firstName},</p>
        <p>We ran into a temporary issue generating your personalized earnings estimate — we're sorry for the delay!</p>
        <p>The great news is that you don't need a report to start selling. Neighbors in your area are already looking for fresh, local produce.</p>
        <div style="text-align: center; margin-top: 32px;">
          <a href="https://casagrown.com/create-listing"
             style="display: inline-block; background-color: #16a34a; color: white; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Create Your First Listing Now →
          </a>
        </div>
      </div>
    `,
    getSuccessHtml: (firstName: string, leadId: string, result: any) => {
      const analogiesHtml = (result.analogies || []).map((a: string) => `
        <li style="margin-bottom: 8px; color: #4b5563;">🎯 ${a}</li>
      `).join('');

      return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h2 style="color: #166534; text-align: center;">Your Personalized CasaGrown Report is Ready!</h2>
        <p>Hi ${firstName},</p>
        <p>Our AI has finished analyzing the potential of your backyard garden based on local demand and pricing.</p>

        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
          <p style="margin: 0; color: #166534; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Estimated Annual Earnings</p>
          <div style="font-size: 48px; color: #14532d; font-weight: 900; margin: 8px 0;">$${result.estimated_annual_earnings}</div>
          <p style="margin: 0; color: #15803d; font-style: italic; font-size: 14px;">${result.reasoning}</p>
        </div>

        <div style="margin-bottom: 24px;">
          <h3 style="color: #166534; margin-bottom: 8px;">🍅 Projected Yield</h3>
          <p style="color: #374151; font-weight: bold; margin: 0;">${result.excess_produce}</p>
        </div>

        <div style="margin-bottom: 32px;">
          <p style="color: #374151; font-weight: bold; margin-bottom: 12px;">That's enough extra cash per year to pay for:</p>
          <ul style="list-style-type: none; padding: 0; margin: 0;">
            ${analogiesHtml}
          </ul>
        </div>

        <div style="text-align: center; margin-top: 32px;">
          <a href="https://casagrown.com/create-listing"
             style="display: inline-block; background-color: #16a34a; color: white; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Start Selling on CasaGrown →
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 32px;">
          You're sitting on a goldmine. Let's get it to your neighbors.
        </p>
      </div>
    `;
    },
    getAiPrompt: (metadata) => {
      const produceList = [ ...(metadata.plants || []), ...(metadata.trees || []) ];
      const produceStr = produceList.length ? produceList.join(", ") : "None";

      return `You are an expert agricultural and economic estimator for CasaGrown, a neighborhood backyard produce marketplace.

A home grower has provided the following details about their garden:
- Zipcode: ${metadata.zipcode || "Unknown"}
- Garden Space: ${metadata.garden_size || "Unknown"}
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
