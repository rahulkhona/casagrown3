---
name: codebase-leverage-first
description: Mandatory protocol before implementing any new feature, page, component, or bug fix: exhaustively analyze the existing codebase first to identify and reuse existing single sources of truth, canonical catalogs, shared utilities, hooks, types, and DB schemas. Prohibits ad-hoc local dictionaries, duplicate utilities, and synthetic fallbacks.
---

# Codebase Leverage First Skill

This skill enforces a **strict research-first architecture discipline**. Before writing a single line of code for a new feature, screen, API, or bug fix, the agent MUST survey the existing codebase to discover and leverage existing infrastructure.

---

## 1. Core Rule: Zero Ad-Hoc Duplication & Single Source of Truth

- **NEVER create local ad-hoc data dictionaries, custom catalogs, or hardcoded mock maps** when canonical catalogs or data models already exist in the codebase (e.g., `EXHAUSTIVE_INTERESTS_CATALOG`, design token palettes, category registries, shipping configurations).
- **NEVER create synthetic or local fallback data arrays in production UI code**. The UI must cleanly reflect live database state, with appropriate empty-state components if records don't exist.
- **Search before building**: Treat the codebase as an ecosystem of reusable modules. Always assume a utility, query builder, validation schema, or catalog already exists until proven otherwise.

---

## 2. Mandatory Pre-Implementation Discovery Checklist

Before creating a new file or modifying an existing feature, execute this 4-step discovery workflow:

### Step 1: Discover Canonical Data Sources & Catalogs
- Search the workspace for domain entities related to the feature (e.g. `interests`, `produce`, `booths`, `orders`, `profiles`, `quarantine`, `leads`).
- Inspect `apps/next-market/lib/`, `apps/next-admin/lib/`, `packages/app/`, and `packages/ui/` for existing constants, helper libraries, and types.
- Check if sibling screens in `next-admin` or `next-market` already implement similar visual or business logic (e.g., if building a produce demand view, first inspect how `interests-catalog` or `browse-market` resolves produce images and metadata).

### Step 2: Discover Database Schemas & RPCs
- Check `supabase/migrations/` for canonical tables, views, enum types, and triggers.
- Use `information_schema` and migration comments (`COMMENT ON TABLE`, `COMMENT ON COLUMN`) to understand exact column names, foreign keys, and JSONB keys before writing any frontend query or SQL statement.

### Step 3: Discover Shared UI Components & Design Tokens
- Reuse design tokens from `@casagrown/app/design-tokens` (colors, typography, spacing, border radii).
- Reuse shared components from `@casagrown/ui` or existing admin dashboard layouts rather than rolling custom ad-hoc styles or conflicting palette constants.

### Step 4: Reuse Existing Edge Functions & Background Services
- When handling notifications, background imports, or analytics, verify existing edge functions in `supabase/functions/` (e.g., `process-interest-digests`, `sync-lead-interests`, `send-notifications`) before introducing new processing flows.

---

## 3. Red Flags & Prohibited Anti-Patterns

| Prohibited Anti-Pattern | Required Best Practice |
|---|---|
| Hardcoding a local `MAP = { ... }` with placeholder images | Import and match against the canonical `EXHAUSTIVE_INTERESTS_CATALOG` / storage bucket assets |
| Assuming all leads are buyers or all users are sellers | Inspect the database schema, enum `interest_type`, and trigger sync functions (`sync_lead_produce_interests`) |
| Writing custom date/currency/unit formatting functions | Reuse existing formatting helpers in `packages/app/utils` or `lib/` |
| Introducing new query joins without column verification | Inspect `supabase/migrations` or DB schema first (preventing `seller_id` vs `owner_id` mistakes) |

---

## 4. Feature Completion Verification

Before submitting:
1. Verify that all imported models and catalogs resolve across monorepo workspace packages.
2. Confirm there is **zero duplication** between the new file and existing sibling modules.
3. Run automated tests (e.g. `playwright test` or `yarn test`) to verify real database bindings and visual rendering.
