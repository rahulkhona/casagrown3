import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let { message, image, history = [], userId, conversationId, guestSessionId } = await req.json();

    // Extract client IP for guest rate limiting
    const clientIp = (
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown'
    );

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase credentials' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch Skills and Rules from DB
    const { data: skillsData } = await supabase.from('growbot_skills').select('*').eq('is_active', true);
    const { data: rulesData } = await supabase.from('growbot_rules').select('*').eq('is_active', true);
    
    const skills = skillsData || [];
    const globalRules = (rulesData || []).map(r => r.rule_text);

    // 2. Vector DB Integration (RAG)
    let userFacts = "";
    if (userId) {
       const { data: facts } = await supabase.from('growbot_user_facts')
         .select('fact')
         .eq('user_id', userId)
         .order('created_at', { ascending: false })
         .limit(10);
         
       if (facts && facts.length > 0) {
         userFacts += `\nCONVERSATION FACTS:\n` + facts.map(f => f.fact).join('\n') + `\n`;
       }

       const { data: profile } = await supabase.from('profiles').select('full_name, zip_code, city, state_code, county, street_address').eq('id', userId).single();
       if (profile) {
          userFacts += `\nUSER ACCOUNT INFO:\nName: ${profile.full_name || 'Not provided'}\nLocation: ${[profile.city, profile.state_code, profile.zip_code].filter(Boolean).join(', ') || 'Not provided'}\n`;
          if (profile.county) userFacts += `County: ${profile.county}\n`;
       }

       
       const { data: garden } = await supabase.from('user_garden').select('produce_name').eq('user_id', userId);
       if (garden && garden.length > 0) {
          userFacts += `Currently growing in garden: ${garden.map(g => g.produce_name).join(', ')}\n`;
       }
    }

    // 3. Transform Skills into Gemini Tools
    const functionDeclarations: any[] = [];
    
    skills.forEach((skill: any) => {
      let props = skill.schema_properties;
      if (typeof props === 'string') {
        try { props = JSON.parse(props); } catch(e){}
      }
      
      const properties: any = {};
      const requiredProps: string[] = [];
      
      if (Array.isArray(props)) {
        props.forEach((prop: any) => {
          if (prop.type === "array") {
            properties[prop.name] = { type: "ARRAY", items: { type: "STRING" }, description: prop.description || "" };
          } else if (prop.type === "object_array") {
             properties[prop.name] = { type: "ARRAY", items: { type: "OBJECT" }, description: prop.description || "" };
          } else {
            properties[prop.name] = { type: "STRING", description: prop.description || "" };
          }
          if (prop.required !== false) {
             requiredProps.push(prop.name);
          }
        });
      }
      properties.suggested_next_actions = { type: "ARRAY", items: { type: "STRING" }, description: "Optional. 1-3 highly specific next action suggestions." };
      
      const declaration: any = {
        name: skill.name,
        description: skill.trigger_rules || `Tool for ${skill.name}`,
        parameters: {
          type: "OBJECT",
          properties: properties
        }
      };
      
      if (requiredProps.length > 0) {
        declaration.parameters.required = requiredProps;
      }
      
      functionDeclarations.push(declaration);
    });

    const tools = functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined;

    let dynamicInstruction = `You are GrowBot, a Home & Garden Assistant for CasaGrown marketplace.

Your v1 capabilities: (1) gather user profile details, (2) identify plants, (3) diagnose plant problems, (4) suggest recipes using what the user grows, (5) help users list items for sale on CasaGrown Market.

GARDENING FIRST: When a user asks ANY gardening or planting question — what to plant, how to care for plants, growing advice for specific conditions (pots, containers, shade, sun, soil, climate) — you MUST answer it directly with your own expert knowledge. Do NOT redirect gardening questions to the community or marketplace. You are the gardening expert — give the answer.

For buying requests → MarketRedirectCard. For explicit community posts (user says "post this", "ask my neighbors", "share to community") → CommunityRedirectCard. For anything outside your scope → ExternalSearchCard.

SELLING: When the user wants to sell, list, or post ANY item, IMMEDIATELY call SellerWizardCard with whatever item name they mentioned. Do NOT ask for price, description, or any other details — the listing form collects those. Just call the tool right away.

MANDATORY TOOL USAGE — you MUST call these tools instead of answering in plain text:
- PLANT IDENTIFICATION: When a user asks "what is this plant?", uploads a plant photo, or describes a plant asking for ID → you MUST call PlantIdentificationCard. Fill in ALL fields (common_name, scientific_name, description, care_instructions, edibility). NEVER answer a plant identification query in plain text.
- PLANT DIAGNOSIS: When a user describes sick plants, yellowing leaves, pests, wilting, spots, or uploads a photo of a plant problem → you MUST call DiagnosisCard. Fill in ALL fields (diagnosis, urgency, remedy_plan). NEVER answer a diagnosis query in plain text.
- RECIPES: When a user asks for recipe ideas, what to cook, or how to use garden produce → you MUST call RecipeCard. Fill in ALL fields (dish_name, ingredients, instructions, prep_time, serving_size). NEVER answer a recipe query in plain text.
If you are unsure whether to use a tool or plain text for these three categories, ALWAYS use the tool.

FOLLOW-UP CHIPS: At the end of every plain text answer (when you do NOT call a tool), always append exactly this block on a new line:
NEXT_ACTIONS: ["<short action 1>", "<short action 2>", "<short action 3>"]
Keep each suggestion under 6 words. They should be specific, natural follow-ups to your answer. Do NOT add this block when you call a tool — the tool card handles it.

RULES (follow strictly):\n`;
    globalRules.forEach(rule => dynamicInstruction += `- ${rule}\n`);

    if (userFacts) {
      dynamicInstruction += `\nUSER MEMORY CONTEXT:\n${userFacts}\n`;
    }

    if (message === '__INIT_WELCOME__' || message === '__AUTH_COMPLETE__') {
      // Gather user state for the welcome
      let isLoggedIn = !!userId;
      let isFirstTimeGrowBotUser = true;
      let isProfileComplete = false;
      let hasName = false;
      let hasLocation = false;
      let userName = '';

      if (userId) {
        const { data: profile } = await supabase.from('profiles')
          .select('has_visited_growbot, full_name, street_address, city, zip_code')
          .eq('id', userId)
          .single();
        
        if (profile) {
          isFirstTimeGrowBotUser = !profile.has_visited_growbot;
          userName = profile.full_name || '';
          hasName = !!userName;
          hasLocation = !!(profile.street_address || profile.city || profile.zip_code);
          isProfileComplete = hasName && hasLocation;

          if (isFirstTimeGrowBotUser) {
            await supabase.from('profiles')
              .update({ has_visited_growbot: true })
              .eq('id', userId);
          }
        }
      }

      console.log(`[Welcome] userId=${userId}, loggedIn=${isLoggedIn}, name=${userName}, profileComplete=${isProfileComplete}`);

      // Check if user has garden data
      let hasGarden = false;
      if (userId) {
        const { data: garden } = await supabase.from('user_garden').select('produce_name').eq('user_id', userId).limit(1);
        hasGarden = !!(garden && garden.length > 0);
      }

      // Static multi-variant welcome — progressively collects info, no LLM cost
      let welcomeText = '';

      if (message === '__AUTH_COMPLETE__') {
        // Just signed in
        welcomeText = hasName
          ? `Welcome back, ${userName}! You're all set. 🌱 What can I help you with?`
          : `Great, you're signed in! To personalize things — what's your name and what area are you in (city or zip)?`;
      } else if (isLoggedIn && isProfileComplete && hasGarden) {
        // Fully set up returning user
        welcomeText = `Hey ${userName}! 🌱 Welcome back to GrowBot.\n\nI can identify plants, diagnose problems, suggest recipes from your garden, and help you list items for sale on CasaGrown.\n\nWhat can I help you with today?`;
      } else if (isLoggedIn && isProfileComplete && !hasGarden) {
        // Has profile but no garden — ask about plants
        welcomeText = `Hey ${userName}! 🌱 Welcome to GrowBot.\n\nI'd love to learn about your garden so I can give you personalized advice and connect you with neighbors who grow similar things.\n\n**What plants, herbs, or trees are you currently growing?** 🌿\n\nYou can also ask me to identify a plant, diagnose a problem, or find recipes!`;
      } else if (isLoggedIn && !isProfileComplete) {
        // Logged in but missing profile info
        const missing: string[] = [];
        if (!hasName) missing.push('your name');
        if (!hasLocation) missing.push('your city or zip code');
        welcomeText = `Hey there! I'm GrowBot 🌱, your personal Home & Garden assistant.\n\nI can identify plants, diagnose problems, suggest recipes, and help you list items on CasaGrown Market.\n\nTo give you the best advice, could you share ${missing.join(' and ')}? I'd also love to know **what plants you're growing** — it helps me personalize tips and connect you with nearby growers! 🌿`;
      } else {
        // Guest — no account yet. Progressive profiling: ask about garden first.
        welcomeText = `Hey there! I'm GrowBot 🌱, your Home & Garden assistant on CasaGrown.\n\nI can identify plants 📸, diagnose problems 🔍, suggest recipes 🍳, and connect you with your local gardening community.\n\nTo get started, **tell me about your garden — what are you growing?** Even if you're just getting started, I'd love to help!\n\nAlso, what's your name and general area (city or zip)? It helps me give advice tailored to your climate and connect you with neighbors. 🏡`;
      }

      return new Response(
        JSON.stringify({ text: welcomeText, actions: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openAiMessages: any[] = [];
    const recentHistory = history.slice(-10);
    recentHistory.forEach((h: any) => {
      openAiMessages.push({
        role: h.role === "user" ? "user" : "assistant",
        content: h.text || "",
      });
    });

    const userContent = message || "Hello";
    const userParts: any[] = [{ text: userContent }];
    
    // Include image data for multimodal requests (plant diagnosis, identification)
    if (image && typeof image === 'string' && image.startsWith('data:')) {
      const [meta, base64Data] = image.split(',');
      const mimeType = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      userParts.push({
        inlineData: { mimeType, data: base64Data }
      });
    }
    
    openAiMessages.push({ role: "user", content: userContent });

    const IS_MOCKED = Deno.env.get('AI_MOCK') === 'true';

    // ── Guest IP rate limit: 5 free exchanges per IP per day ─────────────
    // Skip for: welcome message, logged-in users, and mocked test runs
    const GUEST_EXCHANGE_LIMIT = 5;
    if (!userId && message !== '__INIT_WELCOME__' && message !== '__AUTH_COMPLETE__' && !IS_MOCKED) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('growbot_token_usage')
        .select('id', { count: 'exact', head: true })
        .is('user_id', null)
        .eq('ip_address', clientIp)
        .gte('created_at', todayStart.toISOString());

      if ((count || 0) >= GUEST_EXCHANGE_LIMIT) {
        console.log(`[GrowBot] Guest IP ${clientIp} hit limit (${count} exchanges today). Requesting auth.`);
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(
              `event: auth_required\ndata: ${JSON.stringify({ reason: 'guest_limit', exchanges: count })}\n\n`
            ));
            controller.close();
          }
        });
        return new Response(body, {
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
        });
      }
    }

    if (IS_MOCKED) {
      console.log('[LOCAL] Skipping Gemini — AI_MOCK is true');
      // Return SSE-format mock so tests can verify the streaming protocol
      const isSellIntent = /\bsell\b/i.test(message);
      const mockText = isSellIntent
        ? "Great! Use the listing wizard to get started."
        : "🌱 [Mock] GrowBot AI is mocked. Here is some gardening advice for testing purposes.";
      const mockActions = isSellIntent
        ? [{ type: 'SellerWizardCard', data: { title: message.replace(/.*sell\s*/i, '').trim() || 'Item' } }]
        : [];
      const mockNextActions = isSellIntent ? [] : ['Tomato care tips', 'What to plant now'];

      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: mockText })}\n\n`));
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({
            text: mockText,
            actions: mockActions,
            nextActions: mockNextActions,
            usage: { promptTokens: 10, responseTokens: 20 }
          })}\n\n`));
          controller.close();
        }
      });
      return new Response(body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
      });
    }

    const AI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
    const primaryModel = Deno.env.get("AI_MODEL") || "gemini-3.5-flash-lite";
    const models = [
      { name: primaryModel, version: "v1beta" },
      { name: "gemini-2.5-flash", version: "v1beta" },
    ];

    let turnCount = 0;
    const MAX_TURNS = 3;
    let finalMessageText = "";
    let totalPromptTokens = 0;
    let totalResponseTokens = 0;
    let agenticTurns = 0;
    const actions: any[] = [];
    const calledTools = new Set<string>();
    
    const contents = openAiMessages.map((m: any) => ({
       role: m.role === "assistant" ? "model" : "user",
       parts: [{ text: m.content || "" }],
    }));
    contents.pop();
    contents.push({ role: "user", parts: userParts });
    
    let lastError = "";

    // SSE streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          while (turnCount < MAX_TURNS) {
            turnCount++;
            let geminiData: any = null;
            let callSuccess = false;
            let streamedText = "";
            
            for (const model of models) {
              try {
              const requestBody: any = {
                contents: contents,
                tools: tools,
                tool_config: tools ? { function_calling_config: { mode: "AUTO" } } : undefined,
                generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
              };
              const supportsSystemInstruction = model.name.startsWith('gemini') || model.name.startsWith('gemma-4');
              if (supportsSystemInstruction) {
                requestBody.system_instruction = { parts: [{ text: dynamicInstruction }] };
              } else {
                requestBody.contents = [
                  { role: "user", parts: [{ text: `[SYSTEM INSTRUCTIONS]\n${dynamicInstruction}` }] },
                  { role: "model", parts: [{ text: "Understood. I will follow these instructions." }] },
                  ...requestBody.contents,
                ];
              }
              if (model.name.includes('gemini-2.5')) {
                requestBody.generationConfig.thinkingConfig = { thinkingBudget: 0 };
              }

              // Use streamGenerateContent with SSE format
              const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/${model.version}/models/${model.name}:streamGenerateContent?alt=sse&key=${AI_KEY}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(requestBody),
                }
              );

              if (geminiRes.ok) {
                // Read SSE stream from Gemini, collect full response + stream text to client
                const reader = geminiRes.body!.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                const allParts: any[] = [];

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  
                  // Parse SSE lines
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || ""; // Keep incomplete line in buffer
                  
                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr || jsonStr === '[DONE]') continue;
                    
                    try {
                      const chunk = JSON.parse(jsonStr);
                      const parts = chunk.candidates?.[0]?.content?.parts || [];
                      
                      for (const part of parts) {
                        allParts.push(part);
                        // Only stream non-thought text (thought=true is internal reasoning)
                        if (part.text && part.thought !== true) {
                          streamedText += part.text;
                          send('delta', { text: part.text });
                        }
                      }

                      // Accumulate token usage
                      const usage = chunk.usageMetadata;
                      if (usage) {
                        totalPromptTokens = usage.promptTokenCount || totalPromptTokens;
                        totalResponseTokens = usage.candidatesTokenCount || totalResponseTokens;
                      }
                    } catch { /* skip malformed chunks */ }
                  }
                }

                // Build geminiData-compatible structure from collected parts
                geminiData = { candidates: [{ content: { parts: allParts } }] };
                agenticTurns++;
                callSuccess = true;
                break;
              } else {
                lastError = await geminiRes.text();
                if (geminiRes.status === 429) {
                  const retryAfter = geminiRes.headers.get('retry-after') || '60';
                  console.warn(`GrowBot: Quota exceeded (429), retry after ${retryAfter}s`);
                  finalMessageText = `🌱 I'm getting a lot of questions right now! Give me about ${retryAfter} seconds and try again.`;
                  break; // break the model loop, don't try other models
                }
                console.warn(`GrowBot: ${model.name} failed (${geminiRes.status}):`, lastError.slice(0, 500));
                await new Promise(r => setTimeout(r, 500));
              }
              } catch (networkErr: any) {
                lastError = networkErr.message || String(networkErr);
                console.warn(`GrowBot: ${model.name} network error:`, lastError.slice(0, 300));
                await new Promise(r => setTimeout(r, 500));
              }
            }

            if (!callSuccess && !finalMessageText && !geminiData) {
              console.error('All Gemini models failed:', lastError);
              finalMessageText = "Oops! I had a hiccup connecting to my brain. 🧠 Please try again — it usually works on the second try!";
              break;
            }

            const responseCandidate = geminiData.candidates?.[0];
            if (!responseCandidate) break;

            const responseParts = responseCandidate.content?.parts || [];
            console.log(`[GrowBot] Raw response parts:`, JSON.stringify(responseParts.map((p: any) => Object.keys(p))));
            contents.push({ role: "model", parts: responseParts });

            const functionCalls = responseParts.filter((p: any) => p.functionCall);
            let textParts = responseParts.filter((p: any) => p.text && p.thought !== true).map((p: any) => p.text);
            
            // gemini-2.5-flash puts all text into thought parts even with thinkingBudget:0
            // Fall back to thought text when no non-thought text exists
            if (textParts.length === 0 && functionCalls.length === 0) {
              const thoughtTexts = responseParts.filter((p: any) => p.text && p.thought === true).map((p: any) => p.text);
              if (thoughtTexts.length > 0) {
                // Use the last few thought parts which usually contain the actual response
                textParts = thoughtTexts;
                console.log(`[GrowBot] Using ${thoughtTexts.length} thought parts as text (flash thinking fallback)`);
              }
            }
            console.log(`[GrowBot] Parts breakdown: ${responseParts.length} total, ${responseParts.filter((p:any) => p.thought === true).length} thought, ${textParts.length} text, ${functionCalls.length} tool calls`);

            if (textParts.length > 0) {
              finalMessageText = textParts.join('');
            }

            console.log(`[GrowBot] Turn ${turnCount}: ${functionCalls.length} tool calls, ${textParts.length} text parts`);
            if (functionCalls.length > 0) {
              console.log(`[GrowBot] Tools called: ${functionCalls.map((c: any) => c.functionCall.name).join(', ')}`);

              // Deduplicate: skip tools already called in a previous turn
              const newCalls = functionCalls.filter((c: any) => !calledTools.has(c.functionCall.name));
              if (newCalls.length === 0) {
                console.log('[GrowBot] All tools already called, breaking loop');
                break;
              }

              // Signal client that we're processing tools
              send('status', { message: '🔧 Working on it...' });
              
              const functionResponses: any[] = [];
        
              for (const call of newCalls) {
                const fnName = call.functionCall.name;
                const fnArgs = call.functionCall.args || {};
                calledTools.add(fnName);
                
                const position = 'after';
                const actionPayload = { type: fnName, position, data: { ...fnArgs, user_id: userId } };
                actions.push(actionPayload);
                
                const skillDef = skills.find((s: any) => s.name === fnName);
                let resultData: any = { error: "Function completed locally (no backend RPC linked)." };
                
                if (fnName === 'MarketRedirectCard') {
                  const q = encodeURIComponent(fnArgs.search_query || '');
                  actionPayload.data.redirect_url = `/market${q ? `?q=${q}` : ''}`;
                  resultData = { success: true };
                } else if (fnName === 'CommunityRedirectCard') {
                  actionPayload.data.redirect_url = '/community';
                  resultData = { success: true };
                } else if (skillDef && skillDef.backend_function) {
                  try {
                    const { data: rpcResult, error: rpcError } = await supabase.rpc(skillDef.backend_function, { payload: actionPayload.data });
                    if (rpcError) {
                      resultData = { error: rpcError.message };
                    } else {
                      resultData = rpcResult;
                      actionPayload.data = { ...actionPayload.data, ...rpcResult };
                    }
                  } catch (e: any) {
                    resultData = { error: e.message };
                  }
                }
                
                // Special handling for UserMemoryCard persistence
                if (fnName === 'UserMemoryCard') {
                  const d = fnArgs;
                  const factLines: string[] = [];
                  if (d.extracted_name) factLines.push(`User's name is ${d.extracted_name}.`);
                  if (d.neighborhood_or_address) factLines.push(`User lives at/near: ${d.neighborhood_or_address}.`);
                  if (d.has_home_garden === true) factLines.push('User has a home garden.');
                  if (d.has_home_garden === false) factLines.push('User does not have a home garden.');
                  if (Array.isArray(d.growing_crops) && d.growing_crops.length) factLines.push(`User grows: ${d.growing_crops.join(', ')}.`);
                  if (typeof d.growing_crops === 'string' && d.growing_crops) factLines.push(`User grows: ${d.growing_crops}.`);
                  if (Array.isArray(d.buying_interests) && d.buying_interests.length) factLines.push(`User buys: ${d.buying_interests.join(', ')}.`);
                  if (Array.isArray(d.profession_or_skills) && d.profession_or_skills.length) factLines.push(`User's skills/profession: ${d.profession_or_skills.join(', ')}.`);

                  if (factLines.length > 0) {
                    if (userId) {
                      const factInserts = factLines.map(fact => ({ user_id: userId, fact, embedding: Array(768).fill(0) }));
                      const { error: factErr } = await supabase.from('growbot_user_facts').upsert(factInserts, { onConflict: 'user_id,fact' });
                      if (factErr) console.warn('UserMemory insert failed:', factErr.message);
                    } else if (guestSessionId) {
                      const factInserts = factLines.map(fact => ({ guest_session_id: guestSessionId, fact, embedding: Array(768).fill(0) }));
                      const { error: factErr } = await supabase.from('growbot_user_facts').insert(factInserts);
                      if (factErr) console.warn('Guest UserMemory insert failed:', factErr.message);
                    }
                  }

                  const notifyPref = d.notify_on_demand === true || d.notify_on_demand === false ? d.notify_on_demand : null;
                  const crops: string[] = Array.isArray(d.growing_crops) ? d.growing_crops
                    : (typeof d.growing_crops === 'string' && d.growing_crops) ? d.growing_crops.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : [];
                  if (crops.length > 0 && userId) {
                    const gardenInserts = crops.map(name => ({ user_id: userId, produce_name: name.toLowerCase().trim(), is_custom: true }));
                    const { error: gardenErr } = await supabase.from('user_garden')
                      .upsert(gardenInserts, { onConflict: 'user_id,produce_name', ignoreDuplicates: true });
                    if (gardenErr) console.warn('Garden upsert failed:', gardenErr.message);

                    if (notifyPref === true || notifyPref === null) {
                      const growerInserts = crops.map(name => ({ user_id: userId, produce_name: name.toLowerCase().trim(), notify_on_search: notifyPref !== false }));
                      const { error: growerErr } = await supabase.from('grower_produces')
                        .upsert(growerInserts, { onConflict: 'user_id,produce_name', ignoreDuplicates: true });
                      if (growerErr) console.warn('Grower produces upsert failed:', growerErr.message);
                    }
                  } else if (notifyPref !== null && userId) {
                    await supabase.from('grower_produces').update({ notify_on_search: notifyPref }).eq('user_id', userId);
                  }

                  if (notifyPref !== null) {
                    const notifyFact = notifyPref ? 'User wants to be notified when neighbors look for what they grow.' : 'User does NOT want demand notifications.';
                    if (userId) {
                      await supabase.from('growbot_user_facts').upsert([{ user_id: userId, fact: notifyFact, embedding: Array(768).fill(0) }], { onConflict: 'user_id,fact' });
                    } else if (guestSessionId) {
                      await supabase.from('growbot_user_facts').insert([{ guest_session_id: guestSessionId, fact: notifyFact, embedding: Array(768).fill(0) }]);
                    }
                  }

                  resultData = { success: true, facts_saved: factLines.length, crops_saved: crops.length };
                }
                
                functionResponses.push({
                  functionResponse: { name: fnName, response: { ...resultData, note: 'Card already rendered to user. Do NOT call this tool again.' } }
                });
              }

              // Also add responses for skipped duplicate calls
              for (const call of functionCalls.filter((c: any) => calledTools.has(c.functionCall.name) && !newCalls.includes(c))) {
                functionResponses.push({
                  functionResponse: { name: call.functionCall.name, response: { already_rendered: true, note: 'This card was already shown to the user. Proceed with your text response.' } }
                });
              }
              
              contents.push({ role: "user", parts: functionResponses });
              
            } else {
              // No function calls, the model has finished
              break;
            }
          }

          // Parse NEXT_ACTIONS block out of the final text response
          const nextActionsMatch = finalMessageText.match(/NEXT_ACTIONS:\s*(\[.*?\])/s);
          let nextActions: string[] = [];
          if (nextActionsMatch) {
            try {
              nextActions = JSON.parse(nextActionsMatch[1]);
            } catch { /* ignore malformed */ }
            finalMessageText = finalMessageText.replace(/\nNEXT_ACTIONS:\s*\[.*?\]/s, '').trimEnd();
          }

          // Save to DB
          if (conversationId) {
            await supabase.from('market_chat_messages').insert({
              conversation_id: conversationId,
              sender_id: 'a0000000-0000-0000-0000-00000ca5ab07',
              content: finalMessageText || 'No response',
              ui_actions: actions || []
            });
          }

          // Record token usage (including IP for guest rate limiting)
          if (message !== '__INIT_WELCOME__' && (totalPromptTokens > 0 || totalResponseTokens > 0)) {
            supabase.from('growbot_token_usage').insert({
              user_id: userId || null,
              guest_session_id: userId ? null : (guestSessionId || null),
              ip_address: userId ? null : clientIp,  // only store IP for guests
              prompt_tokens: totalPromptTokens,
              response_tokens: totalResponseTokens,
              total_tokens: totalPromptTokens + totalResponseTokens,
              agentic_turns: agenticTurns,
            }).then(({ error }) => {
              if (error) console.warn('Token usage insert failed:', error.message);
            });
          }

          // Send final done event with complete data (client replaces interim text)
          send('done', {
            text: finalMessageText,
            actions: actions,
            nextActions: nextActions,
          });

        } catch (err: any) {
          console.error('Streaming error:', err);
          send('error', { message: err.message });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

  } catch (error: any) {
    console.error('GrowBot Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
