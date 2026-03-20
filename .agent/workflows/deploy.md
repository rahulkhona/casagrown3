---
description: How to deploy changes to staging and production
---

## Deployment Rules

### 1. Database First, Then Front-End
Always push database migrations to staging **before** deploying front-end updates to Vercel. This ensures the schema/functions the front-end depends on are already in place.

// turbo-all

### 2. Backward-Compatible Changes Only
All database migrations and API changes MUST be backward-compatible:
- **Adding** new tables, columns, functions, or indexes is safe
- **Renaming** or **dropping** columns/tables is NOT safe unless the old code no longer references them
- **Changing** function signatures must keep old parameters working (use defaults)
- If a breaking change is required, do it in two steps:
  1. Deploy new code that works with both old and new schema
  2. Deploy migration that removes the old schema

### Steps

1. Push database migrations to staging:
```bash
cd /Users/rkhona/development/market/casagrown3
npx supabase db push --linked
```

2. Deploy edge functions (if any changed):
```bash
npx supabase functions deploy <function-name> --project-ref <ref>
```

3. Push code to git (triggers Vercel deployment):
```bash
git push origin main
```

4. Verify staging after both DB and front-end are live.
