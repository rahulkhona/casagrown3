---
description: Run the complete test suite across all frameworks and apps
---

# Full Regression Test Suite

Run the following commands **in order** from the monorepo root (`casagrown3/`). All tests must pass before committing.

// turbo-all

## 1. Vitest — Market Unit Tests

```bash
cd apps/next-market && npx vitest run 2>&1 | tail -20
```

Expected: **500+ tests** across 36+ files, all passing.

## 2. Deno — Edge Function Tests

```bash
cd supabase/functions && deno test _tests/ tests/ --allow-all --no-check 2>&1 | tail -20
```

Expected: **119+ tests** across all edge function test files, all passing.

## 3. pgTAP — Database Tests

```bash
npx supabase test db 2>&1 | tail -30
```

Expected: **333+ tests** across 24 test files (01 through 23), all passing.
Note: `05_settlement_benchmark.sql` shows "No plan found" — this is expected, it's a benchmark, not a test.

## 4. Playwright — Market E2E Tests

```bash
cd apps/next-market && npx playwright test e2e/scenarios/ --reporter=list 2>&1 | tail -30
```

Expected: **118+ tests** across 10+ spec files, all passing.

**Prerequisite**: Market app must be running on `localhost:3001` and Supabase must be running locally.

## 5. Playwright — Admin E2E Tests

```bash
cd apps/next-admin && npx playwright test e2e/ --reporter=list 2>&1 | tail -30
```

Expected: Tests for home, financial, market config, market availability, production, and beta-testers pages.

**Prerequisite**: Admin app must be running on `localhost:3005`.

---

## Quick One-Liner (all tests sequentially)

```bash
(cd apps/next-market && npx vitest run) && \
(cd supabase/functions && deno test _tests/ tests/ --allow-all --no-check) && \
npx supabase test db && \
(cd apps/next-market && npx playwright test e2e/scenarios/) && \
(cd apps/next-admin && npx playwright test e2e/)
```
