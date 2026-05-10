const apiKey = process.env.GEMINI_API_KEY;
fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
  body: JSON.stringify({ model: "gemma-4-31b-it", messages: [{role: "user", content: "hello"}] })
}).then(r => r.json()).then(console.log).catch(console.error);
