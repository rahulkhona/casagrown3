---
name: deploy-safety
description: Mandatory rules and verification protocols for deploying database migrations, edge functions, and code to staging/production environments, strictly prohibiting config.toml and .env pushes.
---

# Deploy Safety Skill

This skill defines mandatory procedures, verification protocols, and strict prohibitions for deploying changes to live, staging, and production environments (Supabase hosted projects, Vercel, and GitHub `main`).

---

## ⛔ STRICT PROHIBITION RULES

> [!CAUTION]
> **Zero-Tolerance File & Command Blocklist:**
> 1. **NEVER run `npx supabase config push`** under any circumstances. Overwriting hosted configuration with local `config.toml` breaks site URLs, OAuth providers, and email auth redirect settings.
> 2. **NEVER push or sync `supabase/config.toml`, `.env`, `.env.local`, `.env.production`, `.env.staging`, or secret key files** to live/staging/production environments.
> 3. **NEVER run `npx supabase secrets set` or modify environment secrets** on live/staging projects without explicit, line-by-line user review and approval.
> 4. **NEVER deploy database migrations, edge functions, or schema changes** to production Supabase project `fzdmszvfeewpwswlnfyk` without prior user consent.

---

## 🛡️ Mandatory Pre-Deployment Checklist

Before performing any deployment operation, the AI agent MUST perform the following checks:

### 1. File Inspection & Secret Audit
- Check `git status` and `git diff` to ensure no `.env*` or `config.toml` files are being staged or transmitted.
- Verify that all cron jobs and database rules are declared inside version-controlled SQL migration scripts under `supabase/migrations/`, NOT in `config.toml`.

### 2. Database Migrations Protocol (`npx supabase db push`)
- **Step A**: Always execute a dry-run check first:
  ```bash
  npx supabase db push --dry-run --include-all --linked
  ```
- **Step B**: Review the pending SQL migration list with the user.
- **Step C**: Execute migration deployment only upon explicit user confirmation:
  ```bash
  npx supabase db push --include-all --linked
  ```

### 3. Edge Functions Deployment Protocol (`npx supabase functions deploy`)
- Deploy edge functions individually by name to avoid unintended overwrites:
  ```bash
  npx supabase functions deploy <function-name> --project-ref <project-ref>
  ```
- Do NOT use `--no-verify-jwt` unless explicitly authorized for public webhooks.

### 4. Frontend & Branch Deployment Protocol
- Vercel deployments trigger automatically on `git push origin main`.
- Verify clean local build (`npx next build`) and full test suite pass before pushing to `main`.
- When operating inside a Git worktree or feature branch:
  - **Preferred**: Push directly via refspec `git push origin <current-branch>:main` (avoids changing the checked-out branch).
  - **Alternative**: If checking out `main` locally (`git checkout main`), always switch back to the worktree branch (`git checkout <feature-branch>`) immediately after pushing.
