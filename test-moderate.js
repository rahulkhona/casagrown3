const apiKey = "AIzaSyAcEJsO6K8ifqVrHJqmuKWmHJAK4gQsx4w"; // from .env.local
fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
  body: JSON.stringify({ model: "gemma-4-31b-it", messages: [{role: "user", content: "hello"}], max_tokens: 100 })
}).then(r => r.json()).then(console.log).catch(console.error);
