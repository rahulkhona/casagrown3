// Simulate what the function sends — a large system prompt
const apiKey = "AIzaSyAcEJsO6K8ifqVrHJqmuKWmHJAK4gQsx4w";
const bigPrompt = `You are GrowBot, a hyper-local Home & Garden Assistant.
You MUST respond ONLY with a JSON object matching this exact schema.
CRITICAL INSTRUCTION: You MUST wrap your JSON output inside exactly <json> and </json> tags.

SCHEMA:
{"type":"object","properties":{"message_text":{"type":"string"},"ui_actions":{"type":"array","items":{"type":"object"}}}}

Routing Rules:
1. If user asks about buying produce -> BroadcastBuyRequestCard. (Required data: produce_name, description, price_range)
2. If user asks to list a product -> ProductListingCard. (Required data: product_name, category, description, price)

CRITICAL GLOBAL RULES:
- Always respond in JSON
- Be helpful and friendly

[USER MESSAGE]
hello`;

fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
  body: JSON.stringify({ model: "gemma-4-31b-it", messages: [{role: "user", content: bigPrompt}], temperature: 0.2 })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2))).catch(console.error);
