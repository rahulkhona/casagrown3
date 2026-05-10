// Test gemma4 with plain English instructions instead of JSON schema
const apiKey = "AIzaSyAcEJsO6K8ifqVrHJqmuKWmHJAK4gQsx4w";
const prompt = `You are GrowBot, a hyper-local Home & Garden Assistant for CasaGrown marketplace.

Respond ONLY with valid JSON in this format:
{
  "message_text": "your conversational reply here",
  "ui_actions": []
}

The ui_actions array can contain cards like:
- { "type": "BroadcastBuyRequestCard", "data": { "produce_name": "...", "description": "...", "price_range": "..." } }
- { "type": "ProductListingCard", "data": { "product_name": "...", "category": "...", "description": "...", "price": "..." } }

Only include a card in ui_actions if the user explicitly asks to buy or sell something.
Otherwise, just set ui_actions to [].

GLOBAL RULES:
- Always respond in valid JSON only. No extra text outside the JSON.
- Be warm, helpful and concise.

[USER MESSAGE]
hello`;

fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
  body: JSON.stringify({ model: "gemma-4-31b-it", messages: [{role: "user", content: prompt}], temperature: 0.2 })
}).then(r => r.json()).then(d => console.log(d.choices?.[0]?.message?.content || JSON.stringify(d))).catch(console.error);
