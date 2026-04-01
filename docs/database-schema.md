# CasaGrown — Database Schema & Edge Function Reference

> **Last Updated:** 2026-04-01  
> **Tables:** ~95 | **Migrations:** 305 | **Edge Functions:** 48

---

## Table of Contents

1. [Market App Tables](#1-market-app-tables)
2. [Admin App Tables](#2-admin-app-tables)
3. [Voice App Tables](#3-voice-app-tables)
4. [Metrics App Tables](#4-metrics-app-tables)
5. [Shared / Cross-App Tables](#5-shared--cross-app-tables)
6. [Edge Functions by App](#6-edge-functions-by-app)

---

## 1. Market App Tables

### 1.1 Core Commerce

#### `market_booths`
One booth per seller. Stores booth identity, fulfillment options, and theme.
```sql
id              UUID PK DEFAULT gen_random_uuid()
owner_id        UUID NOT NULL FK → profiles(id) UNIQUE
name            TEXT NOT NULL
description     TEXT
decorative_theme TEXT DEFAULT 'floral'
about_html      TEXT
invite_code     TEXT UNIQUE
offers_delivery BOOLEAN DEFAULT true
delivery_radius_miles INTEGER DEFAULT 5
offers_pickup   BOOLEAN DEFAULT true
pickup_address  TEXT
market_day_of_week INTEGER DEFAULT 6  -- 0=Sun, 6=Sat
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```
RLS: Public read, owner write.

#### `market_products`
Per-market-day product listings tied to a seller.
```sql
id              UUID PK
seller_id       UUID NOT NULL FK → profiles(id)
market_date     DATE NOT NULL
name            TEXT NOT NULL
description     TEXT
category        TEXT NOT NULL DEFAULT 'produce'
price_usd       NUMERIC(10,2) NOT NULL
unit            TEXT NOT NULL DEFAULT 'each'
inventory       INTEGER NOT NULL DEFAULT 0
photos          TEXT[] DEFAULT '{}'
is_active       BOOLEAN DEFAULT true
harvested_at    TIMESTAMPTZ
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```
Indexes: `seller_id`, `market_date`, `(seller_id, market_date)`. RLS: Public read, seller write.

#### `market_orders`
Individual order records linking buyer → seller → product.
```sql
id              UUID PK
buyer_id        UUID NOT NULL FK → profiles(id)
seller_id       UUID NOT NULL FK → profiles(id)
booth_id        UUID NOT NULL FK → market_booths(id)
product_id      UUID NOT NULL FK → market_products(id)
product_name    TEXT NOT NULL
quantity        INTEGER NOT NULL CHECK (> 0)
unit_price_usd  NUMERIC(10,2) NOT NULL
subtotal_usd    NUMERIC(10,2) NOT NULL
tax_rate_pct    NUMERIC(7,4) DEFAULT 0
tax_amount_usd  NUMERIC(10,2) DEFAULT 0
platform_fee_pct NUMERIC(5,2) DEFAULT 10
platform_fee_usd NUMERIC(10,2) DEFAULT 0
total_usd       NUMERIC(10,2) NOT NULL
fulfillment_type TEXT CHECK (IN 'delivery', 'pickup')
status          market_order_status DEFAULT 'pending'
hold_id         UUID FK → market_holds(id)
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```
RLS: Buyer reads own orders, seller reads orders for their products.

#### `market_holds`
Stripe PaymentIntent holds. One active hold per buyer at a time.
```sql
id                      UUID PK
buyer_id                UUID NOT NULL FK → profiles(id)
stripe_payment_intent_id TEXT NOT NULL
stripe_client_secret    TEXT NOT NULL
hold_amount_cents       INTEGER NOT NULL
spent_amount_cents      INTEGER DEFAULT 0
status                  TEXT CHECK (IN 'active','captured','cancelled','expired')
created_at              TIMESTAMPTZ
updated_at              TIMESTAMPTZ
```
Partial unique: `(buyer_id) WHERE status = 'active'`.

### 1.2 Settlement & Financial

#### `market_ledger`
Append-only financial ledger per user. No UPDATE/DELETE policies.
```sql
id              SERIAL PK
created_at      TIMESTAMPTZ
event_type      TEXT CHECK (IN 'hold_placed','hold_captured','hold_released',
                'order_completed','fee_charged','refund_issued',
                'settlement_credit','funds_cleared','payout_sent')
user_id         UUID NOT NULL FK → profiles(id)
order_id        UUID FK → market_orders(id)
settlement_id   UUID
amount_usd      NUMERIC(10,2) CHECK (>= 0)
direction       TEXT CHECK (IN 'debit','credit')
balance_after   NUMERIC(10,2) NOT NULL
metadata        JSONB DEFAULT '{}'
```

#### `market_settlements`
One settlement per market date. Tracks full clearing lifecycle.
```sql
id                       UUID PK
market_date              DATE NOT NULL UNIQUE
status                   clearing_status DEFAULT 'captures_sent'
total_orders             INTEGER DEFAULT 0
total_captured_usd       NUMERIC(10,2) DEFAULT 0
total_released_usd       NUMERIC(10,2) DEFAULT 0
total_payouts_usd        NUMERIC(10,2) DEFAULT 0
total_fees_usd           NUMERIC(10,2) DEFAULT 0
total_refunds_usd        NUMERIC(10,2) DEFAULT 0
stripe_payout_id         TEXT
stripe_payout_amount_usd NUMERIC(10,2)
stripe_payout_received_at TIMESTAMPTZ
reconciliation_check     JSONB DEFAULT '{}'
created_at               TIMESTAMPTZ
updated_at               TIMESTAMPTZ
```

#### `user_settlements`
Per-user breakdown within a market settlement.
```sql
id                UUID PK
settlement_id     UUID NOT NULL FK → market_settlements(id)
user_id           UUID NOT NULL FK → profiles(id)
gross_sales_usd   NUMERIC(10,2) DEFAULT 0
total_purchases_usd NUMERIC(10,2) DEFAULT 0
refunds_issued_usd NUMERIC(10,2) DEFAULT 0
refunds_received_usd NUMERIC(10,2) DEFAULT 0
platform_fees_usd NUMERIC(10,2) DEFAULT 0
hold_captured_usd NUMERIC(10,2) DEFAULT 0
hold_released_usd NUMERIC(10,2) DEFAULT 0
net_payout_usd    NUMERIC(10,2) DEFAULT 0
status            TEXT CHECK (IN 'pending','available','paid_out')
created_at        TIMESTAMPTZ
UNIQUE(settlement_id, user_id)
```

#### `settlement_captures`
Individual Stripe capture operations per hold.
```sql
id                     UUID PK
settlement_id          UUID FK → market_settlements(id)
hold_id                UUID FK → market_holds(id)
buyer_id               UUID FK → profiles(id)
stripe_payment_intent_id TEXT NOT NULL
hold_amount_usd        NUMERIC(10,2)
capture_amount_usd     NUMERIC(10,2)
release_amount_usd     NUMERIC(10,2)
capture_status         TEXT CHECK (IN 'pending','captured','failed','released')
stripe_capture_id      TEXT
error_message          TEXT
created_at             TIMESTAMPTZ
updated_at             TIMESTAMPTZ
```

#### `user_balances`
Materialized balance view per user.
```sql
user_id           UUID PK FK → profiles(id)
available_usd     NUMERIC(10,2) DEFAULT 0
pending_usd       NUMERIC(10,2) DEFAULT 0
total_earned_usd  NUMERIC(10,2) DEFAULT 0
total_spent_usd   NUMERIC(10,2) DEFAULT 0
total_withdrawn_usd NUMERIC(10,2) DEFAULT 0
updated_at        TIMESTAMPTZ
```

#### `platform_bank_ledger`
Platform-level (company) financial ledger tracking all money flows.
```sql
id            BIGSERIAL PK
created_at    TIMESTAMPTZ
event_type    TEXT CHECK (IN 'stripe_payout_received','balance_applied',
              'cashout_sent','gift_card_purchased','donation_sent',
              'stripe_refund','chargeback_debit','stripe_fees','manual_adjustment')
direction     TEXT CHECK (IN 'inflow','outflow')
amount_usd    NUMERIC(10,2) CHECK (> 0)
balance_after NUMERIC(10,2)
provider      TEXT CHECK (IN 'stripe','paypal','venmo','tremendous',
              'reloadly','globalgiving','platform','manual')
```

#### `buyer_debts`
Outstanding debts from failed captures or chargebacks.
```sql
id            UUID PK
buyer_id      UUID FK → profiles(id)
settlement_id UUID FK → market_settlements(id)
capture_id    UUID FK → settlement_captures(id)
amount_usd    NUMERIC(10,2) CHECK (> 0)
reason        TEXT CHECK (IN 'capture_failed','chargeback','post_settlement_refund')
status        TEXT CHECK (IN 'outstanding','recovered','written_off','disputed')
```

### 1.3 Order Lifecycle

#### `order_disputes`
```sql
id, order_id (UNIQUE), initiated_by, reason, photos JSONB,
refund_type ('full'|'partial'), refund_amount_usd, pickup_offered,
status (dispute_status), staff_decision, staff_notes, resolved_at
```

#### `order_dispute_messages`
```sql
id, dispute_id FK, sender_id FK, content TEXT, created_at
```

#### `order_chat_messages`
In-order chat between buyer and seller.
```sql
id, order_id FK, sender_id FK, content TEXT CHECK(length > 0), created_at
```
RLS: Only order buyer/seller can read.

### 1.4 Product Engagement

#### `product_comments`
```sql
id, product_id FK, author_id FK, parent_id FK (self-ref),
body TEXT CHECK(1-2000 chars), is_hidden BOOLEAN, created_at
```

#### `comment_flags` / `comment_likes`
```sql
comment_flags: id, comment_id FK, user_id FK, reason TEXT, UNIQUE(comment_id, user_id)
comment_likes: id, comment_id FK, user_id FK, UNIQUE(comment_id, user_id)
```

#### `product_flags`
```sql
id, product_id FK, user_id FK, reason ('offensive'|'misleading'|'prohibited'|'other'),
details TEXT, UNIQUE(product_id, user_id)
```

#### `product_watches`
```sql
id, user_id FK, keywords TEXT, fulfillment_type TEXT, radius_miles INT,
lat DOUBLE, lng DOUBLE, state_code TEXT, community_h3_index TEXT,
expires_at TIMESTAMPTZ (7 days default)
```

#### `product_reminders`
```sql
id, user_id FK, product_id FK, created_at
```

### 1.5 Messaging (DM)

#### `market_conversations`
```sql
id, participant_a FK, participant_b FK, unread_count_a INT, unread_count_b INT,
last_message_at, UNIQUE(participant_a, participant_b)
```
RLS: Participants only. Blocked users prevented via INSERT CHECK.

#### `market_chat_messages`
```sql
id, conversation_id FK, sender_id FK, parent_id FK (reply threading),
content TEXT CHECK(1-2000), media JSONB, offer_product_id FK, created_at
```

#### `market_chat_reactions`
```sql
id, message_id FK, user_id FK, emoji TEXT, UNIQUE(message_id, user_id, emoji)
```

#### `market_blocks`
```sql
id, blocker_id FK, blocked_id FK, UNIQUE(blocker_id, blocked_id)
```

### 1.6 Community Chat

#### `community_chat_messages`
```sql
id, community_h3_index FK → communities, author_id FK, parent_id FK (self-ref),
content TEXT(1-2000), media JSONB, product_listing_id UUID,
is_system BOOLEAN, is_pinned BOOLEAN, edited_at, created_at
```

#### `community_chat_reactions` / `community_chat_flags` / `community_chat_mutes`
Per-message reactions, flags, and per-user mutes within a community.

#### `community_discussion_topics`
```sql
id, community_h3_index FK, title TEXT, created_at
```

### 1.7 Notifications & Tracking

#### `market_notifications`
```sql
id, user_id FK, content TEXT, link_url TEXT, read_at TIMESTAMPTZ, created_at
```
RLS: User reads own. Written by cron, triggers, and edge functions.

#### `market_followers`
```sql
id, follower_id FK, booth_id FK, created_at, UNIQUE(follower_id, booth_id)
```

#### `zone_pulse`
Change-tracking for zone-based polling.
```sql
zone_id TEXT PK, last_updated TIMESTAMPTZ
```
Updated by triggers on product/booth changes.

#### `buyer_product_notifications`
```sql
id, user_id FK, product_id FK, type TEXT, created_at
```

### 1.8 Booth Management

#### `booth_helpers`
```sql
id, booth_id FK, helper_id FK, status ('pending'|'accepted'|'revoked'),
created_at, updated_at, UNIQUE(booth_id, helper_id)
```

#### `market_settings`
```sql
booth_id FK PK, key TEXT, value JSONB, updated_at
```

#### `market_schedule_policies`
```sql
id, booth_id FK, day_of_week INT, opens_at TIME, closes_at TIME
```

#### `market_reminders`
```sql
id, user_id FK, type TEXT, scheduled_at TIMESTAMPTZ, sent_at
```

### 1.9 Seller Onboarding

#### `demo_booth_templates`
```sql
id SERIAL, seller_name, booth_name, description, decorative_theme,
delivery_radius_miles, rating_min/max, rating_count_min/max
```

#### `demo_product_catalog`
```sql
id SERIAL, name, description, price_usd, unit, category, photo_url
```

---

## 2. Admin App Tables

### 2.1 Configuration & Policies

#### `market_state_blocks`
Per-state marketplace availability toggle.
```sql
id, state_id FK → states(id) UNIQUE, reason TEXT, created_at
```

#### `platform_fees` / `platform_settings`
```sql
platform_fees: id, fee_type TEXT, percentage NUMERIC, flat_amount NUMERIC
platform_settings: key TEXT PK, value JSONB, updated_at
```

#### `sales_categories`
```sql
id, name TEXT UNIQUE, display_name TEXT, created_at
```

#### `category_restrictions`
```sql
id, state_code TEXT, county_id FK, category_name FK, restriction_type TEXT, reason TEXT
```

#### `blocked_products`
```sql
id, product_id FK, reason TEXT, blocked_by FK, created_at
```

### 2.2 Tax & Compliance

#### `category_tax_rules`
```sql
id, state_code TEXT, category_name FK, rule_type (tax_rule_type),
rate_pct NUMERIC(5,3), notes, effective_from DATE, effective_until DATE
```

#### `product_tax_overrides`
```sql
id, product_id FK, override_type TEXT, rate_pct NUMERIC, reason TEXT
```

#### `tax_reporting_thresholds`
```sql
id, state_code TEXT, threshold_usd NUMERIC, form_type TEXT ('1099-K'|etc)
```

#### `counties`
```sql
id, name TEXT, state_id FK, fips_code TEXT
```

#### `quarantine_zones`
```sql
id, country_iso_3 DEFAULT 'USA', state_id FK, county_id FK, city_id FK,
category TEXT, pest_name TEXT, starts_at DATE, ends_at DATE
```

### 2.3 Campaigns & Incentives

#### `incentive_campaigns`
```sql
id, name TEXT, description, starts_at, ends_at, is_active BOOLEAN
```

#### `campaign_zones` / `campaign_rewards`
Zone targeting and reward definitions for campaigns.

### 2.4 User Management

#### `beta_testers`
```sql
id, full_name, email UNIQUE, phone_number, nearest_highschool,
zip_code, campaign_code, referral_source, referral_url, signed_up_at
```

#### `profile_audit_log`
```sql
id, user_id FK, field_name TEXT, old_value TEXT, new_value TEXT, changed_at
```

#### `user_analytics`
```sql
user_id FK, first_order_at, last_order_at, total_orders INT,
total_spent_usd NUMERIC, total_earned_usd NUMERIC
```

### 2.5 Redemption Management

#### `available_redemption_methods` / `available_redemption_method_instruments`
```sql
methods: id, name, display_name, is_active
instruments: id, instrument TEXT, is_active BOOLEAN, disabled_at TIMESTAMPTZ
```

#### `instrument_queuing_status`
Circuit breaker for redemption providers.
```sql
instrument TEXT PK, is_queuing BOOLEAN DEFAULT false
```

#### `state_redemption_method_blocks`
```sql
id, state_code TEXT, method_name TEXT, reason TEXT
```

### 2.6 Error Tracking

#### `edge_function_errors`
```sql
id, created_at, function_name TEXT, error_message TEXT,
error_stack TEXT, request_method TEXT, request_path TEXT
```

#### `client_errors`
```sql
id, user_id FK, page_url TEXT, error_message TEXT,
stack_trace TEXT, component_stack TEXT, browser_info TEXT
```

---

## 3. Voice App Tables

The Voice app (`next-community-voice`) reads from these tables. The main data store is the existing `community_feedback` infrastructure managed via the `feedback_*` tables:

#### `feedback` (community_feedback)
Public feedback/suggestion tickets submitted by community members.

#### `feedback_comment_media`
Media attachments on feedback comments.

#### `feedback_flags`
```sql
id, feedback_id FK, user_id FK, reason TEXT, UNIQUE(feedback_id, user_id)
```

#### `feedback_status_history`
```sql
id, feedback_id FK, old_status, new_status, changed_by FK, changed_at
```

#### `staff_members`
```sql
id FK → profiles, role TEXT, permissions JSONB
```

Note: Voice app also reads from `profiles`, `communities` for user display.

---

## 4. Metrics App Tables

The Metrics app (`next-metrics`) is a read-only analytics dashboard. It queries these tables via aggregate views/RPCs:

- **`market_orders`** — Sales volume, order counts
- **`market_settlements`** — Settlement totals and status
- **`user_settlements`** — Per-user payouts
- **`market_ledger`** — Financial activity log
- **`platform_bank_ledger`** — Company-level cash position
- **`market_products`** — Active listing counts
- **`market_booths`** — Active seller counts
- **`user_balances`** — User balance distribution
- **`user_analytics`** — User engagement metrics
- **`edge_function_errors`** — Error rates by function
- **`client_errors`** — Frontend error tracking
- **`profiles`** — User registration trends

No tables are exclusively owned by the Metrics app — it aggregates data from other apps.

---

## 5. Shared / Cross-App Tables

### 5.1 Points & Financial (Community + Market)

#### `point_ledger`
Complete points transaction history (both community purchases and market earnings).

#### `purchased_points_buckets`
FIFO tracking of purchased point buckets for closed-loop compliance.

#### `point_bucket_consumptions`
Records which bucket was debited for each redemption.

#### `redemptions`
Gift card, donation, and PayPal cashout records.

#### `provider_transactions`
External provider (Tremendous/Reloadly/PayPal) transaction records.

#### `donation_receipts` / `gift_card_deliveries`
Fulfillment records for donations and gift cards.

### 5.2 Catalog Caches

#### `giftcards_cache`
Cached unified gift card catalog from Tremendous + Reloadly.

#### `charity_projects_cache`
Cached GlobalGiving project catalog.

### 5.3 Compliance

#### `point_purchase_limits`
Per-user point purchase limits.

#### `digital_receipts` / `receipt_footers`
Auto-generated digital receipts and customizable footers.

#### `zip_tax_cache`
Cached ZIP → tax rate lookups.

#### `zip_prefix_to_zone` / `usda_zone_produce`
USDA growing zone lookups.

#### `garden_produce_catalog`
Reference catalog of garden produce by category.

### 5.4 Communication

#### `push_subscriptions`
Web push notification subscriptions.

#### `sms_rate_limits`
Rate limiting for SMS OTP.

#### `grower_produces` / `grower_search_notifications`
Grower produce listings and search notification preferences.

---

## 6. Edge Functions by App

### 6.1 Market App Functions (17)

| Function | Lines | Purpose |
|----------|-------|---------|
| `analyze-product-photo` | 177 | AI photo analysis for listing |
| `casabot-reply` | 229 | AI chatbot for buyer/seller help |
| `execute-settlement-captures` | 208 | Captures held Stripe charges |
| `fetch-donation-projects` | 355 | GlobalGiving projects for donate-earnings |
| `fetch-market-gift-cards` | 325 | Gift card catalog for market redemption |
| `market-cashout-paypal` | 452 | PayPal payout for seller earnings |
| `market-cron` | 860 | Daily: reminders, digest, cleanup |
| `market-donate-earnings` | 319 | Donate seller earnings to charity |
| `market-hold` | 367 | Stripe hold (PaymentIntent) at checkout |
| `market-purchase-gift-card` | 465 | Gift card purchase with earnings |
| `moderate-listing` | 339 | AI moderation of listing content |
| `notify-dm-message` | 100 | Push on DM INSERT (DB trigger) |
| `notify-on-market-message` | 88 | Push on market chat INSERT (DB trigger) |
| `notify-product-flagged` | 133 | Push when product is flagged (DB trigger) |
| `register-push-token` | 61 | Register push subscription |
| `send-market-email` | 123 | Market transactional emails |
| `send-market-reminders` | 150 | Scheduled market reminder emails |

### 6.2 Admin App Functions (2)

| Function | Lines | Purpose |
|----------|-------|---------|
| `process-redemptions` | 564 | Retry failed gift card/PayPal/donation fulfillments |
| `simulate-bank-deposit` | 133 | Simulate bank deposit for testing |

### 6.3 Voice App Functions (0)

Voice app has no dedicated edge functions. It uses Supabase client directly for CRUD on feedback tables.

### 6.4 Metrics App Functions (0)

Metrics app has no dedicated edge functions. It queries DB tables directly via Supabase client.

### 6.5 Shared / Background Functions (29)

| Function | Lines | Trigger | Purpose |
|----------|-------|---------|---------|
| `confirm-payment` | 168 | stripe-webhook | Credits points after payment |
| `create-order` | 215 | packages/app | Creates order record |
| `create-payment-intent` | 234 | packages/app | Creates Stripe PaymentIntent |
| `donate-points` | 274 | packages/app | GlobalGiving donation |
| `fetch-gift-cards` | 371 | packages/app | Community gift card catalog |
| `get-tax-rate` | 195 | packages/app | Sales tax calculation |
| `pair-delegation` | 476 | packages/app | Booth delegation system |
| `redeem-gift-card` | 395 | packages/app | Gift card purchase with points |
| `redeem-paypal-payout` | 406 | packages/app | PayPal cashout with points |
| `refund-purchased-points` | 440 | packages/app | Refund points to credit card |
| `resolve-community` | 538 | Onboarding | H3 community resolution |
| `resolve-pending-payments` | 225 | App open | Resolves stuck payments |
| `resolve-usps-address` | 210 | Onboarding | USPS address validation |
| `stripe-webhook` | 432 | Stripe | Webhook event processing |
| `send-notification-email` | 978 | DB trigger | 11 email types |
| `send-push-notification` | 385 | DB trigger | Push notifications |
| `send-transaction-email` | 463 | DB trigger | Transaction emails |
| `casabot-auto-reply` | 226 | DB trigger | Auto AI reply in chat |
| `enrich-communities` | 277 | resolve-community | Enriches community data |
| `execute-auto-payouts` | 309 | DB trigger | Auto-settles eligible orders |
| `notify-on-message` | 143 | DB trigger | Push on community chat |
| `update-zip-codes` | 188 | DB trigger | ZIP→zone mapping |
| `send-phone-otp` | 219 | — | Phone OTP via Twilio |
| `verify-phone-otp` | 159 | — | OTP verification |
| `sync-provider-balance` | 163 | Periodic | Provider balance sync |
| `assign-experiment` | 100 | — | A/B experiment (dormant) |
| `create-offer` | 131 | — | Custom offer RPC (dormant) |
| `sync-locations` | 42 | — | Location sync (dormant) |
| `hold-flow` | — | — | **⛔ DEPRECATED** — replaced by market-hold |
