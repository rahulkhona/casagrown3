import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const DML_DDL_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|COPY)\b/i;

function checkDmlDdl(sql: string): string | null {
  const match = sql.match(DML_DDL_RE);
  if (match) {
    return `Forbidden statement detected: ${match[1].toUpperCase()}. Only SELECT queries are allowed.`;
  }
  return null;
}

function stripFences(text: string): string {
  return text
    .replace(/^```json\n?/i, "")
    .replace(/^```\n?/i, "")
    .replace(/```\n?$/i, "")
    .trim();
}

async function callGemini(
  systemPrompt: string,
  userMessages: Array<{ role: string; text: string }>,
): Promise<{ text: string; error?: string }> {
  const aiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
  const aiModel = Deno.env.get("AI_MODEL") ?? "gemini-3.5-flash";

  const contents = userMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }],
  }));

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${aiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          system_instruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.3,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p: any) => p.text || "").join("");
      return { text: text.trim() };
    } else {
      return { text: "", error: await res.text() };
    }
  } catch (err: any) {
    return { text: "", error: err.message || String(err) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" },
    });
  }

  try {
    const { prompt, conversationHistory } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const systemPrompt = `You are an expert PostgreSQL query builder for CasaGrown's UTM and Analytics dashboard.
Your job is to generate SELECT queries to fulfill user requests for marketing metrics, pageviews, and funnel drop-offs.
You will also determine the best chart type to visualize the result.

DATABASE SCHEMA:
- crm_page_visits: Tracks unique page visits. Columns: id, session_id, url, path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term, user_id, ip_address, user_agent, created_at, state_code, zip_code
- crm_page_events: Tracks specific events (like wizard steps). Columns: id, visit_id, event_type (e.g. 'wizard_step'), event_name (e.g. '/join'), event_data (JSONB containing step_index and step_name), created_at

CRITICAL DOMAIN KNOWLEDGE:
- For general pageview counts/trends, query crm_page_visits.
- For wizard drop-offs, query crm_page_events where event_type = 'wizard_step'. The wizard name is in event_name (e.g. '/join'). The step is in event_data->>'step_index' and event_data->>'step_name'.
- You can join crm_page_events to crm_page_visits via visit_id = crm_page_visits.id to get state_code, zip_code, and UTM parameters for the events.
- For drop-offs, we typically group by step_index and step_name, ordered by step_index ASC. Make sure to return 'step_name' and 'count' for charts.
- For trends, we group by DATE(created_at) and order by date ASC.
- Use explicit ALIASES for count columns, e.g., COUNT(*) AS count. Ensure date column is aliased as date.

OUTPUT REQUIREMENTS:
- Generate ONLY a SELECT statement. No INSERT, UPDATE, DELETE.
- You MUST return a JSON object containing the SQL query, the recommended chart_type, and an explanation.
- Valid chart types: 'LineChart', 'BarChart', 'DonutChart', 'HBarChart', 'Table'.
- Output EXACTLY AND ONLY valid JSON in the following format:
{
  "sql": "SELECT ...",
  "chartType": "LineChart",
  "explanation": "Brief explanation of what the query does"
}`;

    const messages: Array<{ role: string; text: string }> = [];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, text: msg.content });
      }
    }
    messages.push({ role: "user", text: prompt });

    const MAX_ATTEMPTS = 3;
    let sql = "";
    let chartType = "Table";
    let explanation = "";
    let valid = false;
    let validationError = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = await callGemini(systemPrompt, messages);
      if (result.error) {
        return new Response(JSON.stringify({ error: result.error, valid: false }), {
          status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      try {
        const parsed = JSON.parse(stripFences(result.text));
        sql = parsed.sql;
        chartType = parsed.chartType;
        explanation = parsed.explanation;
      } catch (err) {
        validationError = "Failed to parse JSON from AI response.";
        messages.push({ role: "assistant", text: result.text });
        messages.push({ role: "user", text: `ERROR: ${validationError}\nPlease output ONLY valid JSON.` });
        continue;
      }

      const dmlError = checkDmlDdl(sql);
      if (dmlError) {
        validationError = dmlError;
        messages.push({ role: "assistant", text: result.text });
        messages.push({ role: "user", text: `ERROR: ${dmlError}\nPlease generate ONLY a SELECT query.` });
        continue;
      }

      valid = true;
      validationError = "";
      break;
    }

    if (!valid) {
      return new Response(JSON.stringify({ valid: false, error: validationError }), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    let data: any[] = [];
    try {
      const { data: qData, error: qError } = await supabase.rpc("execute_generic_query", {
        p_query: sql + (sql.toLowerCase().includes("limit") ? "" : " LIMIT 500"),
      });

      if (qError) {
        return new Response(JSON.stringify({ valid: false, error: qError.message }), {
          status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      if (qData) {
        data = typeof qData === "string" ? JSON.parse(qData) : qData;
      }
    } catch (err: any) {
      return new Response(JSON.stringify({ valid: false, error: err.message }), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(
      JSON.stringify({
        sql,
        chartType,
        explanation,
        data,
        valid: true,
      }),
      {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
