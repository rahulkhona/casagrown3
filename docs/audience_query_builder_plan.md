# AI-Powered Audience Query Builder — Design Plan

> **Status:** Planned — not yet implemented  
> **Created:** 2025-06-21  
> **Last Updated:** 2025-06-21

---

## Problem Statement

Creating audiences today requires **three separate steps across two tools**:

1. **Write a Postgres RPC function** (SQL, in a migration file) — developer-only
2. **Deploy the migration** to Supabase — developer-only
3. **Register the function** in Admin Portal → Audience Functions — admin can do this
4. **Create an audience** in Admin Portal → Audiences, selecting the registered function

Every new audience segment requires a code deployment. Admins cannot self-serve. The existing `crm_user_metadata` denormalized table only covers a subset of the data — admins need access to the **full marketplace schema** (45+ tables) with arbitrary JOINs to build audiences based on conditions they haven't anticipated yet.

---

## Solution: Conversational AI Query Builder

A single AI-powered interface where admins describe audiences in plain English and the system generates, validates, and refines SQL queries through a conversational loop.

### User Flow

1. **Admin describes** what they want in plain English
2. **AI generates SQL** + shows human-readable explanation
3. **Admin reviews** results preview (count + sample rows)
4. **Admin gives feedback** ("also exclude anyone who got an email last week", "only California")
5. **AI refines the query** — loop until the admin is happy
6. **Save as audience** — ready to use in campaigns/sequences

No visual condition builder, no raw SQL editor. Just a conversational AI interface with result previews. The SQL is generated and validated behind the scenes — the admin interacts purely through natural language.

---

## Design Principles

1. **SQL-first** — The AI generates real `SELECT` SQL against the full schema. This gives unlimited flexibility for JOINs, subqueries, aggregations, date math, etc.
2. **Self-discovering schema** — The system queries `information_schema` at runtime. When new tables or columns are added via migrations, the query builder automatically knows about them. Zero maintenance.
3. **Safety = block writes only** — No `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`. Everything else is fair game.
4. **Validated in a loop** — AI-generated SQL is validated for syntax (via `EXPLAIN`) and semantic correctness (all referenced entities exist). If invalid, feedback is sent back to the AI to fix, looping until valid (max 3 retries).
5. **Conversational refinement** — Admins refine queries through natural language feedback, not by editing SQL.

---

## Architecture

### Dynamic Schema Discovery

Instead of hardcoding table/column lists, the system discovers the schema at runtime:

```
Admin opens Audience Builder
  → RPC: get_queryable_schema()
  → Queries information_schema + pg_catalog FK metadata
  → Returns all tables, columns, types, FKs, enums
  → Cached 5 min (client-side)
  → Fed to Gemini as schema context
```

#### New Postgres Function: `get_queryable_schema()`

```sql
CREATE OR REPLACE FUNCTION get_queryable_schema()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT jsonb_build_object(
    'tables', (
      SELECT jsonb_agg(jsonb_build_object(
        'schema', t.table_schema,
        'name', t.table_name,
        'columns', (
          SELECT jsonb_agg(jsonb_build_object(
            'name', c.column_name,
            'type', c.data_type,
            'udt_name', c.udt_name,
            'is_nullable', c.is_nullable,
            'default', c.column_default,
            'description', col_description(
              (t.table_schema || '.' || t.table_name)::regclass, c.ordinal_position
            )
          ) ORDER BY c.ordinal_position)
          FROM information_schema.columns c
          WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name
        )
      ))
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name NOT LIKE 'pg_%'
    ),
    'foreign_keys', (
      SELECT jsonb_agg(jsonb_build_object(
        'source_table', kcu.table_name,
        'source_column', kcu.column_name,
        'target_table', ccu.table_name,
        'target_column', ccu.column_name,
        'constraint_name', tc.constraint_name
      ))
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    ),
    'enums', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', t.typname,
        'values', (
          SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
          FROM pg_enum e WHERE e.enumtypid = t.oid
        )
      ))
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'public' AND t.typtype = 'e'
    )
  );
$$;
```

**Why this works:**
- New tables added via migration → automatically appear
- New columns → automatically appear
- New enums → automatically appear
- Foreign keys → automatically discovered, so Gemini knows how to JOIN
- Column comments (via `COMMENT ON COLUMN`) → passed as descriptions to help Gemini understand semantics

---

### Query Generation & Validation Loop

```
Admin describes audience (natural language)
  → Edge Function: generate-audience-query
  → Build Gemini prompt with:
      • Natural language request
      • Full schema from get_queryable_schema()
      • Output format instructions
      • Previous errors (if retry)
      • Conversation history (for refinement)
  → Gemini generates SQL
  → Validation:
      1. Parse: is it SELECT-only? Block DML/DDL keywords → hard reject
      2. Syntax: EXPLAIN the query (catches bad table/column refs) → if error, feed back to Gemini
      3. Sanity: run with LIMIT 1 to verify execution → if error, feed back to Gemini
      Max 3 retries
  → Return to admin: SQL query, AI explanation, sample results, row count estimate
```

**Validation steps:**

| Step | What | How | On Failure |
|------|------|-----|------------|
| 1. DML Guard | Block write operations | Regex scan for `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `EXECUTE`, `COPY` (case-insensitive, word-boundary) | Hard reject — don't retry |
| 2. Syntax Check | Verify SQL parses and all entities exist | `EXPLAIN (FORMAT JSON) <query>` | Send Postgres error back to Gemini with instruction to fix |
| 3. Execution Test | Verify query actually runs | Execute with `LIMIT 1` wrapper | Send error back to Gemini |
| 4. Cost Check | Prevent runaway queries | Parse `EXPLAIN` output for estimated rows/cost; warn if > threshold | Warn admin, don't block |
| Max retries | Prevent infinite loops | 3 retry attempts | Return last error to admin |

---

### How Queries Execute at Campaign Send Time

```
Audience saved with SQL query string
  → Campaign send time or Preview click
  → Edge Function wraps query to extract standard audience columns
  → Executes via supabase.rpc('execute_audience_query')
  → Returns standard audience row format
  → Apply channel consent + geo filters + dedup (existing logic)
```

#### New Postgres Function: `execute_audience_query(p_query TEXT)`

```sql
CREATE OR REPLACE FUNCTION execute_audience_query(p_query TEXT)
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Defense-in-depth: block any DML/DDL
  IF p_query ~* '\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|COPY)\b' THEN
    RAISE EXCEPTION 'Query contains forbidden operation';
  END IF;

  RETURN QUERY EXECUTE p_query;
END;
$$;
```

---

## Schema Changes

### Modify `crm_audiences` table

```sql
ALTER TABLE crm_audiences
  ADD COLUMN query_sql       TEXT,            -- the SELECT query
  ADD COLUMN query_source    TEXT DEFAULT 'legacy'
                             CHECK (query_source IN ('legacy', 'ai', 'manual')),
  ADD COLUMN ai_prompt       TEXT,            -- original NL prompt (if AI-generated)
  ADD COLUMN ai_explanation  TEXT,            -- AI's explanation of what the query does
  ADD COLUMN is_dynamic      BOOLEAN NOT NULL DEFAULT false;
```

- **`query_sql`** — the actual SELECT query that produces audience rows
- **`query_source`** — how the query was created: `legacy` (existing RPC), `ai` (Gemini-generated), `manual` (hand-written SQL)
- **`ai_prompt`** — preserves the original natural language prompt for reference/re-generation
- **`ai_explanation`** — human-readable explanation of what the query does
- **`is_dynamic`** — `true` = uses `query_sql`; `false` = uses legacy `audience_rpc_name`
- **`audience_rpc_name`** remains for backward compatibility

---

## Available Schema (45+ Tables)

The AI has access to the **entire public schema** via `get_queryable_schema()`. Key table groups:

### Core Commerce
- `market_booths` — one booth per seller
- `market_products` — per-market-day product listings
- `market_orders` — individual order records (buyer → seller → product)
- `market_holds` — Stripe PaymentIntent holds

### Financial
- `market_ledger` — append-only financial event log
- `market_settlements` — one per market date
- `user_settlements` — per-user per-market-date breakdown
- `settlement_captures` — per-hold Stripe capture/release tracking
- `user_balances` — materialized balance per user
- `buyer_debts` — outstanding debts

### Product Engagement
- `product_comments` — public Q&A on products
- `product_watches` — "notify me when available"
- `product_reminders` — remind me when market opens
- `product_flags` — content moderation flags

### Users & Profiles
- `profiles` — user profiles with geo, ratings, referral, consent
- `crm_leads` — marketing leads
- `crm_user_metadata` — denormalized CRM profile (50+ columns)
- `beta_testers` — pre-launch signups
- `stripe_connect_accounts` — seller payment onboarding

### CRM & Marketing
- `crm_audiences` — audience definitions
- `crm_campaigns` — email/SMS campaigns
- `crm_campaign_sends` — per-recipient tracking
- `crm_sequences` — drip sequences
- `crm_sequence_enrollments` — sequence enrollment tracking
- `crm_promotions` — promotional offers
- `crm_promo_enrollments` — promotion enrollment

### Categories & Compliance
- `sales_categories` — product categories
- `category_restrictions` — jurisdiction-level category bans
- `quarantine_zones` — agricultural pest quarantine management
- `category_tax_rules` — per-state tax rules

### Geographic Reference
- `countries`, `states`, `cities`, `counties`, `zip_codes`, `communities`

### Social & Messaging
- `followers` — user-to-user follow relationships
- `market_followers` — booth followers
- `market_conversations`, `market_chat_messages` — DMs
- `market_blocks` — trust & safety blocks

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDD_audience_query_builder.sql` | Schema changes + new functions |
| `supabase/functions/generate-audience-query/index.ts` | AI query generation + validation loop |
| `apps/next-admin/app/(dashboard)/crm/audiences/builder/page.tsx` | Conversational audience builder page |
| `apps/next-admin/components/AudienceAIChat.tsx` | AI chat interface component |
| `apps/next-admin/components/AudiencePreview.tsx` | Results preview + snapshot |
| `apps/next-admin/lib/schemaCache.ts` | Schema caching utility |

### Modified Files
| File | Change |
|------|--------|
| `supabase/functions/send-crm-campaign/index.ts` | Handle `is_dynamic` audiences via `execute_audience_query()` |
| `apps/next-admin/app/(dashboard)/crm/audiences/page.tsx` | Add source badges, route to builder |
| `apps/next-admin/app/(dashboard)/crm/campaigns/page.tsx` | Show dynamic audiences in dropdown |
| `apps/next-admin/components/SequenceBuilder.tsx` | Show dynamic audiences in snapshot dropdown |

### Unchanged
- All existing RPC-based audiences
- `send-crm-campaign` downstream flow (filters, consent, geo targeting)
- Campaign creation flow
- Audience Functions page
- Snapshot mechanism

---

## Implementation Phases

### Phase 1 — Foundation
1. Schema migration (new columns + functions)
2. `generate-audience-query` edge function with validation loop
3. AI chat interface + preview component
4. Update `send-crm-campaign` for dynamic audiences

### Phase 2 — Polish
1. Column comments on key tables for better AI context
2. Conversational refinement (multi-turn editing)
3. Source badges on audience list
4. Query cost warnings

### Phase 3 — Future Enhancements
- Scheduled audience refresh (cron to re-estimate counts)
- Audience composition (combine/intersect/exclude saved audiences)
- Query templates (save common patterns)
- Usage analytics (which audiences are used most)
