---
description: How to deploy all migrations and configure a new Supabase + Vercel environment (e.g. production)
---

# Deploy to New Environment

Use this workflow when pointing the apps at a **new Supabase project** (e.g. switching from staging to production).

## Prerequisites

Gather from the Supabase Dashboard (Settings → API Keys):
- **Project URL**: `https://<ref>.supabase.co`
- **Project Ref**: the `<ref>` portion
- **Publishable Key**: `sb_publishable_...`
- **Secret Key**: `sb_secret_...`
- **DB Password**: from project creation

---

## 1. Link Supabase CLI to the Target Project

```bash
supabase link --project-ref <PROJECT_REF>
```

Verify:
```bash
cat supabase/.temp/project-ref
# Should output: <PROJECT_REF>
```

## 2. Push All Migrations

```bash
echo "y" | supabase db push --include-all
```

> [!IMPORTANT]
> Migration `20260318960000_fix_database_permissions.sql` grants proper
> PostgreSQL GRANTs to `anon`, `authenticated`, and `service_role` roles.
> Without this, ALL API queries will fail with `permission denied`.

Verify data landed:
```bash
curl -s \
  -H "apikey: <PUBLISHABLE_KEY>" \
  -H "Authorization: Bearer <PUBLISHABLE_KEY>" \
  "https://<PROJECT_REF>.supabase.co/rest/v1/sales_categories?select=name"
```

## 3. Update Vercel Environment Variables

For **each** Vercel project (admin, market, metrics, community-voice):

```bash
cd apps/<app-dir>
rm -rf .vercel
vercel link --project casagrown3-<app> --yes

# Set/update for each environment (production, preview, development):
vercel env rm NEXT_PUBLIC_SUPABASE_URL <env> --yes
vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY <env> --yes
vercel env rm SUPABASE_SERVICE_ROLE_KEY <env> --yes

echo "https://<PROJECT_REF>.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL <env>
echo "<PUBLISHABLE_KEY>" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY <env>
echo "<SECRET_KEY>" | vercel env add SUPABASE_SERVICE_ROLE_KEY <env>
```

> [!CAUTION]
> Use the **new** `sb_publishable_*` and `sb_secret_*` keys, NOT legacy JWT keys.
> Legacy `anon`/`service_role` JWT keys are deprecated (sunset Oct 2025).

### Vercel Projects ↔ App Directories

| Vercel Project | App Directory |
|---|---|
| `casagrown3-admin` | `apps/next-admin` |
| `casagrown3-market` | `apps/next-market` |
| `casagrown3-metrics` | `apps/next-metrics` |
| `casagrown3-next-community-voice` | `apps/next-community-voice` |

### Market-specific env vars (also needed):
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Stripe payments
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — Push notifications

## 4. Trigger Redeployment

```bash
git commit --allow-empty -m "chore: trigger redeploy for new environment" && git push
```

## 5. Verify

- Open the admin dashboard and check:
  - [ ] Sales Categories (9 categories)
  - [ ] Tax Rules (51+ state entries)
  - [ ] Methods (4 redemption methods + instruments)
  - [ ] Market Availability (NY, HI blocked)
  - [ ] Market Settings (Saturday 8-11am)
  - [ ] Product Restrictions (215+ blocked products)

## Seeded Data Summary

| Data | Migration | Count |
|---|---|---|
| US States | `20260311000100_seed_all_us_states` | 51 (50 + DC) |
| Categories | `20260318910000_consolidate_categories` | 9 |
| Produce Tax Rules | `20260318920000_seed_produce_tax_rules` | 51 |
| Blocked Products | `20260318930000_seed_blocked_products` | 215 |
| Market Hours + 1099-K + State Blocks | `20260318940000_production_settings` | Saturday 8-11am, NY/HI blocked |
| Redemption Methods | `20260318950000_ensure_redemption_methods` | 4 methods, 4 instruments |
| DB Permissions | `20260318960000_fix_database_permissions` | GRANTs for API roles |
| Platform Fee (10% USA) | `20260227195508_platform_fees` | 1 |
| Post Type Policies | `20260211000000_post_type_policies` | 5 |
