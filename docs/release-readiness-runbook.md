# CasaGrown — Release Readiness Test Runbook

> **Purpose:** Run all tests needed to verify release readiness.  
> **Usage:** Run per-app sections independently, or all together for a full release.  
> **Prerequisites:** `supabase start` must be running, `node_modules` installed.

---

## Quick Reference — Full Release (All Apps)

```bash
# 1. Database (pgTAP) — 33 files, 441 assertions
supabase test db

# 2. Deno Integration — 37 files, 368 test cases
cd supabase && deno test --allow-env --allow-net --no-check functions/_tests/ functions/tests/

# 3. Market Unit Tests — 44 files, 612 test cases
cd apps/next-market && npx vitest run

# 4. Market E2E — 46 specs, 555 test cases
cd apps/next-market && npx playwright test

# 5. Admin Unit + E2E — 9 files
cd apps/next-admin && npx vitest run && npx playwright test

# 6. Voice Unit + E2E — 6 files
cd apps/next-community-voice && npx vitest run && npx playwright test

# 7. Metrics Unit + E2E — 2 files
cd apps/next-metrics && npx vitest run && npx playwright test
```

---

## APP 1: Market (`next-market`)

### 1A. Vitest Unit Tests (44 files, 612 cases)

```bash
cd apps/next-market && npx vitest run
```

**What's covered:**
- All 43 page renders (public + authenticated)
- 22 component tests (BuyModal, Navbar, Cart, Notifications, etc.)
- 10 library/hook tests (store, auth, analytics, cart, geocode)
- Listing lifecycle, order grouping, deep interaction states

### 1B. Playwright E2E (46 specs, 555 cases)

```bash
cd apps/next-market && npx playwright test
```

**Prerequisites:** Market app must be running on `:3001`
```bash
cd apps/next-market && npx next dev --port 3001 &
```

**What's covered:**
- Core pages (login, browse, booth setup, order flow)
- 24 scenario specs (purchase, earnings, cashout, DM, moderation, chat)
- Financial pipeline (holds, captures, payouts)
- Error states (booth errors, cashout errors, quarantine)
- Visual regression screenshots

### 1C. Deno Integration (all 37 files affect market)

```bash
cd supabase && deno test --allow-env --allow-net --no-check functions/_tests/
```

**Market-critical tests:**
| File | Cases | Critical Path |
|------|-------|---------------|
| `market-hold.test.ts` | Stripe hold placement |
| `create-order.test.ts` | Order creation |
| `settlement-captures.test.ts` | Stripe capture operations |
| `payment-errors.test.ts` | Decline/error handling |
| `stripe-webhook.test.ts` | Webhook processing |
| `moderate-listing.test.ts` | AI moderation |
| `onboarding-functions.test.ts` | resolve-community + USPS |
| `indirect-market-functions.test.ts` | All 10 indirect functions |
| `negative-cases.test.ts` | Negative paths |
| `sandbox-api.test.ts` | Live sandbox API calls |

### 1D. pgTAP Database (33 files, 441 assertions)

```bash
supabase test db
```

**Market-critical tests:**
| File | Assertions | What |
|------|-----------|------|
| `02_market_schema` | 58 | Core table validation |
| `03_market_settlement` | 42 | Settlement correctness |
| `05_balance_first_hold` | 6 | Hold logic |
| `12_place_order` | 7 | Order placement RPC |
| `15_rls_policies` | 13 | Row-level security |
| `20_cash_flow_system` | 38 | Cash flow integrity |

---

## APP 2: Admin (`next-admin`)

### 2A. Unit Tests (2 files)

```bash
cd apps/next-admin && npx vitest run
```

| File | What |
|------|------|
| `__tests__/build.test.ts` | Build compilation check |
| `__tests__/dev.test.ts` | Dev server start check |

### 2B. Playwright E2E (7 specs)

```bash
cd apps/next-admin && npx playwright test
```

**Prerequisites:** Admin app running on default port
```bash
cd apps/next-admin && npx next dev &
```

| Spec | What |
|------|------|
| `e2e/home.spec.ts` | Dashboard renders |
| `e2e/beta-testers.spec.ts` | Beta tester management |
| `e2e/financial.spec.ts` | Cash flow & settlements |
| `e2e/market-availability.spec.ts` | State blocks management |
| `e2e/market-config.spec.ts` | Platform configuration |
| `e2e/quarantine-zones.spec.ts` | Quarantine zone CRUD |
| `e2e/production.spec.ts` | Production build verification |

### 2C. Deno (admin-relevant)

```bash
cd supabase && deno test --allow-env --allow-net --no-check \
  functions/_tests/indirect-market-functions.test.ts \
  --filter "process-redemptions"
```

---

## APP 3: Voice (`next-community-voice`)

### 3A. Unit Tests (1 file)

```bash
cd apps/next-community-voice && npx vitest run
```

| File | What |
|------|------|
| `features/feedback/feedback-service.test.ts` | Feedback submission service |

### 3B. Playwright E2E (5 specs)

```bash
cd apps/next-community-voice && npx playwright test
```

**Prerequisites:** Voice app running on `:3002`
```bash
cd apps/next-community-voice && npx next dev -p 3002 &
```

| Spec | What |
|------|------|
| `e2e/board.spec.ts` | Feedback board rendering |
| `e2e/submit.spec.ts` | Ticket submission flow |
| `e2e/ticket-detail.spec.ts` | Ticket detail view |
| `e2e/flagging.spec.ts` | Content flagging |
| `e2e/staff-users.spec.ts` | Staff management |

---

## APP 4: Metrics (`next-metrics`)

### 4A. Unit Tests (1 file)

```bash
cd apps/next-metrics && npx vitest run
```

| File | What |
|------|------|
| `app/__tests__/metrics.test.tsx` | Dashboard component rendering |

### 4B. Playwright E2E (1 spec)

```bash
cd apps/next-metrics && npx playwright test
```

**Prerequisites:** Metrics app running on `:3004`
```bash
cd apps/next-metrics && npx next dev -p 3004 &
```

| Spec | What |
|------|------|
| `e2e/metrics.spec.ts` | Dashboard pages, charts, data display |

---

## Backend-Only (No App UI)

### Provider Tests (5 files)

```bash
cd supabase && deno test --allow-env --allow-net --no-check \
  functions/_shared/tremendous.test.ts \
  functions/_shared/reloadly.test.ts \
  functions/_provider-tests/giftcard-cache.test.ts \
  functions/_provider-tests/toggles.test.ts \
  functions/_compliance-tests/compliance.test.ts
```

### Per-Function Tests (3 files)

```bash
cd supabase && deno test --allow-env --allow-net --no-check \
  functions/confirm-payment/fifo.test.ts \
  functions/process-redemptions/index.test.ts \
  functions/resolve-usps-address/integration.test.ts
```

### Legacy Deno Tests (2 files)

```bash
cd supabase && deno test --allow-env --allow-net --no-check \
  functions/tests/edge_functions_test.ts \
  functions/tests/cash_flow_test.ts
```

---

## Stress Tests (run separately — slow)

```bash
# Settlement stress
supabase test db --filter 04_market_settlement_stress

# Payout stress
supabase test db --filter 22_payout_stress_test

# 100K row stress
supabase test db --filter 23_100k_stress_test
```

---

## Summary

| App | Vitest | Playwright | Deno | pgTAP | Total Files |
|-----|--------|------------|------|-------|-------------|
| **Market** | 44 (612) | 46 (555) | 37 (368) | 33 (441) | 160 |
| **Admin** | 2 | 7 | 1* | shared | 10 |
| **Voice** | 1 | 5 | — | — | 6 |
| **Metrics** | 1 | 1 | — | — | 2 |
| **Backend** | — | — | 10 | — | 10 |
| **TOTAL** | **48** | **59** | **48** | **33** | **188** |

*Admin shares Deno's `process-redemptions` tests.

**Grand Total: 188 test files, ~2,000+ test cases**
