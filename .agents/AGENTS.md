# Workspace Rules

- **UI Development Workflow**: Always test UI changes locally (e.g., using the dev server or local emulator) and verify their visual layout/functionality before deploying to staging or pushing to remote repositories (Vercel, GitHub, etc.).
- **Production Environment Safety**: The Supabase project `fzdmszvfeewpwswlnfyk` (labeled "staging" but is actually **production**) is the live production system. There is no separate staging environment. **Never** deploy functions, run migrations, update environment secrets, or perform data modifications on this project without explicit user consent first.

---

## Schema Documentation Rules

These rules ensure the AI audience query builder always has accurate context. The database is the single source of truth — no external docs to maintain.

### 1. Migrations: Mandatory `COMMENT ON` for every schema change

Every migration that creates or alters tables/columns **must** include corresponding `COMMENT ON` statements:

- **New tables**: `COMMENT ON TABLE <name> IS '<description>';`
  - If the table is NOT related to the next-market app (e.g., community, voice, admin-internal, infrastructure, chatbot, external integrations, points/redemption), prefix the comment with `@audience:no`. Example: `COMMENT ON TABLE growbot_rules IS '@audience:no GrowBot AI rule definitions';`
- **New columns**: `COMMENT ON COLUMN <table>.<column> IS '<description>';`
  - For JSONB columns, document the known internal key structure (see rule #3 below).
- **Altered columns** (type change, semantic change): Update the existing `COMMENT ON COLUMN`.

The `get_queryable_schema()` function reads these comments via `col_description()` and `obj_description()` and passes them to the AI. Missing comments = the AI has no context for that column.

### 2. Table scoping: `@audience:no` tag convention

Tables tagged `@audience:no` in their `COMMENT ON TABLE` are excluded from the AI query builder's schema context by `get_queryable_schema()`.

- **In-scope** (no tag): Tables related to marketplace commerce, CRM, user profiles, orders, settlements, subscriptions, product engagement, geo reference.
- **Out-of-scope** (`@audience:no`): Community chat, voice/feedback, admin config, infrastructure caches, points/redemption, GrowBot, social integrations, demo/reference data, error logging, experiment framework.

When creating a new table, decide which category it falls into and tag accordingly.

### 3. JSONB column schemas: Code-derived documentation

For every JSONB column in an in-scope table, the `COMMENT ON COLUMN` must document the known internal key structure. This is derived from analyzing the code that writes to that column.

**Format**: Document keys, value types, and query examples:
```sql
COMMENT ON COLUMN crm_leads.metadata IS 'JSONB — structure varies by source. 
Facebook: {fb_leadgen_id: string, fb_ad_id: string}. 
Calculator: {garden_size: "small"|"medium"|"large", plants: string[]}.
Query examples: metadata->>''garden_size'', metadata->''plants''';
```

**When to update JSONB comments**:
- When you modify an edge function, RPC, or application code that **writes to or reads from** a JSONB column, check if the COMMENT ON COLUMN for that JSONB column still accurately reflects the structure. If not, add a migration statement to update it.
- When adding a new key to an existing JSONB column, update the comment to include the new key.
- When adding a new JSONB column, always include a COMMENT ON COLUMN documenting its expected structure.

The runtime `get_jsonb_column_schemas()` function supplements these comments by sampling actual data, but comments are the baseline that works even on an empty database.
