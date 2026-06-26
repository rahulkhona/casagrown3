/**
 * generate-audience-query
 *
 * Accepts a natural language prompt describing a target audience and generates
 * a validated PostgreSQL SELECT query for audience segmentation.
 *
 * Flow:
 *   1. Fetch live DB schema via get_queryable_schema() RPC
 *   2. Build a Gemini system prompt with schema context
 *   3. Generate SQL via Gemini
 *   4. Validate (DML/DDL guard + EXPLAIN via validate_audience_query RPC)
 *   5. On failure, feed Postgres error back to Gemini and retry (max 3 attempts)
 *   6. Return validated SQL, explanation, estimated count, and sample rows
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ── Forbidden-statement guard ────────────────────────────────────────────────
const DML_DDL_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|COPY)\b/i;

function checkDmlDdl(sql: string): string | null {
  const match = sql.match(DML_DDL_RE);
  if (match) {
    return `Forbidden statement detected: ${match[1].toUpperCase()}. Only SELECT queries are allowed.`;
  }
  return null;
}

// ── Strip markdown fences the model may wrap around SQL ──────────────────────
function stripFences(text: string): string {
  return text
    .replace(/^```sql\n?/i, "")
    .replace(/^```\n?/i, "")
    .replace(/```\n?$/i, "")
    .trim();
}

// ── Gemini call helper (with model fallback chain) ───────────────────────────
async function callGemini(
  systemPrompt: string,
  userMessages: Array<{ role: string; text: string }>,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<{ text: string; error?: string }> {
  const aiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
  const aiModel = Deno.env.get("AI_MODEL") ?? "gemini-3.5-flash";

  const models = [
    aiModel,
    "gemini-3.5-flash",
  ];

  const contents = userMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }],
  }));

  let lastError = "";

  for (const model of models) {
    try {
      console.log(`[AUDIENCE-AI] Attempting generation with model: ${model}`);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            system_instruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              maxOutputTokens: opts.maxTokens ?? 1024,
              temperature: opts.temperature ?? 0.3,
              ...(model.includes("gemini-2.5") || model.includes("gemini-3.")
                ? { thinkingConfig: { thinkingBudget: 0 } }
                : {}),
            },
          }),
        },
      );

      if (res.ok) {
        const data = await res.json();
        console.log(`[AUDIENCE-AI] ${model} succeeded`);
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const text =
          parts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("") ||
          parts.map((p: any) => p.text || "").join("");
        return { text: text.trim() };
      } else {
        lastError = await res.text();
        console.warn(`[AUDIENCE-AI] ${model} failed (${res.status}): ${lastError}`);
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err: any) {
      lastError = err.message || String(err);
      console.error(`[AUDIENCE-AI] Error with model ${model}:`, err);
    }
  }

  return { text: "", error: `AI Provider Error: ${lastError.slice(0, 200)}` };
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" },
    });
  }

  try {
    const { prompt, currentSql, conversationHistory, testMock } = await req.json();

    const aiMock = Deno.env.get("AI_MOCK") === "true";
    const shouldMock = aiMock && (testMock === true || req.headers.get("x-playwright-test") === "true");

    // ── Mock mode for local dev / integration tests ────────────────────
    if (shouldMock) {
      return new Response(
        JSON.stringify({
          sql: "SELECT id, 'user' as recipient_type, email, phone_number as phone, full_name as name, state_code, city, zip_code, home_community_h3_index as community_h3, created_at as joined_at, true as accepts_email, true as accepts_sms FROM profiles LIMIT 100",
          explanation: `[MOCK] This query selects all user profiles. Generated from prompt: "${prompt}"`,
          estimatedCount: 42,
          sampleRows: [
            {
              id: "00000000-0000-0000-0000-000000000001",
              recipient_type: "user",
              email: "test@example.com",
              phone: "+15551234567",
              name: "Test User",
              state_code: "CA",
              city: "San Francisco",
              zip_code: "94105",
              community_h3: null,
              joined_at: new Date().toISOString(),
              accepts_email: true,
              accepts_sms: true,
            },
          ],
          valid: true,
          mock: true,
        }),
        {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        },
      );
    }

    // ── Validate inputs ────────────────────────────────────────────────
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const aiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
    if (!aiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // ── Supabase client (service role for RPC access) ──────────────────
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // ── Step 1: Fetch compact schema (text format, ~23KB vs 187KB JSON) ─
    const { data: schema, error: schemaError } = await supabase.rpc("get_queryable_schema_compact");
    if (schemaError) {
      console.error("[AUDIENCE-AI] Schema fetch error:", schemaError);
      return new Response(JSON.stringify({ error: `Schema fetch failed: ${schemaError.message}` }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // ── Step 1b: Fetch JSONB column key schemas from real data ─────────
    let jsonbSection = "";
    try {
      const { data: jsonbData } = await supabase.rpc("get_jsonb_column_schemas");
      if (jsonbData && typeof jsonbData === "object" && Object.keys(jsonbData).length > 0) {
        jsonbSection = `\n\nJSONB COLUMN KEY SCHEMAS (sampled from real data):\n${JSON.stringify(jsonbData, null, 2)}\nUse these keys with the -> and ->> operators to query JSONB columns.`;
      }
    } catch (err) {
      console.warn("[AUDIENCE-AI] JSONB schema fetch failed (non-fatal):", err);
    }

    // ── Step 2: Build system prompt ────────────────────────────────────
    const systemPrompt = `You are an expert PostgreSQL query builder for CasaGrown, a local neighborhood produce marketplace where home gardeners sell fresh produce to their neighbors.

Your job is to generate SELECT queries that identify audiences of users/leads for marketing campaigns.
You can also answer questions about the database schema — what tables exist, what columns they have, relationships between tables, etc.

DATABASE SCHEMA (compact DDL format — "column type [PK|FK→table.col] [NOT NULL] [description]"):
${schema}
${jsonbSection}

CRITICAL DOMAIN KNOWLEDGE:
- \`auth.users\` is the Supabase authentication table. A row here means the person HAS AN ACCOUNT (has signed up / registered). The \`email\` column is the account email. Use this table to determine if someone "has an account", "has signed up", "is a registered user", or "is a member".
- \`profiles\` is the user profile table. It stores profile data (name, phone, address, etc.) and has a 1:1 FK to auth.users via \`profiles.id = auth.users.id\`. A profile may exist without being fully completed (guest mode). Profiles are created after auth signup — not all auth.users have a profile immediately.
- \`crm_leads\` are marketing leads captured via landing pages, ads, etc. Leads are NOT users — they have not signed up yet. A lead becomes a "converted" lead when their email matches an entry in \`auth.users\`.
- To find "leads who have NOT signed up" or "leads without an account": use \`WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE LOWER(u.email) = LOWER(l.email))\` — do NOT use profiles for this check.
- To find "converted leads" (leads who later signed up): use \`WHERE EXISTS (SELECT 1 FROM auth.users u WHERE LOWER(u.email) = LOWER(l.email))\`.
- \`market_orders\` contains orders. \`buyer_id\` and \`seller_id\` are FKs to \`profiles.id\`. To find users who have bought/sold, JOIN with market_orders.
- The \`crm_leads.zipcode\` column is named \`zipcode\` (no underscore), but the output must alias it as \`zip_code\`.
- \`crm_leads\` also has \`city\`, \`state_code\`, \`county\`, and \`country\` columns. Use NULL AS community_h3 since leads don't have an h3 index.

OUTPUT REQUIREMENTS:
- If the user asks about the schema (e.g. "what tables do we have?", "what columns does market_orders have?"), respond with a helpful plain-text answer describing the schema. Do NOT generate SQL for schema questions.
- If the user asks to find/target/select an audience, generate ONLY a SELECT statement. No INSERT, UPDATE, DELETE, DROP, or any DDL.
- The query MUST return exactly these columns (use aliases as needed):
  id UUID, recipient_type TEXT ('user' or 'lead'), email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
- For queries against \`profiles\` table: map full_name→name, phone_number→phone, home_community_h3_index→community_h3, created_at→joined_at, use 'user' as recipient_type. For accepts_email use (email IS NOT NULL) since all registered users can receive email. For accepts_sms use COALESCE(sms_enabled, false).
- For queries against \`crm_leads\` table: use 'lead' as recipient_type, map zipcode→zip_code, created_at→joined_at, NULL AS community_h3. Use the accepts_email and accepts_sms columns directly. The available columns are: id, name, email, phone, zipcode, city, state_code, county, country, source_platform, source_url, source_ad_id, utm_campaign, utm_content, utm_medium, form_version, landing_page_id, referring_user_id, accepts_email, accepts_sms, status, converted_user_id, metadata (JSONB), notes, created_at, has_backyard, produce_interests.
- Use COALESCE for nullable fields when needed.
- You can JOIN any table in the schema to build complex audience segments.
- Use proper PostgreSQL syntax.
- Return ONLY the SQL query, no markdown fences, no explanation, no comments.
${currentSql ? `\nCURRENT SQL TO REFINE:\n${currentSql}` : ""}`;

    // ── Step 3-5: Generate + validate loop (max 3 attempts) ────────────
    const MAX_ATTEMPTS = 3;
    let sql = "";
    let validationError = "";
    let valid = false;

    // Build conversation messages for multi-turn context
    const messages: Array<{ role: string; text: string }> = [];

    // Include conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, text: msg.content });
      }
    }

    // Add the current user prompt
    messages.push({ role: "user", text: prompt });

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[AUDIENCE-AI] Generation attempt ${attempt}/${MAX_ATTEMPTS}`);

      const result = await callGemini(systemPrompt, messages, {
        maxTokens: 1024,
        temperature: 0.3,
      });

      if (result.error) {
        return new Response(JSON.stringify({ error: result.error, valid: false }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      sql = stripFences(result.text);

      // Step 5a: DML/DDL guard
      const dmlError = checkDmlDdl(sql);
      if (dmlError) {
        console.warn(`[AUDIENCE-AI] DML/DDL guard triggered: ${dmlError}`);
        validationError = dmlError;
        // Feed error back as assistant + user messages for retry
        messages.push({ role: "assistant", text: sql });
        messages.push({
          role: "user",
          text: `ERROR: ${dmlError}\n\nPlease generate ONLY a SELECT query. No INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, EXECUTE, or COPY statements.`,
        });
        continue;
      }

      // Step 5b: Syntax validation via EXPLAIN
      const { data: validateResult, error: validateError } = await supabase.rpc(
        "validate_audience_query",
        { p_query: sql },
      );

      if (validateError) {
        console.warn(`[AUDIENCE-AI] Validation RPC error (attempt ${attempt}):`, validateError);
        validationError = validateError.message;
        // Feed the Postgres error back to Gemini for retry
        messages.push({ role: "assistant", text: sql });
        messages.push({
          role: "user",
          text: `The query you generated has a PostgreSQL error:\n${validateError.message}\n\nPlease fix the query and return ONLY the corrected SQL. No markdown fences, no explanation.`,
        });
        continue;
      }

      // Check if the RPC returned an error in its result (some RPCs return {valid, error})
      if (validateResult && typeof validateResult === "object" && validateResult.valid === false) {
        console.warn(`[AUDIENCE-AI] Validation failed (attempt ${attempt}):`, validateResult.error);
        validationError = validateResult.error || "Query validation failed";
        messages.push({ role: "assistant", text: sql });
        messages.push({
          role: "user",
          text: `The query you generated has a PostgreSQL error:\n${validationError}\n\nPlease fix the query and return ONLY the corrected SQL. No markdown fences, no explanation.`,
        });
        continue;
      }

      // Validation passed!
      valid = true;
      validationError = "";
      break;
    }

    // If all attempts failed, return the error
    if (!valid) {
      return new Response(
        JSON.stringify({
          sql,
          explanation: "",
          estimatedCount: 0,
          sampleRows: [],
          valid: false,
          error: `Query validation failed after ${MAX_ATTEMPTS} attempts: ${validationError}`,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        },
      );
    }

    // ── Step 6: Get estimated count from the validation result ─────────
    let estimatedCount = 0;
    try {
      const { data: validateForCount } = await supabase.rpc("validate_audience_query", {
        p_query: sql,
      });
      if (validateForCount && typeof validateForCount === "object" && "estimated_rows" in validateForCount) {
        estimatedCount = validateForCount.estimated_rows ?? 0;
      }
    } catch (err) {
      console.error("[AUDIENCE-AI] Count estimation error:", err);
    }

    // ── Step 7: Get sample rows ────────────────────────────────────────
    let sampleRows: object[] = [];
    try {
      const { data: sampleData } = await supabase.rpc("execute_audience_query", {
        p_query: sql + " LIMIT 5",
      });
      if (Array.isArray(sampleData)) {
        sampleRows = sampleData;
      }
    } catch (err) {
      console.error("[AUDIENCE-AI] Sample rows error:", err);
    }

    // ── Generate human-readable explanation ─────────────────────────────
    let explanation = "";
    try {
      const explainResult = await callGemini(
        "You are a helpful assistant that explains SQL queries in plain English.",
        [
          {
            role: "user",
            text: `Explain in 1-2 sentences what this SQL query does in plain English for a non-technical admin: ${sql}`,
          },
        ],
        { maxTokens: 256, temperature: 0.3 },
      );
      explanation = explainResult.text || "";
    } catch (err) {
      console.error("[AUDIENCE-AI] Explanation generation error:", err);
      explanation = "Unable to generate explanation.";
    }

    // ── Return result ──────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        sql,
        explanation,
        estimatedCount,
        sampleRows,
        valid: true,
      }),
      {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      },
    );
  } catch (err: any) {
    console.error("generate-audience-query error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
