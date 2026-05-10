const apiKey = "AIzaSyAcEJsO6K8ifqVrHJqmuKWmHJAK4gQsx4w";
const prompt = `You are GrowBot. Respond ONLY with valid JSON like: {"message_text": "...", "ui_actions": []}

hello`;

fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${apiKey}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2 }
  })
}).then(r => r.json()).then(d => {
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log("status:", d.candidates?.[0]?.finishReason);
  console.log("text:", text || JSON.stringify(d));
}).catch(console.error);
