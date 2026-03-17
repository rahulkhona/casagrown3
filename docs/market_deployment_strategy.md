# CasaGrown Deployment Runbook

Exact step-by-step commands and instructions for deploying market, admin, and voice apps.

---

## Prerequisites

- [ ] Company email address ready
- [ ] GitHub repo: your `casagrown3` monorepo
- [ ] Supabase CLI installed (`brew install supabase/tap/supabase`)
- [ ] Vercel CLI installed (`npm i -g vercel`)
- [ ] Domain registrar access for `casagrown.com`

---

## Step 1: Create Supabase Account & Projects

### 1.1 Create account
1. Go to https://supabase.com/dashboard
2. Sign up with your **company email**
3. Create an organization (e.g., "CasaGrown")

### 1.2 Create staging project
1. Click **New Project**
2. Name: `casagrown-staging`
3. Database password: generate and **save it securely**
4. Region: pick closest to your users (e.g., `us-west-1`)
5. Click **Create**
6. Note the **Project Reference ID** from Settings → General (looks like `abcdefghijklmnop`)

### 1.3 Create production project
1. Same steps, name: `casagrown-production`
2. Save password and reference ID separately

### 1.4 Get your access token
1. Go to https://supabase.com/dashboard/account/tokens
2. Generate a new token, name it `cli-deploy`
3. Save it — you'll need it for CLI and GitHub Actions

---

## Step 2: Push Schema & Functions to Supabase

Run these from your repo root (`/Users/rkhona/development/market/casagrown3`):

### 2.1 Push to staging

```bash
# Link to staging project
supabase link --project-ref <STAGING_REF>
# Enter your staging DB password when prompted

# Push all 100+ migrations (NOT a reset — it runs migrations incrementally)
supabase db push

# Deploy all edge functions
supabase functions deploy
```

### 2.2 Set edge function secrets on staging

```bash
supabase secrets set --project-ref <STAGING_REF> \
  STRIPE_SECRET_KEY="sk_test_..." \
  USPS_CONSUMER_KEY="..." \
  USPS_CONSUMER_SECRET="..." \
  TREMENDOUS_API_KEY="TEST_..." \
  RELOADLY_CLIENT_ID="..." \
  RELOADLY_CLIENT_SECRET="..." \
  RELOADLY_SANDBOX="true"
```

> [!WARNING]
> Use **test/sandbox keys** for ALL third-party services on staging.

### 2.3 Push to production

```bash
# Link to production project (overwrites the previous link)
supabase link --project-ref <PROD_REF>
# Enter your production DB password when prompted

# Push migrations
supabase db push

# Deploy edge functions
supabase functions deploy
```

### 2.4 Set edge function secrets on production

```bash
supabase secrets set --project-ref <PROD_REF> \
  STRIPE_SECRET_KEY="sk_live_..." \
  USPS_CONSUMER_KEY="..." \
  USPS_CONSUMER_SECRET="..." \
  TREMENDOUS_API_KEY="..." \
  RELOADLY_CLIENT_ID="..." \
  RELOADLY_CLIENT_SECRET="..." \
  RELOADLY_SANDBOX="false"
```

### 2.5 Import waitlist data from old Supabase

```bash
# Export from old project
supabase db dump --project-ref <OLD_REF> --data-only --table waitlist > waitlist_data.sql

# Import into new production project
psql "postgresql://postgres:<PROD_PASSWORD>@db.<PROD_REF>.supabase.co:5432/postgres" < waitlist_data.sql
```

> [!NOTE]
> Adjust the table name (`waitlist`) to match your actual table. If it's just a small table, you can also export as CSV from the Supabase dashboard and import via the Table Editor.

---

## Step 3: Create Vercel Account & Projects

### 3.1 Create account
1. Go to https://vercel.com/signup
2. Sign up with your **company email**
3. Connect your GitHub account
4. **Upgrade to Pro** ($20/mo) — required for 3 projects + custom domains

### 3.2 Create `casagrown-market` project
1. Click **Add New → Project**
2. Import your `casagrown3` GitHub repo
3. Configure:

| Setting | Value |
|---|---|
| **Project Name** | `casagrown-market` |
| **Framework Preset** | Next.js (auto-detected) |
| **Root Directory** | `.` (repo root — click Edit, clear default) |
| **Build Command** | `yarn workspace next-market build` |
| **Output Directory** | `apps/next-market/.next` |
| **Install Command** | `yarn set version 4 && yarn install` |

4. Add environment variables before deploying:

| Name | Value | Environment |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<STAGING_REF>.supabase.co` | Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key | Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<PROD_REF>.supabase.co` | Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production anon key | Production |

5. Click **Deploy**

### 3.3 Create `casagrown-admin` project
1. **Add New → Project** → Import same repo again
2. Configure:

| Setting | Value |
|---|---|
| **Project Name** | `casagrown-admin` |
| **Root Directory** | `.` |
| **Build Command** | `yarn build && yarn workspace next-admin build` |
| **Output Directory** | `apps/next-admin/.next` |
| **Install Command** | `yarn set version 4 && yarn install` |

> [!NOTE]
> `yarn build` first builds the shared packages (`@casagrown/app`, `@casagrown/ui`, `@casagrown/config`) that `next-admin` depends on.

3. Add same env vars (Supabase URL + anon key, scoped per environment)
4. Deploy

### 3.4 Create `casagrown-voice` project
1. Same process, configure:

| Setting | Value |
|---|---|
| **Project Name** | `casagrown-voice` |
| **Root Directory** | `.` |
| **Build Command** | `yarn build && yarn workspace next-community-voice build` |
| **Output Directory** | `apps/next-community-voice/.next` |
| **Install Command** | `yarn set version 4 && yarn install` |

2. Add env vars, deploy

---

## Step 4: Configure Domains

### 4.1 Remove domain from old Vercel account
1. Log into old Vercel account (personal email)
2. Go to project → Settings → Domains
3. Remove `casagrown.com`

### 4.2 Add domains to new Vercel projects

**In `casagrown-market` project:**
1. Settings → Domains → Add
2. Add `casagrown.com` (production)
3. Add `staging.casagrown.com` (assign to `main` branch — see Step 5)

**In `casagrown-admin` project:**
1. Add `admin.casagrown.com` (production)
2. Add `staging-admin.casagrown.com` (assign to `main` branch)

**In `casagrown-voice` project:**
1. Add `voice.casagrown.com` (production)
2. Add `staging-voice.casagrown.com` (assign to `main` branch)

### 4.3 Update DNS

Vercel will show you the required DNS records. Go to your domain registrar and set:

| Type | Name | Value |
|---|---|---|
| `A` | `@` | `76.76.21.21` |
| `CNAME` | `www` | `cname.vercel-dns.com` |
| `CNAME` | `admin` | `cname.vercel-dns.com` |
| `CNAME` | `voice` | `cname.vercel-dns.com` |
| `CNAME` | `staging` | `cname.vercel-dns.com` |
| `CNAME` | `staging-admin` | `cname.vercel-dns.com` |
| `CNAME` | `staging-voice` | `cname.vercel-dns.com` |

Alternatively, point nameservers to Vercel and it manages all records automatically.

---

## Step 5: Configure Git Branches

### 5.1 Create the production branch

```bash
git checkout main
git checkout -b production
git push origin production
```

### 5.2 Configure Vercel branch mapping

For **each** of the 3 Vercel projects:

1. Settings → Git → Production Branch → set to `production`
2. The staging domains (e.g., `staging.casagrown.com`) should be assigned to the `main` branch:
   - Settings → Domains → click the staging domain → Git Branch → type `main`

| Branch | Deploys to |
|---|---|
| `main` | `staging.casagrown.com` / `staging-admin.casagrown.com` / `staging-voice.casagrown.com` |
| `production` | `casagrown.com` / `admin.casagrown.com` / `voice.casagrown.com` |
| `feature/*` | Random preview URL (auto-generated) |

---

## Step 6: GitHub Actions CI/CD

### 6.1 Add GitHub Secrets

Go to your repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token from Step 1.4 |
| `SUPABASE_STAGING_PROJECT_REF` | Staging reference ID |
| `SUPABASE_STAGING_DB_PASSWORD` | Staging DB password |
| `SUPABASE_PROD_PROJECT_REF` | Production reference ID |
| `SUPABASE_PROD_DB_PASSWORD` | Production DB password |

### 6.2 Create workflow file

Create `.github/workflows/deploy-supabase.yml` in your repo (see below in "Files to Create" section).

---

## Step 7: Database Safety Guardrails

> [!CAUTION]
> `supabase db reset` **destroys all data**. It must NEVER run against staging or production. Here's how to prevent it.

### 7.1 Rule: Only use `supabase db push`, never `supabase db reset`

| Command | What it does | Where to use |
|---|---|---|
| `supabase db push` | Runs only **new** migrations that haven't been applied yet | ✅ Staging, ✅ Production |
| `supabase db reset` | **DROPS everything** and re-runs all migrations from scratch | ✅ Local only, ❌ NEVER remote |

The GitHub Action above only uses `db push` — it's safe by design.

### 7.2 Write backward-compatible migrations only

When you create a new migration, follow these rules:

**✅ Safe (backward-compatible):**
```sql
-- Adding a column (nullable or with default)
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date timestamptz;

-- Adding a new table
CREATE TABLE IF NOT EXISTS new_feature (...);

-- Adding an index
CREATE INDEX IF NOT EXISTS idx_name ON table_name (column);

-- Adding a new RLS policy
CREATE POLICY "..." ON table_name ...;
```

**❌ Unsafe (breaking):**
```sql
-- Dropping a column (apps still reading it will break)
ALTER TABLE products DROP COLUMN name;

-- Renaming a column (existing queries will fail)
ALTER TABLE products RENAME COLUMN name TO title;

-- Changing a column type (can lose data)
ALTER TABLE products ALTER COLUMN price TYPE integer;

-- Dropping a table
DROP TABLE products;
```

### 7.3 If you must make a breaking change, do it in two phases

**Example: renaming a column from `name` → `title`**

**Phase 1 migration (deploy first, let it bake):**
```sql
-- Add new column
ALTER TABLE products ADD COLUMN IF NOT EXISTS title text;
-- Copy data
UPDATE products SET title = name WHERE title IS NULL;
-- Add trigger to keep them in sync
CREATE OR REPLACE FUNCTION sync_name_title() RETURNS trigger AS $$
BEGIN
  NEW.title = COALESCE(NEW.title, NEW.name);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```

**Update app code**: read from `title`, write to both `name` and `title`.

**Phase 2 migration (after all apps are updated):**
```sql
-- Now safe to drop the old column
ALTER TABLE products DROP COLUMN name;
```

### 7.4 Add a pre-push hook to prevent accidental resets

Add to `.husky/pre-push`:
```bash
# Prevent accidental db reset on remote projects
if supabase status 2>/dev/null | grep -q "supabase.co"; then
  echo "ERROR: You are linked to a remote Supabase project."
  echo "Use 'supabase db push' instead of 'supabase db reset'."
fi
```

### 7.5 Enable Point-in-Time Recovery (when you upgrade to Pro)

On Supabase Pro ($25/mo per project), enable **PITR** in your production project:
- Dashboard → Settings → Database → Point-in-Time Recovery → Enable
- This lets you restore your database to any point in the last 7 days if something goes wrong

---

## Day-to-Day Workflow Summary

### Developing a new feature:
```bash
# 1. Create feature branch
git checkout main
git checkout -b feature/my-feature

# 2. If you need a schema change, create a migration locally
supabase migration new my_change_name
# Edit the generated SQL file

# 3. Test locally
supabase db reset   # SAFE — this is local only
yarn web:market     # Run market app
yarn web:admin      # Run admin app

# 4. Push and create PR into main
git push origin feature/my-feature
# Create PR on GitHub → target: main
```

### Deploying to staging:
```bash
# 1. Merge PR into main
# → Vercel auto-deploys all 3 apps to staging domains
# → GitHub Action auto-pushes migrations + functions to staging Supabase

# 2. Test on staging.casagrown.com, staging-admin.casagrown.com, etc.
```

### Promoting to production:
```bash
# 1. When staging is verified, merge main → production
git checkout production
git merge main
git push origin production
# → Vercel auto-deploys to production domains
# → GitHub Action auto-pushes migrations + functions to production Supabase
```

---

## Files to Create

### `.github/workflows/deploy-supabase.yml`

```yaml
name: Deploy Supabase

on:
  push:
    branches: [main, production]
    paths:
      - 'supabase/migrations/**'
      - 'supabase/functions/**'
      - 'supabase/config.toml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Set environment
        run: |
          if [ "${{ github.ref_name }}" = "production" ]; then
            echo "PROJECT_REF=${{ secrets.SUPABASE_PROD_PROJECT_REF }}" >> $GITHUB_ENV
            echo "DB_PASSWORD=${{ secrets.SUPABASE_PROD_DB_PASSWORD }}" >> $GITHUB_ENV
          else
            echo "PROJECT_REF=${{ secrets.SUPABASE_STAGING_PROJECT_REF }}" >> $GITHUB_ENV
            echo "DB_PASSWORD=${{ secrets.SUPABASE_STAGING_DB_PASSWORD }}" >> $GITHUB_ENV
          fi

      - name: Link project
        run: supabase link --project-ref $PROJECT_REF
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ env.DB_PASSWORD }}

      - name: Push migrations
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ env.DB_PASSWORD }}

      - name: Deploy edge functions
        run: supabase functions deploy
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### Root `vercel.json` (new file at repo root)

```json
{
  "installCommand": "yarn set version 4 && yarn install"
}
```

> [!NOTE]
> This replaces the per-app `vercel.json` files in `apps/next-admin/` and `apps/next-community/`. Since all 3 Vercel projects use Root Directory `.`, they all read this root config.
