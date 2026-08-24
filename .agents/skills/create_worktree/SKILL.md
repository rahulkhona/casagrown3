---
name: create-worktree
description: Automates the creation and end-to-end bootstrapping of Git worktrees, ensuring all .env files, credentials, node_modules dependencies, and Playwright browsers are properly copied and configured.
---

# Create Worktree Skill

This skill defines the mandatory protocol for creating, bootstrapping, and verifying new Git worktrees in the CasaGrown monorepo.

---

## 1. Worktree Creation Protocol

When asked to create a worktree for a new feature, bugfix, or experimentation:

### Step 1: Create the Git Worktree
From the main workspace or current working directory:
```bash
git worktree add /Users/rkhona/development/quarantine_bot/<worktree-name> -b <feature-branch-name> origin/main
```
*Note: If the branch already exists locally or remotely, omit `-b` or use `git checkout` within the worktree.*

---

### Step 2: Bootstrap Environment Variables (`scripts/setup-workspace-2.sh`)
Navigate to the new worktree and execute the automated setup script:
```bash
cd /Users/rkhona/development/quarantine_bot/<worktree-name>
./scripts/setup-workspace-2.sh --install
```

This automatically:
1. Discovers parent worktree credentials dynamically via `git worktree list`.
2. Copies root `.env` and all 10 app-level `.env` and `.env.local` files (`apps/next-market`, `apps/next-admin`, `apps/next-community-voice`, `apps/next-metrics`, etc.).
3. Copies `supabase/.env.local` and `supabase/functions/.env` (Stripe, Kroger, USDA AMS secrets).
4. Runs `yarn install` to link monorepo packages.
5. Installs the Playwright Chromium browser (`./node_modules/.bin/playwright install chromium`).

---

### Step 3: Verify Worktree Health
Run an isolated smoke test to confirm the new worktree is 100% operational:
```bash
cd apps/next-market && npx vitest run apps/next-market/app/__tests__/locationResolver.test.ts
```

---

## 2. Worktree Git Push Protocol

When working inside a worktree and ready to deploy/push to `main`:

1. **Direct Refspec Push (Recommended)**:
   ```bash
   git push origin <current-branch>:main
   ```
   *Benefit*: Pushes directly to GitHub `main` without switching branches in the worktree.

2. **Branch Switching (If merging locally)**:
   If checking out `main` locally to merge:
   ```bash
   git checkout main && git merge <current-branch> && git push origin main
   git checkout <current-branch>
   ```
   *Always switch back to the feature branch immediately to preserve the worktree context.*

---

## 3. Worktree Teardown & Cleanup

When work on a worktree is finished and merged:
```bash
git worktree remove /Users/rkhona/development/quarantine_bot/<worktree-name>
git worktree prune
```
