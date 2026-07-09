# Fixing Product "Unavailable" Bug

## Problem Summary

Products are randomly showing as **"Unavailable"** in the community and market, even when sellers have active inventory. This has been happening for ~2 weeks and is caused by stale market-closure logic that was never removed when the platform transitioned from a one-day-per-week farmers market to an always-open marketplace.

> **Note:** There are two separate overlays:
> - `"Expired"` badge → `expires_at < now()` (all fulfillment windows have passed — legitimate)
> - `"Unavailable"` badge → `is_active = false` (incorrectly set by cron via `market_date` check — the bug)

## Root Cause

### Original Design (deprecated)
The market was originally designed as a **one-day-per-week farmers market** (Saturdays). Products were ephemeral — listed for a specific `market_date` and expired after that day. Seven nightly cron jobs (`market_close_dow_0` through `market_close_dow_6`) ran at 23:59 UTC every day and called `close_market_booths()` to deactivate all products whose `market_date` had passed.

### Current Design
The market is **always open** with window-based fulfillment. Products persist indefinitely — availability is determined by fulfillment windows, not market dates. The UI has a "Market Override Active" toggle that forces the market open 24/7.

### The Bug Chain
1. Seller creates a product → frontend sets `market_date = today` (e.g. July 9)
2. July 10 at 23:59 UTC → cron fires → `close_market_booths()` runs
3. Function checks: `market_date < current_date` → `July 9 < July 10` → TRUE
4. Product is set to `is_active = false` → shows as **"Unavailable"**

**Every product gets killed the day after it's created.**

### The Function (currently broken)
```sql
CREATE OR REPLACE FUNCTION public.close_market_booths()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- With window-based fulfillment, booths are always open.
  -- Only sweep expired products based on expires_at.
  UPDATE public.market_products 
  SET is_active = false 
  WHERE is_active = true 
    AND (market_date::date < current_date          -- ← stale, kills all products
      OR (expires_at IS NOT NULL AND expires_at < now()));  -- ← also stale, no longer used
END;
$$;
```

Note: The function's own comment says "booths are always open" and "only sweep based on expires_at" — but the `market_date` check was never removed.

### How `expires_at` Actually Works Now
`expires_at` is **still legitimately used** — it is dynamically set by `allocate_from_catalog()` to the **end of the seller's last fulfillment window day**. When all fulfillment windows have passed, `expires_at` becomes past and the product correctly shows the `"Expired"` overlay. This is correct behavior.

There is also a global flag `market_settings.products_never_expire` that overrides all expiry checks when `true`.

### Key Facts
- `close_market_booths()` does **not** actually close booths — it only deactivates products
- The "Market Override Active" toggle in the UI has **no effect** on this database cron
- **38 products** are currently incorrectly deactivated (by `market_date` check, not `expires_at`)
- All 7 cron jobs (`market_close_dow_0` through `market_close_dow_6`) are active and running nightly
- The `expires_at` part of the function is legitimate and should be kept

---

## Fix Plan

### Step 1 — Disable the 7 nightly close crons
The market never closes, so these crons serve no purpose.

```sql
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname LIKE 'market_close_dow_%';
```

### Step 2 — Fix `close_market_booths()` (surgical fix)
Only remove the `market_date` check. Keep the `expires_at` check — it is legitimately used to deactivate products whose fulfillment windows have all passed.

```sql
CREATE OR REPLACE FUNCTION public.close_market_booths()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Market is always open with window-based fulfillment.
  -- Only deactivate products whose expires_at has passed
  -- (expires_at is set by allocate_from_catalog() to end of last window day).
  -- DO NOT check market_date — that field is legacy and no longer controls availability.
  UPDATE public.market_products 
  SET is_active = false 
  WHERE is_active = true 
    AND expires_at IS NOT NULL 
    AND expires_at < now();
END;
$$;
```

### Step 3 — Reactivate 38 incorrectly deactivated products
Restore products that were deactivated by the cron but have not seller-deactivated or flagged.

```sql
UPDATE market_products
SET is_active = true, updated_at = now()
WHERE is_active = false
  AND is_draft = false
  AND is_flagged = false;
```

> ⚠️ **Review before running** — confirm the count and spot-check a few rows to ensure no legitimate deactivations are being reversed.

### Step 4 — Create migration file and commit to `main`

Create a new migration:
```
supabase/migrations/YYYYMMDDHHMMSS_fix_market_close_crons.sql
```

Contents:
- Unschedule the 7 crons
- Neuter `close_market_booths()`

Then:
```bash
git checkout main
git merge fbnext2  # or cherry-pick
git push origin main
```

---

## What We Are NOT Changing
- `market_date` column stays (used in financial settlements / `market_settlements` table)
- Frontend product creation code — `market_date` can still be set to today, it no longer causes deactivation
- Fulfillment window logic — untouched
- `expires_at` column and logic — kept as-is (set by `allocate_from_catalog()`, used for legitimate expiry)
- The 7 `market_close_dow_*` crons — kept active (they now only sweep truly expired products)
- `market_settings.products_never_expire` flag — untouched

---

## Verification
After applying fixes, confirm:
1. `SELECT COUNT(*) FROM market_products WHERE is_active = true` — should show all 38+ restored
2. `SELECT * FROM cron.job WHERE jobname LIKE 'market_close_dow_%'` — should return 0 rows
3. Monitor community feed the next morning — no new "Unavailable" products

---

## Branch Notes
- **Current working branch:** `fbnext2`
- **Changes should land on:** `main`
- Apply DB changes directly to live DB, then commit migration to `main`, then merge `main` → `fbnext2`
