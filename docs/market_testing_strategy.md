# Market Testing Strategy

## Overview

The Market app follows CasaGrown's multi-layered testing strategy with four
test types: pgTAP (database), Deno (integration), Playwright (web E2E), and
manual browser testing.

> **Note**: Maestro tests are not applicable — the Market app is a Next.js web
> application, not a mobile app. Mobile market testing will be added if/when a
> native app is built.

## 1. pgTAP — Database Unit Tests

**File**: `supabase/tests/database/02_market_schema.test.sql`

### What to Test

| Test Case                         | Assertion                              |
| :-------------------------------- | :------------------------------------- |
| Tables exist                      | `has_table('market_booths')`, etc.     |
| Columns exist                     | `has_column('market_booths','name')`   |
| FK constraints                    | Booth → profiles, product → booth      |
| One booth per user                | UNIQUE(owner_id) enforced              |
| RLS: owner can CRUD               | INSERT/UPDATE/DELETE succeed for owner |
| RLS: non-owner can read           | SELECT succeeds for other user         |
| RLS: non-owner cannot write       | INSERT/UPDATE/DELETE fail for other    |
| Coupon uniqueness per booth        | UNIQUE(booth_id, code)                 |

### Execution

```bash
docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
  -c "CREATE EXTENSION IF NOT EXISTS pgtap;"
docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
  < supabase/tests/database/02_market_schema.test.sql
```

## 2. Deno — Integration Tests

**File**: `supabase/functions/_tests/market-schema.test.ts`

### What to Test

| Test Case                       | Method                                 |
| :------------------------------ | :------------------------------------- |
| Create booth                    | Supabase client INSERT + verify        |
| One booth per user              | Second INSERT triggers conflict error  |
| Create product                  | INSERT market_products linked to booth |
| Create coupon                   | INSERT with code uniqueness            |
| RLS: non-owner write blocked    | Use different user JWT, expect error   |
| ToS acceptance                  | Update profiles.tos_accepted_at        |

### Execution

```bash
cd supabase && deno test --allow-env --allow-net \
  functions/_tests/market-schema.test.ts
```

## 3. Playwright — Web E2E Tests

### Auth Setup Project

**File**: `apps/next-market/e2e/auth.setup.ts`

Uses the same pattern as community:
1. Call Supabase GoTrue API to get JWT
2. Navigate to `/login` to set browser origin
3. Inject JWT into localStorage
4. Save browser storage state

### Login Flow Tests

**File**: `apps/next-market/e2e/login.spec.ts`

| Test Case                        | Steps                                  |
| :------------------------------- | :------------------------------------- |
| Email input renders              | Navigate to /login, verify form        |
| Send OTP → shows OTP step        | Enter email, submit, verify OTP screen |
| Invalid OTP shows error          | Enter wrong code, verify error display |
| Successful login → redirects     | Verify redirect to /terms or /my-booth |

### ToS Flow Tests

**File**: `apps/next-market/e2e/tos.spec.ts`

| Test Case                             | Steps                                |
| :------------------------------------ | :----------------------------------- |
| Unauthenticated → redirected to login | Navigate to /my-booth, verify /login |
| No ToS → redirected to /terms         | Login, verify /terms redirect        |
| Accept ToS → redirects to /my-booth   | Click accept, verify redirect        |
| ToS timestamp is recorded             | Query profiles.tos_accepted_at       |

### Execution

```bash
cd apps/next-market && npx playwright test
```

## 4. Test Data & Fixtures

### Seed Data

Market-specific seed data should use deterministic UUIDs with `m` prefix
pattern to avoid collision with community seeds:

```
Market Seller (profiles):  m1111111-1111-1111-1111-111111111111
Market Booth:              mb111111-1111-1111-1111-111111111111
Market Product (Tomatoes): mp111111-1111-1111-1111-111111111111
Market Coupon (WELCOME10): mc111111-1111-1111-1111-111111111111
```

### Cleanup

Before Playwright runs, clean up stale market test data:

```sql
DELETE FROM market_coupons WHERE id::text NOT LIKE 'mc%';
DELETE FROM market_products WHERE id::text NOT LIKE 'mp%';
DELETE FROM market_booths WHERE id::text NOT LIKE 'mb%';
```

## 5. CI/CD Integration

Market tests will be added to the existing pre-push hook (`.husky/pre-push`):

1. **Phase 1**: pgTAP market schema tests (runs with existing DB tests)
2. **Phase 2**: Playwright market E2E (starts market dev server on port 3001)
3. **Phase 1.5b**: Deno market integration tests (runs with existing Deno tests)

## 6. Known Considerations

- **Port**: Market dev server runs on `localhost:3001` (community on `3000`)
- **Shared auth**: Tests for both apps share the same `auth.users` table
- **Mailpit**: OTP emails go to `localhost:54324` in local dev
- **RLS testing**: Use Supabase service_role for setup, then anon/auth for assertions
