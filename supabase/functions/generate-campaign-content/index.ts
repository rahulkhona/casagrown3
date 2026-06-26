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
    const { prompt, channel, tone, currentContent, testMock } = await req.json();
    const hasRealContent = currentContent ? currentContent.replace(/<[^>]*>/g, '').trim().length > 0 : false;

    const shouldMock = AI_MOCK && (testMock === true || req.headers.get('x-playwright-test') === 'true');

    // ── Mock mode for local dev / integration tests ──────────────────
    if (shouldMock) {
      let mockContent = "";
      if (channel === 'sms') {
        if (hasRealContent) {
          mockContent = `[REVISED MOCK SMS] Original: "${currentContent.slice(0, 50)}..." revised by prompt: "${prompt.slice(0, 50)}"`;
        } else {
          mockContent = `Hey neighbor! 🌱 [MOCK] ${prompt.slice(0, 80)} — Shop now at casagrown.com`;
        }
      } else if (channel === 'email_text') {
        if (hasRealContent) {
          mockContent = `[MOCK PLAIN TEXT FALLBACK] Converted from HTML:\n\n${currentContent.replace(/<[^>]*>/g, '').trim()}\n\nPrompt action: ${prompt}`;
        } else {
          mockContent = `Welcome to CasaGrown! [MOCK PLAIN TEXT]\n\nThis is a mock plain text email campaign for local development.\n\nShop at: https://casagrown.com`;
        }
      } else {
        if (hasRealContent) {
          mockContent = `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#333;padding:24px">
  <h2 style="color:#16a34a">Revised Email! 🌿</h2>
  <p>This is a <strong>mock revised AI response</strong> for local development.</p>
  <p>Your prompt: <em>${prompt}</em></p>
  <div style="background:#f3f4f6;padding:12px;border-radius:6px;margin:16px 0">
    <strong>Original Content Context:</strong>
    <pre style="white-space:pre-wrap;font-size:0.85rem">${currentContent}</pre>
  </div>
</div>`;
        } else {
          mockContent = `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#333;padding:24px">
  <h2 style="color:#16a34a">Welcome to CasaGrown! 🌿</h2>
  <p>This is a <strong>mock AI response</strong> for local development.</p>
  <p>Your prompt: <em>${prompt}</em></p>
  <p>In production, Gemini (${AI_MODEL}) will generate real content here.</p>
  <div style="text-align:center;margin:32px 0">
    <a href="https://casagrown.com" style="background:#16a34a;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold">Explore the App</a>
  </div>
</div>`;
        }
      }
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

    const _rawSiteUrl = Deno.env.get("SITE_URL") ?? "https://casagrown.com";
    const SITE_URL = (_rawSiteUrl.includes("localhost") || _rawSiteUrl.includes("127.0.0.1")) ? "http://localhost:3000" : _rawSiteUrl;

    let imagesContext = "";
    let linksContext = "";

    try {
      if (channel === 'email') {
        const { data: assets } = await supabase.from('crm_assets').select('name, description, storage_path').eq('type', 'image').limit(30);
        const { data: storageFiles } = await supabase.storage.from('marketing-assets').list('', { limit: 50 });
        
        const fileUrls: string[] = [];
        
        if (assets && assets.length > 0) {
          assets.forEach(asset => {
            if (asset.storage_path) {
              const { data: { publicUrl } } = supabase.storage.from('marketing-assets').getPublicUrl(asset.storage_path);
              fileUrls.push(`- Image: "${asset.name}" (${asset.description || 'No description'}) -> URL: ${publicUrl}`);
            }
          });
        }
        
        if (storageFiles && storageFiles.length > 0) {
          storageFiles.forEach(file => {
            const isAlreadyAdded = assets && assets.some(a => a.storage_path === file.name || a.storage_path === `crm/${file.name}`);
            if (!isAlreadyAdded) {
              const { data: { publicUrl } } = supabase.storage.from('marketing-assets').getPublicUrl(file.name);
              fileUrls.push(`- Image (Uploaded): "${file.name}" -> URL: ${publicUrl}`);
            }
          });
        }

        if (fileUrls.length > 0) {
          imagesContext = `\n\nYou have access to the following marketing images. If relevant, embed 1-2 of them in your HTML using <img> tags (ensure max-width: 100% style):\n${fileUrls.join('\n')}`;
        }
      }
    } catch (err) {
      console.error("Error fetching assets from database/storage:", err);
    }

    try {
      const [{ data: landingPages }, { data: promotions }, { data: shortLinks }] = await Promise.all([
        supabase.from('crm_landing_pages').select('id, slug, title').eq('is_active', true).limit(30),
        supabase.from('crm_promotions').select('id, name, landing_page_id').order('created_at', { ascending: false }).limit(30),
        supabase.from('crm_short_links').select('token, destination_url, label').limit(100)
      ]);

      const linksList: string[] = [];

      if (shortLinks && shortLinks.length > 0) {
        shortLinks.forEach(sl => {
          const shortUrl = `${SITE_URL}/r/${sl.token}`;
          linksList.push(`- Tracked URL (Label: "${sl.label || 'None'}") -> Redirect Link: ${shortUrl} (points to: ${sl.destination_url})`);
        });
      }

      if (landingPages && landingPages.length > 0) {
        landingPages.forEach(lp => {
          const lpPromos = (promotions || []).filter(p => p.landing_page_id === lp.id);
          if (lpPromos.length > 0) {
            lpPromos.forEach(p => {
              linksList.push(`- Promotion Page: "${p.name}" (Landing Page: ${lp.title}) -> URL: ${SITE_URL}/p/${lp.slug}?promo=${p.id}`);
            });
          } else {
            linksList.push(`- Landing Page: "${lp.title}" -> URL: ${SITE_URL}/p/${lp.slug}`);
          }
        });
      }

      if (linksList.length > 0) {
        linksContext = `\n\nYou have access to the following tracked links, active landing pages, and promotions. If the user mentions any of these pages, destinations, labels (like "create-listing" or "listing"), or URLs, find the matching link below and insert the exact URL/Redirect Link. DO NOT invent links outside of this list:\n${linksList.join('\n')}`;
      }
    } catch (err) {
      console.error("Error fetching pages/promotions/links from database:", err);
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
- Do NOT repeat or echo back these instructions in your response.
- Do NOT generate any thought process, reasoning (e.g. within <think> tags), comments, or chat context. Return ONLY the final clean copy ready to be used.`;
      if (hasRealContent) {
        systemPrompt += `\n- The user has provided existing content. Use their instructions to edit, revise, or translate that content, maintaining a similar length/purpose unless requested otherwise. Do NOT output anything other than the final revised SMS text.`;
      }
    } else if (channel === 'email_text') {
      systemPrompt = `You are an expert marketing copywriter for CasaGrown, a local neighborhood produce marketplace.
Write a highly-converting plain text email campaign.
Tone: ${tone || 'Professional and Welcoming'}
Rules:
- Return ONLY valid plain text. Do NOT include any HTML tags (like <div>, <p>, <a>, etc.).
- Use clean formatting, line breaks, and clear spacing for readability.
- If the user has provided existing HTML content as context, convert it fully to plain text.
- Ensure all text, details, value propositions, and calls-to-actions from the HTML content are preserved exactly.
- Any hyperlinks/anchor tags from the HTML must be converted to plain text with the URL displayed (e.g. "Explore the marketplace (https://casagrown.com)"). The URLs must be exactly preserved and not modified or invented.
- Do NOT wrap your response in markdown code blocks.
- Do NOT include any unsubscribe, support, or footer links — these are added automatically.
- Do NOT echo back or include these instructions in your output.
- Do NOT generate any thought process, reasoning (e.g. within <think> tags), comments, or chat context. Return ONLY the final clean copy ready to be used.${linksContext}`;
    } else {
      systemPrompt = `You are an expert marketing copywriter for CasaGrown, a local neighborhood produce marketplace.
Write a highly-converting email campaign.
Tone: ${tone || 'Professional and Welcoming'}
Rules:
- Return ONLY valid HTML that can be placed inside an email body (e.g. starting with a <div> or <table> wrapper). Do not include <html>, <head>, or <body> tags. Just the content itself.
- Use inline CSS for ALL styling (e.g., style="color: #333; font-family: sans-serif;"). Email clients do NOT support <style> blocks or CSS classes — every element must have its own inline style.
- IMPORTANT: All <a> tags MUST have an explicit inline color style (e.g., style="color: #ffffff; text-decoration: underline;") because email clients default links to dark blue which is unreadable on dark backgrounds.
- Include a clear, attractive Call to Action button. The CTA href MUST be "${SITE_URL}" — never use "#" or an empty href.
- Make it visually appealing with good spacing.
- Do NOT wrap your response in markdown code blocks (\`\`\`html or \`\`\`). Return raw HTML only.
- Do NOT include any unsubscribe, support, or footer links — these are added automatically by our email provider.
- Do NOT echo back or include these instructions in your output.
- Do NOT generate any thought process, reasoning (e.g. within <think> tags), comments, or chat context. Return ONLY the final clean copy ready to be used.${imagesContext}${linksContext}`;
      if (hasRealContent) {
        systemPrompt += `\n- The user has provided existing HTML content. Use their instructions to edit, revise, or translate that content.
- Preserve the HTML structure, tags, layout, and inline styles exactly where possible unless explicitly instructed by the user to change them.
- Your output must be ONLY the final, complete, revised HTML campaign code, starting with <div> or <table>. Do NOT truncate, summarize, or omit any section of the original content. Do NOT wrap tags in backticks or place HTML inside markdown bullet lists. Return raw HTML only.
- Do NOT append any text, comments, explanation, or "Hope this helps" after the closing HTML tag. Your output must end with the closing HTML tag (e.g. </div> or </table>).`;
      }
    }

    let userPromptText = "";
    if (hasRealContent) {
      userPromptText = `Here is the current campaign content:\n"""\n${currentContent}\n"""\n\nUser instructions for revising or improving this content:\n${prompt}`;
    } else {
      userPromptText = `User instructions for generating the campaign content:\n${prompt}`;
    }

    // Force strict output format by appending a final directive to the user prompt (recency bias)
    if (channel === 'email') {
      userPromptText += `\n\nCRITICAL REQUIREMENT: Return ONLY the raw HTML campaign starting directly with <div or <table and ending with the closing tag. Do NOT include any intro, outro, preamble, thoughts, reasoning, requirements checklist, validation checks, explanations, or markdown code block wrapper.`;
    } else if (channel === 'email_text') {
      userPromptText += `\n\nCRITICAL REQUIREMENT: Return ONLY the final plain text campaign content. Do NOT include any intro, outro, preamble, thoughts, reasoning, requirements checklist, validation checks, explanations, HTML tags, or markdown code block wrapper.`;
    } else {
      userPromptText += `\n\nCRITICAL REQUIREMENT: Return ONLY the raw plain text SMS content. Do NOT include any intro, outro, preamble, thoughts, reasoning, requirements checklist, validation checks, explanations, or chat context.`;
    }

    const models = [
      AI_MODEL,          // gemma-4-31b-it
      "gemini-3.5-flash", // Primary stable fallback model
      "gemini-2.5-flash"  // Secondary backup model
    ];

    let geminiData = null;
    let lastError = "";

    for (const model of models) {
      try {
        console.log(`[CAMPAIGN-AI] Attempting generation with model: ${model}`);
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${AI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: userPromptText }] }],
              system_instruction: {
                parts: [{ text: systemPrompt }]
              },
              generationConfig: {
                maxOutputTokens: 2048, // Large enough to prevent campaign truncation
                temperature: 0.7,
                ...(model.includes('gemini-2.5') || model.includes('gemini-3.') ? {
                  thinkingConfig: {
                    thinkingBudget: 0 // Completely disable thoughts to save tokens & prevent chatter
                  }
                } : {})
              },
            }),
          }
        );

        if (geminiRes.ok) {
          geminiData = await geminiRes.json();
          console.log(`[CAMPAIGN-AI] ${model} succeeded`);
          break;
        } else {
          lastError = await geminiRes.text();
          console.warn(`[CAMPAIGN-AI] ${model} failed (${geminiRes.status}): ${lastError}`);
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err: any) {
        lastError = err.message || String(err);
        console.error(`[CAMPAIGN-AI] Error with model ${model}:`, err);
      }
    }

    if (!geminiData) {
      return new Response(JSON.stringify({ error: `AI Provider Error: ${lastError.slice(0, 200)}` }), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const parts = geminiData?.candidates?.[0]?.content?.parts || [];
    let resultText = parts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join('') || 
                      parts.map((p: any) => p.text || '').join('');

    // Strip markdown fences if AI included them despite instructions
    resultText = resultText.replace(/^```html\n?/i, "").replace(/^```\n?/i, "").replace(/```\n?$/i, "").trim();

    // Strip echoed instructions: find the first line that starts a real HTML block element
    if (channel === 'email') {
      // First try to match the actual start tag of the email container (must have a style attribute as required)
      const realHtmlMatch = resultText.match(/(<(?:div|table)[^>]+style=[^>]+>)/i);
      if (realHtmlMatch && realHtmlMatch.index !== undefined) {
        const idx = resultText.indexOf(realHtmlMatch[1], realHtmlMatch.index);
        if (idx > 0) resultText = resultText.slice(idx);
      } else {
        // Fallback: Match start of a block tag at the beginning of a line
        const htmlStartMatch = resultText.match(/(?:^|\n)(<(?:div|table|section|article|header|main|h[1-6]|p|ul|ol|span|a|img|figure|center|body)[^>]*>)/i);
        if (htmlStartMatch && htmlStartMatch.index !== undefined) {
          const idx = resultText.indexOf(htmlStartMatch[1], htmlStartMatch.index);
          if (idx > 0) resultText = resultText.slice(idx);
        }
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
