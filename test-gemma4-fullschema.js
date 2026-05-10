const apiKey = "AIzaSyAcEJsO6K8ifqVrHJqmuKWmHJAK4gQsx4w";
const prompt = `You are GrowBot, a hyper-local Home & Garden Assistant.
You MUST respond ONLY with a JSON object matching this exact schema.
CRITICAL INSTRUCTION: You MUST wrap your JSON output inside exactly <json> and </json> tags.

SCHEMA:
{
  "type": "object",
  "properties": {
    "message_text": { "type": "string", "description": "Conversational text reply." },
    "ui_actions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string", "description": "Card type. MUST be one of: 'DiagnosisCard', 'PlantGuideCard', 'ShoppingResultsCard', 'BroadcastBuyRequestCard', 'SellerWizardCard', 'GrowSuggestionCard', 'UserMemoryCard', 'RecipeCard'" },
          "data": { "type": "object", "properties": { "diagnosis": { "type": "string" }, "urgency": { "type": "string" }, "remedy_plan": { "type": "string" }, "plant_name": { "type": "string" }, "care_instructions": { "type": "string" }, "companion_plants": { "type": "array" }, "suggested_next_actions": { "type": "array" } } }
        }
      }
    }
  },
  "required": ["message_text"]
}

Routing Rules:
1. If user uploads a sick plant or asks for a diagnosis -> DiagnosisCard
2. If user asks to identify a plant -> PlantGuideCard

CRITICAL GLOBAL RULES:
- Always respond in JSON wrapped in <json></json> tags

[USER MESSAGE]
my tomatoes have yellow leaves`;

fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${apiKey}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ contents: [{role: "user", parts: [{text: prompt}]}], generationConfig: { temperature: 0.2 } })
}).then(r => r.json()).then(d => {
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log(text || JSON.stringify(d));
}).catch(console.error);
