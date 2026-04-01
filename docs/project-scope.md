# CasaGrown — Complete Project Scope & Architecture Reference

> **Last Updated:** 2026-04-01  
> **Repository:** `casagrown3` (monorepo)  
> **Stack:** Next.js 14 (App Router) · Expo (React Native) · Supabase (Postgres + Edge Functions) · Stripe

---

## 1. Applications (7 total)

### 1a. Frontend Apps

| App | Framework | Pages | Src Files | Test Files | Purpose |
|-----|-----------|-------|-----------|------------|---------|
| **next-market** | Next.js 14 | 43 | 150 | 90 | Primary marketplace PWA — buying, selling, booths, orders |
| **next-community** | Next.js 14 | 31 | 45 | 7 | Community app — posts, chat, points, offers, delegation |
| **next-admin** | Next.js 14 | 22 | 41 | 9 | Admin dashboard — user management, config, settlements |
| **next-community-voice** | Next.js 14 | 11 | 35 | 6 | Public feedback platform — submit/vote on community feedback |
| **next-metrics** | Next.js 14 | 10 | 25 | 2 | Internal analytics dashboard — sales, health, logs |
| **expo-community** | Expo (RN) | ~15 | 34 | 0 | Mobile community app (iOS/Android) |
| **expo-admin** | Expo (RN) | ~3 | 4 | 0 | Mobile admin app (iOS/Android) |

### 1b. Shared Packages

| Package | Contents |
|---------|----------|
| `packages/app` | Cross-platform features, hooks, providers (used by expo-community, next-community) |
| `packages/config` | Shared configuration |
| `packages/ui` | Shared UI components |

### 1c. packages/app Feature Modules

These are shared between `expo-community` and `next-community`:

```
admin, auth, chat, common, community, community-chat, create-post,
delegate, feed, feedback, home, invite, legal, menu, my-posts,
notifications, offers, orders, points, profile-wizard, redeem, user
```

### 1d. packages/app Shared Hooks

| Hook | Purpose |
|------|---------|
| `usePaymentService.ts` | Payment abstraction layer |
| `usePendingPayments.ts` | Calls `resolve-pending-payments` on app open |
| `usePointsBalance.ts` | Fetches user point balance |
| `usePurchaseLimits.ts` | Fetches platform purchase limits |
| `useOTAUpdates.ts` | Expo OTA update check |

---

## 2. Market App Pages (next-market — 43 pages)

### Core Commerce
- `/market` — Browse marketplace feed
- `/market/booth/[id]` — View seller booth
- `/market/booth/[id]/about` — Booth about page
- `/market/booth/[id]/product/[productId]` — Product detail within booth
- `/market/product/[id]` — Standalone product detail page
- `/cart` — Shopping cart
- `/orders` — Order list
- `/orders/[id]` — Order detail / tracking

### Seller Dashboard (My Booth)
- `/my-booth` — Seller dashboard home
- `/my-booth/products` — Manage listings
- `/my-booth/products/new` — Create new listing
- `/my-booth/products/[id]` — Edit listing
- `/my-booth/orders` — Incoming orders
- `/my-booth/customize` — Booth branding
- `/my-booth/coupons` — Manage coupons
- `/my-booth/invitations` — Booth helper invitations

### Financials
- `/earnings` — Seller earnings dashboard
- `/earnings/payout` — Cashout / payout page
- `/earnings/tax-info` — Tax information & reporting

### Communication
- `/messages` — DM inbox
- `/messages/[id]` — DM conversation
- `/messages/new` — Start new DM
- `/chat/[id]` — Order-linked chat
- `/community` — Community chat

### Onboarding & Profile
- `/login` — Authentication
- `/logout` — Session termination
- `/profile-setup` — Onboarding wizard (calls resolve-community, resolve-usps-address)
- `/profile` — User profile
- `/settings` — Account settings
- `/get-started` — Seller onboarding hub
- `/get-started/[template]` — Template-based booth setup
- `/join-booth/[code]` — Accept booth delegation

### Content & Discovery
- `/` — Landing page
- `/guide` — User guide
- `/terms` — Terms of service
- `/notifications` — In-app notifications
- `/following` — Followed booths
- `/helping` — Delegate helper view
- `/voice/*` — Community voice (board, submit, ticket)
- `/testers` — Beta tester signup (standalone layout)

---

## 3. Edge Functions (48 total)

### 3a. Market-App Direct Functions (invoked FROM next-market)

| Function | Lines | What It Does |
|----------|-------|--------------|
| `analyze-product-photo` | 177 | AI-powered photo analysis for listing categorization |
| `casabot-reply` | 229 | AI chatbot response for buyer/seller questions |
| `execute-settlement-captures` | 208 | Captures held Stripe charges after delivery confirmation |
| `fetch-donation-projects` | 355 | Fetches GlobalGiving charity projects for earnings donation |
| `fetch-market-gift-cards` | 325 | Fetches gift card catalog for market-specific redemption |
| `market-cashout-paypal` | 452 | PayPal payout for sellers cashing out market earnings |
| `market-donate-earnings` | 319 | Donate seller earnings to charity |
| `market-hold` | 367 | Places Stripe hold on buyer's card during checkout |
| `market-purchase-gift-card` | 465 | Gift card purchase using market earnings |
| `moderate-listing` | 339 | AI moderation of product listing content/images |
| `register-push-token` | 61 | Registers browser push notification subscription |
| `resolve-community` | 538 | Resolves H3 community cell from lat/lng during onboarding |
| `resolve-usps-address` | 210 | Validates/standardizes address via USPS API |
| `send-market-email` | 123 | Sends market-specific transactional emails |

### 3b. Community/Shared-App Functions (invoked from packages/app, expo-community, next-community)

| Function | Lines | Callers |
|----------|-------|---------|
| `confirm-payment` | 168 | `packages/app` (6 refs) — credits points after Stripe confirmation |
| `create-order` | 215 | `packages/app` (3 refs), DB trigger (2) — creates order record |
| `create-payment-intent` | 234 | `packages/app` (4 refs) — creates Stripe PaymentIntent for point purchase |
| `donate-points` | 274 | `packages/app` (1 ref) — GlobalGiving donation with earned points |
| `fetch-gift-cards` | 371 | `next-community` (2), `packages/app` (3) — community gift card catalog |
| `get-tax-rate` | 195 | `packages/app` (1 ref) — calculates sales tax for transactions |
| `pair-delegation` | 476 | `next-community` (1), `packages/app` (3) — booth delegation system |
| `redeem-gift-card` | 395 | `next-community` (1), `packages/app` (1) — purchase gift card with points |
| `redeem-paypal-payout` | 406 | `next-community` (1), `packages/app` (1) — PayPal cashout with points |
| `refund-purchased-points` | 440 | `packages/app` (1 ref) — refund purchased points back to credit card |
| `resolve-pending-payments` | 225 | `packages/app` (1 ref) — resolves stuck pending payments on app open |

### 3c. Admin Functions

| Function | Lines | Caller |
|----------|-------|--------|
| `process-redemptions` | 564 | `next-admin` (1), cron — retries failed redemptions FIFO |
| `simulate-bank-deposit` | 133 | `next-admin` (1) — simulates bank deposit for testing |

### 3d. DB-Trigger / Cron Functions (no direct app caller)

| Function | Lines | Trigger Source | Writes To |
|----------|-------|----------------|-----------|
| `casabot-auto-reply` | 226 | DB trigger on chat message INSERT | `order_chat_messages` |
| `enrich-communities` | 277 | Called by `resolve-community` fire-and-forget | `communities` |
| `execute-auto-payouts` | 309 | DB trigger / cron | `market_settlements`, `platform_bank_ledger` |
| `market-cron` | 860 | Cron job (daily) | `market_notifications`, `market_reminders` |
| `notify-dm-message` | 100 | DB trigger on DM message INSERT | Push notifications |
| `notify-on-market-message` | 88 | DB trigger on market chat INSERT | Push notifications |
| `notify-on-message` | 143 | DB trigger on community chat INSERT | Push notifications |
| `notify-product-flagged` | 133 | DB trigger on product flag INSERT | Push notifications |
| `send-market-reminders` | 150 | DB trigger / cron | Email notifications |
| `send-notification-email` | 978 | DB trigger via `net.http_post` | Postmark emails (11 types) |
| `send-push-notification` | 385 | DB trigger (6 migration refs) | Push notifications |
| `send-transaction-email` | 463 | DB trigger (2 refs) | Postmark transaction emails |
| `update-zip-codes` | 188 | DB trigger (1 ref) | `zip_prefix_to_zone` |

### 3e. Webhook / External

| Function | Lines | Source |
|----------|-------|--------|
| `stripe-webhook` | 432 | Stripe webhook events → calls `confirm-payment` |
| `send-phone-otp` | 219 | Phone verification (Twilio) |
| `verify-phone-otp` | 159 | Phone OTP verification |
| `sync-provider-balance` | 163 | Syncs Tremendous/Reloadly balance to DB |

### 3f. Functions Without Direct Callers

| Function | Lines | Status |
|----------|-------|--------|
| `assign-experiment` | 100 | A/B experiment assignment — no active caller |
| `create-offer` | 131 | Custom offer RPC wrapper — no active frontend caller |
| `hold-flow` | ? | Directory exists but no `index.ts` — dead code |
| `sync-locations` | 42 | Community location sync — no active caller |

### 3g. Shared Modules (`supabase/functions/_shared/`)

| Module | Purpose |
|--------|---------|
| `cors.ts` | CORS headers |
| `serve-with-cors.ts` | Edge function wrapper with auth, env, error handling |
| `push-notify.ts` | Push notification helper (`sendPushNotification`, `getUserDisplayName`) |
| `postmark.ts` | Postmark email delivery |
| `tremendous.ts` | Tremendous gift card API client |
| `reloadly.ts` | Reloadly gift card API client |
| `gift-card-types.ts` | Gift card type definitions and fee computation |
| `pick-best-provider.ts` | Provider comparison (Tremendous vs Reloadly) |
| `grace-period.ts` | Instrument grace period logic for disabled providers |
| `payout-email.ts` | Payout email templates |
| `twilio.ts` | Twilio SMS client |
| `batch-paypal-payout.ts` | PayPal batch payout helper |
| `test-helpers.ts` | Shared test utilities |

---

## 4. Database Architecture

### 4a. Statistics
- **305 migrations** in `supabase/migrations/`
- **~95 tables** across the schema
- **33 pgTAP test files** in `supabase/tests/database/`

### 4b. Core Market Tables

| Table | Purpose |
|-------|---------|
| `market_booths` | Seller booth profiles |
| `market_products` | Product listings |
| `market_orders` | Order records |
| `market_holds` | Stripe hold records during checkout |
| `market_settlements` | Seller settlement records |
| `market_ledger` | Market-specific earnings ledger |
| `market_notifications` | In-app notifications (read by Navbar.tsx) |
| `market_conversations` | DM conversation records |
| `market_chat_messages` | DM messages |
| `market_chat_reactions` | DM reactions |
| `market_followers` | Following relationships |
| `market_state_blocks` | State-based marketplace restrictions |
| `market_blocks` | User blocking |
| `market_schedule_policies` | Booth operating hours |
| `market_settings` | Per-booth settings |
| `market_reminders` | Scheduled market reminders |

### 4c. Financial Tables

| Table | Purpose |
|-------|---------|
| `payment_transactions` | Stripe payment records |
| `point_ledger` | Complete points transaction history |
| `purchased_points_buckets` | FIFO tracking of purchased point buckets |
| `point_bucket_consumptions` | Consumption records for purchased buckets |
| `redemptions` | Gift card / donation / cashout records |
| `provider_transactions` | External provider transaction records |
| `platform_bank_ledger` | Platform-level financial ledger |
| `buyer_debts` | Outstanding buyer debt from failed settlements |
| `settlement_captures` | Individual Stripe capture operations |
| `user_settlements` | Per-user settlement records |
| `user_balances` | Materialized balance view |
| `platform_fees` | Fee configuration |
| `instrument_queuing_status` | Circuit breaker state for redemption providers |

### 4d. Community Tables

| Table | Purpose |
|-------|---------|
| `communities` | H3-based community cells |
| `community_chat_messages` | Community chat messages |
| `community_chat_reactions` | Community chat reactions |
| `community_chat_flags` | Flagged community messages |
| `community_chat_mutes` | Muted users in community chat |
| `community_discussion_topics` | Discussion topics |

### 4e. Order Lifecycle Tables

| Table | Purpose |
|-------|---------|
| `order_chat_messages` | In-order chat messages |
| `order_disputes` | Dispute records |
| `order_dispute_messages` | Dispute conversation messages |
| `digital_receipts` | Auto-generated receipts |

### 4f. Compliance & Tax Tables

| Table | Purpose |
|-------|---------|
| `counties` | County jurisdiction data |
| `category_tax_rules` | Per-category tax rules |
| `product_tax_overrides` | Per-product tax exceptions |
| `zip_tax_cache` | Cached ZIP→tax rate lookups |
| `tax_reporting_thresholds` | Per-state 1099 thresholds |
| `quarantine_zones` | Agricultural quarantine zones |
| `category_restrictions` | Restricted product categories |
| `state_redemption_method_blocks` | Per-state redemption restrictions |

---

## 5. Data Flow: Function → Table → App

### 5a. Market App Notification Pipeline

```
market-cron ──────────┐
process-redemptions ──┤──→ market_notifications ──→ Navbar.tsx (next-market)
notify-dm-message ────┘    (read by useNotifications)
```

### 5b. Payment Pipeline

```
BuyModal.tsx ──→ create-payment-intent ──→ Stripe ──→ stripe-webhook
                                                         │
                                                    confirm-payment ──→ point_ledger
                                                                        purchased_points_buckets
                                                                        payment_transactions
```

### 5c. Order Lifecycle

```
BuyModal.tsx ──→ market-hold ──→ market_holds (Stripe hold)
          │
     create-order ──→ market_orders
                       │
          ├── seller confirms delivery
          │      │
          │      └── execute-settlement-captures ──→ settlement_captures
          │                                          market_settlements
          │                                          market_ledger
          │
          ├── buyer disputes
          │      └── order_disputes, order_chat_messages
          │
          └── DB trigger ──→ send-notification-email (order_placed)
                          └── notify-on-market-message (push)
```

### 5d. Seller Payout Pipeline

```
earnings/payout ──→ market-cashout-paypal ──→ PayPal Payouts API
                 └── market-donate-earnings ──→ GlobalGiving API
                 └── market-purchase-gift-card ──→ Tremendous/Reloadly API
                     All write to: market_ledger, redemptions, platform_bank_ledger
```

### 5e. Community Points Pipeline

```
buy-points page ──→ create-payment-intent ──→ Stripe
                                                │
                                           stripe-webhook
                                                │
                                           confirm-payment ──→ point_ledger

redeem page ──→ redeem-gift-card ──→ Tremendous/Reloadly
             └── donate-points ──→ GlobalGiving
             └── redeem-paypal-payout ──→ PayPal
                 All write to: redemptions, point_ledger
                 Failed ones → process-redemptions (cron retry)
```

---

## 6. Test Architecture

### 6a. Test Layers

| Layer | Framework | Count | Location |
|-------|-----------|-------|----------|
| **pgTAP** (DB) | pgTAP | 33 files | `supabase/tests/database/*.test.sql` |
| **Deno Integration** | Deno.test | 27 files | `supabase/functions/_tests/*.test.ts` |
| **Deno Legacy** | Deno.test | 2 files | `supabase/functions/tests/*.ts` |
| **Vitest Unit** | Vitest | 44 files (market) | `apps/next-market/**/*.test.*` |
| **Playwright E2E** | Playwright | 20 specs | `apps/next-market/e2e/*.spec.ts` |
| **Other App Tests** | Vitest | 20 files | `apps/next-{admin,community,voice,metrics}` |

### 6b. pgTAP Test Files (33)

```
01_jurisdiction_restrictions    18_listing_lifecycle
02_market_schema                19_order_completion_receipts
03_market_settlement            20_cash_flow_system
04_market_settlement_stress     21_payout_system
05_balance_first_hold           22_payout_stress_test
06_product_expiration           23_100k_stress_test
07_market_schedule              25_market_lifecycle_cron
08_platform_fees                26_zone_pulse
09_tax_thresholds               27_product_drafts
10_flagging_flow                27_quarantine_zones
11_banned_users                 28_moderation
12_place_order                  29_direct_messaging
13_transaction_summary          30_tax_system
14_analytics_and_functions      31_multi_user_settlement
15_rls_policies                 32_grower_search
16_triggers_and_functions       33_buyer_product_notifications
17_market_state_blocks
```

### 6c. Deno Integration Tests (27 files)

```
background-functions        negative-cases
casabot                     notification-functions
cash-flow-rpcs              notification-rpcs
create-order                onboarding-functions
create-payment-intent       payment-errors
execute-auto-payouts        payout-flow
get-tax-rate                payout-rpcs
grower-digest               phone-otp
indirect-market-functions   place_market_order
market-hold                 redemption-flow
market-purchase-gift-card   refund-purchased-points
market-schema               sandbox-api
moderate-listing            settlement-captures
                            stripe-webhook
```

### 6d. Playwright E2E Specs (20 files)

```
booth-deep          functional-flows     order-deep
booth-setup         listing-lifecycle    order-flow
comprehensive       login                pages
earnings-flow       market-browse        pages-deep
financial-flow      remaining-interactions
first-booth-alpha   screenshot
```

Scenario specs:
```
scenarios/booth-errors
scenarios/order-flows
scenarios/pioneer-banner
```

### 6e. next-market Vitest Tests (44 files)

Located in `apps/next-market/app/**/__tests__/` covering:
- Component unit tests (BuyModal, CartSheet, ProductCard, etc.)
- Page render tests (all 43 pages)
- Library tests (supabase client, store, hooks)
- Negative path tests (BuyModal-Negative, error toasts)

---

## 7. send-notification-email: All 11 Email Types

| Type | Trigger | Recipient |
|------|---------|-----------|
| `order_placed` | DB trigger on order INSERT | Both buyer and seller |
| `offer_made` | DB trigger on offer INSERT | Post author (buyer) |
| `order_disputed` | Dispute creation | Both parties |
| `dispute_resolved` | Admin resolves dispute | Both parties |
| `chat_initiated` | First DM message | Message recipient |
| `points_purchase` | Payment confirmation | Buyer |
| `points_redemption` | Gift card / cashout completion | User |
| `points_refund` | Refund back to credit card | User |
| `tax_threshold_warning` | Earnings cross state threshold | Seller |
| `delegation_revoked` | Delegation cancelled | Delegate |
| `delegation_accepted` | Delegate accepts invitation | Delegator |

---

## 8. Cron Jobs

| Function | Schedule | What It Does |
|----------|----------|--------------|
| `market-cron` | Daily | Market reminders, daily digest emails, notification cleanup |
| `process-redemptions` | Periodic | Retries failed gift card / PayPal / donation fulfillments |
| `execute-auto-payouts` | Triggered | Auto-settles eligible orders |
| `sync-provider-balance` | Periodic | Syncs Tremendous / Reloadly account balances |

---

## 9. External Services

| Service | Purpose | Functions Using It |
|---------|---------|-------------------|
| **Stripe** | Payments, holds, captures, refunds | `create-payment-intent`, `market-hold`, `stripe-webhook`, `confirm-payment`, `execute-settlement-captures`, `refund-purchased-points` |
| **PayPal** | Seller cashout payouts | `market-cashout-paypal`, `redeem-paypal-payout`, `process-redemptions` |
| **Tremendous** | Gift card fulfillment (preferred) | `redeem-gift-card`, `market-purchase-gift-card`, `process-redemptions` |
| **Reloadly** | Gift card fulfillment (fallback) | `redeem-gift-card`, `market-purchase-gift-card`, `process-redemptions` |
| **GlobalGiving** | Charitable donations | `donate-points`, `market-donate-earnings`, `fetch-donation-projects` |
| **Postmark** | Transactional emails | `send-notification-email`, `send-market-email`, `send-transaction-email` |
| **USPS** | Address validation + ZIP+4 | `resolve-usps-address` |
| **Nominatim** | Geocoding (address → lat/lng) | `resolve-community` |
| **Overpass** | OSM data for community naming | `resolve-community`, `enrich-communities` |
| **Twilio** | Phone OTP verification | `send-phone-otp`, `verify-phone-otp` |
| **Gemini AI** | Product photo analysis, moderation | `analyze-product-photo`, `moderate-listing`, `casabot-reply` |

---

## 10. Quick Reference: Function → App Mapping

### Functions EXCLUSIVELY used by next-market:
`analyze-product-photo`, `casabot-reply`, `execute-settlement-captures`, `fetch-market-gift-cards`, `market-cashout-paypal`, `market-cron`, `market-donate-earnings`, `market-hold`, `market-purchase-gift-card`, `moderate-listing`, `resolve-community` (onboarding), `resolve-usps-address` (onboarding), `send-market-email`, `send-market-reminders`, `notify-on-market-message`, `notify-dm-message`, `notify-product-flagged`

### Functions EXCLUSIVELY used by community apps:
`fetch-gift-cards`, `pair-delegation`, `redeem-gift-card`, `redeem-paypal-payout`, `donate-points`, `refund-purchased-points`, `get-tax-rate`

### Functions shared between market + community:
`create-payment-intent`, `confirm-payment`, `create-order`, `resolve-pending-payments`, `register-push-token`, `fetch-donation-projects`

### Functions used by admin:
`process-redemptions`, `simulate-bank-deposit`

### Functions with NO app caller (DB/webhook/cron only):
`casabot-auto-reply`, `enrich-communities`, `execute-auto-payouts`, `notify-on-message`, `send-notification-email`, `send-push-notification`, `send-transaction-email`, `stripe-webhook`, `update-zip-codes`

### Dead/Dormant:
`assign-experiment`, `create-offer`, `hold-flow`, `sync-locations`, `send-phone-otp`, `verify-phone-otp`, `sync-provider-balance`
