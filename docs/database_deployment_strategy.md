# Database Deployment Strategy

## Table of Contents

0. [🚀 Tonight's Deployment Runbook](#0--tonights-deployment-runbook)
1. [Initial Deployment — How It Works](#1-initial-deployment--how-it-works)
2. [Backward Compatibility Rules](#2-backward-compatibility-rules)
3. [Staging vs Production Strategy](#3-staging-vs-production-strategy)
4. [Migration Workflow](#4-migration-workflow)
5. [CI/CD Integration](#5-cicd-integration)

---

## 0. 🚀 Tonight's Deployment Runbook

> **Do this TWICE** — once for staging, once for production.
> Each environment needs its own Supabase project.

### Prerequisites

- [ ] Supabase CLI installed (`npm i -g supabase`)
- [ ] Two Supabase projects created at [supabase.com/dashboard](https://supabase.com/dashboard):
  - **Staging project** (linked to `main` branch)
  - **Production project** (linked to `release/` branch)
- [ ] Note down each project's **Project Ref** and **Database URL** (Settings → Database → Connection string → URI)

---

### STAGING — Step by Step

#### Step 1: Get your staging DB connection string

Go to your **staging** Supabase project dashboard:
- Settings → Database → Connection string → URI
- Copy the `postgresql://postgres.xxxx:password@xxxx.supabase.co:5432/postgres` string

```bash
# Save it as an env var (replace with your actual connection string)
export STAGING_DB_URL="postgresql://postgres.xxxx:YOUR_PASSWORD@xxxx.supabase.co:5432/postgres"
```

#### Step 2: Run the consolidated DDL

```bash
cd /Users/rkhona/development/market/casagrown3

# This creates all 109 tables, 165 functions, 81 indices, 33 triggers, 246 RLS policies
psql "$STAGING_DB_URL" -f docs/production_ddl.sql
```

> If you see errors about extensions not existing, enable them first in the Supabase dashboard:
> Dashboard → Database → Extensions → Enable: `postgis`, `pg_cron`, `pg_net`

#### Step 3: Baseline the migration history

```bash
# This marks all 104 existing migrations as "already applied"
psql "$STAGING_DB_URL" -f docs/baseline_migration_history.sql
```

#### Step 4: Verify it worked

```bash
# Check tables were created
psql "$STAGING_DB_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
# Expected: ~109

# Check migration history was seeded
psql "$STAGING_DB_URL" -c "SELECT count(*) FROM supabase_migrations.schema_migrations;"
# Expected: 104

# Check a key function exists
psql "$STAGING_DB_URL" -c "SELECT proname FROM pg_proc WHERE proname = 'nearby_booths';"
# Expected: nearby_booths
```

#### Step 5: Link the Supabase CLI

```bash
cd /Users/rkhona/development/market/casagrown3
supabase link --project-ref <staging-project-ref>

# Verify — this should say "no pending migrations"
supabase db push --dry-run
```

#### Step 6: Seed initial data (if needed)

```bash
# Add staff members so you can log into admin/voice/metrics apps
psql "$STAGING_DB_URL" -c "
INSERT INTO public.staff_members (email, role) VALUES
  ('your-email@example.com', 'admin')
ON CONFLICT DO NOTHING;
"

# Add platform settings
psql "$STAGING_DB_URL" -c "
INSERT INTO public.platform_settings (id, platform_fee_percent, min_order_points)
VALUES (1, 5.0, 100)
ON CONFLICT DO NOTHING;
"

# Add market settings
psql "$STAGING_DB_URL" -c "
INSERT INTO public.market_settings (id, market_open)
VALUES (1, true)
ON CONFLICT DO NOTHING;
"
```

#### Step 7: Deploy the apps (pointing to staging Supabase)

Update each app's `.env.local` (or Vercel/hosting environment variables):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<staging-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
```

Then deploy:
- Market app (port 3001)
- Voice app (port 3002)
- Admin app (port 3003)
- Metrics app (port 3004)

---

### PRODUCTION — Step by Step

> **Repeat the exact same Steps 1–7 above**, but:
> - Use the **production** Supabase project's DB URL and project ref
> - Use the **`release/v0.1`** branch (create it first: `git checkout -b release/v0.1 main`)
> - Point app environment variables to the production Supabase URL/key

---

### After Both Are Set Up — What Happens Next?

From this point forward, the workflow is:

```
Developer writes new migration file
     │
     ▼
git push to main ──────► supabase db push on STAGING (auto)
     │
     ▼ (when ready for release)
Cherry-pick to release/vX.Y ──► supabase db push on PRODUCTION (manual approval)
```

**You never run the DDL or baseline scripts again.** New migrations are applied incrementally by `supabase db push`.

---

## 1. Initial Deployment — How It Works

### Why the consolidated DDL approach?

Supabase tracks which migrations have been applied via its `supabase_migrations.schema_migrations` table. If you link a fresh Supabase project to this repo, `supabase db push` would try to run all 104 migration files sequentially — which is slow, fragile, and may hit ordering conflicts.

Instead, we:
1. **Run a single DDL** (`docs/production_ddl.sql`) that creates the final schema state
2. **Baseline the history** (`docs/baseline_migration_history.sql`) so Supabase thinks all 104 migrations already ran
3. **Future migrations** apply cleanly via `supabase db push` from that point

### Files

| File | Purpose |
|---|---|
| `docs/production_ddl.sql` (9,030 lines) | Creates all tables, functions, indices, triggers, RLS |
| `docs/baseline_migration_history.sql` (215 lines) | Marks 104 migrations as "already applied" |

---

## 2. Backward Compatibility Rules

### Golden Rule: Never Break Running Applications

Since your apps can't all be redeployed simultaneously with the database, the DB schema must always be compatible with both the **current** and **previous** app versions.

### What is ALLOWED ✅

| Change | Why It's Safe |
|---|---|
| `ADD COLUMN ... DEFAULT x` | Old app ignores it; new app uses it |
| `CREATE TABLE` | Old app doesn't reference it |
| `CREATE INDEX` | Transparent to application code |
| `CREATE FUNCTION` / `CREATE OR REPLACE FUNCTION` | Old app doesn't call new functions |
| `CREATE POLICY` | Additive security — won't break reads/writes |
| `ALTER TABLE ... ADD CONSTRAINT` (deferred/check) | Won't break existing data patterns |
| `CREATE TYPE ... AS ENUM` | New type, old app doesn't know about it |
| `ALTER TYPE ... ADD VALUE` | Adds enum variant, existing values unchanged |

### What is FORBIDDEN ❌

| Change | Why It Breaks Things | What To Do Instead |
|---|---|---|
| `DROP TABLE` | Old app still queries it | Mark table as deprecated, remove after 2 releases |
| `DROP COLUMN` | Old app still reads it | Add `_deprecated` suffix, stop writing, remove in 2 releases |
| `ALTER COLUMN ... TYPE` | Data type change breaks queries | Add new column, backfill, switch app, drop old later |
| `ALTER COLUMN ... SET NOT NULL` (on existing nullable) | Old app may insert NULLs | Add DEFAULT first, backfill NULLs, then add constraint |
| `ALTER COLUMN ... DROP DEFAULT` | Old app relies on default | Never remove defaults |
| `RENAME TABLE` | Old app uses old name | Create a VIEW with old name as alias |
| `RENAME COLUMN` | Old app uses old name | Add new column + trigger to sync, drop old later |
| `DROP FUNCTION` | Old app may call it | Deprecate, replace body with compat shim, remove in 2 releases |
| `DROP INDEX` | May cause performance regression | Only drop after verifying query plans |
| `ALTER TYPE ... RENAME VALUE` | Breaks enum comparisons | Add new value, migrate data, remove old in 2 releases |

### Enforcing This: Pre-commit Migration Linter

Add a pre-commit hook check that scans new migration files:

```bash
# Add to .husky/pre-commit after the vitest checks

echo "🔍 Checking migration safety..."
UNSAFE_PATTERNS="DROP TABLE|DROP COLUMN|ALTER.*TYPE|RENAME TABLE|RENAME COLUMN|DROP FUNCTION|DROP INDEX|DROP POLICY"

for f in $(git diff --cached --name-only -- 'supabase/migrations/*.sql'); do
  if grep -qiE "$UNSAFE_PATTERNS" "$f"; then
    echo "❌ UNSAFE migration detected in $f:"
    grep -niE "$UNSAFE_PATTERNS" "$f"
    echo ""
    echo "If this is intentional (e.g., part of a 2-release deprecation cycle),"
    echo "add '-- SAFE: <reason>' on the same line to suppress this check."
    # Check if each flagged line has a SAFE annotation
    while IFS= read -r line; do
      if echo "$line" | grep -qiE "$UNSAFE_PATTERNS" && ! echo "$line" | grep -qi "SAFE:"; then
        echo "❌ Blocking commit. Add '-- SAFE: <reason>' annotation or fix the migration."
        exit 1
      fi
    done < "$f"
  fi
done
echo "✅ Migration safety check passed"
```

### Deprecation Lifecycle (2-Release Cycle)

```
Release N:   Add new column/table, start writing to both old + new
Release N+1: App only reads new column. Old column annotated -- DEPRECATED
Release N+2: Migration to DROP old column with "-- SAFE: deprecated in N, removed in N+2"
```

---

## 3. Staging vs Production Strategy

### Branch Model

```
main (staging) ──────●──────●──────●──────●──────●─────
                      \                    \
                       \                    \
release/v0.1 (prod) ───●────●               \
                                              \
release/v0.2 (prod) ──────────────────────────●────●
```

### Database Environments

| Environment | Branch | Supabase Project | Purpose |
|---|---|---|---|
| **Local dev** | any | Local Docker (`supabase start`) | Development + testing |
| **Staging** | `main` | Staging Supabase project | Pre-alpha testing, QA |
| **Production** | `release/vX.Y` | Production Supabase project | Live users |

### Migration Flow

```
Developer writes migration
        │
        ▼
┌─────────────────┐
│  Local dev DB   │  ← supabase db reset (runs all migrations)
│  (Docker)       │  ← Tests: pgTAP, Playwright, vitest
└────────┬────────┘
         │ git push to main
         ▼
┌─────────────────┐
│  Staging DB     │  ← supabase db push --linked (applies new migrations)
│  (Supabase)     │  ← Staging apps auto-deploy, QA testing
└────────┬────────┘
         │ cherry-pick / merge to release/vX.Y
         ▼
┌─────────────────┐
│  Production DB  │  ← supabase db push --linked (applies new migrations)
│  (Supabase)     │  ← AFTER production app deploy
└─────────────────┘
```

### Key Rules

#### Rule 1: Migrations go forward only

Never edit a migration file after it has been pushed to `main`. If you need to fix a mistake, create a new migration that corrects it.

#### Rule 2: Deploy database BEFORE app (for additive changes)

Since we only allow additive changes (new columns, tables, functions), the DB can always be updated before the app. The old app simply ignores the new objects.

```
Step 1: supabase db push   (adds new columns/tables/functions)
Step 2: Deploy new app      (uses the new columns/tables/functions)
```

#### Rule 3: Staging is always ahead of Production

Migrations always flow: `dev → staging → production`. Never apply a migration to production without it first running on staging.

#### Rule 4: Release branch cherry-picks migrations

When cutting a release:

```bash
# Create release branch from main
git checkout -b release/v0.2 main

# OR cherry-pick specific migrations into existing release
git cherry-pick <commit-with-migration>
```

#### Rule 5: One migration per feature/PR

Each PR that needs schema changes should have exactly one migration file. This makes cherry-picking clean.

### Practical Commands

```bash
# === LOCAL DEV ===
supabase start                              # Start local DB
supabase db reset                           # Reset + run all migrations
supabase migration new my_feature           # Create new migration file

# === STAGING (main branch) ===
supabase link --project-ref <staging-ref>
supabase db push                            # Apply pending migrations

# === PRODUCTION (release branch) ===
git checkout release/v0.1
supabase link --project-ref <prod-ref>
supabase db push                            # Apply only migrations in this branch
```

---

## 4. Migration Workflow

### Writing a New Migration

```bash
# 1. Create the migration file
supabase migration new add_wishlist_table

# 2. Write SQL (additive only!)
#    File: supabase/migrations/20260319000000_add_wishlist_table.sql
```

```sql
-- supabase/migrations/20260319000000_add_wishlist_table.sql

-- New table (safe: additive)
CREATE TABLE public.wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.market_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

-- Index (safe: transparent)
CREATE INDEX idx_wishlists_user ON public.wishlists(user_id);

-- RLS (safe: additive)
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own wishlists"
  ON public.wishlists FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

```bash
# 3. Test locally
supabase db reset    # Full reset with new migration
npm run test         # Run all tests

# 4. Commit and push
git add supabase/migrations/20260319000000_add_wishlist_table.sql
git commit -m "feat: add wishlists table"
git push origin main   # → auto-applies to staging
```

### Deprecation Migration Example

```sql
-- supabase/migrations/20260320000000_deprecate_old_orders.sql

-- Step 1 of 2-release deprecation cycle for public.orders table
-- The market app now uses public.market_orders exclusively.
-- This migration adds a deprecation marker. The table will be removed
-- in release v0.3 after confirming no references remain.

COMMENT ON TABLE public.orders IS 'DEPRECATED: Use market_orders. Removal planned for v0.3';

-- Add a view so any lingering references still work
CREATE OR REPLACE VIEW public.legacy_orders AS
  SELECT * FROM public.orders;
```

---

## 5. CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/db-push.yml
name: Database Push

on:
  push:
    branches: [main]
    paths: ['supabase/migrations/**']

jobs:
  push-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      
      - name: Link to staging
        run: supabase link --project-ref ${{ secrets.STAGING_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      
      - name: Push migrations
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

  # Production push is manual or triggered by release branch
  push-production:
    if: startsWith(github.ref, 'refs/heads/release/')
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      
      - name: Link to production
        run: supabase link --project-ref ${{ secrets.PROD_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      
      - name: Push migrations
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### Pre-commit Safety Check Summary

Add to `.husky/pre-commit`:

```bash
# Migration backward-compatibility check
UNSAFE_OPS="DROP TABLE|DROP COLUMN|ALTER.*SET DATA TYPE|ALTER.*TYPE.*USING|RENAME TABLE|RENAME COLUMN|DROP FUNCTION|DROP INDEX"
STAGED_MIGRATIONS=$(git diff --cached --name-only -- 'supabase/migrations/*.sql' 2>/dev/null)

if [ -n "$STAGED_MIGRATIONS" ]; then
  echo "🔍 Checking migration backward compatibility..."
  for f in $STAGED_MIGRATIONS; do
    VIOLATIONS=$(grep -niE "$UNSAFE_OPS" "$f" | grep -v "SAFE:" || true)
    if [ -n "$VIOLATIONS" ]; then
      echo "❌ Potentially unsafe migration in $f:"
      echo "$VIOLATIONS"
      echo "Add '-- SAFE: <reason>' comment to suppress, or use the 2-release deprecation cycle."
      exit 1
    fi
  done
  echo "✅ Migration safety check passed"
fi
```

---

## Quick Reference Card

| Question | Answer |
|---|---|
| **First deploy?** | Run `docs/production_ddl.sql`, then baseline migration history |
| **New migration?** | `supabase migration new name`, write additive SQL only |
| **Can I DROP?** | Only with `-- SAFE:` annotation after 2-release deprecation |
| **Staging deploy?** | Auto on push to `main` via `supabase db push` |
| **Production deploy?** | Manual approval on push to `release/vX.Y` |
| **Migration ordering?** | Timestamp-based, never edit after push to `main` |
| **Fix a mistake?** | Create a new migration that corrects it |
| **DB before or after app?** | DB first (additive changes are safe before app knows about them) |
