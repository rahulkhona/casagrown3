const apiKey = "AIzaSyAcEJsO6K8ifqVrHJqmuKWmHJAK4gQsx4w";
const bigPrompt = `You are GrowBot, a hyper-local Home & Garden Assistant.
You MUST respond ONLY with a JSON object matching this exact schema.

SCHEMA:
{"type":"object","properties":{"message_text":{"type":"string"},"ui_actions":{"type":"array","items":{"type":"object"}}}}

[USER MESSAGE]
hello`;

fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
  body: JSON.stringify({ model: "gemini-2.5-flash", messages: [{role: "user", content: bigPrompt}], temperature: 0.2 })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d.choices?.[0]?.message?.content || d, null, 2))).catch(console.error);
