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
    let { message, image, history = [], userId, conversationId } = await req.json();

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

For buying requests → MarketRedirectCard. For community posts → CommunityRedirectCard. For anything outside your scope → ExternalSearchCard.

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

      // Fast-path: generate welcome server-side, skip LLM entirely
      let welcomeText = '';

      if (message === '__AUTH_COMPLETE__') {
        welcomeText = hasName
          ? `Welcome back, ${userName}! You're all set. 🌱 What can I help you with?`
          : `Great, you're signed in! To personalize things — what's your name?`;
      } else if (isLoggedIn && isProfileComplete) {
        welcomeText = `Hey${hasName ? ` ${userName}` : ''}! 🌱 I can identify plants, diagnose problems, suggest recipes from your garden, and help you list items for sale on CasaGrown.\n\nWhat can I help you with today?`;
      } else if (isLoggedIn) {
        // Logged in but missing profile info — introduce + ask for what's missing
        const missing: string[] = [];
        if (!hasName) missing.push('your name');
        if (!hasLocation) missing.push('your neighborhood or zip code');
        welcomeText = `Hey there! I'm GrowBot 🌱\n\nI can identify plants, diagnose problems, suggest recipes from your garden, and help you list items for sale on CasaGrown.\n\nTo personalize your experience — what's ${missing.join(' and ')}?`;
      } else {
        welcomeText = `Hey! I'm GrowBot, your Home & Garden assistant. 🌱\n\nI can identify plants, diagnose problems, suggest recipes, and help you list items for sale on CasaGrown. Ask me anything!\n\nIf you'd like personalized tips, I'll help you sign in when the time comes.`;
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

    if (IS_MOCKED) {
      console.log('[LOCAL] Skipping Gemini — AI_MOCK is true');
      const mockReply = "🌱 [Local dev] GrowBot AI is skipped because AI_MOCK is true. Set it to false in supabase/functions/.env to run the real AI locally.";
      
      if (conversationId) {
         await supabase.from('market_chat_messages').insert({
           conversation_id: conversationId,
           sender_id: 'a0000000-0000-0000-0000-00000ca5ab07',
           content: mockReply,
           ui_actions: []
         });
      }

      return new Response(JSON.stringify({
         text: mockReply,
         actions: []
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const AI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
    const primaryModel = Deno.env.get("AI_MODEL") || "gemma-4-31b-it";
    const models = [
      { name: primaryModel, version: "v1beta" },
      { name: "gemma-4-26b-a4b-it", version: "v1beta" },
    ];

    let turnCount = 0;
    const MAX_TURNS = 5;
    let finalMessageText = "";
    const actions: any[] = [];
    
    const contents = openAiMessages.map((m: any) => ({
       role: m.role === "assistant" ? "model" : "user",
       parts: [{ text: m.content || "" }],
    }));
    contents.pop();
    contents.push({ role: "user", parts: userParts });
    
    let lastError = "";

    while (turnCount < MAX_TURNS) {
      turnCount++;
      let geminiData: any = null;
      let callSuccess = false;
      
      for (const model of models) {
        const requestBody: any = {
              contents: contents,
              tools: tools,
              tool_config: tools ? { function_calling_config: { mode: "AUTO" } } : undefined,
              generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
            };
        // gemini-* and gemma-4-* models support system_instruction natively
        const supportsSystemInstruction = model.name.startsWith('gemini') || model.name.startsWith('gemma-4');
        if (supportsSystemInstruction) {
          requestBody.system_instruction = { parts: [{ text: dynamicInstruction }] };
        } else {
          // Inject as first user message for models without system_instruction support
          requestBody.contents = [
            { role: "user", parts: [{ text: `[SYSTEM INSTRUCTIONS]\n${dynamicInstruction}` }] },
            { role: "model", parts: [{ text: "Understood. I will follow these instructions." }] },
            ...requestBody.contents,
          ];
        }
        // Only gemini-2.5+ models support thinkingConfig
        if (model.name.includes('gemini-2.5')) {
          requestBody.generationConfig.thinkingConfig = { thinkingBudget: 0 };
        }
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/${model.version}/models/${model.name}:generateContent?key=${AI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          }
        );

        if (geminiRes.ok) {
          geminiData = await geminiRes.json();
          callSuccess = true;
          break;
        } else {
          lastError = await geminiRes.text();
          console.warn(`GrowBot: ${model.name} failed (${geminiRes.status}):`, lastError.slice(0, 500));
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (!callSuccess || !geminiData) {
        console.error('All Gemini models failed:', lastError);
        finalMessageText = "I am currently experiencing incredibly high traffic from other neighbors! Please try asking again in a few moments.";
        break;
      }

      const responseCandidate = geminiData.candidates?.[0];
      if (!responseCandidate) break;

      const responseParts = responseCandidate.content?.parts || [];
      console.log(`[GrowBot] Raw response parts:`, JSON.stringify(responseParts.map((p: any) => Object.keys(p))));
      contents.push({
        role: "model",
        parts: responseParts
      });

      const functionCalls = responseParts.filter((p: any) => p.functionCall);
      // Filter out 'thought' parts (model reasoning) — only include user-facing text
      const textParts = responseParts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text);

      if (textParts.length > 0) {
        finalMessageText += textParts.join('\\n');
      }

      console.log(`[GrowBot] Turn ${turnCount}: ${functionCalls.length} tool calls, ${textParts.length} text parts`);
      if (functionCalls.length > 0) {
        console.log(`[GrowBot] Tools called: ${functionCalls.map((c: any) => c.functionCall.name).join(', ')}`);
        const functionResponses: any[] = [];
        
        for (const call of functionCalls) {
          const fnName = call.functionCall.name;
          const fnArgs = call.functionCall.args || {};
          
          // Position controls rendering order relative to text: 'after' = text first, card second (default)
          const position = 'after';
          
          const actionPayload = { type: fnName, position, data: { ...fnArgs, user_id: userId } };
          actions.push(actionPayload);
          
          const skillDef = skills.find((s: any) => s.name === fnName);
          let resultData: any = { error: "Function completed locally (no backend RPC linked)." };
          
          // MarketRedirectCard — build the redirect URL server-side
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
                // Merge backend result into card data so fields like status, community_message_id are accessible
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
              const factInserts = factLines.map(fact => ({ user_id: userId, fact, embedding: Array(768).fill(0) }));
              const { error: factErr } = await supabase.from('growbot_user_facts').upsert(factInserts, { onConflict: 'user_id,fact' });
              if (factErr) console.warn('UserMemory insert failed:', factErr.message);
            }
            resultData = { success: true, facts_saved: factLines.length };
          }
          
          functionResponses.push({
            functionResponse: {
              name: fnName,
              response: resultData
            }
          });
        }
        
        contents.push({
          role: "user",
          parts: functionResponses
        });
        
      } else {
        // No function calls, the model has finished
        break;
      }
    }

    if (conversationId) {
       await supabase.from('market_chat_messages').insert({
         conversation_id: conversationId,
         sender_id: 'a0000000-0000-0000-0000-00000ca5ab07',
         content: finalMessageText || 'No response',
         ui_actions: actions || []
       });
    }

    return new Response(JSON.stringify({
      text: finalMessageText,
      actions: actions
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('GrowBot Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
