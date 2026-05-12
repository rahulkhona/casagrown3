const apiKey = "AIzaSyAcEJsO6K8ifqVrHJqmuKWmHJAK4gQsx4w"; // from .env.local
fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${apiKey}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ contents: [{role: "user", parts: [{text: "hello"}]}] })
}).then(r => r.json()).then(console.log).catch(console.error);
