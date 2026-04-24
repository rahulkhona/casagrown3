# CasaGrown Deployment Guide

## Table of Contents

0. [🚀 Deployment Runbook](#0--deployment-runbook)
1. [Initial Deployment — How It Works](#1-initial-deployment--how-it-works)
2. [Backward Compatibility Rules](#2-backward-compatibility-rules)
3. [Staging vs Production Strategy](#3-staging-vs-production-strategy)
4. [Migration Workflow](#4-migration-workflow)
5. [CI/CD Integration](#5-cicd-integration)
6. [Vercel Configuration (Frontend)](#6-vercel-configuration-frontend)
7. [Supabase Secrets (Edge Functions)](#7-supabase-secrets-edge-functions)
8. [Webhook Infrastructure](#8-webhook-infrastructure)
9. [Cron Jobs Reference](#9-cron-jobs-reference)
10. [GitHub Configuration (CI/CD)](#10-github-configuration-cicd)
11. [Production Health Monitoring](#11-production-health-monitoring)

---

## 0. 🚀 Tonight's Deployment Runbook

> **Do this TWICE** — once for staging, once for production.
> Each environment needs its own Supabase project.

### Prerequisites

- [ ] Supabase CLI installed (`npm i -g supabase`)
- [ ] Two Supabase projects created at [supabase.com/dashboard](https://supabase.com/dashboard):
  - **Staging project** (linked to `main` branch)
  - **Production project** (linked to `production` branch)
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
> - Use the **`production`** branch
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
git merge main into production ──► supabase db push on PRODUCTION (manual approval)
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
         │ merge to production
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

When promoting to production:

```bash
# Merge main into production
git checkout production
git merge main
git push origin production

# Tag the release for tracking
git tag v0.2.0
git push origin v0.2.0
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

# === PRODUCTION (production branch) ===
git checkout production
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

## 6. Vercel Configuration (Frontend)

These variables must be added to your Vercel Project Settings. They expose public keys and routing configuration to the Next.js `apps/next-market` application.

| Variable Name | Purpose | Example / Where to find |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Connects Next.js to your Supabase instance. | `https://[PROJECT_ID].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key for Supabase Auth and Row Level Security. | Supabase Dashboard -> Project Settings -> API |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Enables Stripe Elements (credit card inputs/Apple Pay). | `pk_test_...` or `pk_live_...` from Stripe Dashboard |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key for browser Push Notifications. | `BNekJ12j-POg5NswygqWO1iCZjKx8ErjnJd35smwv1ST9mKXWV3v-8AgJ96DmD9nbgPbfMHtCeKe6_tjXVtEzCs` |
| `NEXT_PUBLIC_ENABLE_PHONE_VERIFICATION`| Feature flag for Twilio OTP flows. | `true` or `false` |

---

## 7. Supabase Secrets (Edge Functions)

These secrets securely power your Edge Functions. They MUST NOT be exposed to the frontend. Add them using the Supabase CLI (`supabase secrets set KEY="value"`) or the Supabase Cloud Dashboard.

### A. Financial Integrity (Payments, Donations & Cashouts)
| Secret | Purpose | Source |
| :--- | :--- | :--- |
| `STRIPE_SECRET_KEY` | Processes payments and platform fees. | Stripe Dashboard -> API Keys (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Cryptographically verifies incoming Stripe payloads. | Stripe Dashboard -> Webhooks (`whsec_...`) |
| `PAYPAL_CLIENT_ID` | OAuth Client ID for PayPal checkouts (No `test_` or `live_` prefix—verify in dashboard). | PayPal Developer Dashboard |
| `PAYPAL_SECRET` | OAuth Secret for PayPal transactions. | PayPal Developer Dashboard |
| `PAYPAL_BASE_URL` | Routing target (`api-m.paypal.com` vs `api-m.sandbox.paypal.com`). Dictates Sandbox vs Live! | PayPal Developer Dashboard |
| `PAYPAL_ENABLED` | Feature flag to actively show PayPal checkout to users. | `true` or `false` |
| `GLOBALGIVING_API_KEY` | Authenticates donations to agricultural non-profits at checkout.| GlobalGiving API Dashboard |
| `GLOBALGIVING_SANDBOX` | Points GlobalGiving to sandbox vs production. | `true` or `false` |
| `ZIPTAX_API_KEY` | Calculates dynamic interstate sales tax for botanical orders. | ZipTax Dashboard -> API Keys |
| `TREMENDOUS_API_KEY` | Issues digital gift cards/VISA debit for US cashouts. | Tremendous Dashboard |
| `RELOADLY_CLIENT_ID` | OAuth Client ID for Global (Mexico/Canada) cashouts. | Reloadly API Dashboard |
| `RELOADLY_CLIENT_SECRET` | OAuth Secret for Global cashouts. | Reloadly API Dashboard |
| `RELOADLY_SANDBOX` | Points Reloadly to sandbox vs production. | `true` or `false` |

### B. Trust & Safety (Identity & Location)
| Secret | Purpose | Source |
| :--- | :--- | :--- |
| `TWILIO_ACCOUNT_SID` | Core Twilio account credential. | Twilio Console |
| `TWILIO_AUTH_TOKEN` | Twilio authorization token. | Twilio Console |
| `TWILIO_VERIFY_SERVICE_SID` | Specifically points to your Twilio Verify service for OTPs. | Twilio Console -> Verify Service |
| `TWILIO_FROM_NUMBER` | The actual Twilio phone number used for sending standard SMS messages. | Twilio Console -> Phone Numbers |
| `TWILIO_WEBHOOK_SECRET` | Webhook security string (Generated: `twsec_8f92a4b1c7d3e6f5g8h0j2k4l6m8n9p1`). | Developer generated |
| `ENABLE_PHONE_VERIFICATION` | Feature flag that enables `send-phone-otp` Edge Function to process OTP requests. Must be `true` for phone verification to work. Without it, the function returns 503. | `true` or `false` |
| `USPS_CONSUMER_KEY` | Geocodes and validates physical agricultural addresses. | USPS Web Tools API |
| `USPS_CONSUMER_SECRET`| Authenticates USPS Web Tools API. | USPS Web Tools API |

### C. Communications (Push & Email)
| Secret | Purpose | Source |
| :--- | :--- | :--- |
| `POSTMARK_SERVER_TOKEN` | Transactional router (Receipts, Welcome emails). | Postmark -> Primary Server -> API Tokens |
| `POSTMARK_BROADCAST_TOKEN`| Core Broadcast routing (Daily Grower Digest). | Postmark -> Broadcast Server -> API Tokens |
| `POSTMARK_MESSAGE_STREAM` | Outbound stream routing identifier. | Usually `outbound` |
| `VAPID_PUBLIC_KEY` | Supabase-side public key (matches Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY`). | `BNekJ12j-POg5NswygqWO1iCZjKx8ErjnJd35smwv1ST9mKXWV3v-8AgJ96DmD9nbgPbfMHtCeKe6_tjXVtEzCs` |
| `VAPID_PRIVATE_KEY` | Cryptographic signer for Web Push. **Never expose to frontend.** | `L4MTDJ2gTMbt3eKSmjF5ZEeWm_btAMfDQxG2NDNUocE` |
| `VAPID_SUBJECT` | Admin contact for VAPID protocol. | `mailto:support@casagrown.com` |

### D. Artificial Intelligence (CasaBot & Moderation)
| Secret | Purpose | Source |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | AI Vision analysis for verifying product photos. | Google Cloud Platform / Vertex AI |
| `OPENROUTER_API_KEY` | Fallback routing for Multi-LLM model engines. | OpenRouter Dashboard |
| `AI_MODEL` | Explicitly binds the model engine. | e.g. `gemma-4-31b-it` |

### E. App Configuration URLs
| Secret | Purpose | Source |
| :--- | :--- | :--- |
| `SITE_URL` | Used dynamically to format link anchors in password reset emails. | e.g. `https://casagrown.com` |
| `MARKET_APP_URL` | Used to deeply link flagging/moderator notifications. | e.g. `https://market.casagrown.com` |

### F. Supabase Vault Secrets (Required for Cron Jobs & DB Triggers)

> [!IMPORTANT]
> Database triggers and cron jobs call Edge Functions via `pg_net` from **inside Postgres**. They cannot access Edge Function environment variables — they resolve the URL and auth key from **Supabase Vault** at runtime.

These secrets must be created **once per environment** (staging, production) via the Supabase SQL Editor or CLI. They are **not needed locally** — local dev falls back to the hardcoded `supabase-demo` JWT automatically.

| Vault Secret Name | Purpose | Example Value |
| :--- | :--- | :--- |
| `edge_functions_base_url` | Base URL for all Edge Function HTTP calls from DB triggers. | `https://[PROJECT_ID].supabase.co/functions/v1` |
| `service_role_key` | Service role JWT for authenticating DB-to-Edge-Function calls. | `eyJ...` (from Supabase Dashboard → API → service_role) |

**How to create (run once per environment):**

```sql
-- Via Supabase Dashboard → SQL Editor, or via CLI:
-- npx supabase db execute --db-url "postgres://..." -c "<SQL>"

SELECT vault.create_secret(
  'https://[PROJECT_ID].supabase.co/functions/v1',
  'edge_functions_base_url'
);

SELECT vault.create_secret(
  'eyJ...your-service-role-key...',
  'service_role_key'
);
```

**Helper functions** (created in migration `20260425000100`):
- `get_edge_fn_base_url()` — resolves the Edge Function URL at runtime
- `get_service_role_key()` — resolves the service role JWT at runtime
- `edge_fn_headers()` — returns `{"Content-Type": "application/json", "Authorization": "Bearer <key>"}` for use in `net.http_post()` calls

**Resolution chain** (used by all three helpers):
1. `current_setting('app.settings.*')` — PG runtime config (rarely used)
2. `vault.decrypted_secrets` — **primary method on staging/production**
3. Hardcoded local fallback — only reached in local Docker dev

> [!WARNING]
> If these Vault secrets are missing on staging/production, **all cron-driven edge function calls and DB-triggered notifications** (welcome emails, order status emails, push notifications, SMS, settlement captures) will **fail silently**. The triggers have `EXCEPTION WHEN OTHERS` guards so they won't break transactions, but no work will be performed.

> [!CAUTION]
> **Never use `format()` to bake URLs into cron schedules.** The URL must be resolved at execution time via `get_edge_fn_base_url()`. Using `format()` evaluates the vault query once at migration time — if the secret doesn't exist yet, it permanently bakes in the localhost fallback.

---

## 8. Webhook Infrastructure

> [!WARNING]
> **CRITICAL DEPLOYMENT GOTCHA**: All Edge Functions default to requiring a valid Supabase User JWT. Since external services (PayPal, Stripe, etc.) do not have User JWTs, they will receive a `401 Unauthorized` error from the API Gateway before the code even executes.
>
> You **MUST** ensure all webhooks are listed in your `supabase/config.toml` file with `verify_jwt = false`.
>
> If you deploy a new webhook without adding it to `config.toml`, you must manually bypass it during deployment: `supabase functions deploy [function_name] --no-verify-jwt`.

To keep Supabase completely synchronized with external physical world events, you must log into the dashboard of the following third parties and point their webhooks to your Supabase Edge Functions.

### A. Stripe Webhook
*   **Destination URL**: `https://[YOUR_SUPABASE_PROJECT].supabase.co/functions/v1/stripe-webhook`
*   **Events**: `checkout.session.completed` (Fulfills orders after cash capture), `account.updated` (Updates merchant KYC onboarding status).

### B. PayPal / Venmo Webhook
*   **Destination URL**: `https://[YOUR_SUPABASE_PROJECT].supabase.co/functions/v1/webhook-paypal`
*   **Events**: `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `PAYMENT.PAYOUTS-ITEM.FAILED` (Synchronizes PayPal & Venmo cashout statuses with your DB).

### C. Tremendous Webhook (US Gift Cards / Cashouts)
*   **Destination URL**: `https://[YOUR_SUPABASE_PROJECT].supabase.co/functions/v1/webhook-tremendous`
*   **Events**: `rewards.completed`, `rewards.failed` (Notifies user and releases escrow if failed).

### D. Reloadly Webhook (Global Cashouts)
*   **Destination URL**: `https://[YOUR_SUPABASE_PROJECT].supabase.co/functions/v1/webhook-reloadly`
*   **Events**: `transaction.success`, `transaction.failed` (Handles async Global/LatAm redemption resolutions).

### E. Twilio Status Webhook (Optional but Recommended)
*   **Destination URL**: `https://[YOUR_SUPABASE_PROJECT].supabase.co/functions/v1/webhook-twilio?secret=twsec_8f92a4b1c7d3e6f5g8h0j2k4l6m8n9p1`
*   **Events**: "A MESSAGE COMES IN" (Handles STOP/START SMS replies to update user's `twilio_blocked` boolean).

---

## 9. Cron Jobs Reference

### Edge Function Cron Jobs (use vault for URL + auth)

| Job Name | Schedule (UTC) | PDT Equivalent | Edge Function | Purpose |
|---|---|---|---|---|
| `daily-market-settlement` | `59 6 * * *` | 11:59 PM | *(SQL only)* | Settle completed orders |
| `execute-settlement-captures` | `5 7 * * *` | 12:05 AM | `/execute-settlement-captures` | Capture Stripe holds |
| `retry-settlement-captures` | `0 */4 * * *` | Every 4h | `/execute-settlement-captures` | Safety net for missed captures |
| `daily-settlement-digest` | `0 15 * * *` | 8:00 AM | `/market-cron` | Settlement receipt emails |
| `daily-grower-digest` | `0 17 * * *` | 10:00 AM | `/market-cron` | Grower digest emails |
| `casabot-starter-post` | `0 14 * * *` | 7:00 AM | `/casabot-starter-post` | Daily community starter |
| `casabot-auto-reply` | `*/5 * * * *` | Every 5 min | `/casabot-auto-reply` | Bot auto-replies |
| `enrich-communities` | `30 4 * * *` | 9:30 PM | `/enrich-communities` | Community data enrichment |
| `send-market-reminders` | `*/5 * * * *` | Every 5 min | `/send-market-reminders` | Market day reminders |
| `refresh-donation-projects` | `5 0 * * *` | 5:05 PM | `/fetch-donation-projects` | Donation project cache |
| `refresh-giftcard-catalog` | `0 0 * * *` | 5:00 PM | `/fetch-gift-cards` | Gift card cache |
| `execute-auto-payouts` | `30 0 * * *` | 5:30 PM | `/execute-auto-payouts` | Auto payout execution |
| `process-redemptions` | `*/15 * * * *` | Every 15 min | `/process-redemptions` | Redemption processing |
| `reconcile-redemptions` | `*/5 * * * *` | Every 5 min | `/market-cron` | Redemption reconciliation |

### Pure SQL Cron Jobs (no external URL)

| Job Name | Schedule | Purpose |
|---|---|---|
| `abandoned-onboarding-job` | `0 * * * *` | Process abandoned onboarding |
| `auto-complete-orders` | `*/5 * * * *` | Auto-complete delivered orders |
| `cleanup-expired-product-watches` | `0 4 * * *` | Clean expired watches |
| `cleanup-old-market-notifications` | `0 3 * * *` | Purge old notifications |
| `cleanup-old-sms-logs` | `0 4 * * *` | Purge old SMS logs |
| `cleanup-sms-rate-limits` | `0 * * * *` | Purge old rate limits |
| `credit-expiry-reminders` | `0 16 * * *` | Credit expiry reminders |
| `market_close_dow_6` | `0 18 * * 6` | Close Saturday market |
| `market_open_ping_dow_6` | `0 9 * * 6` | Saturday open notification |
| `market_prep_ping_dow_6` | `0 17 * * 5` | Friday prep notification |
| `process_recurring_incentives` | `0 0 * * *` | Process recurring credits |
| `purge-stale-push-subscriptions` | `0 8 * * 0` | Purge old push subs |

### Adding a New Cron Job

Always use the helper functions for edge function calls:

```sql
PERFORM cron.schedule('my-new-job', '0 12 * * *',
  $cmd$
  SELECT net.http_post(
    url := get_edge_fn_base_url() || '/my-edge-function',
    headers := edge_fn_headers(),
    body := '{"key": "value"}'::jsonb
  )
  $cmd$
);
```

**Never** use `format()` to bake URLs at schedule creation time — it will resolve to localhost on fresh deployments.

---

## 10. GitHub Configuration (CI/CD)

If you are running the `quarantine-bot` or Playwright regression suites natively in GitHub actions, you only need to ensure GitHub has access to a dedicated staging environment so it does not corrupt Production.

| Secret | Purpose |
| :--- | :--- |
| `SUPABASE_URL` | Staging Supabase URL for E2E tests. |
| `SUPABASE_ANON_KEY` | Staging Anon Key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Allows Github to seed database and wipe tables. |

*(Note: Vercel automatically deploys pushes to Git `main`. You do not need explicit GitHub Action workflow keys for Next.js since Vercel automatically assumes authority).*

---

## 11. Production Health Monitoring

You can proactively scan the database for failed payouts, unresolved escalations, and critical errors without having to manually dig through tables.

### A. The Audit Script
Run the built-in audit script from your terminal:
```bash
SUPABASE_SERVICE_ROLE_KEY="[YOUR_SERVICE_KEY]" npx tsx scripts/audit-production-errors.ts
```

### B. Finding your `SUPABASE_SERVICE_ROLE_KEY`
This key acts as the master password to your database, bypassing all Row Level Security. **Never commit it to your repository or expose it to the frontend.**

To find your remote key:
1. Log into your **Supabase Dashboard** and select your project.
2. Click the **Project Settings** (gear icon) in the bottom left.
3. Click **API** under Configuration.
4. Under the **Project API keys** section, look for the key labeled `service_role` and `secret`.
5. Click the eye icon to reveal and copy it.

