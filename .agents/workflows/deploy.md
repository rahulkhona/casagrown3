---
description: How to deploy CasaGrown to staging or production (database + frontend)
---

# CasaGrown Deployment Workflow

## Supabase Projects

| Environment | Project Ref | Project Name |
|---|---|---|
| Staging | `fzdmszvfeewpwswlnfyk` | casagrown-staging |
| Production | `ampwkbyepqhvqirvejoj` | casagrown-production |

## Staging Domains
- `market-staging.casagrown.com`
- `admin-staging.casagrown.com`
- `metrics-staging.casagrown.com`
- `voice-staging.casagrown.com`

## Production Domains
- `www.casagrown.com` / `casagrown.com` / `market.casagrown.com`
- `admin.casagrown.com`
- `metrics.casagrown.com`
- `voice.casagrown.com`

---

## Deploy Steps

### 1. Push Database Migrations

Migrations must be pushed manually — Vercel does NOT deploy database changes.

```bash
# Ensure CLI is authenticated
// turbo
npx supabase projects list

# Link to target project (if not already linked)
npx supabase link --project-ref <project-ref>

# Dry run first
// turbo
npx supabase db push --dry-run --include-all --linked

# Push for real
npx supabase db push --include-all --linked
```

> **Note**: Use `--include-all` if migrations were created out of order relative to what's already on remote.

### 2. Prohibited Configuration Pushes (`config.toml`, `.env`, `.env.local`)

> [!CAUTION]
> **NEVER run `npx supabase config push`** or upload `.env` / `config.toml` files to hosted Supabase or Vercel. Hosted Auth, SMTP, and site URL settings MUST be managed via Supabase Dashboard or version-controlled SQL migrations. Refer strictly to the [`deploy-safety`](file:///.agents/skills/deploy_safety/SKILL.md) skill.

### 3. Deploy Frontend (Vercel)

Frontend deploys happen automatically on `git push origin main`. No manual steps needed.

---

## Common Issues

- **`type "geometry" does not exist`**: Add `SET search_path TO public, extensions;` at the top of any migration that uses PostGIS types.
- **Spinner on admin pages**: Usually means a table referenced in the page hasn't been migrated to the target database yet. Push migrations.
- **OTP email shows default template**: Auth config hasn't been pushed to the hosted project. Run `supabase config push`.
