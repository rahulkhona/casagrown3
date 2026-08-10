# Handoff: Fix Address Leak & PII RLS Frontend Breakage

**Branch:** `fix-address-leak` (worktree at `../casagrown-fix-address-leak`)  
**Priority:** 🔴 URGENT — Production is broken right now  
**Scope:** Frontend-only changes (~15 files). No new migrations needed.

---

## Context: What Happened

A migration was manually applied directly to the production Supabase project (`fzdmszvfeewpwswlnfyk`) that:
1. **Created two public views** — `public_profiles` and `public_market_booths` — that expose only safe, non-PII columns
2. **Locked down RLS** on the `profiles` and `market_booths` base tables so only the row owner can SELECT their own row

This was the correct security change. The problem is that **the frontend was never updated** to use the new views. It still queries the base tables directly, which now return 0 rows for cross-user reads.

**Production users are currently experiencing:**
- Booth names missing or showing "Unknown" on market/booth pages
- Orders page with missing buyer/seller names
- Following page completely empty
- Rating reminder after order completion showing no seller/buyer name
- Q&A post author names missing
- Messages page — already fixed in another branch, re-apply here

---

## The Two Views Available in Production

### `public_profiles`
Safe columns (no PII):
```
id, full_name, avatar_url, home_community_h3_index, closure_status,
seller_avg_rating, seller_rating_count, farm_name, business_type,
seller_bio, business_license, food_handler_permit, cottage_food_permit,
insurance_provider
```
**Does NOT expose:** `street_address`, `city`, `state_code`, `zip_code`, `phone_number`, `email`

### `public_market_booths`
Safe columns (no raw address):
```
id, owner_id, name, description, decorative_theme, header_image_url,
offers_delivery, offers_pickup, delivery_radius_miles, delivery_zipcodes,
pickup_display_address, delivery_windows, pickup_windows, helper_passcode,
is_open
```
**Does NOT expose:** `pickup_address`, `pickup_street`, `pickup_city`, `pickup_state`, `pickup_zip`, `pickup_location`

---

## The Golden Rule for This Fix

> **Any read of another user's data → use public view.**  
> **Any read of the current user's own data → keep on base table (they have RLS permission).**  
> **All writes → always use base table.**

The #1 mistake to avoid: switching own-user reads (e.g. checkout address autofill, wizard setup) to the public view — those reads need PII fields that the view doesn't expose.

---

## Complete List of Files to Change

### GROUP 1 — Direct `.from('profiles')` or `.from('market_booths')` cross-user reads

These query another user's data and return 0 rows under the new RLS.

---

#### `apps/next-market/app/(main)/market/booth/[id]/BoothDetailClient.tsx`
- Find the query: `supabase.from('market_booths').select(...)`  
  → Change to `supabase.from('public_market_booths')`
- Find the query: `supabase.from('profiles').select('avatar_url, full_name').eq('id', booth.owner_id)`  
  → Change to `supabase.from('public_profiles')`

---

#### `apps/next-market/app/(main)/market/booth/[id]/product/[productId]/ProductDetailClient.tsx`
- Find cross-user booth read (not the owner's own booth read — look for `.eq('id', boothId)` without a user auth check)  
  → Change `from('market_booths')` → `from('public_market_booths')` for that read
- Find cross-user profile read (seller info for display)  
  → Change `from('profiles')` → `from('public_profiles')`
- **Keep** the own-user read on line ~184: `.from('profiles').select('street_address, city, state_code, zip_code, zip_plus4').eq('id', user.id)` — this is the buyer's own address for checkout, must stay on base table

---

#### `apps/next-market/app/(main)/following/page.tsx`
Current (broken):
```typescript
const { data: boothData } = await supabase
  .from('market_booths')
  .select(`id, owner_id, name, profiles!market_booths_owner_id_fkey(full_name, avatar_url)`)
  .in('id', boothIds)
```
Fix — switch parent table and FK join to public views:
```typescript
const { data: boothData } = await supabase
  .from('public_market_booths')
  .select(`id, owner_id, name, public_profiles!market_booths_owner_id_fkey(full_name, avatar_url)`)
  .in('id', boothIds)
```
Also update the mapping: `b.profiles?.full_name` → `b.public_profiles?.full_name`

---

#### `apps/next-market/app/(main)/community/components/ChatMessage.tsx`
- Find: `supabase.from('market_booths').select('id').eq('owner_id', targetUserId)`  
  → Change to `from('public_market_booths')`

---

#### `apps/next-market/app/components/RatingReminder.tsx`
Two cross-user profile reads (lines ~57 and ~84):
```typescript
// Line ~57: buyer getting seller's name for rating
supabase.from('profiles').select('full_name').eq('id', buyerOrder.seller_id)
// Line ~84: seller getting buyer's name for rating  
supabase.from('profiles').select('full_name').eq('id', sellerOrder.buyer_id)
```
Both → `from('public_profiles')`

---

#### `apps/next-market/app/(main)/messages/page.tsx`
Already fixed in `feature/daily-games`. Re-apply:
```typescript
// Change embedded FK join from profiles to public_profiles
profile_a:public_profiles!market_conversations_participant_a_fkey(id, full_name, avatar_url),
profile_b:public_profiles!market_conversations_participant_b_fkey(id, full_name, avatar_url),
```

---

#### `apps/next-market/app/(main)/messages/[id]/page.tsx`
Already fixed in `feature/daily-games`. Re-apply:
```typescript
.select('*, profile_a:public_profiles!market_conversations_participant_a_fkey(id, full_name, avatar_url, closure_status), profile_b:public_profiles!market_conversations_participant_b_fkey(id, full_name, avatar_url, closure_status)')
```

---

#### `apps/next-market/app/api/og-booth/route.tsx`
- Find: `supabase.from('market_booths')` (using anon client for OG image generation)  
  → Change to `from('public_market_booths')`

---

#### `apps/next-market/app/b/[code]/route.ts`
- Find: `supabase.from('market_booths')` (redirect route for booth share links)  
  → Change to `from('public_market_booths')`

---

#### `apps/next-market/app/components/WidgetEmbed.tsx`
- Find: `supabase.from('market_booths')` (public widget embed)  
  → Change to `from('public_market_booths')`

---

#### `apps/next-market/app/api/marketplace-csv/route.ts`
- Find cross-user `from('market_booths')` and `from('profiles')` reads  
  → Change to public views

---

### GROUP 2 — Hidden PostgREST FK joins (⚠️ these do NOT appear in grep for `from('profiles')`)

These embed a join to `profiles` or `market_booths` inside a select string on a DIFFERENT table. They're the most commonly missed pattern.

---

#### `apps/next-market/app/(main)/orders/[id]/page.tsx` — MOST CRITICAL

**Issue 1 — FK joins for buyer/seller names (line ~144):**
```typescript
// BROKEN: buyer_id and seller_id FK joins hit profiles (now RLS-restricted)
.select('*, delivery_address, buyer:buyer_id(full_name, avatar_url), seller:seller_id(full_name, avatar_url), booth:booth_id(name, pickup_address)')
```
Fix: fetch buyer/seller names separately from `public_profiles` after loading the order, OR use an RPC.
```typescript
// Step 1: Load the order without the broken joins
const { data } = await supabase
  .from('market_orders')
  .select('*, delivery_address, booth:booth_id(name, pickup_display_address)')
  .eq('id', orderId)
  .single()

// Step 2: Fetch buyer and seller names from public_profiles
const [{ data: buyerProfile }, { data: sellerProfile }] = await Promise.all([
  supabase.from('public_profiles').select('full_name, avatar_url').eq('id', data.buyer_id).single(),
  supabase.from('public_profiles').select('full_name, avatar_url').eq('id', data.seller_id).single(),
])
```

**Issue 2 — `booth:booth_id(name, pickup_address)` join hits `market_booths` (line ~144):**
`market_booths.pickup_address` is now RLS-restricted AND is raw PII. Switch to `booth:booth_id(name, pickup_display_address)` — but note: PostgREST FK joins resolve through the base table, not the view. So you need to fetch booth info separately:
```typescript
supabase.from('public_market_booths').select('name, pickup_display_address').eq('id', data.booth_id).single()
```

**Issue 3 — Address fallback using `buyer.street_address` (line ~157):**
```typescript
// BROKEN: buyer.street_address comes from profiles (now null after RLS)
buyer_address: (data as any).delivery_address || (data as any).buyer?.street_address || undefined,
```
Fix — remove the `buyer.street_address` fallback entirely. Use only `delivery_address`:
```typescript
buyer_address: (data as any).delivery_address || undefined,
```
This is also the right security decision — sellers should never get the buyer's raw address from profiles.

**Issue 4 — `seller_address` fallback using `seller.street_address` (line ~158):**
```typescript
// BROKEN and is a PII leak
seller_address: (data as any).booth?.pickup_address || (data as any).seller?.street_address || undefined,
```
Fix:
```typescript
seller_address: (data as any).booth?.pickup_display_address || undefined,
```

**Issue 5 — Dispute messages (line ~195):**
```typescript
.select('*, profiles:sender_id(full_name)')
```
Fix:
```typescript
.select('*, public_profiles:sender_id(full_name)')
```
And update mapping: `m.profiles?.full_name` → `m.public_profiles?.full_name`

---

#### `apps/next-market/app/(main)/orders/page.tsx`

**Lines ~112-114 — same FK join pattern:**
```typescript
// BROKEN
buyer:buyer_id(full_name, avatar_url),
seller:seller_id(full_name, avatar_url),
booth:booth_id(name, pickup_address),
```
Fix: Same approach as orders/[id] — load order, then fetch buyer/seller from `public_profiles` and booth from `public_market_booths` separately.

Update mapping at lines ~123-129:
```typescript
buyer_address: o.delivery_address || null,   // remove profiles fallback
seller_address: o.booth?.pickup_display_address || null,  // not pickup_address
```

---

#### `apps/next-market/app/(main)/join-booth/[code]/page.tsx` (lines ~80, ~113)

```typescript
// BROKEN: profiles FK join on market_booths (now RLS-restricted)
.select('id, name, owner_id, decorative_theme, header_image_url, profiles!market_booths_owner_id_fkey(full_name)')
```
Fix:
```typescript
.select('id, name, owner_id, decorative_theme, header_image_url, public_profiles!market_booths_owner_id_fkey(full_name)')
```
Update all references from `booth.profiles?.full_name` → `booth.public_profiles?.full_name`

---

#### `apps/next-market/app/components/ProductQA.tsx` (line ~201)

```typescript
// BROKEN: FK join to profiles for Q&A post authors
.select('*, profiles:author_id(full_name, avatar_url)')
```
Fix:
```typescript
.select('*, public_profiles:author_id(full_name, avatar_url)')
```
Update all references: `item.profiles?.full_name` → `item.public_profiles?.full_name`, etc.

---

### GROUP 3 — DO NOT CHANGE (own-user reads, need PII fields)

**Never switch these to public views** — they read PII for the current user's own account:

| File | Fields | Why |
|:---|:---|:---|
| `market/page.tsx` L446 | `street_address, city, zip_code` | Buyer's own location for market search |
| `components/BuyModal.tsx` | `street_address, city, zip_code` | Buyer's checkout address |
| `components/wizard/Step1Basics.tsx` | `full_name, street_address, ...` | Own profile setup |
| `components/wizard/Step2Fulfillment.tsx` | `street_address, city, zip_code` | Own fulfillment setup |
| `my-booth/products/new/page.tsx` | booth + profile data | Seller managing own listing |
| `app/(marketing)/join/page.tsx` L352 | `full_name, street_address, profile_completed_at` | Own onboarding |
| `app/(standalone)/pro/page.tsx` L190 | `market_booths` with `owner_id.eq.userId` | Seller's own booths |
| All `.update()`, `.insert()` calls | Writes | Always base table |

---

## Test Fixes Required

### Fix 1 — `e2e/subscription-upgrade-downgrade.spec.ts`
Find the test asserting `getByText(/branding/i)` for the **Pro** tier plan. This text does not exist in the Pro card — it's only in the Elite card. The Pro card shows "GrowBot AI Copilot".

```diff
- await expect(page.getByText(/branding/i).first()).toBeVisible({ timeout: 15_000 })
+ await expect(page.getByText(/GrowBot AI Copilot/i).first()).toBeVisible({ timeout: 15_000 })
```

Find the exact line by searching for `branding` in the spec file and checking which `test()` block it's in — it should be a test that uses `mockSubscription(page, 'pro')`.

### Fix 2 — Auto-resolves after code fix
`deep-interactions.spec.ts` P6, `wizard-telemetry.spec.ts` join test, and `account-closure.spec.ts` DM compose test should all resolve automatically once the code changes above are applied. No test changes needed for those.

---

## How to Test

### Step 1: Start local environment
```bash
cd apps/next-market
npm run dev
```
In another terminal:
```bash
npx supabase start
```

### Step 2: Run targeted specs first (fast feedback)
```bash
# Orders — covers the most critical P6 delivery address fix
npx playwright test apps/next-market/e2e/scenarios/deep-interactions.spec.ts --project=chromium --grep "P6"

# Messages — closure status banner
npx playwright test apps/next-market/e2e/account-closure.spec.ts --project=chromium --grep "DM compose"

# Subscription — branding text fix
npx playwright test apps/next-market/e2e/subscription-upgrade-downgrade.spec.ts --project=chromium

# Wizard telemetry
npx playwright test apps/next-market/e2e/wizard-telemetry.spec.ts --project=chromium --grep "join"
```

### Step 3: Manual smoke checks
- [ ] `/market/booth/[id]` — booth name and seller avatar visible
- [ ] `/orders` — buyer/seller names visible
- [ ] `/orders/[id]` — "Delivery Address" section renders with directions link
- [ ] Wizard `/my-booth/products/new` — pickup address pre-fills from own profile
- [ ] Rating reminder after completed order — shows seller/buyer name
- [ ] Q&A on any product — author names visible
- [ ] `/following` — booth names and seller avatars visible
- [ ] OG image at `/api/og-booth?id=<booth_id>` — loads without error

### Step 4: Full release test
```bash
./scripts/release-test.sh
```
All tests must pass before deploy.

---

## Deployment Sequence

> **Migrations are already live in production.** Do NOT run any migrations. This is a frontend-only deploy.

### Step 1: Commit
```bash
git add apps/next-market/app/ apps/next-market/e2e/subscription-upgrade-downgrade.spec.ts
git commit -m "fix(security): switch public reads to public_profiles and public_market_booths views

- Fixes 406 errors caused by PII RLS lockdown on profiles and market_booths
- Removes buyer.street_address and seller.street_address fallbacks from orders page
- Fixes hidden PostgREST FK joins in orders, following, join-booth, ProductQA
- Fixes subscription spec Pro tier branding assertion

Resolves: booth name missing, orders broken, following page empty, Q&A authors missing"
```

### Step 2: Push to main → Vercel deploys automatically
```bash
git push origin fix-address-leak
# Then open a PR to main and merge, OR push directly to main if approved
git push origin fix-address-leak:main
```

### Step 3: Verify production within 5 minutes of deploy
- Open an incognito browser, go to production market
- Check booth page, orders page, messages page
- Confirm "Delivery Address" renders on an order detail

---

## Key Files Reference

| View | Live in prod? | Columns safe to select |
|:---|:---:|:---|
| `public_profiles` | ✅ Yes | `id, full_name, avatar_url, closure_status, seller_avg_rating, farm_name, business_type, seller_bio` |
| `public_market_booths` | ✅ Yes | `id, owner_id, name, description, offers_delivery, offers_pickup, pickup_display_address, is_open, helper_passcode` |

---

## What NOT to Do

- ❌ Do not run `supabase db push` — migrations are already in production
- ❌ Do not modify any migration files
- ❌ Do not switch own-user PII reads (checkout, wizard, profile setup) to public views
- ❌ Do not deploy to Supabase staging or push to GitHub without user approval after testing
