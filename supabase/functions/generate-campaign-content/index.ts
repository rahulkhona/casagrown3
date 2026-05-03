/**
 * generate-campaign-content
 *
 * Accepts a prompt, channel, and tone to generate campaign content using AI.
 * Suggests images from the marketing-assets storage bucket if applicable.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const AI_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
const AI_URL = Deno.env.get("AI_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemma-4-31b-it";
const AI_MOCK = Deno.env.get("AI_MOCK") === "true";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" },
    });
  }

  try {
    const { prompt, channel, tone } = await req.json();

    // ── Mock mode for local dev / integration tests ──────────────────
    if (AI_MOCK) {
      const mockContent = channel === 'sms'
        ? `Hey neighbor! 🌱 [MOCK] ${prompt.slice(0, 80)} — Shop now at casagrown.com`
        : `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#333;padding:24px">
  <h2 style="color:#16a34a">Welcome to CasaGrown! 🌿</h2>
  <p>This is a <strong>mock AI response</strong> for local development.</p>
  <p>Your prompt: <em>${prompt}</em></p>
  <p>In production, Gemini (${AI_MODEL}) will generate real content here.</p>
  <div style="text-align:center;margin:32px 0">
    <a href="https://casagrown.com" style="background:#16a34a;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold">Explore the App</a>
  </div>
</div>`;
      return new Response(JSON.stringify({ content: mockContent, mock: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    if (!prompt || !channel) {
      return new Response(JSON.stringify({ error: "Missing prompt or channel" }), {
        status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    if (!AI_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } }
    });

    let imagesContext = "";
    
    // Fetch available marketing images if channel is email
    if (channel === 'email') {
      const { data: files } = await supabase.storage.from('marketing-assets').list('', { limit: 50 });
      if (files && files.length > 0) {
        const fileUrls = files.map(f => {
          const { data: { publicUrl } } = supabase.storage.from('marketing-assets').getPublicUrl(f.name);
          return `- ${f.name}: ${publicUrl}`;
        });
        imagesContext = `\n\nYou have access to the following marketing images. If relevant, embed 1-2 of them in your HTML using <img> tags (ensure max-width: 100% style):\n${fileUrls.join('\n')}`;
      }
    }

    let systemPrompt = '';
    if (channel === 'sms') {
      systemPrompt = `You are an expert marketing copywriter for CasaGrown, a local neighborhood produce marketplace.
Write a highly-converting SMS campaign message.
Tone: ${tone || 'Friendly and Urgent'}
Rules:
- Keep it under 160 characters if possible.
- Include a strong Call to Action.
- Do NOT use emojis unless appropriate for the tone.
- Do NOT include any HTML. Return ONLY plain text.
- Do NOT repeat or echo back these instructions in your response.`;
    } else {
      systemPrompt = `You are an expert marketing copywriter for CasaGrown, a local neighborhood produce marketplace.
Write a highly-converting email campaign.
Tone: ${tone || 'Professional and Welcoming'}
Rules:
- Return ONLY valid HTML that can be placed inside an email body. Do not include <html>, <head>, or <body> tags. Just the content.
- Use inline CSS for styling (e.g., style="color: #333; font-family: sans-serif;").
- Include a clear, attractive Call to Action button. The CTA href MUST be "https://casagrown.com" — never use "#" or an empty href.
- Make it visually appealing with good spacing.
- Do NOT wrap your response in markdown code blocks (\`\`\`html). Return raw HTML only.
- Do NOT include any unsubscribe, support, or footer links — these are added automatically by our email provider.
- Do NOT echo back or include these instructions in your output.${imagesContext}`;
    }

    const content = [
      { type: "text", text: `${systemPrompt}\n\n---\n\n${prompt}` }
    ];

    let aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
        "HTTP-Referer": "https://casagrown.com",
        "X-Title": "CasaGrown Campaign Assistant",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "user", content }
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Gemini API error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: `AI Provider Error: ${errText.slice(0, 200)}` }), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const aiData = await aiRes.json();
    let resultText = aiData.choices?.[0]?.message?.content ?? "";

    // Strip markdown fences if AI included them despite instructions
    resultText = resultText.replace(/^```html\n?/i, "").replace(/^```\n?/i, "").replace(/```\n?$/i, "").trim();

    // Strip echoed instructions: find the first line that starts a real HTML block element
    if (channel === 'email') {
      // Match the start of a real HTML block tag at the beginning of a line
      const htmlStartMatch = resultText.match(/(?:^|\n)(<(?:div|table|section|article|header|main|h[1-6]|p|ul|ol|span|a|img|figure|center|body)[^>]*>)/i);
      if (htmlStartMatch && htmlStartMatch.index !== undefined) {
        const idx = resultText.indexOf(htmlStartMatch[1], htmlStartMatch.index);
        if (idx > 0) resultText = resultText.slice(idx);
      }
    } else {
      // For SMS, strip any lines that look like instructions (contain "*" bullets or "Rules:")
      const lines = resultText.split('\n');
      const firstContentLine = lines.findIndex(l => l.trim() && !l.trim().startsWith('*') && !l.includes('Rules:') && !l.includes('Tone:'));
      if (firstContentLine > 0) resultText = lines.slice(firstContentLine).join('\n').trim();
    }

    return new Response(JSON.stringify({ content: resultText }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    console.error("generate-campaign-content error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
