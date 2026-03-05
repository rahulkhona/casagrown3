# Data Model

This document defines the complete schema for the application, derived from all
Supabase migrations. Each section includes the SQL DDL, markdown description,
and any associated triggers/functions/RLS policies.

> [!NOTE]
> **Migrations applied (in order)**: `20260131173152_initial_schema` →
> `20260131183000_refactor_redemptions` → `20260131191000_zip_scraped_tracking`
> → `20260131191500_update_zip_tracking` → `20260131192000_scraping_logs` →
> `20260131203000_guest_experimentation` → `20260201100000_auth_triggers` →
> `20260201200000_h3_community_refactor` →
> `20260202161700_update_profiles_schema` → `20260203051900_add_country_code` →
> `20260204055900_point_ledger_rls` → `20260206031500_add_referral_code_trigger`
> → `20260206040000_incentive_rules_rls` → `20260206041000_profiles_rls` →
> `20260206060000_followers_table` → `20260207000000_profiles_public_read_rls` →
> `20260207060000_posts_content_rls` → `20260207070000_shared_tables_rls` →
> `20260207080000_delegation_pairing` → `20260207090000_delegation_links` →
> `20260209235700_create_post_detail_rls` →
> `20260210030000_category_restrictions_rls` → `20260210040000_platform_config`
> → `20260210050000_communities_rls` → `20260210060000_sell_need_by_date` →
> `20260210070000_enrich_communities_cron` → `20260210080000_produce_interests`
> → `20260211000000_post_type_policies` → `20260211100000_posts_on_behalf_of` →
> `20260212000000_public_post_anon_rls` → `20260213000000_chat_delivery_status`
> → `20260213010000_chat_realtime` → `20260214000000_payment_transactions` →
> `20260214100000_signup_baseline_ledger` →
> `20260214200000_points_per_unit_rename` →
> `20260215090000_order_status_pending` → `20260215090001_order_default_pending`
> → `20260215100000_balance_after_trigger` →
> `20260215200000_create_order_atomic` → `20260216070000_order_version` →
> `20260216070001_accept_reject_versioned` →
> `20260217000001_modify_order_address` → `20260217000002_rpc_user_messages` →
> `20260217000003_storage_buckets` → `20260217000004_storage_policies` →
> `20260217000005_chat_media_bucket` → `20260217000006_cancel_order_rpc` →
> `20260217000007_mark_delivered_rpc` → `20260217000008_confirm_delivery_rpc` →
> `20260217000009_dispute_escalation_rpcs` → `20260217000010_fix_point_flow` →
> `20260217000011_orders_realtime` → `20260217000012_order_messages_with_units`
> → `20260217000013_modify_order_with_units` →
> `20260217003100_add_unit_to_order_messages` →
> `20260217003200_modify_order_unit_messages` →
> `20260218000000_add_buy_quantity_unit` →
> `20260218000001_order_conversation_param` →
> `20260219000001_role_specific_messages` →
> `20260219000002_cancel_order_system_message` →
> `20260219099000_offer_status_withdrawn` → `20260219100000_offers_extended` →
> `20260219100001_create_offer_atomic` → `20260219100002_accept_offer_atomic` →
> `20260219100003_reject_offer_rpc` → `20260219100004_withdraw_offer_rpc` →
> `20260219100005_modify_offer_rpc` → `20260219999000_storage_buckets_fix` →
> `20260220000000_storage_rls_policies` →
> `20260220100000_offer_message_from_seller` →
> `20260220100001_buy_details_unique_postid` →
> `20260220200000_offer_delivery_dates` →
> `20260220300000_accept_offer_buyer_qty` → `20260220400000_staff_members` →
> `20260220400001_feedback_enhancements` → `20260220400002_feedback_rls` →
> `20260220400003_staff_email_lookup` → `20260220400004_feedback_storage` →
> `20260220400005_document_media_type` → `20260220400006_feedback_flags` →
> `20260222100000_redemption_providers` → `20260223000000_feature_waitlist` →
> `20260223020000_redemptions_rls_policies` → `20260223100000_delegation_splits`
> → `20260223100001_complete_order_with_split` →
> `20260224000000_communities_upsert_rls` →
> `20260224000001_delegations_realtime` → `20260224000002_realtime_identities` →
> `20260225000000_push_subscriptions` →
> `20260225000001_notify_on_message_trigger` →
> `20260225000002_notify_delegator_on_post` →
> `20260225000003_notify_delegator_on_order` →
> `20260225000004_notify_user_on_redemption` →
> `20260225000005_notify_delegator_on_reject` →
> `20260225000006_snapshot_delegation_split` →
> `20260225000007_notify_on_revocation` → `20260225000008_provider_queue_status`
> → `20260226000001_provider_disabled_grace_period` →
> `20260227023104_add_paypal_payout_id_to_profiles` →
> `20260227024500_add_paypal_provider` → `20260227195508_platform_fees` →
> `20260227210144_redemption_architecture` →
> `20260227210145_instrument_grace_period` →
> `20260228004000_closed_loop_buckets` → `20260228004500_fifo_rpc_updates` →
> `20260228042110_giftcards_cache` →
> `20260228065500_platform_config_deprecation` →
> `20260228070000_country_refund_fees` → `20260228070500_add_venmo_enum` →
> `20260228200440_backfill_refund_gift_cards` →
> `20260228213340_finalize_gift_card_redemption_rpc` →
> `20260228220038_universal_finalize_redemption_rpc` →
> `20260228230000_deprecate_old_rpcs` →
> `20260301000000_acid_donation_refund_fixes` →
> `20260301079000_add_escrow_refund_type` → `20260301080000_dynamic_categories`
> → `20260301080100_update_create_order_rpc` →
> `20260301080200_update_accept_offer_rpc` → `20260301080300_ban_category_rpc` →
> `20260301080400_add_category_restriction_rpc` →
> `20260301080500_ban_product_rpc` → `20260301090000_incentive_campaigns` →
> `20260301090100_sales_tax_rules` → `20260301100000_profile_overhaul` →
> `20260301100100_garden_categories` → `20260301100200_drop_incentive_rules` →
> `20260301100300_zipcode_popular_produce` → `20260301100500_user_garden_rls` →
> `20260301100600_tax_rate_cache` → `20260301100700_order_tax_columns` →
> `20260301100800_sales_tax_ledger_type` → `20260301100900_seed_ca_tax_rules` →
> `20260303000000_post_moderation_pipeline` → `20260305000000_compliance_ddl` →
> `20260305000001_compliance_functions` →
> `20260305000100_seed_redemption_blocks` →
> `20260305000200_edge_function_errors`

## Extensions

```sql
create extension if not exists "pgcrypto";  -- required for gen_random_uuid()
create extension if not exists postgis;     -- required for spatial queries (H3, geometry types)
create extension if not exists pg_cron with schema pg_catalog;   -- cron-style job scheduling (20260210070000)
create extension if not exists pg_net with schema extensions;    -- HTTP requests from Postgres (20260210070000)
```

---

## Enums

All custom enum types used across the schema.

```sql
create type incentive_action as enum (
  'signup', 'complete_basic_profile', 'join_a_community', 'make_first_post',
  'invite_people_to_community', 'invitee_signing_up',
  'invitee_making_first_transaction', 'making_first_transaction'
);

create type incentive_scope as enum ('global', 'country', 'state', 'city', 'zip', 'community');

create type point_transaction_type as enum (
  'purchase', 'transfer', 'payment', 'platform_charge', 'redemption', 'reward',
  'hold',              -- buyer's points held until order completes (was 'escrow', renamed by 20260305000000)
  'refund',            -- points returned to buyer if order is cancelled (20260215090000)
  'platform_fee',      -- platform fee deducted from seller payout (20260227195508)
  'donation',          -- points spent on charitable donations (20260222100000)
  'delegation_split',  -- delegate/delegator share of a delegated sale (20260223100000)
  'hold_refund',       -- refund of held points (was 'escrow_refund', renamed by 20260305000000)
  'sales_tax'          -- sales tax collected on an order (20260301100800)
);

create type post_type as enum (
  'want_to_sell', 'want_to_buy', 'offering_service',
  'need_service', 'seeking_advice', 'general_info'
);

create type post_reach as enum ('community', 'global');

create type sales_category as enum (
  'fruits', 'vegetables', 'herbs', 'flowers',
  'flower_arrangements', 'garden_equipment', 'pots', 'soil'
);

create type unit_of_measure as enum ('piece', 'dozen', 'box', 'bag');
create type media_asset_type as enum ('video', 'image');
create type offer_status as enum ('pending', 'accepted', 'rejected', 'withdrawn');
-- Updated by 20260219099000: added 'withdrawn'
-- Updated by 20260215090000: added 'pending' (before 'accepted'), 'delivered', 'cancelled'
-- Updated by 20260217000008: added 'escalated'
-- Updated by 20260305000000: added 'completed' (set when buyer confirms delivery)
create type order_status as enum ('pending', 'accepted', 'delivered', 'completed', 'disputed', 'escalated', 'cancelled');
create type rating_score as enum ('1', '2', '3', '4', '5');
create type chat_message_type as enum ('text', 'media', 'mixed', 'system');
create type escalation_status as enum ('open', 'resolved');
create type escalation_resolution as enum ('refund_accepted', 'resolved_without_refund', 'dismissed');
create type refund_offer_status as enum ('pending', 'accepted', 'rejected');
create type delegation_status as enum ('pending', 'accepted', 'rejected', 'revoked', 'pending_pairing', 'active', 'inactive');
create type restriction_scope as enum ('global', 'country', 'state', 'city', 'zip', 'community');
create type experiment_status as enum ('draft', 'running', 'completed', 'rolled_out', 'rejected');
create type redemption_item_type as enum ('gift_card', 'merchandize', 'donation');
create type redemption_reach_type as enum ('global', 'restricted');
create type redemption_status as enum ('pending', 'completed', 'failed');
create type feedback_type as enum ('feature_request', 'bug_report');
create type feedback_status as enum (
  'open', 'under_review', 'planned', 'in_progress',
  'completed', 'rejected', 'duplicate'
);
create type scraping_status as enum ('success', 'failure', 'zero_results');

-- Added by 20260228004000_closed_loop_buckets
create type purchased_bucket_status as enum (
  'active', 'depleted', 'refunded', 'partially_refunded', 'pending_fulfillment'
);
create type manual_refund_fulfillment_type as enum (
  'physical_check', 'egift_card', 'venmo'  -- 'venmo' added by 20260228070500
);
create type manual_refund_status as enum (
  'pending_verification', 'verification_failed', 'pending_fulfillment', 'fulfilled'
);

-- Added by 20260301090000_incentive_campaigns
create type campaign_behavior as enum (
  'signup', 'first_post', 'first_purchase', 'first_sale',
  'per_referral', 'first_purchase_by_referee', 'first_sale_by_referee'
);

-- Added by 20260301090100_sales_tax_rules
create type tax_rule_type as enum (
  'fixed',      -- rate_pct known (0 = exempt)
  'evaluate'    -- must compute at runtime
);

-- Added by 20260303000000_post_moderation_pipeline
create type post_status as enum (
  'review',      -- Just created, awaiting verification
  'available',   -- Passed review, visible in feed
  'flagged',     -- Community-flagged, hidden pending admin review
  'rejected',    -- AI rejected, user must edit
  'removed'      -- Admin removed
);
```

---

## Geographic Reference Tables

### `countries`

| Column            | Type          | Description                                               |
| :---------------- | :------------ | :-------------------------------------------------------- |
| `iso_3`           | `text`        | **Primary Key**. ISO 3166-1 alpha-3 (e.g., 'USA', 'CAN'). |
| `name`            | `text`        | Country name.                                             |
| `currency_symbol` | `text`        | e.g., '$', '€'.                                           |
| `phone_code`      | `text`        | e.g., '+1'.                                               |
| `created_at`      | `timestamptz` | Default `now()`.                                          |
| `updated_at`      | `timestamptz` | Default `now()`.                                          |

```sql
create table countries (
  iso_3 text primary key,
  name text not null,
  currency_symbol text,
  phone_code text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### `states`

| Column          | Type          | Description                             |
| :-------------- | :------------ | :-------------------------------------- |
| `id`            | `uuid`        | Primary Key.                            |
| `country_iso_3` | `text`        | FK to `countries(iso_3)`.               |
| `code`          | `text`        | State/province code (e.g., 'CA', 'NY'). |
| `name`          | `text`        | Full name (e.g., 'California').         |
| `created_at`    | `timestamptz` | Default `now()`.                        |
| `updated_at`    | `timestamptz` | Default `now()`.                        |

**Unique**: `(country_iso_3, code)`

```sql
create table states (
  id uuid primary key default gen_random_uuid(),
  country_iso_3 text not null references countries(iso_3),
  code text not null,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(country_iso_3, code)
);
```

### `cities`

| Column       | Type          | Description         |
| :----------- | :------------ | :------------------ |
| `id`         | `uuid`        | Primary Key.        |
| `state_id`   | `uuid`        | FK to `states(id)`. |
| `name`       | `text`        | City name.          |
| `created_at` | `timestamptz` | Default `now()`.    |
| `updated_at` | `timestamptz` | Default `now()`.    |

**Unique**: `(state_id, name)`

```sql
create table cities (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references states(id),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(state_id, name)
);
```

### `zip_codes`

| Column            | Type          | Description                          |
| :---------------- | :------------ | :----------------------------------- |
| `zip_code`        | `text`        | PK part 1.                           |
| `country_iso_3`   | `text`        | PK part 2. FK to `countries(iso_3)`. |
| `city_id`         | `uuid`        | FK to `cities(id)`.                  |
| `latitude`        | `numeric`     | Centroid latitude.                   |
| `longitude`       | `numeric`     | Centroid longitude.                  |
| `last_scraped_at` | `timestamptz` | When last scraped for communities.   |

**Primary Key**: `(zip_code, country_iso_3)`

```sql
create table zip_codes (
  zip_code text not null,
  country_iso_3 text not null references countries(iso_3),
  city_id uuid not null references cities(id),
  latitude numeric,
  longitude numeric,
  last_scraped_at timestamptz,  -- added by 20260131191000
  primary key (zip_code, country_iso_3)
);
```

### `communities`

H3-based community definitions. Replaced legacy uuid-based community table via
migration `20260201200000`.

| Column       | Type                      | Description                                             |
| :----------- | :------------------------ | :------------------------------------------------------ |
| `h3_index`   | `text`                    | **Primary Key**. H3 Index (Res 7).                      |
| `name`       | `text`                    | Human-readable name (derived from OSM landmarks).       |
| `location`   | `geometry(Point, 4326)`   | Centroid for spatial queries.                           |
| `boundary`   | `geometry(Polygon, 4326)` | Hexagonal boundary.                                     |
| `city`       | `text`                    | Administrative context.                                 |
| `state`      | `text`                    | State/Region.                                           |
| `country`    | `text`                    | Country code.                                           |
| `metadata`   | `jsonb`                   | Source info (e.g., `{"source": "osm", "osm_id": 123}`). |
| `created_at` | `timestamptz`             | Default `now()`.                                        |
| `updated_at` | `timestamptz`             | Default `now()`.                                        |

**Indexes**: `communities_location_idx` (GiST on `location`)

```sql
create table communities (
    h3_index text primary key,
    name text not null,
    location geometry(Point, 4326),
    boundary geometry(Polygon, 4326),
    city text,
    state text,
    country text,
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index communities_location_idx on communities using gist (location);
```

**RLS Policies** (`20260210050000_communities_rls`):

| Policy                                   | Operation | Rule                  |
| :--------------------------------------- | :-------- | :-------------------- |
| Authenticated users can read communities | `SELECT`  | `using (true)`        |
| Anonymous users can read communities     | `SELECT`  | `using (true)` (anon) |

> [!IMPORTANT]
> **PostGIS geometry via REST API**: The Supabase REST API (PostgREST) returns
> `geometry` columns as **GeoJSON objects**, not WKT strings. For example, the
> `location` column comes back as `{"type": "Point", "coordinates": [lng, lat]}`
> rather than `POINT(lng lat)`. Client-side parsing must handle the GeoJSON
> format. See `profile-screen.tsx` `loadProfile()` for an example that handles
> both formats.

---

## Users & Profiles

### `profiles`

Linked to Supabase Auth `auth.users` table. Auto-created on signup via
`handle_new_user()` trigger.

| Column                          | Type                    | Description                                                    |
| :------------------------------ | :---------------------- | :------------------------------------------------------------- |
| `id`                            | `uuid`                  | **Primary Key** (FK to `auth.users.id`).                       |
| `email`                         | `text`                  | Unique. Copied from auth.users on signup.                      |
| `full_name`                     | `text`                  | Display name.                                                  |
| `avatar_url`                    | `text`                  | URL to avatar image.                                           |
| `phone_number`                  | `text`                  | For SMS notifications.                                         |
| `country_code`                  | `varchar(3)`            | ISO 3166-1 alpha-3 (e.g., 'USA'). Default: 'USA'.              |
| `zip_code`                      | `text`                  | Postal code.                                                   |
| `home_community_h3_index`       | `text`                  | FK to `communities(h3_index)`.                                 |
| `home_location`                 | `geometry(Point, 4326)` | Exact user location (optional).                                |
| `nearby_community_h3_indices`   | `text[]`                | Array of adjacent H3 indices.                                  |
| `notify_on_wanted`              | `boolean`               | Receive "wanted" notifications. Default: `true`.               |
| `notify_on_available`           | `boolean`               | Receive "available" notifications. Default: `true`.            |
| `push_enabled`                  | `boolean`               | Push enabled. Default: `true`.                                 |
| `sms_enabled`                   | `boolean`               | SMS enabled. Default: `false`.                                 |
| `referral_code`                 | `text`                  | Unique 8-char alphanumeric code. Auto-generated via trigger.   |
| `invited_by_id`                 | `uuid`                  | FK to `profiles(id)`. Who referred this user.                  |
| `paypal_payout_id`              | `text`                  | PayPal email or Venmo phone number for cashouts.               |
| `street_address`                | `text`                  | User's street address. Added by `20260301100000`.              |
| `city`                          | `text`                  | City name. Added by `20260301100000`.                          |
| `state_code`                    | `text`                  | 2-letter state code (CA, NY). Added by `20260301100000`.       |
| `zip_plus4`                     | `text`                  | 9-digit ZIP (inferred). Added by `20260301100000`.             |
| `email_verified`                | `boolean`               | Whether email is verified. Default: `false`. `20260301100000`. |
| `phone_verified`                | `boolean`               | Whether phone is verified. Default: `false`. `20260301100000`. |
| `phone_verified_at`             | `timestamptz`           | When phone was last verified. `20260301100000`.                |
| `phone_verification_code`       | `text`                  | Temp 6-digit OTP for phone verification. `20260301100000`.     |
| `phone_verification_expires_at` | `timestamptz`           | OTP expiration timestamp. `20260301100000`.                    |
| `profile_completed_at`          | `timestamptz`           | When wizard was completed. `20260301100000`.                   |
| `tos_accepted_at`               | `timestamptz`           | When ToS was accepted. Nullable. `20260305000000`.             |
| `created_at`                    | `timestamptz`           | Default `now()`.                                               |
| `updated_at`                    | `timestamptz`           | Default `now()`.                                               |

**Triggers**: `trigger_set_referral_code` (auto-generates referral code),
`on_auth_user_created` (creates profile + awards signup points via
`campaign_rewards`), `trg_clear_phone_verification` (auto-clears phone
verification when phone_number changes)

**RPCs**: `verify_phone(p_code TEXT)` — validates OTP code and sets
`phone_verified = true`

**Indexes**: `profiles_home_location_idx` (GiST),
`profiles_nearby_communities_idx` (GIN)

```sql
-- Base table (initial_schema) + columns added by subsequent migrations
create table profiles (
  id uuid primary key references auth.users(id),
  email text unique not null,
  full_name text,
  avatar_url text,
  phone_number text,
  country_code varchar(3) default 'USA',                         -- 20260203051900
  zip_code text,                                                  -- 20260202161700
  home_community_h3_index text references communities(h3_index),  -- 20260201200000
  home_location geometry(Point, 4326),                            -- 20260201200000
  nearby_community_h3_indices text[],                             -- 20260202161700
  notify_on_wanted boolean not null default true,
  notify_on_available boolean not null default true,
  push_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  referral_code text unique,
  invited_by_id uuid references profiles(id),
  paypal_payout_id text,
  street_address text,                                            -- 20260301100000
  city text,                                                       -- 20260301100000
  state_code text,                                                 -- 20260301100000
  zip_plus4 text,                                                  -- 20260301100000
  email_verified boolean not null default false,                    -- 20260301100000
  phone_verified boolean not null default false,                    -- 20260301100000
  phone_verified_at timestamptz,                                   -- 20260301100000
  phone_verification_code text,                                    -- 20260301100000
  phone_verification_expires_at timestamptz,                       -- 20260301100000
  profile_completed_at timestamptz,                                -- 20260301100000
  tos_accepted_at timestamptz,                                      -- 20260305000000
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index profiles_home_location_idx on profiles using gist (home_location);
create index profiles_nearby_communities_idx on profiles using gin (nearby_community_h3_indices);
```

### `stripe_connect_accounts`

Stores the mapping between users and their Stripe Hosted Onboarding/Express
Connect accounts for cash redemptions.

| Column                | Type          | Description                                 |
| :-------------------- | :------------ | :------------------------------------------ |
| `user_id`             | `uuid`        | **Primary Key**, FK to `auth.users(id)`.    |
| `stripe_account_id`   | `text`        | Unique. The `acct_` Stripe Connect account. |
| `onboarding_complete` | `boolean`     | True when they can receive payouts.         |
| `created_at`          | `timestamptz` | Default `now()`.                            |
| `updated_at`          | `timestamptz` | Default `now()`.                            |

**RLS Policies**: Users can read their own. Only Service Role can insert/update
(via Edge Functions). **Indexes**: `stripe_connect_accounts_stripe_id_idx`

```sql
create table stripe_connect_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text unique not null,
  onboarding_complete boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index stripe_connect_accounts_stripe_id_idx on stripe_connect_accounts(stripe_account_id);
```

### `user_garden`

Tracks produce items a user grows.

| Column         | Type          | Description                                                             |
| :------------- | :------------ | :---------------------------------------------------------------------- |
| `id`           | `uuid`        | Primary Key.                                                            |
| `user_id`      | `uuid`        | FK to `profiles(id)`.                                                   |
| `produce_name` | `text`        | Name of the produce.                                                    |
| `category`     | `text`        | Category (fruits/vegetables/flowers/herbs). `20260301100100`.           |
| `is_custom`    | `boolean`     | `true` if user typed a custom name. Default: `false`. `20260301100100`. |
| `created_at`   | `timestamptz` | Default `now()`.                                                        |
| `updated_at`   | `timestamptz` | Default `now()`.                                                        |

**Constraints**: Unique `(user_id, produce_name)` (`20260301100100`)

```sql
create table user_garden (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  produce_name text not null,
  category text default 'vegetables',          -- 20260301100100
  is_custom boolean not null default false,     -- 20260301100100
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index idx_user_garden_unique on user_garden (user_id, produce_name);
```

### `usda_zone_produce`

Zone-based produce suggestions derived from USDA Plant Hardiness Zone data. The
app's garden picker in the profile wizard uses the `get_popular_produce_for_zip`
RPC to query this table via the user's zip code.

**Migration**: `20260301100300_zipcode_popular_produce.sql`

| Column         | Type      | Description                                                                                                                  |
| :------------- | :-------- | :--------------------------------------------------------------------------------------------------------------------------- |
| `zone_group`   | `text`    | PK part 1. Climate zone: `cold`, `cool`, `moderate_cool`, `moderate`, `warm_moderate`, `warm`, `hot`, `tropical`, `DEFAULT`. |
| `produce_name` | `text`    | PK part 2. Produce item name.                                                                                                |
| `category`     | `text`    | `fruits`, `vegetables`, `flowers`, or `herbs`.                                                                               |
| `emoji`        | `text`    | Display emoji.                                                                                                               |
| `season`       | `text`    | `spring`, `summer`, `fall`, `winter`, or `year_round`.                                                                       |
| `rank`         | `integer` | Sort order within zone group. Default: `0`.                                                                                  |

**RLS Policies**: Authenticated + anonymous can read.

### `zip_prefix_to_zone`

Maps 3-digit US zip prefixes to USDA hardiness zone groups. Used by
`get_popular_produce_for_zip` to resolve a user's climate zone.

**Migration**: `20260301100300_zipcode_popular_produce.sql`

| Column       | Type   | Description                                      |
| :----------- | :----- | :----------------------------------------------- |
| `zip_prefix` | `text` | **Primary Key**. 3-digit prefix (e.g., `'950'`). |
| `zone_group` | `text` | Zone group key in `usda_zone_produce`.           |

**RLS Policies**: Authenticated + anonymous can read.

**RPC**: `get_popular_produce_for_zip(p_zip TEXT)` — extracts the 3-digit prefix
from the zip code, looks up the zone group, and returns produce items sorted by
category and rank. Falls back to `'DEFAULT'` zone if no mapping exists.

### `garden_produce_catalog` _(legacy backup)_

Static seed of common produce items. Created by `20260301100100` but superseded
by the USDA zone-based system above (`20260301100300`). **Not queried by the by
the USDA zone-based system above (`20260301100300`). **Not queried by the app.**

### `followers`

User-to-user follow relationships. Auto-inserted when invitee signs up via
referral.

| Column        | Type          | Description                                        |
| :------------ | :------------ | :------------------------------------------------- |
| `follower_id` | `uuid`        | PK part 1. FK to `profiles(id)` on delete cascade. |
| `followed_id` | `uuid`        | PK part 2. FK to `profiles(id)` on delete cascade. |
| `created_at`  | `timestamptz` | Default `now()`.                                   |

**Constraints**: Composite PK `(follower_id, followed_id)`, Check
`follower_id != followed_id` (prevents self-follow)

```sql
create table followers (
  follower_id uuid references profiles(id) on delete cascade,
  followed_id uuid references profiles(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (follower_id, followed_id),
  constraint no_self_follow check (follower_id != followed_id)
);

create index idx_followers_follower on followers (follower_id);
create index idx_followers_followed on followers (followed_id);
```

**RLS Policies** (`20260207070000_shared_tables_rls`): Public reads,
follower-controlled writes.

| Policy                                     | Operation | Rule                                    |
| :----------------------------------------- | :-------- | :-------------------------------------- |
| Follow relationships are publicly readable | `SELECT`  | `using (true)`                          |
| Users can follow others                    | `INSERT`  | `with check (follower_id = auth.uid())` |
| Users can unfollow                         | `DELETE`  | `using (follower_id = auth.uid())`      |

```text
(indexes shown above)
```

---

## Incentive & Points System

### `incentive_rules`

Defines reward point values for user actions, with geographic scoping.

| Column               | Type               | Description                                   |
| :------------------- | :----------------- | :-------------------------------------------- |
| `id`                 | `uuid`             | Primary Key.                                  |
| `action_type`        | `incentive_action` | Action being rewarded.                        |
| `scope`              | `incentive_scope`  | Geographic scope.                             |
| `points`             | `integer`          | Points awarded. Default: `0`.                 |
| `country_iso_3`      | `text`             | FK to `countries`. Optional.                  |
| `state_id`           | `uuid`             | FK to `states`. Optional.                     |
| `city_id`            | `uuid`             | FK to `cities`. Optional.                     |
| `zip_code`           | `text`             | Optional (composite FK with `country_iso_3`). |
| `community_h3_index` | `text`             | FK to `communities(h3_index)`. Optional.      |
| `start_date`         | `timestamptz`      | When rule becomes active.                     |
| `end_date`           | `timestamptz`      | Optional expiration.                          |
| `created_at`         | `timestamptz`      | Default `now()`.                              |

```sql
create table incentive_rules (
  id uuid primary key default gen_random_uuid(),
  action_type incentive_action not null,
  scope incentive_scope not null default 'global',
  points integer not null default 0,
  country_iso_3 text references countries(iso_3),
  state_id uuid references states(id),
  city_id uuid references cities(id),
  zip_code text,
  community_h3_index text references communities(h3_index),  -- 20260201200000
  start_date timestamptz not null default now(),
  end_date timestamptz,
  created_at timestamptz default now(),
  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3),
  unique(action_type, scope, country_iso_3, state_id, city_id, zip_code, community_h3_index, start_date)
);
```

### `point_ledger`

Tracks all point transactions — complete audit trail. Campaign incentive claims
are also tracked here via `campaign_id` and `campaign_behavior` columns (added
by `20260301090000_incentive_campaigns`).

| Column              | Type                     | Description                                        |
| :------------------ | :----------------------- | :------------------------------------------------- |
| `id`                | `uuid`                   | Primary Key.                                       |
| `user_id`           | `uuid`                   | FK to `profiles(id)` on delete cascade.            |
| `type`              | `point_transaction_type` | Transaction type.                                  |
| `amount`            | `integer`                | Points (positive = earned, negative = spent).      |
| `balance_after`     | `integer`                | Running balance — **auto-computed by DB trigger**. |
| `reference_id`      | `uuid`                   | Optional linked entity.                            |
| `metadata`          | `jsonb`                  | (e.g., `{"action_type": "join_a_community"}`).     |
| `campaign_id`       | `uuid`                   | FK to `incentive_campaigns(id)`. Nullable.         |
| `campaign_behavior` | `campaign_behavior`      | Which behavior earned this reward. Nullable.       |
| `created_at`        | `timestamptz`            | Default `now()`.                                   |

**Idempotency**: Reward grants check for existing entries with matching
`action_type` in metadata. Campaign rewards are deduped by
`idx_ledger_campaign_dedup`.

**Trigger: `trg_compute_balance_after`** (`BEFORE INSERT`): Auto-computes
`balance_after` as `SUM(existing amounts) + new amount`. Uses
`pg_advisory_xact_lock` per user to prevent race conditions. Callers pass any
value for `balance_after` (conventionally `0`) — the trigger overrides it.

**Indexes**: `idx_ledger_campaign_dedup` — partial unique on
`(campaign_id, user_id, campaign_behavior, COALESCE(reference_id, …))` WHERE
`campaign_id IS NOT NULL`. Prevents double-claiming; `per_referral` earns once
per referee via `reference_id`.

```sql
create table point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type point_transaction_type not null,
  amount integer not null,
  balance_after integer not null,
  reference_id uuid,
  metadata jsonb default '{}',
  campaign_id uuid references incentive_campaigns(id),      -- 20260301090000
  campaign_behavior campaign_behavior,                       -- 20260301090000
  created_at timestamptz default now()
);
```

---

## Posts & Content

### `posts`

| Column               | Type          | Description                                                               |
| :------------------- | :------------ | :------------------------------------------------------------------------ |
| `id`                 | `uuid`        | Primary Key.                                                              |
| `author_id`          | `uuid`        | FK to `profiles(id)`. The delegate (post manager).                        |
| `on_behalf_of`       | `uuid`        | FK to `profiles(id)`. Nullable. Delegator whose produce is being sold.    |
| `community_h3_index` | `text`        | FK to `communities(h3_index)`.                                            |
| `type`               | `post_type`   | Post type.                                                                |
| `reach`              | `post_reach`  | Visibility scope. Default: `'community'`.                                 |
| `content`            | `text`        | Post body.                                                                |
| `is_archived`        | `boolean`     | Set `true` by ban cascade RPCs. Default: `false`. _(by `20260301080000`)_ |
| `status`             | `post_status` | Moderation status. Default: `'available'`. _(by `20260303000000`)_        |
| `created_at`         | `timestamptz` | Default `now()`.                                                          |
| `updated_at`         | `timestamptz` | Default `now()`.                                                          |

**Indexes**: `posts_community_h3_idx`, `posts_on_behalf_of_idx`,
`idx_posts_is_archived` (partial, WHERE `is_archived = false`),
`idx_posts_status` (partial, WHERE `status = 'available'`)

```sql
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id),
  on_behalf_of uuid references profiles(id),  -- 20260211100000
  community_h3_index text references communities(h3_index),  -- 20260201200000
  type post_type not null,
  reach post_reach not null default 'community',
  content text not null,
  is_archived boolean not null default false,   -- 20260301080000
  status post_status not null default 'available', -- 20260303000000
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index posts_community_h3_idx on posts(community_h3_index);
create index posts_on_behalf_of_idx on posts(on_behalf_of) where on_behalf_of is not null;
create index idx_posts_is_archived on posts(is_archived) where is_archived = false;
create index idx_posts_status on posts(status) where status = 'available';
```

**RLS Policies** (`20260207060000_posts_content_rls`,
`20260212000000_public_post_anon_rls`):

| Policy                                        | Operation | Role            | Rule                                                                        |
| :-------------------------------------------- | :-------- | :-------------- | :-------------------------------------------------------------------------- |
| Posts are readable by all authenticated users | `SELECT`  | `authenticated` | `using (true)` — public reads, feed curation handled by application queries |
| Posts are readable by anonymous users         | `SELECT`  | `anon`          | `using (true)` — enables public post pages for non-logged-in users          |
| Authors can create their own posts            | `INSERT`  | `authenticated` | `with check (author_id = auth.uid())`                                       |
| Authors can update their own posts            | `UPDATE`  | `authenticated` | `using (author_id = auth.uid())`                                            |
| Authors can delete their own posts            | `DELETE`  | `authenticated` | `using (author_id = auth.uid())`                                            |

### `post_likes`

```sql
create table post_likes (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);
```

**RLS Policies** (`20260207060000_posts_content_rls`,
`20260212000000_public_post_anon_rls`):

| Policy                                     | Operation | Role            | Rule                                |
| :----------------------------------------- | :-------- | :-------------- | :---------------------------------- |
| Post likes are readable                    | `SELECT`  | `authenticated` | `using (true)`                      |
| Post likes are readable by anonymous users | `SELECT`  | `anon`          | `using (true)`                      |
| Users can like posts                       | `INSERT`  | `authenticated` | `with check (user_id = auth.uid())` |
| Users can remove their own likes           | `DELETE`  | `authenticated` | `using (user_id = auth.uid())`      |

### `post_comments`

```sql
create table post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id),
  content text not null,
  created_at timestamptz default now()
);
```

**RLS Policies** (`20260207060000_posts_content_rls`,
`20260212000000_public_post_anon_rls`):

| Policy                                        | Operation | Role            | Rule                                |
| :-------------------------------------------- | :-------- | :-------------- | :---------------------------------- |
| Post comments are readable                    | `SELECT`  | `authenticated` | `using (true)`                      |
| Post comments are readable by anonymous users | `SELECT`  | `anon`          | `using (true)`                      |
| Users can create their own comments           | `INSERT`  | `authenticated` | `with check (user_id = auth.uid())` |
| Users can update their own comments           | `UPDATE`  | `authenticated` | `using (user_id = auth.uid())`      |
| Users can delete their own comments           | `DELETE`  | `authenticated` | `using (user_id = auth.uid())`      |

### `post_flags`

```sql
create table post_flags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id),
  reason text,
  created_at timestamptz default now()
);
```

**Trigger: `trg_post_flag_threshold`** (`AFTER INSERT`, added by
`20260303000000`): When a post accumulates ≥ 3 flags, auto-sets
`posts.status = 'flagged'` (if currently `'available'`) and inserts a
notification to the post author informing them of the review.

**RLS Policies** (`20260207060000_posts_content_rls`,
`20260212000000_public_post_anon_rls`):

| Policy                                     | Operation | Role            | Rule                                |
| :----------------------------------------- | :-------- | :-------------- | :---------------------------------- |
| Post flags are readable                    | `SELECT`  | `authenticated` | `using (true)`                      |
| Post flags are readable by anonymous users | `SELECT`  | `anon`          | `using (true)`                      |
| Users can flag posts                       | `INSERT`  | `authenticated` | `with check (user_id = auth.uid())` |
| Users can remove their own flags           | `DELETE`  | `authenticated` | `using (user_id = auth.uid())`      |

### `post_media`

```sql
create table post_media (
  post_id uuid references posts(id) on delete cascade,
  media_id uuid references media_assets(id) on delete cascade,
  position integer default 0,
  primary key (post_id, media_id)
);
```

**RLS Policies** (`20260207060000_posts_content_rls`,
`20260212000000_public_post_anon_rls`):

| Policy                                    | Operation | Role            | Rule                                                                          |
| :---------------------------------------- | :-------- | :-------------- | :---------------------------------------------------------------------------- |
| Post media is readable                    | `SELECT`  | `authenticated` | `using (true)`                                                                |
| Post media is readable by anonymous users | `SELECT`  | `anon`          | `using (true)`                                                                |
| Post authors can attach media             | `INSERT`  | `authenticated` | `with check (post_id in (select id from posts where author_id = auth.uid()))` |
| Post authors can detach media             | `DELETE`  | `authenticated` | `using (post_id in (select id from posts where author_id = auth.uid()))`      |

### `want_to_sell_details`

| Column                     | Type              | Description                                                                                 |
| :------------------------- | :---------------- | :------------------------------------------------------------------------------------------ |
| `id`                       | `uuid`            | Primary Key.                                                                                |
| `post_id`                  | `uuid`            | FK to `posts(id)` on delete cascade.                                                        |
| `category`                 | `text`            | FK to `sales_categories(name)`. (was `sales_category` enum, converted by `20260301080000`.) |
| `produce_name`             | `text`            | Name of the produce.                                                                        |
| `unit`                     | `unit_of_measure` | Unit of measure.                                                                            |
| `total_quantity_available` | `numeric`         | Quantity available.                                                                         |
| `points_per_unit`          | `integer`         | Points per unit.                                                                            |
| `delegator_id`             | `uuid`            | FK to `profiles(id)`. Optional delegator.                                                   |
| `need_by_date`             | `date`            | Latest drop-off date. Added by `20260210060000`.                                            |
| `is_produce`               | `boolean`         | Whether this is produce. Default: `false`. Added by `20260305000000`.                       |
| `harvest_date`             | `date`            | When the produce was harvested. Nullable. Added by `20260305000000`.                        |
| `created_at`               | `timestamptz`     | Default `now()`.                                                                            |
| `updated_at`               | `timestamptz`     | Default `now()`.                                                                            |

```sql
create table want_to_sell_details (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  category text not null references sales_categories(name),  -- 20260301080000 (was enum)
  produce_name text not null,
  unit unit_of_measure not null,
  total_quantity_available numeric not null,
  points_per_unit integer not null,
  delegator_id uuid references profiles(id),
  need_by_date date,                               -- 20260210060000
  is_produce boolean not null default false,        -- 20260305000000
  harvest_date date,                                 -- 20260305000000
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**RLS Policies** (`20260212000000_public_post_anon_rls`):

| Policy                                       | Operation | Role   | Rule           |
| :------------------------------------------- | :-------- | :----- | :------------- |
| Sell details are viewable by anonymous users | `SELECT`  | `anon` | `using (true)` |

### `delivery_dates`

Accepted drop-off dates for a post. Used by both sell and buy posts to indicate
when the seller/buyer can accept deliveries.

| Column          | Type          | Description                          |
| :-------------- | :------------ | :----------------------------------- |
| `id`            | `uuid`        | Primary Key.                         |
| `post_id`       | `uuid`        | FK to `posts(id)` on delete cascade. |
| `delivery_date` | `date`        | An accepted delivery date.           |
| `created_at`    | `timestamptz` | Default `now()`.                     |

```sql
create table delivery_dates (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  delivery_date date not null,
  created_at timestamptz default now()
);
```

### `want_to_buy_details`

| Column             | Type              | Description                                                    |
| :----------------- | :---------------- | :------------------------------------------------------------- |
| `id`               | `uuid`            | Primary Key.                                                   |
| `post_id`          | `uuid`            | FK to `posts(id)` on delete cascade.                           |
| `category`         | `sales_category`  | Sales category.                                                |
| `produce_names`    | `text[]`          | Array of produce names the buyer is looking for.               |
| `need_by_date`     | `date`            | Latest date by which the buyer needs the produce.              |
| `desired_quantity` | `numeric`         | Optional. How much the buyer needs. Added by `20260218000000`. |
| `desired_unit`     | `unit_of_measure` | Optional. Unit of measure. Added by `20260218000000`.          |
| `created_at`       | `timestamptz`     | Default `now()`.                                               |
| `updated_at`       | `timestamptz`     | Default `now()`.                                               |

```sql
create table want_to_buy_details (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  category sales_category not null,
  produce_names text[] not null,
  need_by_date date,
  desired_quantity numeric,         -- 20260218000000
  desired_unit unit_of_measure,     -- 20260218000000
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**RLS Policies** (`20260212000000_public_post_anon_rls`):

| Policy                                      | Operation | Role   | Rule           |
| :------------------------------------------ | :-------- | :----- | :------------- |
| Buy details are viewable by anonymous users | `SELECT`  | `anon` | `using (true)` |

### `sales_categories` _(added by `20260301080000`)_

Dynamic, table-driven categories replacing the old `sales_category` enum.

| Column          | Type          | Description                                                           |
| :-------------- | :------------ | :-------------------------------------------------------------------- |
| `name`          | `text`        | **Primary Key**.                                                      |
| `display_order` | `integer`     | Sorting order.                                                        |
| `is_produce`    | `boolean`     | Whether this category is produce. Default: `false`. `20260305000000`. |
| `created_at`    | `timestamptz` | Default `now()`.                                                      |
| `updated_at`    | `timestamptz` | Default `now()`.                                                      |

```sql
create table sales_categories (
  name          text primary key,
  display_order integer not null default 0,
  is_produce    boolean not null default false,    -- 20260305000000
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
```

### `category_restrictions` _(added by `20260301080000`)_

Soft-blocks a category in a specific H3 zone (or globally when
`community_h3_index` is NULL). Cascades: archives posts, cancels orders, refunds
held-point refunds, sends system messages.

| Column               | Type          | Description                                       |
| :------------------- | :------------ | :------------------------------------------------ |
| `id`                 | `uuid`        | Primary Key.                                      |
| `category_name`      | `text`        | FK to `sales_categories(name)` ON DELETE CASCADE. |
| `community_h3_index` | `text`        | FK to `communities(h3_index)`. NULL = global.     |
| `reason`             | `text`        | Human-readable reason.                            |
| `created_at`         | `timestamptz` | Default `now()`.                                  |

**Unique**: `(category_name, community_h3_index)`

```sql
create table category_restrictions (
  id                  uuid primary key default gen_random_uuid(),
  category_name       text not null references sales_categories(name) on delete cascade,
  community_h3_index  text references communities(h3_index),
  reason              text,
  created_at          timestamptz default now(),
  unique(category_name, community_h3_index)
);
```

### `blocked_products` _(added by `20260301080000`)_

Blocks a specific product name within a category/zone. Cascades same as category
restrictions.

| Column               | Type          | Description                                   |
| :------------------- | :------------ | :-------------------------------------------- |
| `id`                 | `uuid`        | Primary Key.                                  |
| `product_name`       | `text`        | Product name to block (case-sensitive match). |
| `community_h3_index` | `text`        | FK to `communities(h3_index)`. NULL = global. |
| `reason`             | `text`        | Human-readable reason.                        |
| `created_at`         | `timestamptz` | Default `now()`.                              |

**Unique**: `(product_name, community_h3_index)`

```sql
create table blocked_products (
  id                  uuid primary key default gen_random_uuid(),
  product_name        text not null,
  community_h3_index  text references communities(h3_index),
  reason              text,
  created_at          timestamptz default now(),
  unique(product_name, community_h3_index)
);
```

### Ban Cascade RPCs _(added by `20260301080300`–`20260301080500`)_

| RPC                        | Input                               | Effect                                                                              |
| :------------------------- | :---------------------------------- | :---------------------------------------------------------------------------------- |
| `ban_category(p_name)`     | Category name                       | Hard-delete category → cascades FKs, archives posts, cancels orders, refunds held points |
| `add_category_restriction` | Name, H3 (optional), reason         | Soft-block: insert restriction row → archive + cancel + refund                      |
| `ban_product`              | Product name, H3 (optional), reason | Block product → archive matching posts, cancel orders, refund                       |

---

## Push Notifications

### `push_subscriptions`

Stores push tokens for Web Push, APNs, and FCM delivery engines.

| Column       | Type          | Description                                      |
| :----------- | :------------ | :----------------------------------------------- |
| `id`         | `uuid`        | Primary Key.                                     |
| `user_id`    | `uuid`        | FK to `auth.users(id)` on delete cascade.        |
| `token`      | `text`        | Exact device token or URL endpoint JSON.         |
| `platform`   | `text`        | enum equivalent: `web`, `ios`, or `android`.     |
| `endpoint`   | `text`        | Required exclusively for VAPID Web Push routing. |
| `created_at` | `timestamptz` | Default `now()`.                                 |
| `updated_at` | `timestamptz` | Default `now()`.                                 |

**Unique Constraints**: `(user_id, token)` **Indexes**:
`idx_push_subscriptions_user_id`

```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('web', 'ios', 'android')),
  endpoint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);

create index idx_push_subscriptions_user_id on push_subscriptions(user_id);
```

**RLS Policies** (`20260225000000_push_subscriptions`):

| Policy                                   | Operation | Role            | Rule                                   |
| :--------------------------------------- | :-------- | :-------------- | :------------------------------------- |
| Users can read their own subscriptions   | `SELECT`  | `authenticated` | `using (auth.uid() = user_id)`         |
| Users can insert their own subscriptions | `INSERT`  | `authenticated` | `with check (auth.uid() = user_id)`    |
| Users can update their own subscriptions | `UPDATE`  | `authenticated` | `using (auth.uid() = user_id)`         |
| Users can delete their own subscriptions | `DELETE`  | `authenticated` | `using (auth.uid() = user_id)`         |
| Edge functions can read all under bypass | `ALL`     | `service_role`  | `using (auth.role() = 'service_role')` |

### Associated Database Triggers

Push notifications employ asynchronous database triggers invoking `pg_net` to
fire HTTPS `POST` deliveries dynamically:

1. **`notify_delegator_on_post`**: Triggers `AFTER INSERT ON posts` for rows
   bound `on_behalf_of`.
2. **`notify_delegator_on_order`**: Triggers `AFTER UPDATE ON orders` when
   status becomes `completed` filtering posts `on_behalf_of`.
3. **`notify_user_on_redemption`**: Triggers `AFTER UPDATE ON redemptions` when
   status becomes `completed`.

---

## Platform Configuration

### `platform_config` _(DROPPED by `20260228065500`)_

> [!WARNING]
> This table was dropped by `20260228065500_platform_config_deprecation`.
> Replaced by `platform_fees`, `giftcards_cache`, `charity_projects_cache`, and
> `platform_settings`.

~~Key-value store for platform settings. No longer exists.~~

### `platform_fees`

Stores dynamic fee percentages by country. Used to compute platform fees during
order resolution. The system looks for the most recent entry for a user's
country code, falling back to 10% if none exists.

| Column          | Type          | Description                        |
| :-------------- | :------------ | :--------------------------------- |
| `id`            | `uuid`        | **Primary Key**. Auto-generated.   |
| `country_code`  | `varchar(3)`  | ISO 3166-1 alpha-3 (e.g., 'USA').  |
| `fees`          | `numeric`     | Fee percentage (e.g., 10 for 10%). |
| `creation_date` | `timestamptz` | Default `now()`.                   |

**Indexes**: `idx_platform_fees_country` on `(country_code, creation_date DESC)`

```sql
create table platform_fees (
  id uuid primary key default gen_random_uuid(),
  creation_date timestamptz default now(),
  country_code varchar(3) not null,
  fees numeric not null
);
create index idx_platform_fees_country on platform_fees(country_code, creation_date desc);
```

### `giftcards_cache`

Stores deduplicated, unified catalog data from multiple gift card providers to
reduce load on external APIs and decouple from `platform_config`.

**Migration**: `20260228042110_giftcards_cache.sql`

| Column       | Type                | Description                                                   |
| :----------- | :------------------ | :------------------------------------------------------------ |
| `id`         | `uuid`              | **Primary Key**. Auto-generated.                              |
| `provider`   | `giftcard_provider` | Enum (`'unified'`, `'tremendous'`, `'reloadly'`). **UNIQUE**. |
| `data`       | `jsonb`             | The actual cached JSON payload of unified gift cards.         |
| `updated_at` | `timestamptz`       | Default `now()`.                                              |

```sql
create type giftcard_provider as enum ('unified', 'tremendous', 'reloadly');

create table giftcards_cache (
  id uuid primary key default gen_random_uuid(),
  provider giftcard_provider unique not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

### `charity_projects_cache` _(added by `20260228065500`)_

Caches charity project listings from GlobalGiving API. Single row, upserted by
the Edge Function.

```sql
create table charity_projects_cache (
  id         uuid primary key default gen_random_uuid(),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
```

### `platform_settings` _(added by `20260228065500`)_

Global platform settings (replaces legacy `platform_config` key-value store
which was dropped in the same migration).

| Column                     | Type          | Description                                    |
| :------------------------- | :------------ | :--------------------------------------------- |
| `id`                       | `uuid`        | Primary Key.                                   |
| `provider_grace_period_ms` | `integer`     | Grace period in ms. Default: 1800000 (30 min). |
| `updated_at`               | `timestamptz` | Default `now()`.                               |

```sql
create table platform_settings (
  id uuid primary key default gen_random_uuid(),
  provider_grace_period_ms integer not null default 1800000,
  updated_at timestamptz not null default now()
);
```

Configurable expiration days per post type. Used by the "My Posts" screen to
determine active/expired status for each post based on its type.

**Migration**: `20260211000000_post_type_policies.sql`

| Column            | Type          | Description                                          |
| :---------------- | :------------ | :--------------------------------------------------- |
| `post_type`       | `post_type`   | **Primary Key**. The post type enum value.           |
| `expiration_days` | `integer`     | Days until a post of this type expires. Default: 30. |
| `created_at`      | `timestamptz` | Default `now()`.                                     |
| `updated_at`      | `timestamptz` | Default `now()`.                                     |

**Default expiration values**:

| Post Type          | Expiration Days |
| :----------------- | :-------------- |
| `want_to_sell`     | 14              |
| `want_to_buy`      | 7               |
| `offering_service` | 30              |
| `need_service`     | 7               |
| `seeking_advice`   | 30              |
| `general_info`     | 30              |

```sql
create table post_type_policies (
  post_type post_type primary key,
  expiration_days integer not null default 30,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed default expiration days per type
insert into post_type_policies (post_type, expiration_days) values
  ('want_to_sell', 14),
  ('want_to_buy', 7),
  ('offering_service', 30),
  ('need_service', 7),
  ('seeking_advice', 30),
  ('general_info', 30);
```

**RLS Policies** (`20260211000000_post_type_policies`):

| Policy                                                     | Operation | Rule           |
| :--------------------------------------------------------- | :-------- | :------------- |
| Post type policies are readable by all authenticated users | `SELECT`  | `using (true)` |

---

## Media

### `media_assets`

```sql
create table media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  storage_path text not null,
  media_type media_asset_type not null,
  mime_type text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
```

**RLS Policies** (`20260207070000_shared_tables_rls`,
`20260212000000_public_post_anon_rls`):

| Policy                                       | Operation | Role            | Rule                                 |
| :------------------------------------------- | :-------- | :-------------- | :----------------------------------- |
| Media assets are publicly readable           | `SELECT`  | `authenticated` | `using (true)`                       |
| Media assets are readable by anonymous users | `SELECT`  | `anon`          | `using (true)`                       |
| Owners can upload media                      | `INSERT`  | `authenticated` | `with check (owner_id = auth.uid())` |
| Owners can delete their media                | `DELETE`  | `authenticated` | `using (owner_id = auth.uid())`      |

---

## Transactional (Conversations, Offers, Orders)

### `conversations`

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  created_at timestamptz default now(),
  unique(post_id, buyer_id, seller_id)
);
```

**RLS Policies** (`20260207070000_shared_tables_rls`): Two-party access — only
`buyer_id` or `seller_id` can read.

| Policy                            | Operation | Rule                                                      |
| :-------------------------------- | :-------- | :-------------------------------------------------------- |
| Conversation parties can read     | `SELECT`  | `using (buyer_id = auth.uid() OR seller_id = auth.uid())` |
| Buyers can initiate conversations | `INSERT`  | `with check (buyer_id = auth.uid())`                      |
| No update/delete                  | —         | Conversations are immutable once created                  |

### `chat_messages`

```sql
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid references profiles(id),
  content text,
  media_id uuid references media_assets(id),
  type chat_message_type not null default 'text',
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  delivered_at timestamptz,  -- 20260213000000: when recipient's device received the message
  read_at timestamptz,       -- 20260213000000: when recipient opened/viewed the message
  check (content is not null or media_id is not null)
);
```

**RLS Policies** (`20260207070000_shared_tables_rls`,
`20260213000000_chat_delivery_status`): Access inherited from conversation
membership.

| Policy                                            | Operation | Rule                                              |
| :------------------------------------------------ | :-------- | :------------------------------------------------ |
| Conversation parties can read messages            | `SELECT`  | `conversation_id` in user's conversations         |
| Conversation parties can send messages            | `INSERT`  | `sender_id = auth.uid()` AND conversation member  |
| Recipients can mark messages as delivered or read | `UPDATE`  | `sender_id != auth.uid()` AND conversation member |

**Realtime Configuration** (`20260213010000_chat_realtime`):

```sql
-- Add chat_messages to the realtime publication so INSERT/UPDATE events
-- are broadcast to connected clients.
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- REPLICA IDENTITY FULL ensures UPDATE events include ALL columns,
-- which is required for Supabase Realtime filter matching
-- (e.g. `conversation_id=eq.X`). Without this, only the PK is broadcast
-- and client-side filters can't match.
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
```

| Setting           | Value               | Purpose                                              |
| :---------------- | :------------------ | :--------------------------------------------------- |
| Publication       | `supabase_realtime` | Broadcasts INSERT/UPDATE events to connected clients |
| Replica Identity  | `FULL`              | All columns in UPDATE payloads (not just PK)         |
| Subscribed Events | `INSERT`, `UPDATE`  | New messages + delivery/read status changes          |

### `offers`

The offers table stores seller-initiated offers on buy posts. Extended by
migrations `20260219100000_offers_extended`,
`20260220200000_offer_delivery_dates`.

| Column                            | Type           | Description                                                                  |
| :-------------------------------- | :------------- | :--------------------------------------------------------------------------- |
| `id`                              | `uuid`         | Primary Key.                                                                 |
| `conversation_id`                 | `uuid`         | FK to `conversations(id)`.                                                   |
| `created_by`                      | `uuid`         | FK to `profiles(id)`. The seller who created the offer.                      |
| `post_id`                         | `uuid`         | FK to `posts(id)`. The `want_to_buy` post this offer responds to.            |
| `quantity`                        | `numeric`      | Offered quantity.                                                            |
| `points_per_unit`                 | `integer`      | Price per unit in points.                                                    |
| `category`                        | `text`         | Product category (mirrors `sales_category` enum values).                     |
| `product`                         | `text`         | Product name.                                                                |
| `unit`                            | `text`         | Unit of measure (e.g., 'box', 'dozen'). Optional.                            |
| `delivery_date`                   | `date`         | Primary delivery date (first element of `delivery_dates`).                   |
| `delivery_dates`                  | `date[]`       | Array of available delivery dates. Added by `20260220200000`.                |
| `message`                         | `text`         | Optional message from seller to buyer.                                       |
| `seller_post_id`                  | `uuid`         | FK to `posts(id)`. Optional link to seller's own sell post.                  |
| `media`                           | `jsonb`        | Media attachments (images/videos). Default `'[]'`.                           |
| `community_h3_index`              | `text`         | Community where the offer originates. Added by `20260220200000`.             |
| `additional_community_h3_indices` | `text[]`       | Additional communities for the offer. Added by `20260220200000`.             |
| `status`                          | `offer_status` | Default `'pending'`. Values: `pending`, `accepted`, `rejected`, `withdrawn`. |
| `version`                         | `integer`      | Optimistic locking version. Default `1`. Bumped on modify.                   |
| `created_at`                      | `timestamptz`  | Default `now()`.                                                             |
| `updated_at`                      | `timestamptz`  | Default `now()`. Updated on modify/accept/reject/withdraw.                   |

```sql
create table offers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  created_by uuid not null references profiles(id),
  post_id uuid references posts(id) on delete cascade,           -- 20260219100000
  quantity numeric not null,
  points_per_unit integer not null,
  category text,                                                  -- 20260219100000
  product text,                                                   -- 20260219100000
  unit text,                                                      -- 20260219100000
  delivery_date date,                                             -- 20260219100000
  delivery_dates date[] default '{}',                             -- 20260220200000
  message text,                                                   -- 20260219100000
  seller_post_id uuid references posts(id),                       -- 20260219100000
  media jsonb default '[]'::jsonb,                                -- 20260219100000
  community_h3_index text,                                        -- 20260220200000
  additional_community_h3_indices text[] default '{}',             -- 20260220200000
  status offer_status not null default 'pending',
  version integer not null default 1,                             -- 20260219100000
  created_at timestamptz default now(),
  updated_at timestamptz default now()                            -- 20260219100000
);
```

**Realtime Configuration** (`20260219100000_offers_extended`):

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.offers;
```

**RLS Policies** (`20260207070000_shared_tables_rls`, updated by
`20260219100000`):

| Policy                                       | Operation | Rule                                              |
| :------------------------------------------- | :-------- | :------------------------------------------------ |
| Conversation parties can read offers         | `SELECT`  | `conversation_id` in user's conversations         |
| Conversation parties can create offers       | `INSERT`  | `created_by = auth.uid()` AND conversation member |
| Conversation parties can update offer status | `UPDATE`  | Conversation member (original policy)             |
| Conversation parties can update offers       | `UPDATE`  | Conversation member (added by `20260219100000`)   |

### `orders`

| Column                     | Type             | Description                                                         |
| :------------------------- | :--------------- | :------------------------------------------------------------------ |
| `id`                       | `uuid`           | Primary Key.                                                        |
| `offer_id`                 | `uuid`           | FK to `offers(id)`.                                                 |
| `buyer_id`                 | `uuid`           | FK to `profiles(id)`.                                               |
| `seller_id`                | `uuid`           | FK to `profiles(id)`.                                               |
| `category`                 | `sales_category` | Product category.                                                   |
| `product`                  | `text`           | Product name.                                                       |
| `quantity`                 | `numeric`        | Ordered quantity.                                                   |
| `points_per_unit`          | `integer`        | Price per unit in points.                                           |
| `delivery_date`            | `date`           | Expected delivery date.                                             |
| `delivery_time`            | `time`           | Expected delivery time (optional).                                  |
| `delivery_instructions`    | `text`           | Delivery notes.                                                     |
| `delivery_address`         | `text`           | Delivery location. Added by `20260217000001`.                       |
| `delivery_proof_media_id`  | `uuid`           | FK to `media_assets(id)`. Seller's delivery proof.                  |
| `delivery_proof_url`       | `text`           | URL of delivery proof image.                                        |
| `delivery_proof_location`  | `text`           | Geo coordinates of delivery (lat,lng).                              |
| `delivery_proof_timestamp` | `timestamptz`    | When delivery proof was captured.                                   |
| `dispute_proof_media_id`   | `uuid`           | FK to `media_assets(id)`. Buyer's dispute evidence.                 |
| `dispute_proof_url`        | `text`           | URL of dispute evidence image.                                      |
| `conversation_id`          | `uuid`           | FK to `conversations(id)`.                                          |
| `status`                   | `order_status`   | Default `'pending'` (changed by `20260215090001`).                  |
| `version`                  | `integer`        | Optimistic locking version. Default `1`. Added by `20260216070000`. |
| `buyer_rating`             | `rating_score`   | Buyer's rating of the transaction.                                  |
| `buyer_feedback`           | `text`           | Buyer's feedback text.                                              |
| `seller_rating`            | `rating_score`   | Seller's rating of the transaction.                                 |
| `seller_feedback`          | `text`           | Seller's feedback text.                                             |
| `tax_rate_pct`             | `numeric`        | Applied sales tax rate (%). Nullable. Added by `20260301100700`.    |
| `tax_amount`               | `integer`        | Tax amount in points. Nullable. Added by `20260301100700`.          |
| `harvest_date`             | `date`           | When produce was harvested. Nullable. Added by `20260305000000`.    |
| `created_at`               | `timestamptz`    | Default `now()`.                                                    |
| `updated_at`               | `timestamptz`    | Default `now()`.                                                    |

```sql
create table orders (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers(id),
  buyer_id uuid not null,
  seller_id uuid not null,
  category sales_category not null,
  product text not null,
  quantity numeric not null,
  points_per_unit integer not null,
  delivery_date date,
  delivery_time time,
  delivery_instructions text,
  delivery_address text,                                    -- 20260217000001
  delivery_proof_media_id uuid references media_assets(id),
  delivery_proof_url text,                                  -- 20260217000007
  delivery_proof_location text,                             -- 20260217000007
  delivery_proof_timestamp timestamptz,                     -- 20260217000007
  dispute_proof_media_id uuid references media_assets(id),  -- 20260217000008
  dispute_proof_url text,                                   -- 20260217000008
  conversation_id uuid not null references conversations(id),
  status order_status not null default 'pending',           -- 20260215090001
  version integer not null default 1,                       -- 20260216070000
  buyer_rating rating_score,
  buyer_feedback text,
  seller_rating rating_score,
  seller_feedback text,
  tax_rate_pct numeric,                                       -- 20260301100700
  tax_amount integer,                                          -- 20260301100700
  harvest_date date,                                           -- 20260305000000
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**Realtime Configuration** (`20260217000010_orders_realtime`):

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
```

| Setting          | Value               | Purpose                                          |
| :--------------- | :------------------ | :----------------------------------------------- |
| Publication      | `supabase_realtime` | Broadcasts INSERT/UPDATE events for live updates |
| Replica Identity | `FULL`              | All columns in UPDATE payloads                   |

**RLS Policies** (`20260207070000_shared_tables_rls`): Two-party access — only
`buyer_id` or `seller_id`.

| Policy                                | Operation | Rule                                                           |
| :------------------------------------ | :-------- | :------------------------------------------------------------- |
| Order parties can read their orders   | `SELECT`  | `using (buyer_id = auth.uid() OR seller_id = auth.uid())`      |
| Order parties can create orders       | `INSERT`  | `with check (buyer_id = auth.uid() OR seller_id = auth.uid())` |
| Order parties can update their orders | `UPDATE`  | `using (buyer_id = auth.uid() OR seller_id = auth.uid())`      |

### `escalations`

```sql
create table escalations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  initiator_id uuid not null references profiles(id),
  reason text not null,
  dispute_proof_media_id uuid references media_assets(id),
  status escalation_status not null default 'open',
  resolution_type escalation_resolution,
  accepted_refund_offer_id uuid,  -- FK added after refund_offers table
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**RLS Policies** (`20260207070000_shared_tables_rls`): Access inherited from
order parties.

| Policy                               | Operation | Rule                                        |
| :----------------------------------- | :-------- | :------------------------------------------ |
| Order parties can read escalations   | `SELECT`  | `order_id` in user's orders                 |
| Order parties can create escalations | `INSERT`  | `initiator_id = auth.uid()` AND order party |
| Order parties can update escalations | `UPDATE`  | Order party                                 |

### `refund_offers`

```sql
create table refund_offers (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references escalations(id) on delete cascade,
  amount numeric(10,2) not null,
  message text,
  status refund_offer_status not null default 'pending',
  created_at timestamptz default now()
);

-- Deferred FK (circular dependency)
alter table escalations
  add constraint fk_accepted_refund
  foreign key (accepted_refund_offer_id) references refund_offers(id);
```

**RLS Policies** (`20260207070000_shared_tables_rls`): Access inherited from
escalation → order parties.

| Policy                                       | Operation | Rule                            |
| :------------------------------------------- | :-------- | :------------------------------ |
| Order parties can read refund offers         | `SELECT`  | `escalation_id` → order parties |
| Order parties can create refund offers       | `INSERT`  | `escalation_id` → order parties |
| Order parties can update refund offer status | `UPDATE`  | `escalation_id` → order parties |

---

## Redemption System

### `provider_queue_status`

Tracks circuit-breaker queueing states and administrative toggles for redemption
providers.

**Migrations**: `20260225000008_provider_queue_status.sql`,
`20260226000001_provider_disabled_grace_period.sql`

| Column        | Type          | Description                                                         |
| :------------ | :------------ | :------------------------------------------------------------------ |
| `id`          | `uuid`        | Primary Key.                                                        |
| `provider`    | `text`        | Provider name (`globalgiving`, `tremendous`, `reloadly`, `stripe`). |
| `is_queuing`  | `boolean`     | If true, redemptions are queued instead of processed.               |
| `is_active`   | `boolean`     | If false, the provider is completely disabled from UI.              |
| `disabled_at` | `timestamptz` | When the provider was disabled (used for grace periods).            |
| `updated_at`  | `timestamptz` | Default `now()`.                                                    |

**Triggers**: `trg_set_provider_disabled_at` automatically updates the
`disabled_at` timestamp when `is_active` is toggled.

```sql
create table provider_queue_status (
    id uuid primary key default gen_random_uuid(),
    provider text not null unique check (provider in ('globalgiving', 'tremendous', 'reloadly', 'stripe')),
    is_queuing boolean not null default false,
    is_active boolean not null default true,
    disabled_at timestamptz,
    updated_at timestamptz default now()
);
```

**RLS Policies** (`20260225000008`): Admin-only access.

| Policy                                  | Operation | Rule                                         |
| :-------------------------------------- | :-------- | :------------------------------------------- |
| Admins can view provider queue status   | `SELECT`  | `public.has_staff_role(auth.uid(), 'admin')` |
| Admins can update provider queue status | `UPDATE`  | `public.has_staff_role(auth.uid(), 'admin')` |

**RPC `get_active_redemption_providers()`** Returns available redemption methods
(`provider`, `is_queuing`) where `is_active = true`. Security definer (bypasses
RLS so guests can read).

### `redemption_merchandize`

```sql
create table redemption_merchandize (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  point_cost integer not null,
  type redemption_item_type not null,
  reach_type redemption_reach_type not null default 'global',
  is_active boolean default true,
  created_at timestamptz default now()
);
```

### `redemption_merchandize_media`

```sql
create table redemption_merchandize_media (
  id uuid primary key default gen_random_uuid(),
  merchandize_id uuid not null references redemption_merchandize(id) on delete cascade,
  media_id uuid not null references media_assets(id) on delete cascade,
  display_order integer default 0,
  created_at timestamptz default now(),
  unique(merchandize_id, media_id)
);
```

### `redemption_merchandize_restrictions`

Unified restriction table (replaced 5 separate restriction tables via migration
`20260131183000`).

```sql
create table redemption_merchandize_restrictions (
  id uuid primary key default gen_random_uuid(),
  merchandize_id uuid not null references redemption_merchandize(id) on delete cascade,
  scope restriction_scope not null default 'global',
  country_iso_3 text references countries(iso_3),
  state_id uuid references states(id),
  city_id uuid references cities(id),
  zip_code text,
  community_h3_index text references communities(h3_index),  -- 20260201200000
  is_allowed boolean not null default true,
  created_at timestamptz default now(),
  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3),
  unique(merchandize_id, scope, country_iso_3, state_id, city_id, zip_code, community_h3_index)
);
```

### `redemptions`

```sql
create table redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  item_id uuid not null references redemption_merchandize(id),
  point_cost integer not null,
  status redemption_status not null default 'pending',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
```

---

## Notifications

### `notifications`

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  link_url text,
  read_at timestamptz,
  created_at timestamptz default now()
);
```

**RLS Policies** (`20260207070000_shared_tables_rls`,
`20260303000000_post_moderation_pipeline`): Private to recipient.

| Policy                                     | Operation | Rule                             |
| :----------------------------------------- | :-------- | :------------------------------- |
| Users can read their own notifications     | `SELECT`  | `using (user_id = auth.uid())`   |
| Users can mark their notifications as read | `UPDATE`  | `using (user_id = auth.uid())`   |
| Users can delete their own notifications   | `DELETE`  | `using (user_id = auth.uid())`   |
| No insert by users                         | —         | Created by system (service role) |

**Auto-Expiry** (`20260303000000`): A `pg_cron` job runs daily at 03:00 UTC,
deleting notifications older than 30 days:
`DELETE FROM notifications WHERE created_at < now() - interval '30 days'`.

---

## Delegations

### `delegations`

Allows one user to delegate sales to another. Supports link-based sharing where
the delegatee is unknown until they accept the invitation.

```sql
create table delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_id uuid not null references profiles(id),
  delegatee_id uuid references profiles(id),        -- NULL until link is accepted
  status delegation_status not null default 'pending',
  pairing_code text,                    -- 6-digit code for manual/in-person linking
  pairing_expires_at timestamptz,       -- When the pairing code expires
  delegation_code text unique,          -- 8-char slug for shareable link (e.g. 'd-abc12xyz')
  message text,                         -- Optional personal message from delegator
  delegate_pct smallint default 50      -- Delegate's % of after-fee proceeds (20260223100000)
    check (delegate_pct between 0 and 100),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (delegatee_id is null or delegator_id <> delegatee_id)
);

-- Unique index on non-null pairing codes (expiry enforced at query time)
create unique index idx_delegation_pairing_code
  on delegations(pairing_code)
  where pairing_code is not null;

-- Unique index for fast lookup by delegation link code
create unique index idx_delegations_delegation_code
  on delegations(delegation_code)
  where delegation_code is not null;
```

**RLS Policies** (`20260207070000_shared_tables_rls`): Two-party access.

| Policy                               | Operation | Rule                                                             |
| :----------------------------------- | :-------- | :--------------------------------------------------------------- |
| Delegation parties can read          | `SELECT`  | `using (delegator_id = auth.uid() OR delegatee_id = auth.uid())` |
| Delegators can create delegations    | `INSERT`  | `with check (delegator_id = auth.uid())`                         |
| Delegation parties can update status | `UPDATE`  | `using (delegator_id = auth.uid() OR delegatee_id = auth.uid())` |
| Delegators can delete delegations    | `DELETE`  | `using (delegator_id = auth.uid())`                              |

#### Soft Revocation ("Winding Down")

When a delegation is revoked or inactivated, it only prevents **new** posts.
Existing posts remain fully manageable by the delegate because
`posts.author_id = delegate`:

- **New posts blocked**: `getActiveDelegators()` filters by `status = 'active'`,
  so the delegator disappears from the sell-form picker.
- **Existing posts unaffected**: The delegate owns posts via `author_id` and can
  still view, edit, manage chats, and fulfill orders through normal RLS.
- **UI feedback**: The delegation screen shows revoked/inactive delegations with
  a "Winding Down" badge as long as any posts exist with
  `on_behalf_of = delegator_id`. Once all such posts are deleted or expired, the
  delegation disappears from the list.

---

## Experimentation System

### `experiments`

```sql
create table experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status experiment_status not null default 'draft',
  rollout_percentage integer default 0 check (rollout_percentage between 0 and 100),
  target_criteria jsonb default '{}',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### `experiment_variants`

```sql
create table experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  name text not null,
  weight integer not null default 50,
  is_control boolean default false,
  config jsonb default '{}',
  created_at timestamptz default now()
);
```

### `experiment_assignments`

Updated by `20260131203000_guest_experimentation` to support guest users.

```sql
create table experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  variant_id uuid not null references experiment_variants(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,  -- nullable for guests
  device_id text,
  context jsonb default '{}',                               -- 20260131203000
  assigned_at timestamptz default now(),
  constraint experiment_assignments_identifier_check
    check (user_id is not null or device_id is not null)
);

-- Conditional unique indexes (guest experimentation)
create unique index experiment_assignments_user_idx
  on experiment_assignments (experiment_id, user_id)
  where user_id is not null;

create unique index experiment_assignments_device_idx
  on experiment_assignments (experiment_id, device_id)
  where user_id is null;
```

### `experiment_events`

```sql
create table experiment_events (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id),
  variant_id uuid not null references experiment_variants(id),
  user_id uuid references profiles(id),  -- nullable for guests
  device_id text,                         -- 20260131203000
  event_name text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
```

---

## Scraping Logs

### `scraping_logs`

> [!NOTE]
> Legacy scraping tables (`zip_code_tracking`, `scraping_logs`) were dropped
> during the H3 community refactor (`20260201200000`). The `scraping_logs` table
> below was defined in `20260131192000` but dropped in the H3 migration. The
> `scraping_status` enum still exists.

```sql
create table scraping_logs (
  id uuid primary key default gen_random_uuid(),
  zip_code text not null,
  country_iso_3 text not null,
  status scraping_status not null,
  error_message text,
  communities_count integer default 0,
  scraped_at timestamptz default now(),
  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3)
);
```

---

## User Feedback

### `user_feedback`

```sql
create table user_feedback (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  type feedback_type not null,
  title text not null,
  description text not null,
  status feedback_status not null default 'open',
  created_at timestamptz default now()
);
```

### `feedback_media`

```sql
create table feedback_media (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references user_feedback(id) on delete cascade,
  media_id uuid not null references media_assets(id) on delete cascade,
  display_order integer default 0,
  unique(feedback_id, media_id)
);
```

### `feedback_votes`

```sql
create table feedback_votes (
  feedback_id uuid not null references user_feedback(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (feedback_id, user_id),
  created_at timestamptz default now()
);
```

### `feedback_comments`

```sql
create table feedback_comments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references user_feedback(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  is_official_response boolean default false,
  created_at timestamptz default now()
);
```

### `feedback_status_history` _(added by `20260220400001`)_

Audit trail for feedback status changes. Auto-populated via trigger.

```sql
create table feedback_status_history (
  id          uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references user_feedback(id) on delete cascade,
  old_status  feedback_status,
  new_status  feedback_status not null,
  changed_by  uuid not null references profiles(id),
  note        text,
  created_at  timestamptz default now()
);
```

**Trigger**: `log_feedback_status_change` — auto-inserts a history row whenever
`user_feedback.status` changes.

### `feedback_comment_media` _(added by `20260220400001`)_

Junction table linking feedback comments to media assets (attachments).

```sql
create table feedback_comment_media (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references feedback_comments(id) on delete cascade,
  media_id   uuid not null references media_assets(id) on delete cascade,
  unique(comment_id, media_id)
);
```

### `feedback_flags`

Content flagging table — community users can flag offensive/inappropriate
content. Staff can filter flagged tickets and moderate (dismiss flags or delete
tickets).

**Migration**: `20260220400006_feedback_flags.sql`

| Column        | Type          | Description                                  |
| :------------ | :------------ | :------------------------------------------- |
| `id`          | `uuid`        | Primary Key.                                 |
| `feedback_id` | `uuid`        | FK to `user_feedback(id)` on delete cascade. |
| `user_id`     | `uuid`        | FK to `auth.users(id)` on delete cascade.    |
| `reason`      | `text`        | Optional reason for flagging.                |
| `created_at`  | `timestamptz` | Default `now()`.                             |

**Unique**: `(feedback_id, user_id)` — one flag per user per ticket.

```sql
create table feedback_flags (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references user_feedback(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique(feedback_id, user_id)
);
```

**RLS Policies**:

| Policy                                 | Operation | Rule                                           |
| :------------------------------------- | :-------- | :--------------------------------------------- |
| Users can see own flags, staff see all | `SELECT`  | `user_id = auth.uid() OR is_staff(auth.uid())` |
| Authenticated users can flag content   | `INSERT`  | `user_id = auth.uid()`                         |
| Users can unflag own, staff can delete | `DELETE`  | `user_id = auth.uid() OR is_staff(auth.uid())` |

---

## Produce Interests

### `produce_interests`

Stores produce items users are interested in (captured during the wizard intro
step). Used to notify sellers when someone near them wants their produce.

**Migration**: `20260210080000_produce_interests.sql`

| Column         | Type          | Description                                           |
| :------------- | :------------ | :---------------------------------------------------- |
| `id`           | `uuid`        | Primary Key.                                          |
| `user_id`      | `uuid`        | FK to `profiles(id)` on delete cascade.               |
| `produce_name` | `text`        | Name of the produce item.                             |
| `is_custom`    | `boolean`     | `true` if user typed a custom name. Default: `false`. |
| `created_at`   | `timestamptz` | Default `now()`.                                      |

**Constraints**: Unique `(user_id, produce_name)` — prevents duplicate entries
per user.

**Indexes**: `idx_produce_interests_produce` (by produce name),
`idx_produce_interests_user` (by user)

```sql
create table produce_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  produce_name text not null,
  is_custom boolean default false,
  created_at timestamptz default now(),
  unique(user_id, produce_name)
);

create index idx_produce_interests_produce on produce_interests(produce_name);
create index idx_produce_interests_user on produce_interests(user_id);
```

**RLS Policies** (`20260210080000_produce_interests`):

| Policy                                       | Operation | Rule                                |
| :------------------------------------------- | :-------- | :---------------------------------- |
| Users can view all produce interests         | `SELECT`  | `using (true)` (authenticated)      |
| Users can add their own produce interests    | `INSERT`  | `with check (user_id = auth.uid())` |
| Users can update their own produce interests | `UPDATE`  | `using (user_id = auth.uid())`      |
| Users can remove their own produce interests | `DELETE`  | `using (user_id = auth.uid())`      |

---

## RLS Policies

RLS is enabled on **all** tables. Only tables with explicit access policies are
listed below.

| Table                         | Policy                                             | Operation | Condition                                  |
| :---------------------------- | :------------------------------------------------- | :-------- | :----------------------------------------- |
| `profiles`                    | Anyone can view profiles for invite lookup         | SELECT    | `true` (anon role)                         |
| `profiles`                    | Authenticated users can view all profiles          | SELECT    | `true` (authenticated)                     |
| `profiles`                    | Users can update own profile                       | UPDATE    | `auth.uid() = id`                          |
| `incentive_rules`             | Anyone can view incentive rules                    | SELECT    | `true` (authenticated)                     |
| `incentive_rules`             | Anonymous can view incentive rules                 | SELECT    | `true` (anon role)                         |
| `point_ledger`                | Users can view own point ledger entries            | SELECT    | `auth.uid() = user_id`                     |
| `point_ledger`                | Users can insert own point ledger entries          | INSERT    | `auth.uid() = user_id`                     |
| `followers`                   | Users can view own follows                         | SELECT    | `auth.uid() in (follower_id, followed_id)` |
| `followers`                   | Users can follow others                            | INSERT    | `auth.uid() = follower_id`                 |
| `followers`                   | Users can unfollow                                 | DELETE    | `auth.uid() = follower_id`                 |
| `scraping_logs`               | Service role can do everything                     | ALL       | `true`                                     |
| `sales_category_restrictions` | Authenticated users can read category restrictions | SELECT    | `true` (authenticated)                     |
| `platform_config`             | Authenticated users can read platform config       | SELECT    | `true` (authenticated)                     |
| `communities`                 | Authenticated users can read communities           | SELECT    | `true` (authenticated)                     |
| `communities`                 | Anonymous users can read communities               | SELECT    | `true` (anon)                              |
| `produce_interests`           | Users can view all produce interests               | SELECT    | `true` (authenticated)                     |
| `produce_interests`           | Users can add their own produce interests          | INSERT    | `auth.uid() = user_id`                     |
| `produce_interests`           | Users can update their own produce interests       | UPDATE    | `auth.uid() = user_id`                     |
| `produce_interests`           | Users can remove their own produce interests       | DELETE    | `auth.uid() = user_id`                     |
| `post_type_policies`          | Post type policies are readable by all auth users  | SELECT    | `true` (authenticated)                     |
| `posts`                       | Posts are readable by anonymous users              | SELECT    | `true` (anon)                              |
| `post_likes`                  | Post likes are readable by anonymous users         | SELECT    | `true` (anon)                              |
| `post_comments`               | Post comments are readable by anonymous users      | SELECT    | `true` (anon)                              |
| `post_flags`                  | Post flags are readable by anonymous users         | SELECT    | `true` (anon)                              |
| `post_media`                  | Post media is readable by anonymous users          | SELECT    | `true` (anon)                              |
| `media_assets`                | Media assets are readable by anonymous users       | SELECT    | `true` (anon)                              |
| `want_to_sell_details`        | Sell details are viewable by anonymous users       | SELECT    | `true` (anon)                              |
| `want_to_buy_details`         | Buy details are viewable by anonymous users        | SELECT    | `true` (anon)                              |

**RLS Policy SQL:**

```sql
-- profiles (20260207000000 — replaced restrictive own-profile-only policy)
create policy "Anyone can view profiles for invite lookup" on profiles for select to anon using (true);
create policy "Authenticated users can view all profiles" on profiles for select to authenticated using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- incentive_rules (20260206040000)
create policy "Anyone can view incentive rules" on incentive_rules for select using (true);
create policy "Anonymous can view incentive rules" on incentive_rules for select to anon using (true);

-- point_ledger (20260204055900)
create policy "Users can view own point ledger entries" on point_ledger for select using (auth.uid() = user_id);
create policy "Users can insert own point ledger entries" on point_ledger for insert with check (auth.uid() = user_id);

-- followers (20260206060000)
create policy "Users can view own follows" on followers for select using (auth.uid() in (follower_id, followed_id));
create policy "Users can follow others" on followers for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow" on followers for delete using (auth.uid() = follower_id);

-- sales_category_restrictions (20260210030000)
create policy "Authenticated users can read category restrictions" on sales_category_restrictions for select to authenticated using (true);

-- platform_config (20260210040000)
create policy "Authenticated users can read platform config" on platform_config for select to authenticated using (true);

-- communities (20260210050000)
create policy "Authenticated users can read communities" on communities for select to authenticated using (true);
create policy "Anonymous users can read communities" on communities for select to anon using (true);

-- produce_interests (20260210080000)
create policy "Users can view all produce interests" on produce_interests for select to authenticated using (true);
create policy "Users can add their own produce interests" on produce_interests for insert to authenticated with check (user_id = auth.uid());
create policy "Users can update their own produce interests" on produce_interests for update to authenticated using (user_id = auth.uid());
create policy "Users can remove their own produce interests" on produce_interests for delete to authenticated using (user_id = auth.uid());

-- post_type_policies (20260211000000)
create policy "Post type policies are readable by all authenticated users" on post_type_policies for select to authenticated using (true);

-- public post page anonymous access (20260212000000)
create policy "Posts are readable by anonymous users" on posts for select to anon using (true);
create policy "Post likes are readable by anonymous users" on post_likes for select to anon using (true);
create policy "Post comments are readable by anonymous users" on post_comments for select to anon using (true);
create policy "Post flags are readable by anonymous users" on post_flags for select to anon using (true);
create policy "Post media is readable by anonymous users" on post_media for select to anon using (true);
create policy "Media assets are readable by anonymous users" on media_assets for select to anon using (true);
create policy "Sell details are viewable by anonymous users" on want_to_sell_details for select to anon using (true);
create policy "Buy details are viewable by anonymous users" on want_to_buy_details for select to anon using (true);
```

> [!NOTE]
> Tables without explicit policies listed above have RLS enabled but no access
> rules yet (pending implementation).

---

## Database Functions & Triggers

### `handle_new_user()`

Auto-creates a profile row when a new user signs up via Supabase Auth, and
awards signup reward points if an active global signup rule exists.

**Migration**: `20260201100000_auth_triggers.sql`

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  signup_reward_points integer;
begin
  -- 1. Create Profile
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );

  -- 2. Create baseline point_ledger entry (0 points)
  insert into public.point_ledger (
    user_id, type, amount, balance_after, metadata
  )
  values (
    new.id,
    'reward',
    0,
    0,
    jsonb_build_object('reason', 'Account Created')
  );

  -- 3. Check for Active Signup Reward (Global Scope)
  select points into signup_reward_points
  from incentive_rules
  where action_type = 'signup'
    and scope = 'global'
    and (end_date is null or end_date > now())
  limit 1;

  -- 4. Award Points if Rule Exists
  if signup_reward_points is not null and signup_reward_points > 0 then
    insert into public.point_ledger (
      user_id, type, amount, balance_after, metadata
    )
    values (
      new.id,
      'reward',
      signup_reward_points,
      signup_reward_points,
      jsonb_build_object('reason', 'Signup Reward', 'rule', 'global_signup')
    );
  end if;

  return new;
end;
$$;

-- Trigger: fires after insert on auth.users
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Seed default signup reward (idempotent)
insert into incentive_rules (action_type, scope, points, start_date)
values ('signup', 'global', 50, now())
on conflict (action_type, scope, country_iso_3, state_id, city_id, zip_code, community_h3_index, start_date)
do nothing;
```

### `generate_referral_code()`

Generates a unique 8-character alphanumeric referral code.

**Migration**: `20260206031500_add_referral_code_trigger.sql`

```sql
create or replace function generate_referral_code()
returns text as $$
declare
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
  i integer;
begin
  for i in 1..8 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result;
end;
$$ language plpgsql;
```

### `set_referral_code_on_insert()`

Trigger function to assign a unique referral code on profile insert if not
already set.

```sql
create or replace function set_referral_code_on_insert()
returns trigger as $$
declare
  new_code text;
  code_exists boolean;
begin
  if NEW.referral_code is null then
    loop
      new_code := generate_referral_code();
      select exists(select 1 from profiles where referral_code = new_code) into code_exists;
      exit when not code_exists;
    end loop;
    NEW.referral_code := new_code;
  end if;
  return NEW;
end;
$$ language plpgsql;

-- Trigger on profiles
drop trigger if exists trigger_set_referral_code on profiles;
create trigger trigger_set_referral_code
  before insert on profiles
  for each row
  execute function set_referral_code_on_insert();
```

### `get_zips_without_communities()`

Returns zip codes that need community scraping (not scraped or scraped >90 days
ago).

**Migration**: `20260131191500_update_zip_tracking.sql` (updated from
`20260131191000`)

```sql
create or replace function get_zips_without_communities(batch_size int)
returns table (zip_code text, country_iso_3 text)
language plpgsql
security definer
as $$
begin
  return query
  select z.zip_code, z.country_iso_3
  from zip_codes z
  where z.country_iso_3 = 'USA'
    and (z.last_scraped_at is null or z.last_scraped_at < now() - interval '90 days')
  order by z.last_scraped_at nulls first, z.zip_code
  limit batch_size;
end;
$$;
```

### `compute_balance_after()`

Auto-computes `balance_after` on every `point_ledger` insert. Uses advisory lock
per user to prevent race conditions from concurrent inserts.

**Migration**: `20260215100000_balance_after_trigger.sql`

```sql
create or replace function public.compute_balance_after()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  last_balance integer;
begin
  -- Advisory lock on user_id to serialize concurrent inserts
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  -- Compute running balance as SUM of all existing amounts
  select coalesce(sum(amount), 0) into last_balance
  from point_ledger
  where user_id = new.user_id;

  if last_balance is null then
    last_balance := 0;
  end if;

  new.balance_after := last_balance + new.amount;
  return new;
end;
$$;

-- Trigger fires BEFORE INSERT so we can modify NEW.balance_after
create trigger trg_compute_balance_after
  before insert on point_ledger
  for each row
  execute function public.compute_balance_after();
```

### `create_order_atomic()`

Atomically creates a "buy now" order — wraps conversation + offer + order +
hold + system message in a single transaction. The `compute_balance_after`
trigger fires inside this transaction, so advisory locks are properly held.

**Migration**: `20260215200000_create_order_atomic.sql`

```sql
create or replace function public.create_order_atomic(
  p_buyer_id  uuid,
  p_seller_id uuid,
  p_post_id   uuid,
  p_quantity   integer,
  p_points_per_unit integer,
  p_total_price integer,
  p_category   text,
  p_product    text,
  p_delivery_date  date default null,
  p_delivery_instructions text default null
) returns jsonb
```

**Logic**:

1. Check buyer's balance (sum of all `point_ledger` amounts)
2. Create or reuse `conversations` row (buyer + seller + post)
3. Create pending `offers` row
4. Create pending `orders` row
5. Hold buyer's points via `point_ledger` insert (type: `hold`, amount:
   `-totalPrice`) — `balance_after` auto-computed by trigger
6. Insert system `chat_messages` ("Order placed: ...")
7. Return `{ orderId, conversationId, newBalance }`

---

## Edge Functions

### `resolve-community`

Resolves a user's location to a primary H3 community and identifies 6
neighboring communities.

**Endpoint**: `POST /functions/v1/resolve-community`

**Input**: `{ "address": "..." }` or `{ "lat": 37.77, "lng": -122.41 }`

**Logic**:

1. Geocode address → Lat/Lng via Nominatim (if address provided) —
   `⏱️ Nominatim geocoding: Xms`
2. Calculate H3 Index (Res 7) for primary cell + `gridDisk(h3, 1)` for 6
   neighbors (7 total)
3. **Batch DB lookup**: single `.in()` query for all 7 H3 indices —
   `⏱️ DB batch lookup: Xms → found N/7`
4. For **missing** indices only: generate via `generateCommunityFromOverpass()`
   helper (sequential, 2s delay between calls to respect rate limits) —
   `⏱️ Overpass generation for [idx]: Xms`
5. Insert new communities into `communities` table
6. Return primary community + 6 neighbors with resolved location —
   `⏱️ Total request time: Xms`

**Caching**: Communities are persisted to DB on first resolution. Subsequent
lookups for the same H3 zones skip Overpass entirely (step 3 returns all 7 from
DB). Logs `✅ All communities found in DB cache` when fully cached.

**Naming Heuristic** (`generateCommunityFromOverpass`): Schools > Parks > Malls

> Major Roads > Neighborhoods

**Dependencies**: `@supabase/supabase-js@2`, `h3-js@4.1.0`

**Source**:
[resolve-community/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/resolve-community/index.ts)

### `assign-experiment`

Assigns a user/device to an experiment variant using deterministic bucketing
(djb2 hash).

**Endpoint**: `POST /functions/v1/assign-experiment`

**Input**:
`{ "experiment_id": "...", "device_id": "...", "profile_id": "...", "context": {} }`

**Logic**:

1. Check for existing assignment → return it if found
2. Fetch experiment + variants, validate experiment is `running`
3. Check targeting criteria against context
4. Hash `experiment_id:identifier` via djb2, bucket into variant weight ranges
5. Persist assignment to `experiment_assignments`

**Source**:
[assign-experiment/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/assign-experiment/index.ts)

### `sync-locations`

Syncs country reference data from the REST Countries API into the `countries`
table.

**Endpoint**: `POST /functions/v1/sync-locations`

**Logic**: Fetches from `restcountries.com/v3.1/all`, maps to schema, upserts on
`iso_3`.

**Source**:
[sync-locations/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/sync-locations/index.ts)

### `update-zip-codes`

Bulk imports US zip codes with state/city auto-population.

**Endpoint**: `POST /functions/v1/update-zip-codes`

**Logic**: Parses CSV zip code data, extracts unique states/cities, upserts them
in dependency order, then upserts zip codes with resolved `city_id` FKs.

**Source**:
[update-zip-codes/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/update-zip-codes/index.ts)

### `pair-delegation`

Handles delegation pairing via 6-digit codes (in-person) and shareable link
codes (remote). Delegators generate a code or link; delegatees enter or click it
to activate the relationship.

**Endpoint**: `POST /functions/v1/pair-delegation`

**Actions**:

| Action          | Auth          | Input                                               | Result                                                                                  |
| :-------------- | :------------ | :-------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| `lookup`        | None (public) | `{ "action": "lookup", "code": "d-abc12xyz" }`      | Returns delegation info (delegator profile, message, pairing code) for the landing page |
| `generate`      | JWT           | `{ "action": "generate" }`                          | Creates pending delegation with 6-digit pairing code, 5-min expiry                      |
| `accept`        | JWT           | `{ "action": "accept", "code": "123456" }`          | Validates 6-digit code, sets `delegatee_id`, activates delegation, clears code          |
| `generate-link` | JWT           | `{ "action": "generate-link", "message": "..." }`   | Creates delegation with `d-` prefixed link code + 6-digit pairing code, 24h expiry      |
| `accept-link`   | JWT           | `{ "action": "accept-link", "code": "d-abc12xyz" }` | Validates link code, sets `delegatee_id`, activates delegation                          |

**Link reuse**: `generate-link` reuses an existing unexpired `pending_pairing`
row for the same delegator instead of creating duplicates. This ensures
re-sharing a link does not generate orphan rows.

**Security**:

- `lookup` is unauthenticated (used by landing page before user logs in)
- All other actions require `Authorization` header (user JWT)
- Uses service role for atomic DB operations that bypass RLS
- Prevents self-delegation (`delegator_id ≠ auth.uid()`) in both `accept` and
  `accept-link` actions
- Code collision retry (regenerates on unique constraint violation)

**Query filters**: The `useDelegations` hook queries only `pending` and `active`
statuses. `pending_pairing` rows (outstanding link invitations with no
delegatee) are excluded from the My Delegates list, so they don't inflate
delegate counts.

**Attribution approach**: Delegation codes are passed to new installs via:

- **Android**: Google Play Install Referrer (`delegate=d-xxx` in the Play Store
  URL `referrer` parameter) — deterministic, no privacy notices
- **iOS**: Users revisit the delegation landing page after installing, or enter
  the 6-digit pairing code manually via Join by Code. Branch.io (deferred deep
  links) will be integrated pre-launch.
- **Clipboard bridge**: Removed. The previous approach of writing to clipboard
  before app store redirect caused iOS 14+ / Android 13+ privacy notices ("App
  pasted from clipboard") and was a poor UX pattern.

**Source**:
[pair-delegation/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/pair-delegation/index.ts)

### `enrich-communities`

Background enrichment function that improves community names generated during
the `resolve-community` flow. Communities initially named with fallback "Zone
XX" patterns (from Nominatim) are re-queried against Overpass API for better
landmark-based names.

**Endpoint**: `POST /functions/v1/enrich-communities`

**Input**: `{ "limit": 3 }` (optional, default 1)

**Logic**:

1. Query communities where `metadata->>'source'` is `'nominatim_fallback'`
   (fallback names that need enrichment)
2. For each community, claim it by setting source to `'enriching'` (concurrency
   guard prevents duplicate processing)
3. Call `enrichCommunityFromOverpass()` — queries Overpass API with the
   community's H3 boundary polygon for nearby landmarks
4. Apply naming heuristic: Schools > Parks > Malls > Roads > Neighborhoods
5. Update the community name, metadata source to `'overpass'`, and boundary
   geometry
6. On failure, reset source back to `'nominatim_fallback'` for retry

**Scheduling** (`20260210070000_enrich_communities_cron`):

```sql
-- Runs every minute via pg_cron, processing up to 3 communities per invocation
SELECT cron.schedule(
  'enrich-communities-job',
  '* * * * *',
  $$ SELECT net.http_post(
    url := 'http://api.localhost:54321/functions/v1/enrich-communities',
    headers := jsonb_build_object(...),
    body := '{"limit": 3}'::jsonb
  ); $$
);
```

**Concurrency**: Uses optimistic locking — sets `metadata.source` to
`'enriching'` before processing and only selects communities with
`'nominatim_fallback'` source. This prevents concurrent cron ticks from
processing the same community.

**Dependencies**: `@supabase/supabase-js@2`, `h3-js@4.1.0`, `pg_cron`, `pg_net`

**Source**:
[enrich-communities/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/enrich-communities/index.ts)

> [!IMPORTANT]
> Edge functions require `supabase functions serve` to be running locally.
> Without it, requests return **503 Service Temporarily Unavailable**.

---

## Payment System

### `payment_transactions`

Tracks payment intents for point purchases. Links Stripe PaymentIntents to
`point_ledger` entries, ensuring idempotent point crediting.

**Migration**: `20260214000000_payment_transactions.sql`

| Column                     | Type          | Description                                            |
| :------------------------- | :------------ | :----------------------------------------------------- |
| `id`                       | `uuid`        | Primary Key.                                           |
| `user_id`                  | `uuid`        | FK to `profiles(id)`.                                  |
| `stripe_payment_intent_id` | `text`        | Stripe PI ID (or `mock_*` for mock provider).          |
| `amount_cents`             | `integer`     | Total charge in cents.                                 |
| `service_fee_cents`        | `integer`     | Service fee portion in cents. Default: `0`.            |
| `points_amount`            | `integer`     | Number of points to credit.                            |
| `status`                   | `text`        | `pending`, `succeeded`, or `failed`.                   |
| `provider`                 | `text`        | `mock` or `stripe`.                                    |
| `point_ledger_id`          | `uuid`        | FK to `point_ledger(id)`. Set on confirmation.         |
| `metadata`                 | `jsonb`       | Additional data (card info for mock, Stripe metadata). |
| `webhook_received_at`      | `timestamptz` | When webhook/confirmation was processed.               |
| `created_at`               | `timestamptz` | Default `now()`.                                       |
| `updated_at`               | `timestamptz` | Default `now()`.                                       |

```sql
create table payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stripe_payment_intent_id text,
  amount_cents integer not null,
  service_fee_cents integer not null default 0,
  points_amount integer not null,
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  provider text not null default 'mock' check (provider in ('mock','stripe')),
  point_ledger_id uuid references point_ledger(id),
  metadata jsonb default '{}',
  webhook_received_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**RLS Policies** (`20260214000000_payment_transactions`):

| Policy                                  | Operation | Rule                                    |
| :-------------------------------------- | :-------- | :-------------------------------------- |
| Users can read own payment transactions | `SELECT`  | `using (auth.uid() = user_id)`          |
| Service role can manage all             | ALL       | Service role bypasses RLS in edge funcs |

**Indexes**: `idx_payment_transactions_user_id`,
`idx_payment_transactions_status`

---

### Payment Edge Functions

#### `create-payment-intent`

Creates a payment transaction and (for Stripe mode) a Stripe PaymentIntent.

**Endpoint**: `POST /functions/v1/create-payment-intent`

**Input**:
`{ "amountCents": 1000, "pointsAmount": 100, "serviceFeeCents": 30, "provider": "mock"|"stripe" }`

**Logic**:

1. Authenticate user via JWT
2. Insert `payment_transactions` row (status: `pending`)
3. If `provider === 'stripe'`: create Stripe PaymentIntent via API
4. Return `{ clientSecret, transactionId }`

#### `confirm-payment`

**Single source of truth** for crediting points after payment. Idempotent.

**Endpoint**: `POST /functions/v1/confirm-payment`

**Input**: `{ "paymentTransactionId": "uuid" }`

**Logic**:

1. Fetch transaction — skip if already `succeeded`
1. Fetch transaction — skip if already `succeeded`
1. Insert `point_ledger` entry (type: `purchase`, amount: +points) —
   `balance_after` auto-computed by trigger
1. Update `payment_transactions` (status: `succeeded`, set `point_ledger_id`)
1. Return `{ success: true, newBalance, pointsAmount }`

#### `stripe-webhook`

Handles Stripe webhook events for server-side payment confirmation.

**Endpoint**: `POST /functions/v1/stripe-webhook`

**Events handled**: `payment_intent.succeeded`, `payment_intent.payment_failed`

**Security**: Verifies Stripe signature using HMAC-SHA256 (Web Crypto API).
Calls `confirm-payment` for succeeded events, marks transaction as `failed` for
failed events.

#### `resolve-pending-payments`

Recovers stuck payments on app open (handles app-kill and webhook delay).

**Endpoint**: `POST /functions/v1/resolve-pending-payments`

**Logic**:

1. Fetch all `pending` transactions for authenticated user
2. Mark stale transactions (>24h) as `failed`
3. Mock transactions: auto-confirm via `confirm-payment`
4. Stripe transactions: check Stripe API status, confirm if `succeeded`
5. Return `{ resolved: [...], pending: [...] }`

#### `create-order`

Atomically creates a "buy now" order from the feed.

**Endpoint**: `POST /functions/v1/create-order`

**Input**:
`{ "postId", "sellerId", "quantity", "pricePerUnit", "totalPrice", "category", "product", "deliveryDate", "deliveryInstructions", "deliveryAddress" }`

**Logic**:

1. Verify buyer has sufficient balance
2. Create/reuse `conversations` row (buyer + seller + post)
3. Create auto-accepted `offers` row
4. Create `orders` row (status=`pending`, version=`1`)
5. Debit buyer: insert `point_ledger` (type: `hold`, amount: -totalPrice)
6. Insert system `chat_messages` ("Order placed: ...")
7. Return `{ orderId, conversationId, newBalance }`

#### `create-offer`

Thin wrapper around the `create_offer_atomic` RPC. Validates inputs and
delegates to the SQL function for atomic conversation + offer creation.

**Endpoint**: `POST /functions/v1/create-offer`

**Input**:
`{ "postId", "buyerId", "quantity", "pointsPerUnit", "category", "product", "unit?", "deliveryDate?", "message?", "sellerPostId?", "media?" }`

**Logic**:

1. Authenticate seller via JWT
2. Validate required fields (`postId`, `buyerId`, `quantity`, `pointsPerUnit`,
   `category`, `product`)
3. Reject self-offers (`sellerId === buyerId`)
4. Call `create_offer_atomic` RPC with all parameters
5. Return `{ offerId, conversationId }` or business logic error
   (`existingOfferId`, `existingOrderId`)

**Source**:
[create-offer/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/create-offer/index.ts)

---

### Redemption Edge Functions

Edge functions for the redemption system: gift card purchases, charitable
donations, catalog management, and provider balance monitoring. These work with
the tables added in migration `20260222100000_redemption_providers`.

#### `donate-points`

Donates user points to GlobalGiving charitable projects. Implements full
lifecycle: debit → API call → receipt → refund on failure.

**Endpoint**: `POST /functions/v1/donate-points`

**Input**:
`{ "projectId?", "projectTitle?", "organizationName", "theme?", "pointsAmount", "itemId?" }`

**Logic**:

1. Validate balance (`point_ledger` latest `balance_after`)
2. Create pending `redemptions` row (provider: `globalgiving`)
3. Debit points: insert `point_ledger` (type: `donation`, −pointsAmount)
4. Call GlobalGiving Donation API (or simulate if `GLOBALGIVING_SANDBOX=true`)
5. Log `provider_transactions` row (status: `success`)
6. Store `donation_receipts` row (receipt number, URL, tax-deductible flag)
7. Mark redemption `completed`
8. On API failure: refund points, mark redemption `failed`

**Env vars**: `GLOBALGIVING_API_KEY`, `GLOBALGIVING_SANDBOX`

**Conversion**: 100 points = $1.00 USD

**Source**:
[donate-points/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/donate-points/index.ts)

#### `fetch-donation-projects`

Fetches charitable project catalog from GlobalGiving. Supports search and browse
modes with 24-hour caching.

**Endpoint**: `POST /functions/v1/fetch-donation-projects`

**Input**: `{ "q?": "search term" }` or `?q=search+term` query parameter

**Modes**:

| Mode   | Trigger             | API Call                     | Cache                                                 |
| :----- | :------------------ | :--------------------------- | :---------------------------------------------------- |
| Search | `q` param ≥ 2 chars | GlobalGiving search API      | No cache (live)                                       |
| Browse | No `q` param        | GlobalGiving active projects | `platform_config` key `donation_projects_v1`, 24h TTL |

**Fallback**: Returns hardcoded mock projects (4 items) when
`GLOBALGIVING_API_KEY` is not configured.

**Output**: `{ projects: DonationProject[], cached: boolean }`

**Source**:
[fetch-donation-projects/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/fetch-donation-projects/index.ts)

#### `fetch-gift-cards`

Merges gift card catalogs from Reloadly and Tremendous providers into a unified,
deduplicated list sorted by brand popularity.

**Endpoint**: `POST /functions/v1/fetch-gift-cards`

**Logic**:

1. Check cache (`platform_config` key `gift_card_catalog_v4`, 24h TTL)
2. Fetch catalogs from both providers in parallel (`Promise.allSettled`)
3. Process Tremendous first (preferred — no processing fees)
4. Merge Reloadly cards: extend denomination ranges for existing brands, add new
   brands
5. Compute `hasProcessingFee` and `processingFeeUsd` per brand
6. Sort by popularity (curated top 10: Amazon, Target, Walmart, Starbucks, …)
   then alphabetically
7. Cache results to `platform_config`
8. Return `{ cards: UnifiedGiftCard[], cached: boolean, count }`

**Brand deduplication**: Normalizes brand names (lowercase, strip punctuation,
remove country suffixes) to merge the same brand from different providers.

**Env vars**: `TREMENDOUS_API_KEY`, `RELOADLY_CLIENT_ID`,
`RELOADLY_CLIENT_SECRET`, `RELOADLY_SANDBOX`

**Source**:
[fetch-gift-cards/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/fetch-gift-cards/index.ts)

#### `redeem-gift-card`

Purchases a gift card with points. Picks the cheapest provider, handles the full
lifecycle: debit → provider order → delivery → refund on failure.

**Endpoint**: `POST /functions/v1/redeem-gift-card`

**Input**: `{ "brandName", "faceValueCents", "pointsCost" }`

**Logic**:

1. Validate balance
2. Look up brand in cached catalog (`gift_card_catalog_v4`) to find available
   providers and compute net fees
3. Pick cheapest provider (Tremendous first — free; Reloadly as fallback)
4. Create pending `redemptions` row
5. Debit points: insert `point_ledger` (type: `redemption`, −pointsCost)
6. Place order with selected provider API
7. On provider failure: refund points, mark redemption `failed`
8. Log `provider_transactions` row
9. Store `gift_card_deliveries` row (card code, URL, PIN, expiry)
10. Mark redemption `completed`
11. Return `{ success, redemptionId, provider, cardCode, cardUrl, netFeeCents }`

**Source**:
[redeem-gift-card/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/redeem-gift-card/index.ts)

#### `sync-provider-balance`

Cron function that polls Reloadly and Tremendous balance APIs, updates
`provider_accounts` table, and warns on low balances.

**Endpoint**: `POST /functions/v1/sync-provider-balance`

**Logic**:

1. **Tremendous**: Fetch `funding_sources` → find `method === "balance"` →
   update `provider_accounts.balance_cents`
2. **Reloadly**: OAuth token → `accounts/balance` → update
   `provider_accounts.balance_cents`
3. For each provider: compare balance against `low_balance_threshold_cents`
   (default $100), log warning if below
4. Return `{ success, synced_at, providers: { tremendous, reloadly } }`

**Env vars**: `TREMENDOUS_API_KEY`, `RELOADLY_CLIENT_ID`,
`RELOADLY_CLIENT_SECRET`

**Intended scheduling**: Called via `pg_cron` (similar to `enrich-communities`).

**Source**:
[sync-provider-balance/index.ts](file:///Users/rkhona/development/bug_reporting/casagrown3/supabase/functions/sync-provider-balance/index.ts)

---

## Order Lifecycle RPC Functions

Server-side functions implementing the order state machine with optimistic
locking (`version` column) and hold-based point flows. All RPCs use
`SECURITY DEFINER` and `FOR UPDATE` row locking.

### `accept_order_versioned`

**Migration**: `20260216070001`, updated by `20260217003100`

**Signature**:
`accept_order_versioned(p_order_id uuid, p_expected_version integer) → jsonb`

**Logic**:

1. Lock and fetch order
2. Verify status = `pending`
3. Verify `version = p_expected_version` (returns `VERSION_MISMATCH` error +
   system message if stale)
4. Set status → `accepted`, reduce
   `want_to_sell_details.total_quantity_available`
5. Insert system message with unit-aware formatting (e.g., "2 dozen Tomatoes for
   200 points. Points held on hold…")
6. Return `{ success: true }`

### `reject_order_versioned`

**Migration**: `20260216070001`

**Signature**:
`reject_order_versioned(p_order_id uuid, p_expected_version integer) → jsonb`

**Logic**:

1. Lock and fetch order, verify pending + version match
2. Set status → `cancelled`
3. Refund buyer: insert `point_ledger` (type: `refund`, amount: +total)
4. Insert system message ("Order rejected by seller. Points refunded.")
5. Return `{ success: true }`

### `cancel_order`

**Migration**: `20260217000006`, updated by `20260219000002`

**Signature**:
`cancel_order_with_message(p_order_id uuid, p_user_id uuid) → jsonb`

**Logic**:

1. Lock and fetch order
2. Verify caller is buyer or seller
3. Verify status is `pending` or `accepted` (not already
   cancelled/delivered/disputed)
4. Determine canceller role (`buyer` or `seller`)
5. Set status → `cancelled`
6. Refund buyer: insert `point_ledger` (type: `refund`, amount: +total)
7. If previously `accepted`, restore `total_quantity_available` on the post
8. Insert **system message** (`sender_id = null`, `type = 'system'`): "Order
   cancelled by buyer/seller. X points have been refunded to the buyer."
9. Return `{ success: true }`

### `mark_delivered`

**Migration**: `20260217000007`

**Signature**:
`mark_delivered(p_order_id uuid, p_seller_id uuid, p_proof_url text, p_proof_location text) → jsonb`

**Logic**:

1. Lock and fetch order, verify caller is seller
2. Verify status = `accepted`
3. Set status → `delivered`, store proof URL/location/timestamp
4. Insert system message ("Order marked as delivered by seller. Buyer: please
   confirm receipt.")
5. Return `{ success: true }`

### `confirm_delivery`

**Migration**: `20260217000008_confirm_delivery_rpc`, updated by
`20260223100001_complete_order_with_split`

**Signature**:
`confirm_order_delivery(p_order_id uuid, p_buyer_id uuid) → jsonb`

**Logic** (delegation-split-aware, `20260223100001`):

1. Lock and fetch order, verify caller is buyer
2. Verify status = `delivered`
3. Calculate total, platform fee (10%), after-fee amount
4. Insert `point_ledger` platform fee entry (type: `platform_fee`, amount: -fee)
5. **If delegated sale** (`post.on_behalf_of IS NOT NULL`):
   - Look up active delegation to get `delegate_pct` (default 50%)
   - Split after-fee amount: delegate gets `delegate_pct%`, delegator gets
     remainder
   - Insert two `point_ledger` entries (type: `delegation_split`) — one for
     delegate, one for delegator, with metadata including role, percentages, and
     amounts
   - Insert notification to delegator about the sale
6. **If normal sale**: Insert single `point_ledger` (type: `payment`)
7. Set status → `completed` (terminal)
8. Insert **role-specific system messages** (both `sender_id = null`,
   `type = 'system'`):
   - _Buyer sees_: "✅ Order complete! X held points released…"
     (`metadata.visible_to = buyer_id`)
   - _Seller sees_: "💰 Payment received: X points credited…"
     (`metadata.visible_to = seller_id`)
9. Return `{ success: true, delegated: bool, ... share amounts }`

### `create_escalation`

**Migration**: `20260217000008_dispute_escalation_rpcs`

**Signature**:
`create_escalation(p_order_id uuid, p_buyer_id uuid, p_reason text, p_proof_url text) → jsonb`

**Logic**:

1. Lock and fetch order, verify caller is buyer
2. Verify status = `delivered` or `accepted` (can dispute before or after
   delivery)
3. Set order status → `disputed`
4. Create `escalations` row (status: `open`)
5. Insert system message ("Buyer has disputed this order. Reason: ...")
6. Return `{ escalationId, success: true }`

### `create_refund_offer`

**Migration**: `20260217000008_dispute_escalation_rpcs`

**Signature**:
`create_refund_offer(p_escalation_id uuid, p_user_id uuid, p_amount numeric, p_message text) → jsonb`

**Logic**:

1. Verify escalation exists and is `open`
2. Create `refund_offers` row (status: `pending`)
3. Insert system message ("Refund offer: X points. Message: ...")
4. Return `{ refundOfferId, success: true }`

### `accept_refund_offer`

**Migration**: `20260217000008_dispute_escalation_rpcs`, updated by
`20260219000001`

**Signature**:
`accept_refund_offer_with_message(p_order_id uuid, p_buyer_id uuid, p_offer_id uuid) → jsonb`

**Logic**:

1. Lock order and refund offer, verify caller is buyer, offer is `pending`
2. Calculate refund, seller amount, platform fee, and seller payout
3. Set offer status → `accepted`
4. Close escalation (status: `resolved`, resolution: `refund_accepted`)
5. Refund buyer the partial amount
6. Credit seller remaining minus fee, record platform fee
7. Set order status → `completed`
8. Insert **role-specific system messages**:
   - _Buyer sees_: "✅ Dispute resolved! X points refunded…"
     (`metadata.visible_to = buyer_id`)
   - _Seller sees_: "💰 Dispute resolved: X points credited…"
     (`metadata.visible_to = seller_id`)
9. Return `{ success: true }`

> [!NOTE]
> **`visible_to` metadata pattern**: System messages with
> `metadata.visible_to = <user_id>` are only shown to that user. Messages
> without `visible_to` (or `visible_to = null`) are visible to all participants.
> RPCs updated in `20260219000001`: `confirm_order_delivery`,
> `accept_refund_offer_with_message`, `resolve_dispute_with_message`.

### `modify_order`

**Migration**: `20260217000011`, updated by `20260217003100`

**Signature**:
`modify_order(p_order_id uuid, p_buyer_id uuid, p_quantity integer, p_delivery_date date, p_points_per_unit integer, p_delivery_address text, p_delivery_instructions text) → jsonb`

**Logic**:

1. Lock and fetch order, verify caller is buyer, status = `pending`
2. Compute price difference (old total vs new total)
3. If cost increased: verify buyer balance, hold additional amount
4. If cost decreased: refund difference to buyer
5. Update order fields + bump `version`
6. Insert system message with unit ("Order modified: 3 boxes Tomatoes for 300
   points…")
7. Return `{ success: true, newVersion, newTotal }`

---

## Offer RPCs

All offer RPCs were added in migrations `20260219100001` – `20260219100005`,
with updates in `20260220100000` (seller message) and `20260220300000` (buyer
quantity support).

### `create_offer_atomic`

**Migration**: `20260219100001_create_offer_atomic`, updated by
`20260220100000_offer_message_from_seller`,
`20260220200000_offer_delivery_dates`

**Signature**:
`create_offer_atomic(p_seller_id uuid, p_buyer_id uuid, p_post_id uuid, p_quantity integer, p_points_per_unit integer, p_category text, p_product text, p_unit text, p_delivery_date date, p_message text, p_seller_post_id uuid, p_media jsonb, p_delivery_dates date[], p_community_h3_index text, p_additional_community_h3_indices text[]) → jsonb`

**Logic**:

1. Prevent self-offers (`p_seller_id != p_buyer_id`)
2. Resolve delivery dates: prefer `p_delivery_dates` array, fall back to
   `ARRAY[p_delivery_date]`
3. Create or reuse conversation for `(post_id, buyer_id, seller_id)`
4. Check no pending offer or active order (`pending`/`accepted`/`delivered`)
   exists for this conversation
5. Insert offer with all columns including `delivery_dates`,
   `community_h3_index`, `additional_community_h3_indices`
6. Insert seller chat message (type=`text`, from seller — not system)
7. Return `{ offerId, conversationId }`

### `accept_offer_atomic`

**Migration**: `20260219100002_accept_offer_atomic`, updated by
`20260220300000_accept_offer_buyer_qty`

**Signature**:
`accept_offer_atomic(p_offer_id uuid, p_buyer_id uuid, p_delivery_address text, p_delivery_instructions text, p_quantity numeric) → jsonb`

**Logic**:

1. Lock and fetch offer (`FOR UPDATE`), verify `status = 'pending'`
2. Fetch conversation, verify `p_buyer_id = conversation.buyer_id`
3. Validate `p_delivery_address` is not empty
4. Use buyer's requested quantity:
   `v_quantity := coalesce(p_quantity, offer.quantity)`
5. Validate `v_quantity > 0` and `v_quantity <= offer.quantity`
6. Calculate total price: `v_total_price := v_quantity × offer.points_per_unit`
7. Verify buyer's point balance ≥ `v_total_price`
8. Update offer: `status → 'accepted'`, `updated_at → now()`
9. Insert order (status=`pending`) with buyer's quantity and calculated price
10. Hold buyer's points: `point_ledger` INSERT (type=`hold`, −total_price)
11. Update buyer's balance: `profiles.current_points -= v_total_price`
12. Insert buyer chat message (type=`text`, "✅ Offer accepted! Order placed:
    ...")
13. Return `{ orderId, conversationId, newBalance }`

### `reject_offer_with_message`

**Migration**: `20260219100003_reject_offer_rpc`

**Signature**:
`reject_offer_with_message(p_offer_id uuid, p_buyer_id uuid) → jsonb`

**Logic**:

1. Lock offer (`FOR UPDATE`), verify `status = 'pending'`
2. Verify caller is the buyer (`conversation.buyer_id = p_buyer_id`)
3. Update offer: `status → 'rejected'`, `updated_at → now()`
4. Insert system message: "Offer rejected: X unit product at Y pts/unit."
5. Return `{ success: true }`

### `withdraw_offer_with_message`

**Migration**: `20260219100004_withdraw_offer_rpc`

**Signature**:
`withdraw_offer_with_message(p_offer_id uuid, p_seller_id uuid) → jsonb`

**Logic**:

1. Lock offer (`FOR UPDATE`), verify `status = 'pending'`
2. Verify caller is the creator (`offer.created_by = p_seller_id`)
3. Update offer: `status → 'withdrawn'`, `updated_at → now()`
4. Insert system message: "Offer withdrawn: X unit product."
5. Return `{ success: true }`

### `modify_offer_with_message`

**Migration**: `20260219100005_modify_offer_rpc`

**Signature**:
`modify_offer_with_message(p_offer_id uuid, p_seller_id uuid, p_quantity integer, p_points_per_unit integer, p_delivery_date date, p_message text, p_media jsonb, p_delivery_dates date[], p_community_h3_index text, p_additional_community_h3_indices text[]) → jsonb`

**Logic**:

1. Lock offer (`FOR UPDATE`), verify `status = 'pending'`
2. Verify caller is the creator (`offer.created_by = p_seller_id`)
3. Resolve delivery dates (prefer array, fall back to single date)
4. Track field changes for system message (qty, price, delivery, media)
5. Update offer with new values + `version += 1` + `updated_at → now()`
6. Insert seller chat message (type=`text`): "✏️ Offer modified: {changes}. New
   total: X pts."
7. Return `{ success: true, newVersion }`

---

## Storage Buckets

Supabase Storage buckets for media uploads. Created by migrations
`20260217000003` – `20260217000005`.

### `avatars`

Profile avatar images.

| Setting            | Value                                                |
| :----------------- | :--------------------------------------------------- |
| Public             | `true`                                               |
| File size limit    | 5 MB                                                 |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |

**Policies**: Authenticated users can upload to their own path (`uid/filename`),
public read access.

### `chat-media`

Chat message attachments (images, videos).

| Setting            | Value                |
| :----------------- | :------------------- |
| Public             | `true`               |
| File size limit    | 50 MB                |
| Allowed MIME types | `image/*`, `video/*` |

**Policies**: Authenticated users can upload, public read access.

### `delivery-proof-images`

Delivery and dispute proof photos.

| Setting            | Value                                   |
| :----------------- | :-------------------------------------- |
| Public             | `true`                                  |
| File size limit    | 10 MB                                   |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` |

**Policies**: Authenticated users can upload, public read access.

---

## Database RPC Helpers

### `get_user_messages`

**Migration**: `20260217000002`

Returns the most recent messages for a user across all their conversations, used
for building the chat inbox view.

**Signature**:
`get_user_messages(p_user_id uuid) → TABLE(conversation_id, post_id, buyer_id, seller_id, other_user_id, other_user_name, other_user_avatar, last_message, last_message_at, unread_count)`

**Logic**: Joins `conversations` → `chat_messages` → `profiles` to build inbox
summary with unread counts and last message preview.

---

## Redemption Provider Integration

**Migration**: `20260222100000_redemption_providers`

Adds tables for tracking provider accounts (Reloadly, Tremendous, GlobalGiving),
logging provider API transactions, and enriching the existing `redemptions`
table with delivery details (gift card codes, donation receipts).

### New Enum: `provider_transaction_status`

```sql
CREATE TYPE provider_transaction_status AS ENUM ('pending', 'success', 'failed', 'refunded');
```

### `provider_accounts`

Tracks API credentials reference and balance snapshots for each integration
provider.

| Column                        | Type          | Notes                                          |
| :---------------------------- | :------------ | :--------------------------------------------- |
| `id`                          | `uuid` PK     | Auto-generated                                 |
| `provider_name`               | `text` UNIQUE | `'reloadly'`, `'tremendous'`, `'globalgiving'` |
| `display_name`                | `text`        | Human-readable name                            |
| `is_active`                   | `boolean`     | Default `true`                                 |
| `balance_cents`               | `integer`     | Current balance in cents (USD)                 |
| `balance_updated_at`          | `timestamptz` | Last time balance was synced                   |
| `low_balance_threshold_cents` | `integer`     | Default `10000` ($100)                         |
| `metadata`                    | `jsonb`       | Provider-specific config                       |
| `created_at`                  | `timestamptz` | Auto-generated                                 |
| `updated_at`                  | `timestamptz` | Auto-generated                                 |

**RLS**: Service role only (no user access).

**Seed data**: `reloadly`, `tremendous`, `globalgiving` rows inserted.

### `provider_transactions`

Logs every API call to external providers for audit and debugging.

| Column              | Type                          | Notes                         |
| :------------------ | :---------------------------- | :---------------------------- |
| `id`                | `uuid` PK                     | Auto-generated                |
| `provider_name`     | `text`                        | Provider key                  |
| `redemption_id`     | `uuid` FK → `redemptions`     | Link to user redemption       |
| `user_id`           | `uuid` FK → `profiles`        | NOT NULL                      |
| `external_order_id` | `text`                        | Provider's order ID           |
| `item_type`         | `text`                        | `'gift_card'`, `'donation'`   |
| `item_name`         | `text`                        | e.g. `'Amazon $25 Gift Card'` |
| `face_value_cents`  | `integer`                     | Face value in cents           |
| `cost_cents`        | `integer`                     | Actual cost after discount    |
| `discount_cents`    | `integer`                     | Default `0`                   |
| `fee_cents`         | `integer`                     | Default `0`                   |
| `status`            | `provider_transaction_status` | Default `'pending'`           |
| `status_message`    | `text`                        | Error message if failed       |
| `request_payload`   | `jsonb`                       | Default `'{}'`                |
| `response_payload`  | `jsonb`                       | Default `'{}'`                |
| `created_at`        | `timestamptz`                 | Auto-generated                |
| `updated_at`        | `timestamptz`                 | Auto-generated                |

**Indexes**: `user_id`, `redemption_id`, `status`, `created_at DESC`.

**RLS**: Service role full access; authenticated users can read their own rows.

### `gift_card_deliveries`

Stores delivered card details for gift card redemptions.

| Column                    | Type          | Notes                              |
| :------------------------ | :------------ | :--------------------------------- |
| `id`                      | `uuid` PK     | Auto-generated                     |
| `redemption_id`           | `uuid` FK     | ON DELETE CASCADE                  |
| `provider_transaction_id` | `uuid` FK     | Link to `provider_transactions`    |
| `brand_name`              | `text`        | e.g. `'Amazon'`, `'Starbucks'`     |
| `face_value_cents`        | `integer`     | Face value in cents                |
| `card_code`               | `text`        | Gift card code (encrypted at rest) |
| `card_url`                | `text`        | Redemption URL                     |
| `card_pin`                | `text`        | PIN if applicable                  |
| `expiry_date`             | `date`        | Card expiry                        |
| `delivered_at`            | `timestamptz` | When the card was delivered        |
| `created_at`              | `timestamptz` | Auto-generated                     |

**RLS**: Service role write; authenticated users read own (via `redemption_id`
ownership check).

### `donation_receipts`

Stores donation confirmation details for charitable donations.

| Column                    | Type          | Notes                             |
| :------------------------ | :------------ | :-------------------------------- |
| `id`                      | `uuid` PK     | Auto-generated                    |
| `redemption_id`           | `uuid` FK     | ON DELETE CASCADE                 |
| `provider_transaction_id` | `uuid` FK     | Link to `provider_transactions`   |
| `organization_name`       | `text`        | e.g. `'Food For All Foundation'`  |
| `project_title`           | `text`        | Specific project name             |
| `theme`                   | `text`        | `'Hunger'`, `'Environment'`, etc. |
| `donation_amount_cents`   | `integer`     | Amount donated in cents           |
| `points_spent`            | `integer`     | Points deducted from user         |
| `receipt_url`             | `text`        | Downloadable receipt URL          |
| `receipt_number`          | `text`        | Receipt reference number          |
| `tax_deductible`          | `boolean`     | Default `true`                    |
| `donated_at`              | `timestamptz` | Default `now()`                   |
| `created_at`              | `timestamptz` | Auto-generated                    |

**RLS**: Service role write; authenticated users read own (via `redemption_id`
ownership check).

### Columns added to `redemptions`

| Column              | Type          | Notes                              |
| :------------------ | :------------ | :--------------------------------- |
| `provider`          | `text`        | `'reloadly'`, `'tremendous'`, etc. |
| `provider_order_id` | `text`        | External order ID                  |
| `failed_reason`     | `text`        | Reason if failed                   |
| `completed_at`      | `timestamptz` | When fulfillment completed         |
| `refunded_at`       | `timestamptz` | When points were refunded          |

**Realtime**: `redemptions` added to `supabase_realtime` publication.

---

## Feature Waitlist

**Migration**: `20260223000000_feature_waitlist`

Tracks user interest in upcoming features (e.g., 529 savings plans).

### `feature_waitlist`

| Column       | Type          | Notes                        |
| :----------- | :------------ | :--------------------------- |
| `id`         | `uuid` PK     | Auto-generated               |
| `user_id`    | `uuid` FK     | → `auth.users(id)`, NOT NULL |
| `feature`    | `text`        | Default `'529'`              |
| `email`      | `text`        | Optional contact email       |
| `created_at` | `timestamptz` | Auto-generated               |

**Constraints**: UNIQUE on `(user_id, feature)`.

**RLS**: Users can insert and read their own rows only.

---

## Redemptions RLS Policies

**Migration**: `20260223020000_redemptions_rls_policies`

Adds missing RLS policies to the `redemptions` table (previously blocking all
operations) and makes `item_id` nullable for API-based redemptions.

**Policies**:

- Users can INSERT own redemptions (`auth.uid() = user_id`)
- Users can SELECT own redemptions
- Users can UPDATE own redemptions

**Schema change**: `ALTER TABLE redemptions ALTER COLUMN item_id DROP NOT NULL`

---

## Push Notifications

### `push_subscriptions`

Stores push tokens for Web Push, APNs, and FCM to enable push notifications
across all platforms. Used to deliver notifications when orders, offers, or chat
messages are created.

**Migration**: `20260225000000_push_subscriptions.sql`

| Column       | Type          | Description                                        |
| :----------- | :------------ | :------------------------------------------------- |
| `id`         | `uuid`        | Primary Key.                                       |
| `user_id`    | `uuid`        | FK to `auth.users(id)` on delete cascade.          |
| `token`      | `text`        | The push subscription token or device identifier.  |
| `platform`   | `text`        | Enum-like: 'web', 'ios', 'android'.                |
| `endpoint`   | `text`        | Web Push endpoint URL (null for native platforms). |
| `created_at` | `timestamptz` | Default `now()`.                                   |
| `updated_at` | `timestamptz` | Default `now()`.                                   |

**Unique Constraints**: `(user_id, token)` **Indexes**:
`idx_push_subscriptions_user_id`

```sql
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  endpoint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);
```

**RLS Policies**:

| Policy                                     | Operation | Role            | Rule                                   |
| :----------------------------------------- | :-------- | :-------------- | :------------------------------------- |
| Users can read their own subscriptions     | `SELECT`  | `authenticated` | `using (auth.uid() = user_id)`         |
| Users can insert their own subscriptions   | `INSERT`  | `authenticated` | `with check (auth.uid() = user_id)`    |
| Users can update their own subscriptions   | `UPDATE`  | `authenticated` | `using (auth.uid() = user_id)`         |
| Users can delete their own subscriptions   | `DELETE`  | `authenticated` | `using (auth.uid() = user_id)`         |
| Service role can bypass for edge functions | `ALL`     | `service_role`  | `using (auth.role() = 'service_role')` |

### `notify_on_message` Trigger

A PostgreSQL trigger attached to the `chat_messages` table that automatically
sends an HTTP POST request via `pg_net` to the `notify-on-message` Supabase Edge
Function whenever a new message is inserted.

**Migration**: `20260225000001_notify_on_message_trigger.sql`

```sql
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS trigger AS $$
BEGIN
    -- Fire-and-forget HTTP call to the notify-on-message edge function
    PERFORM net.http_post(
        url := 'http://api.localhost:54321/functions/v1/notify-on-message',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer <service_role_key>'
        ),
        body := jsonb_build_object(
            'messageId', NEW.id,
            'conversationId', NEW.conversation_id,
            'senderId', NEW.sender_id,
            'messageType', NEW.type::text
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_new_message
    AFTER INSERT ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_message();
```

### `process-redemptions`

Cron-scheduled edge function that processes queued point redemptions.

**Endpoint**: `POST /functions/v1/process-redemptions`

**Logic**:

1. Fetches all redemptions where status is `'failed'` (for Tremendous/Reloadly)
   or `'pending'` (for GlobalGiving/PayPal) in FIFO order.
2. In parallel, checks Tremendous and Reloadly balance APIs.
3. Re-attempts processing the redemption against the requested provider
   (Reloadly, Tremendous, GlobalGiving, or PayPal).
4. Adjusts provider circuit breaker statuses (`provider_queue_status`) upon
   sustained success.

**Env vars**: `TREMENDOUS_API_KEY`, `RELOADLY_CLIENT_ID`,
`RELOADLY_CLIENT_SECRET`, `GLOBALGIVING_API_KEY`, `PAYPAL_CLIENT_ID`,
`PAYPAL_SECRET`, `CRON_SECRET`

**Source**:
[process-redemptions/index.ts](file:///Users/rkhona/development/casagrown3/supabase/functions/process-redemptions/index.ts)

### `redeem-paypal-payout`

Allows users to redeem points directly into their PayPal or Venmo accounts.

**Endpoint**: `POST /functions/v1/redeem-paypal-payout`

**Logic**:

1. Validates the requested points and user's current point balance.
2. Verifies the user's `paypal_payout_id` (email or phone number).
3. Verifies `provider_queue_status` for `paypal` is active or in a grace period.
4. Connects to PayPal Payouts API using client credentials.
5. Creates a `'pending'` redemption record, then attempts the Payout transfer.
6. On success: Updates redemption to `'completed'`, deducts points via
   `point_ledger`, and sends a Push Notification.
7. On failure: Queues the transaction by marking it `'failed'` so the
   `process-redemptions` cron job can retry it later.

**Source**:
[redeem-paypal-payout/index.ts](file:///Users/rkhona/development/casagrown3/supabase/functions/redeem-paypal-payout/index.ts)

### `register-push-token`

Stores a push notification token/subscription for the authenticated user.

**Endpoint**: `POST /functions/v1/register-push-token`

**Logic**: Upserts on `(user_id, token)` into the `push_subscriptions` table to
handle duplicates gracefully while updating the `updated_at` timestamp.

**Source**:
[register-push-token/index.ts](file:///Users/rkhona/development/casagrown3/supabase/functions/register-push-token/index.ts)

### `send-push-notification`

Internal edge function that unifies push deployments across Web Push, APNs
(iOS), and FCM (Android).

**Endpoint**: `POST /functions/v1/send-push-notification`

**Logic**:

1. Accepts internal requests (usually from `pg_net` or other edge functions
   using `service_role` keys).
2. Fetches all active `push_subscriptions` for the designated `userIds`.
3. Routes payloads appropriately via Web Push protocol (`webpush`), APNs
   (`jsonwebtoken` + fetch), or FCM.
4. Cleans up any expired subscriptions (HTTP 410) dynamically.

**Env vars**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `APNS_KEY_ID`,
`APNS_TEAM_ID`, `APNS_KEY`, `FCM_SERVER_KEY`

**Source**:
[send-push-notification/index.ts](file:///Users/rkhona/development/casagrown3/supabase/functions/send-push-notification/index.ts)

---

## Closed-Loop FIFO Points Buckets

**Migration**: `20260228004000_closed_loop_buckets`,
`20260228004500_fifo_rpc_updates`

Tracks purchased-point buckets to enforce FIFO consumption and enable precise
refunds back to the original payment method. Purchased points are segregated
from earned points to maintain closed-loop compliance.

### `purchased_points_buckets`

| Column                   | Type                      | Notes                                           |
| :----------------------- | :------------------------ | :---------------------------------------------- |
| `id`                     | `uuid` PK                 | Auto-generated                                  |
| `user_id`                | `uuid` FK → `profiles`    | ON DELETE CASCADE                               |
| `payment_transaction_id` | `uuid` FK                 | → `payment_transactions(id)`, ON DELETE CASCADE |
| `point_ledger_id`        | `uuid` FK                 | → `point_ledger(id)`, nullable                  |
| `original_amount`        | `integer`                 | Points originally purchased                     |
| `remaining_amount`       | `integer`                 | Points not yet consumed/refunded                |
| `status`                 | `purchased_bucket_status` | Default `'active'`                              |
| `metadata`               | `jsonb`                   | Default `'{}'`                                  |
| `created_at`             | `timestamptz`             | Auto-generated                                  |
| `updated_at`             | `timestamptz`             | Auto-generated                                  |

**Indexes**: `user_id`, `status`

**RLS**: Users can SELECT their own buckets.

### `point_bucket_consumptions`

Maps FIFO consumption of purchased buckets when platform transactions occur.

| Column            | Type          | Notes                                               |
| :---------------- | :------------ | :-------------------------------------------------- |
| `id`              | `uuid` PK     | Auto-generated                                      |
| `bucket_id`       | `uuid` FK     | → `purchased_points_buckets(id)`, ON DELETE CASCADE |
| `ledger_id`       | `uuid` FK     | → `point_ledger(id)`, ON DELETE CASCADE             |
| `amount_consumed` | `integer`     | Points consumed from this bucket                    |
| `created_at`      | `timestamptz` | Auto-generated                                      |

**Indexes**: `bucket_id`, `ledger_id`

**RLS**: Users can SELECT via bucket ownership.

### `manual_refund_checks`

Tracks manual refund requests requiring identity verification (for amounts above
small-balance thresholds).

| Column                           | Type                             | Notes                            |
| :------------------------------- | :------------------------------- | :------------------------------- |
| `id`                             | `uuid` PK                        | Auto-generated                   |
| `user_id`                        | `uuid` FK → `profiles`           | ON DELETE CASCADE                |
| `bucket_ids`                     | `uuid[]`                         | Array of bucket IDs              |
| `fulfillment_type`               | `manual_refund_fulfillment_type` | Check, e-gift card, or Venmo     |
| `stripe_verification_session_id` | `text`                           | Stripe Identity session          |
| `amount_cents`                   | `integer`                        | Final amount after fees          |
| `mailing_address`                | `jsonb`                          | For physical checks              |
| `target_email`                   | `text`                           | For e-gift cards                 |
| `status`                         | `manual_refund_status`           | Default `'pending_verification'` |
| `tracking_number`                | `text`                           | Check tracking                   |
| `fulfilled_at`                   | `timestamptz`                    | When fulfilled                   |
| `created_at`                     | `timestamptz`                    | Auto-generated                   |
| `updated_at`                     | `timestamptz`                    | Auto-generated                   |

**Indexes**: `user_id`, `status`

**RLS**: Users can SELECT their own rows.

### `small_balance_refund_thresholds`

Per-state thresholds below which alternative refund methods (Venmo, gift card)
are offered instead of card refunds.

| Column            | Type          | Notes                            |
| :---------------- | :------------ | :------------------------------- |
| `country_iso_3`   | `text` FK     | → `countries(iso_3)`             |
| `state_code`      | `text`        | State/province code              |
| `threshold_cents` | `integer`     | e.g., 1000 for $10 in California |
| `created_at`      | `timestamptz` | Auto-generated                   |
| `updated_at`      | `timestamptz` | Auto-generated                   |

**PK**: `(country_iso_3, state_code)`

**RLS**: Public read access.

### `consume_fifo_buckets` Trigger

**Migration**: `20260228004500_fifo_rpc_updates`

Fired `AFTER INSERT` on `point_ledger`. When a debit row with
`type IN ('payment', 'platform_charge')` is inserted, the trigger iterates
through the user's active purchased buckets in FIFO order (`created_at ASC`),
deducting from each bucket and logging `point_bucket_consumptions` rows.

### `get_user_balances` RPC

**Migration**: `20260228004500_fifo_rpc_updates`

**Signature**:
`get_user_balances(p_user_id uuid) → TABLE(total_balance, purchased_balance, earned_balance)`

**Logic**:

1. Sum all `point_ledger` amounts for total balance
2. Sum `remaining_amount` from active/partially-refunded buckets for purchased
   balance
3. Earned = total − purchased (bounded by 0)

---

## Country Refund Fees

**Migration**: `20260228070000_country_refund_fees`

### `country_refund_fees`

Fee matrix for calculating refund costs by country.

| Column                        | Type          | Notes                     |
| :---------------------------- | :------------ | :------------------------ |
| `country_iso_3`               | `text` PK     | Country code              |
| `stripe_identity_fee_cents`   | `integer`     | Identity verification fee |
| `transaction_fee_percent`     | `numeric`     | e.g., 2.9 for 2.9%        |
| `transaction_fee_fixed_cents` | `integer`     | e.g., 30 for $0.30        |
| `created_at`                  | `timestamptz` | Auto-generated            |
| `updated_at`                  | `timestamptz` | Auto-generated            |

**RLS**: Public read; admin write (via `staff_members` check).

**Seed data**: USA — 250¢ identity fee, 2.9% + 30¢ transaction fee.

---

## ACID Redemption & Refund RPCs

**Migrations**: `20260228213340`, `20260228220038`, `20260301000000`

These RPCs ensure atomicity for all external-provider operations. Edge functions
make a single RPC call after the provider API succeeds, guaranteeing that ledger
updates, delivery records, and queue status are never orphaned.

### `finalize_redemption` RPC

**Migration**: `20260228213340` (gift cards), `20260228220038` (universal),
`20260301000000` (donations + paypal)

**Signature**: `finalize_redemption(p_payload JSONB) → void`

**Payload keys**: `redemption_id`, `redemption_type`, `provider_name`,
`external_order_id`, `actual_cost_cents`, `card_code`, `card_url`,
`receipt_number`

**Logic** (branched by `redemption_type`):

| Type             | Actions                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `gift_card`      | Insert `gift_card_deliveries`, log `provider_transactions`, update ledger metadata with card code/URL |
| `donation`       | Insert `donation_receipts`, log `provider_transactions`, update ledger metadata                       |
| `paypal`/`venmo` | Log `provider_transactions`, update ledger metadata with batch ID                                     |

All types: mark `redemptions.status = 'completed'`, update
`point_ledger.metadata`.

> [!NOTE]
> `finalize_gift_card_redemption` was created in `20260228213340` and
> deprecated/dropped in `20260228230000` in favor of the universal
> `finalize_redemption`.

### `finalize_point_refund` RPC

**Migration**: `20260301000000_acid_donation_refund_fixes`

**Signature**:
`finalize_point_refund(p_user_id UUID, p_bucket_id UUID, p_amount_cents INT, p_reference_id UUID, p_metadata JSONB) → void`

**Logic**:

1. Lock bucket row (`FOR UPDATE`) to prevent concurrent refund races
2. Validate `p_amount_cents ≤ remaining_amount`
3. Insert `point_ledger` debit (type: `'refund'`, amount: `−p_amount_cents`)
4. Update bucket: `remaining_amount -= p_amount_cents`, status → `'refunded'` or
   `'partially_refunded'`

---

## Refund Purchased Points

### `refund-purchased-points` Edge Function

**Endpoint**: `POST /functions/v1/refund-purchased-points`

Handles refunds for purchased point buckets with three methods:

| Method        | Condition                | Flow                                                                                 |
| ------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| Card refund   | Default (non-expired)    | Stripe Refund API → `finalize_point_refund` RPC                                      |
| Venmo cashout | Fallback (small balance) | PayPal Payouts API → queue `redemptions` row → `finalize_point_refund` RPC           |
| E-Gift Card   | Fallback (small balance) | Queue `redemptions` row for `process-redemptions` cron → `finalize_point_refund` RPC |

**Input**:
`{ "bucketId", "method": "card" | "venmo" | "egift_card", "targetPhoneNumber?" }`

**Source**:
[refund-purchased-points/index.ts](file:///Users/rkhona/development/casagrown3/supabase/functions/refund-purchased-points/index.ts)

---

## Incentive Campaigns _(added by `20260301090000`)_

Campaign-driven point incentives targeted to specific H3 zones with configurable
behavior rewards. Claims are tracked directly in `point_ledger` (no separate
claims table).

### `incentive_campaigns`

| Column        | Type          | Description                                 |
| :------------ | :------------ | :------------------------------------------ |
| `id`          | `uuid`        | **Primary Key**.                            |
| `name`        | `text`        | Campaign name.                              |
| `description` | `text`        | Optional description.                       |
| `starts_at`   | `timestamptz` | When the campaign becomes active.           |
| `ends_at`     | `timestamptz` | When it expires. Must be after `starts_at`. |
| `is_active`   | `boolean`     | Manual on/off toggle. Default: `true`.      |
| `created_at`  | `timestamptz` | Default `now()`.                            |
| `updated_at`  | `timestamptz` | Default `now()`.                            |

**Indexes**: `idx_campaigns_active` (partial on `is_active = true`)

```sql
create table incentive_campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  is_active   boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  constraint chk_campaign_dates check (ends_at > starts_at)
);
```

### `campaign_zones`

Links campaigns to H3 zones they target.

| Column               | Type   | Description                                        |
| :------------------- | :----- | :------------------------------------------------- |
| `id`                 | `uuid` | **Primary Key**.                                   |
| `campaign_id`        | `uuid` | FK to `incentive_campaigns(id)` ON DELETE CASCADE. |
| `community_h3_index` | `text` | FK to `communities(h3_index)`.                     |

**Unique**: `(campaign_id, community_h3_index)` **Indexes**:
`idx_campaign_zones_h3`

```sql
create table campaign_zones (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references incentive_campaigns(id) on delete cascade,
  community_h3_index  text references communities(h3_index),
  unique(campaign_id, community_h3_index)
);
```

### `campaign_rewards`

Point reward amount per behavior per campaign.

| Column        | Type                | Description                                        |
| :------------ | :------------------ | :------------------------------------------------- |
| `id`          | `uuid`              | **Primary Key**.                                   |
| `campaign_id` | `uuid`              | FK to `incentive_campaigns(id)` ON DELETE CASCADE. |
| `behavior`    | `campaign_behavior` | Which user action earns points.                    |
| `points`      | `integer`           | Points awarded. Must be > 0.                       |

**Unique**: `(campaign_id, behavior)`

```sql
create table campaign_rewards (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references incentive_campaigns(id) on delete cascade,
  behavior    campaign_behavior not null,
  points      integer not null check (points > 0),
  unique(campaign_id, behavior)
);
```

### Claim Tracking via `point_ledger`

Campaign incentive claims are recorded as normal `point_ledger` rows with
`campaign_id` and `campaign_behavior` set. The partial unique index
`idx_ledger_campaign_dedup` prevents double-claiming:

- **One-time behaviors** (`signup`, `first_post`, etc.): one claim per
  `(campaign, user, behavior)`
- **`per_referral`**: one claim per `(campaign, user, behavior, reference_id)`
  where `reference_id` is the referee's user ID

---

## Sales Tax Rules _(added by `20260301090100`)_

State-level sales tax rules with category-level base rules and product-level
overrides. Two rule types: `fixed` (rate known, 0 = exempt) and `evaluate` (must
compute at runtime).

### `category_tax_rules`

Base tax rule per (state, category) combination.

| Column            | Type            | Description                                            |
| :---------------- | :-------------- | :----------------------------------------------------- |
| `id`              | `uuid`          | **Primary Key**.                                       |
| `state_code`      | `text`          | US state code (e.g., 'CA', 'TX').                      |
| `category_name`   | `text`          | FK to `sales_categories(name)` ON DELETE CASCADE.      |
| `rule_type`       | `tax_rule_type` | `'fixed'` (rate known) or `'evaluate'` (runtime calc). |
| `rate_pct`        | `numeric(5,3)`  | Tax rate %. 0 = exempt. Required when `fixed`.         |
| `notes`           | `text`          | Optional explanation.                                  |
| `effective_from`  | `date`          | When rule takes effect. Default: today.                |
| `effective_until` | `date`          | When rule expires. NULL = no expiry.                   |
| `created_at`      | `timestamptz`   | Default `now()`.                                       |
| `updated_at`      | `timestamptz`   | Default `now()`.                                       |

**Indexes**: `idx_category_tax_unique` (partial unique on active rules),
`idx_category_tax_state`

```sql
create table category_tax_rules (
  id              uuid primary key default gen_random_uuid(),
  state_code      text not null,
  category_name   text not null references sales_categories(name) on delete cascade,
  rule_type       tax_rule_type not null default 'evaluate',
  rate_pct        numeric(5,3) default 0 check (rate_pct >= 0 and rate_pct <= 100),
  notes           text,
  effective_from  date not null default current_date,
  effective_until date,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint chk_fixed_has_rate check (rule_type != 'fixed' or rate_pct is not null)
);

create unique index idx_category_tax_unique
  on category_tax_rules (state_code, category_name) where effective_until is null;
```

### `product_tax_overrides`

Product-level exceptions to category rules. Only recorded when a product differs
from its parent category rule.

| Column             | Type            | Description                                       |
| :----------------- | :-------------- | :------------------------------------------------ |
| `id`               | `uuid`          | **Primary Key**.                                  |
| `category_rule_id` | `uuid`          | FK to `category_tax_rules(id)` ON DELETE CASCADE. |
| `product_name`     | `text`          | Product name (case-insensitive matching).         |
| `rule_type`        | `tax_rule_type` | Override rule type.                               |
| `rate_pct`         | `numeric(5,3)`  | Override rate. 0 = exempt.                        |
| `notes`            | `text`          | Optional explanation.                             |
| `effective_from`   | `date`          | Default: today.                                   |
| `effective_until`  | `date`          | NULL = no expiry.                                 |
| `created_at`       | `timestamptz`   | Default `now()`.                                  |
| `updated_at`       | `timestamptz`   | Default `now()`.                                  |

**Indexes**: `idx_product_tax_override_unique` (partial unique, case-insensitive
via `LOWER(product_name)`)

```sql
create table product_tax_overrides (
  id                uuid primary key default gen_random_uuid(),
  category_rule_id  uuid not null references category_tax_rules(id) on delete cascade,
  product_name      text not null,
  rule_type         tax_rule_type not null,
  rate_pct          numeric(5,3) default 0 check (rate_pct >= 0 and rate_pct <= 100),
  notes             text,
  effective_from    date not null default current_date,
  effective_until   date,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  constraint chk_override_fixed_has_rate check (rule_type != 'fixed' or rate_pct is not null)
);

create unique index idx_product_tax_override_unique
  on product_tax_overrides (category_rule_id, lower(product_name))
  where effective_until is null;
```

### Tax Rule Query Pattern

```sql
-- Get applicable tax rule for a product (product override > category rule)
SELECT
  COALESCE(po.rule_type, cr.rule_type) AS rule_type,
  COALESCE(po.rate_pct, cr.rate_pct)   AS rate_pct
FROM category_tax_rules cr
LEFT JOIN product_tax_overrides po
  ON po.category_rule_id = cr.id
  AND LOWER(po.product_name) = LOWER('Tomatoes')
  AND (po.effective_until IS NULL OR po.effective_until > CURRENT_DATE)
  AND po.effective_from <= CURRENT_DATE
WHERE cr.state_code = 'CA'
  AND cr.category_name = 'vegetables'
  AND (cr.effective_until IS NULL OR cr.effective_until > CURRENT_DATE)
  AND cr.effective_from <= CURRENT_DATE;
```

### `zip_tax_cache`

Monthly cache of ZipTax API rates. Prevents redundant API calls.

| Column       | Type          | Description                                       |
| :----------- | :------------ | :------------------------------------------------ |
| `id`         | `uuid`        | Primary Key.                                      |
| `zip_code`   | `text`        | ZIP code.                                         |
| `state_code` | `text`        | 2-letter state code.                              |
| `rate_pct`   | `numeric`     | Combined sales tax rate (%).                      |
| `fetched_at` | `timestamptz` | When rate was fetched. Default `now()`.           |
| `expires_at` | `timestamptz` | Expiry time (monthly). Default `now() + 30 days`. |

**Unique**: `(zip_code, state_code)` WHERE `expires_at > now()`

```sql
-- 20260301100600_tax_rate_cache.sql
create table zip_tax_cache (
  id uuid primary key default gen_random_uuid(),
  zip_code text not null,
  state_code text not null,
  rate_pct numeric not null,
  fetched_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '30 days')
);

create unique index idx_zip_tax_active
  on zip_tax_cache (zip_code, state_code)
  where expires_at > now();
```

### CA Tax Rule Seed Data

Migration `20260301100900_seed_ca_tax_rules.sql` seeds California-specific tax
rules. Food items (fruits, vegetables, herbs) are exempt (fixed 0%), while
non-food categories (flowers, equipment, etc.) use the `evaluate` rule type for
dynamic ZipTax API lookup.

---

## Compliance & Regulatory Tables _(20260305000000)_

### `point_purchase_limits`

Per-country caps on point purchases to prevent abuse.

| Column                  | Type          | Description                                        |
| :---------------------- | :------------ | :------------------------------------------------- |
| `id`                    | `uuid`        | Primary Key.                                       |
| `country_iso_3`         | `text`        | Country code. Default: `'USA'`. Unique.            |
| `max_outstanding_cents` | `integer`     | Max outstanding balance in cents. Default: 200000. |
| `daily_limit_cents`     | `integer`     | Daily purchase cap in cents. Default: 50000.       |
| `created_at`            | `timestamptz` | Default `now()`.                                   |
| `updated_at`            | `timestamptz` | Default `now()`.                                   |

```sql
CREATE TABLE point_purchase_limits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso_3        TEXT NOT NULL DEFAULT 'USA',
  max_outstanding_cents INTEGER NOT NULL DEFAULT 200000,
  daily_limit_cents    INTEGER NOT NULL DEFAULT 50000,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_iso_3)
);
```

**RLS Policies**: Authenticated can read. Admins (via `staff_members`) can
manage.

### `state_redemption_method_blocks`

Blocks specific redemption methods in specific states (e.g., cashout blocked in
all 50 states + DC).

| Column          | Type                | Description                                    |
| :-------------- | :------------------ | :--------------------------------------------- |
| `id`            | `uuid`              | Primary Key.                                   |
| `country_iso_3` | `text`              | Country code. Default: `'USA'`.                |
| `state_code`    | `text`              | 2-letter state code.                           |
| `method`        | `redemption_method` | Redemption method being blocked.               |
| `reason`        | `text`              | Human-readable reason for the block. Nullable. |
| `created_at`    | `timestamptz`       | Default `now()`.                               |

**Unique**: `(country_iso_3, state_code, method)`

```sql
CREATE TABLE state_redemption_method_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso_3   TEXT NOT NULL DEFAULT 'USA',
  state_code      TEXT NOT NULL,
  method          redemption_method NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_iso_3, state_code, method)
);
```

**RLS Policies**: Authenticated can read. Admins (via `staff_members`) can
manage.

**Seed Data** (`20260305000100`): Cashout blocked in all 50 US states + DC.

### `digital_receipts`

Stores jsonb buyer/seller receipt data generated by `confirm_order_delivery`.

| Column           | Type          | Description                            |
| :--------------- | :------------ | :------------------------------------- |
| `id`             | `uuid`        | Primary Key.                           |
| `order_id`       | `uuid`        | FK to `orders(id)`. Not null.          |
| `buyer_receipt`  | `jsonb`       | Buyer-facing receipt data.             |
| `seller_receipt` | `jsonb`       | Seller-facing receipt (includes fees). |
| `created_at`     | `timestamptz` | Default `now()`.                       |

```sql
CREATE TABLE digital_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  buyer_receipt   JSONB NOT NULL,
  seller_receipt  JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_digital_receipts_order ON digital_receipts(order_id);
```

**RLS Policies**: Users can read receipts from their own orders (buyer or
seller).

**Receipt JSONB structure** (buyer):

```json
{
  "transaction_id": "uuid",
  "date": "timestamptz",
  "type": "Affiliated Network Fulfillment",
  "buyer_name": "text",
  "buyer_zip": "text",
  "seller_name": "text",
  "seller_zip": "text",
  "harvest_date": "date",
  "product": "text",
  "quantity": 1,
  "points_per_unit": 10,
  "subtotal": 10,
  "tax_amount": 0,
  "total": 10,
  "footer": "text or null"
}
```

### `receipt_footers`

State-specific legal footer text appended to digital receipts.

| Column          | Type          | Description                         |
| :-------------- | :------------ | :---------------------------------- |
| `id`            | `uuid`        | Primary Key.                        |
| `country_iso_3` | `text`        | Country code. Default: `'USA'`.     |
| `state_code`    | `text`        | 2-letter state code.                |
| `footer_text`   | `text`        | Legal footer text.                  |
| `font_size_pt`  | `integer`     | Font size in points. Default: `10`. |
| `created_at`    | `timestamptz` | Default `now()`.                    |

**Unique**: `(country_iso_3, state_code)`

```sql
CREATE TABLE receipt_footers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso_3   TEXT NOT NULL DEFAULT 'USA',
  state_code      TEXT NOT NULL,
  footer_text     TEXT NOT NULL,
  font_size_pt    INTEGER NOT NULL DEFAULT 10,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_iso_3, state_code)
);
```

**RLS Policies**: Authenticated can read. Admins (via `staff_members`) can
manage.

**Seed Data**: FL entry with cottage food disclaimer.

---

## Observability _(20260305000200)_

### `edge_function_errors`

Persistent error log for edge functions. Service-role only (no public access).
Rows should be cleaned up after 30 days.

| Column           | Type          | Description             |
| :--------------- | :------------ | :---------------------- |
| `id`             | `uuid`        | Primary Key.            |
| `created_at`     | `timestamptz` | Default `now()`.        |
| `function_name`  | `text`        | Edge function name.     |
| `error_message`  | `text`        | Error message.          |
| `error_stack`    | `text`        | Stack trace. Nullable.  |
| `request_method` | `text`        | HTTP method. Nullable.  |
| `request_path`   | `text`        | Request path. Nullable. |

```sql
CREATE TABLE edge_function_errors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  error_message text NOT NULL,
  error_stack   text,
  request_method text,
  request_path  text
);

CREATE INDEX idx_efe_fn_created
  ON edge_function_errors (function_name, created_at DESC);
```

**RLS**: Enabled, no public policies (service_role only).
