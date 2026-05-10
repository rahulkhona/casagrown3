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

    let dynamicInstruction = `You are GrowBot, a hyper-local Home & Garden Assistant for CasaGrown marketplace.
Your goal is to help users with their gardening, plant care, and community market needs.
You have access to a suite of tools. Use them when appropriate to fetch real-time data or perform actions on behalf of the user.
If you call a tool, wait for the results, and then provide a conversational response summarizing the findings.
DO NOT use markdown JSON blocks, just reply conversationally.

CRITICAL GLOBAL RULES:\n`;
    globalRules.forEach(rule => dynamicInstruction += `- ${rule}\n`);

    if (userFacts) {
      dynamicInstruction += `\nUSER MEMORY CONTEXT:\n${userFacts}\n`;
    }

    if (message === '__INIT_WELCOME__') {
      dynamicInstruction += `\nSPECIAL INSTRUCTION: The user just opened the chat. Introduce yourself as GrowBot, briefly mention your core capabilities (e.g., plant diagnosis, recipe generation, market connections), and if you have user context, acknowledge it (e.g. mention their location if available). Then ask an engaging question to learn about their gardening goals, and explicitly state "You can change the subject at any time!" Do NOT generate any UI cards for this welcome message.\n`;
      message = "Hello, I just opened the chat.";
    }

    const openAiMessages: any[] = [];
    const recentHistory = history.slice(-10);
    recentHistory.forEach((h: any) => {
      openAiMessages.push({
        role: h.role === "user" ? "user" : "assistant",
        content: h.text || "",
      });
    });

    const userContent = `[SYSTEM INSTRUCTIONS]\n${dynamicInstruction}\n\n[USER MESSAGE]\n${message || "Hello"}`;
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
         uiActions: []
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const AI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
    const primaryModel = Deno.env.get("AI_MODEL") || "gemma-4-31b-it";
    const models = [
      { name: primaryModel, version: "v1beta" },
      { name: "gemini-2.5-flash", version: "v1beta" },
    ];

    let turnCount = 0;
    const MAX_TURNS = 5;
    let finalMessageText = "";
    const uiActions: any[] = [];
    
    const contents = openAiMessages.map((m: any) => ({
       role: m.role === "assistant" ? "model" : "user",
       parts: [{ text: m.content || "" }],
    }));
    contents.pop();
    contents.push({ role: "user", parts: [{ text: userContent }] });
    
    let lastError = "";

    while (turnCount < MAX_TURNS) {
      turnCount++;
      let geminiData: any = null;
      let callSuccess = false;
      
      for (const model of models) {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/${model.version}/models/${model.name}:generateContent?key=${AI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: contents,
              tools: tools,
              generationConfig: { temperature: 0.2 },
            }),
          }
        );

        if (geminiRes.ok) {
          geminiData = await geminiRes.json();
          callSuccess = true;
          break;
        } else {
          lastError = await geminiRes.text();
          console.warn(`GrowBot: ${model.name} failed (${geminiRes.status}), trying next...`);
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
      contents.push({
        role: "model",
        parts: responseParts
      });

      const functionCalls = responseParts.filter((p: any) => p.functionCall);
      const textParts = responseParts.filter((p: any) => p.text).map((p: any) => p.text);

      if (textParts.length > 0) {
        finalMessageText += textParts.join('\\n');
      }

      if (functionCalls.length > 0) {
        const functionResponses: any[] = [];
        
        for (const call of functionCalls) {
          const fnName = call.functionCall.name;
          const fnArgs = call.functionCall.args || {};
          
          const actionPayload = { type: fnName, data: { ...fnArgs, user_id: userId } };
          uiActions.push(actionPayload);
          
          const skillDef = skills.find((s: any) => s.name === fnName);
          let resultData: any = { error: "Function completed locally (no backend RPC linked)." };
          
          if (skillDef && skillDef.backend_function) {
            try {
              const { data: rpcResult, error: rpcError } = await supabase.rpc(skillDef.backend_function, { payload: actionPayload.data });
              if (rpcError) {
                resultData = { error: rpcError.message };
              } else {
                resultData = rpcResult;
                actionPayload.data.backend_results = rpcResult.backend_results || rpcResult;
                
                // Backwards compatibility for UI rendering
                if (fnName === 'ShoppingResultsCard' && rpcResult.backend_results) {
                   actionPayload.data.stores = rpcResult.backend_results;
                }
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
         ui_actions: uiActions || []
       });
    }

    return new Response(JSON.stringify({
      text: finalMessageText,
      uiActions: uiActions
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('GrowBot Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
