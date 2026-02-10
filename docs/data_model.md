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
  'purchase', 'transfer', 'payment', 'platform_charge', 'redemption', 'reward'
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
create type offer_status as enum ('pending', 'accepted', 'rejected');
create type order_status as enum ('accepted', 'disputed');
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

| Column                        | Type                    | Description                                                  |
| :---------------------------- | :---------------------- | :----------------------------------------------------------- |
| `id`                          | `uuid`                  | **Primary Key** (FK to `auth.users.id`).                     |
| `email`                       | `text`                  | Unique. Copied from auth.users on signup.                    |
| `full_name`                   | `text`                  | Display name.                                                |
| `avatar_url`                  | `text`                  | URL to avatar image.                                         |
| `phone_number`                | `text`                  | For SMS notifications.                                       |
| `country_code`                | `varchar(3)`            | ISO 3166-1 alpha-3 (e.g., 'USA'). Default: 'USA'.            |
| `zip_code`                    | `text`                  | Postal code.                                                 |
| `home_community_h3_index`     | `text`                  | FK to `communities(h3_index)`.                               |
| `home_location`               | `geometry(Point, 4326)` | Exact user location (optional).                              |
| `nearby_community_h3_indices` | `text[]`                | Array of adjacent H3 indices.                                |
| `notify_on_wanted`            | `boolean`               | Receive "wanted" notifications. Default: `true`.             |
| `notify_on_available`         | `boolean`               | Receive "available" notifications. Default: `true`.          |
| `push_enabled`                | `boolean`               | Push enabled. Default: `true`.                               |
| `sms_enabled`                 | `boolean`               | SMS enabled. Default: `false`.                               |
| `referral_code`               | `text`                  | Unique 8-char alphanumeric code. Auto-generated via trigger. |
| `invited_by_id`               | `uuid`                  | FK to `profiles(id)`. Who referred this user.                |
| `created_at`                  | `timestamptz`           | Default `now()`.                                             |
| `updated_at`                  | `timestamptz`           | Default `now()`.                                             |

**Triggers**: `trigger_set_referral_code` (auto-generates referral code),
`on_auth_user_created` (creates profile + awards signup points)

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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index profiles_home_location_idx on profiles using gist (home_location);
create index profiles_nearby_communities_idx on profiles using gin (nearby_community_h3_indices);
```

### `user_garden`

Tracks produce items a user grows.

| Column         | Type          | Description           |
| :------------- | :------------ | :-------------------- |
| `id`           | `uuid`        | Primary Key.          |
| `user_id`      | `uuid`        | FK to `profiles(id)`. |
| `produce_name` | `text`        | Name of the produce.  |
| `created_at`   | `timestamptz` | Default `now()`.      |
| `updated_at`   | `timestamptz` | Default `now()`.      |

```sql
create table user_garden (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  produce_name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

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

Tracks all point transactions — complete audit trail.

| Column          | Type                     | Description                                    |
| :-------------- | :----------------------- | :--------------------------------------------- |
| `id`            | `uuid`                   | Primary Key.                                   |
| `user_id`       | `uuid`                   | FK to `profiles(id)` on delete cascade.        |
| `type`          | `point_transaction_type` | Transaction type.                              |
| `amount`        | `integer`                | Points (positive = earned, negative = spent).  |
| `balance_after` | `integer`                | Balance after transaction.                     |
| `reference_id`  | `uuid`                   | Optional linked entity.                        |
| `metadata`      | `jsonb`                  | (e.g., `{"action_type": "join_a_community"}`). |
| `created_at`    | `timestamptz`            | Default `now()`.                               |

**Idempotency**: Reward grants check for existing entries with matching
`action_type` in metadata.

```sql
create table point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type point_transaction_type not null,
  amount integer not null,
  balance_after integer not null,
  reference_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
```

---

## Posts & Content

### `posts`

| Column               | Type          | Description                               |
| :------------------- | :------------ | :---------------------------------------- |
| `id`                 | `uuid`        | Primary Key.                              |
| `author_id`          | `uuid`        | FK to `profiles(id)`.                     |
| `community_h3_index` | `text`        | FK to `communities(h3_index)`.            |
| `type`               | `post_type`   | Post type.                                |
| `reach`              | `post_reach`  | Visibility scope. Default: `'community'`. |
| `content`            | `text`        | Post body.                                |
| `created_at`         | `timestamptz` | Default `now()`.                          |
| `updated_at`         | `timestamptz` | Default `now()`.                          |

**Indexes**: `posts_community_h3_idx`

```sql
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id),
  community_h3_index text references communities(h3_index),  -- 20260201200000
  type post_type not null,
  reach post_reach not null default 'community',
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index posts_community_h3_idx on posts(community_h3_index);
```

**RLS Policies** (`20260207060000_posts_content_rls`):

| Policy                                        | Operation | Rule                                                                        |
| :-------------------------------------------- | :-------- | :-------------------------------------------------------------------------- |
| Posts are readable by all authenticated users | `SELECT`  | `using (true)` — public reads, feed curation handled by application queries |
| Authors can create their own posts            | `INSERT`  | `with check (author_id = auth.uid())`                                       |
| Authors can update their own posts            | `UPDATE`  | `using (author_id = auth.uid())`                                            |
| Authors can delete their own posts            | `DELETE`  | `using (author_id = auth.uid())`                                            |

### `post_likes`

```sql
create table post_likes (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);
```

**RLS Policies** (`20260207060000_posts_content_rls`):

| Policy                           | Operation | Rule                                |
| :------------------------------- | :-------- | :---------------------------------- |
| Post likes are readable          | `SELECT`  | `using (true)`                      |
| Users can like posts             | `INSERT`  | `with check (user_id = auth.uid())` |
| Users can remove their own likes | `DELETE`  | `using (user_id = auth.uid())`      |

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

**RLS Policies** (`20260207060000_posts_content_rls`):

| Policy                              | Operation | Rule                                |
| :---------------------------------- | :-------- | :---------------------------------- |
| Post comments are readable          | `SELECT`  | `using (true)`                      |
| Users can create their own comments | `INSERT`  | `with check (user_id = auth.uid())` |
| Users can update their own comments | `UPDATE`  | `using (user_id = auth.uid())`      |
| Users can delete their own comments | `DELETE`  | `using (user_id = auth.uid())`      |

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

**RLS Policies** (`20260207060000_posts_content_rls`):

| Policy                           | Operation | Rule                                |
| :------------------------------- | :-------- | :---------------------------------- |
| Post flags are readable          | `SELECT`  | `using (true)`                      |
| Users can flag posts             | `INSERT`  | `with check (user_id = auth.uid())` |
| Users can remove their own flags | `DELETE`  | `using (user_id = auth.uid())`      |

### `post_media`

```sql
create table post_media (
  post_id uuid references posts(id) on delete cascade,
  media_id uuid references media_assets(id) on delete cascade,
  position integer default 0,
  primary key (post_id, media_id)
);
```

**RLS Policies** (`20260207060000_posts_content_rls`):

| Policy                        | Operation | Rule                                                                          |
| :---------------------------- | :-------- | :---------------------------------------------------------------------------- |
| Post media is readable        | `SELECT`  | `using (true)`                                                                |
| Post authors can attach media | `INSERT`  | `with check (post_id in (select id from posts where author_id = auth.uid()))` |
| Post authors can detach media | `DELETE`  | `using (post_id in (select id from posts where author_id = auth.uid()))`      |

### `want_to_sell_details`

| Column                     | Type              | Description                                      |
| :------------------------- | :---------------- | :----------------------------------------------- |
| `id`                       | `uuid`            | Primary Key.                                     |
| `post_id`                  | `uuid`            | FK to `posts(id)` on delete cascade.             |
| `category`                 | `sales_category`  | Sales category.                                  |
| `produce_name`             | `text`            | Name of the produce.                             |
| `unit`                     | `unit_of_measure` | Unit of measure.                                 |
| `total_quantity_available` | `numeric`         | Quantity available.                              |
| `price_per_unit`           | `numeric(10,2)`   | Price per unit.                                  |
| `delegator_id`             | `uuid`            | FK to `profiles(id)`. Optional delegator.        |
| `need_by_date`             | `date`            | Latest drop-off date. Added by `20260210060000`. |
| `created_at`               | `timestamptz`     | Default `now()`.                                 |
| `updated_at`               | `timestamptz`     | Default `now()`.                                 |

```sql
create table want_to_sell_details (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  category sales_category not null,
  produce_name text not null,
  unit unit_of_measure not null,
  total_quantity_available numeric not null,
  price_per_unit numeric(10,2) not null,
  delegator_id uuid references profiles(id),
  need_by_date date,                               -- 20260210060000
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### `delivery_dates`

```sql
create table delivery_dates (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  delivery_date date not null,
  created_at timestamptz default now()
);
```

### `want_to_buy_details`

```sql
create table want_to_buy_details (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  category sales_category not null,
  produce_names text[] not null,
  need_by_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### `sales_category_restrictions`

Controls which sales categories are allowed per geographic scope.

```sql
create table sales_category_restrictions (
  id uuid primary key default gen_random_uuid(),
  category sales_category not null,
  scope restriction_scope not null default 'global',
  country_iso_3 text references countries(iso_3),
  state_id uuid references states(id),
  city_id uuid references cities(id),
  zip_code text,
  community_h3_index text references communities(h3_index),  -- 20260201200000
  is_allowed boolean not null default false,
  created_at timestamptz default now(),
  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3),
  unique(category, scope, country_iso_3, state_id, city_id, zip_code, community_h3_index)
);
```

**RLS Policies** (`20260210030000_category_restrictions_rls`):

| Policy                                             | Operation | Rule           |
| :------------------------------------------------- | :-------- | :------------- |
| Authenticated users can read category restrictions | `SELECT`  | `using (true)` |

---

## Platform Configuration

### `platform_config`

Key-value store for platform settings (e.g., fee percentages). Introduced to
make operational parameters database-driven instead of hardcoded.

| Column        | Type          | Description                                           |
| :------------ | :------------ | :---------------------------------------------------- |
| `key`         | `text`        | **Primary Key**. Config key name.                     |
| `value`       | `text`        | Config value (stored as text, parsed by application). |
| `description` | `text`        | Human-readable description of the setting.            |
| `updated_at`  | `timestamptz` | Default `now()`.                                      |

**Known keys**:

| Key                    | Default | Description                                         |
| :--------------------- | :------ | :-------------------------------------------------- |
| `platform_fee_percent` | `10`    | Platform fee percentage charged on completed sales. |

```sql
create table platform_config (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz default now()
);
```

**RLS Policies** (`20260210040000_platform_config`):

| Policy                                       | Operation | Rule           |
| :------------------------------------------- | :-------- | :------------- |
| Authenticated users can read platform config | `SELECT`  | `using (true)` |

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

**RLS Policies** (`20260207070000_shared_tables_rls`):

| Policy                             | Operation | Rule                                 |
| :--------------------------------- | :-------- | :----------------------------------- |
| Media assets are publicly readable | `SELECT`  | `using (true)`                       |
| Owners can upload media            | `INSERT`  | `with check (owner_id = auth.uid())` |
| Owners can delete their media      | `DELETE`  | `using (owner_id = auth.uid())`      |

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
  check (content is not null or media_id is not null)
);
```

**RLS Policies** (`20260207070000_shared_tables_rls`): Access inherited from
conversation membership.

| Policy                                 | Operation | Rule                                             |
| :------------------------------------- | :-------- | :----------------------------------------------- |
| Conversation parties can read messages | `SELECT`  | `conversation_id` in user's conversations        |
| Conversation parties can send messages | `INSERT`  | `sender_id = auth.uid()` AND conversation member |
| No update/delete                       | —         | Messages are immutable (audit trail)             |

### `offers`

```sql
create table offers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  created_by uuid not null references profiles(id),
  quantity numeric not null,
  price_per_unit numeric(10,2) not null,
  status offer_status not null default 'pending',
  created_at timestamptz default now()
);
```

**RLS Policies** (`20260207070000_shared_tables_rls`): Access inherited from
conversation membership.

| Policy                                       | Operation | Rule                                              |
| :------------------------------------------- | :-------- | :------------------------------------------------ |
| Conversation parties can read offers         | `SELECT`  | `conversation_id` in user's conversations         |
| Conversation parties can create offers       | `INSERT`  | `created_by = auth.uid()` AND conversation member |
| Conversation parties can update offer status | `UPDATE`  | Conversation member                               |

### `orders`

```sql
create table orders (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers(id),
  buyer_id uuid not null,
  seller_id uuid not null,
  category sales_category not null,
  product text not null,
  quantity numeric not null,
  price_per_unit numeric(10,2) not null,
  delivery_date date,
  delivery_time time,
  delivery_instructions text,
  delivery_proof_media_id uuid references media_assets(id),
  conversation_id uuid not null references conversations(id),
  status order_status not null default 'accepted',
  buyer_rating rating_score,
  buyer_feedback text,
  seller_rating rating_score,
  seller_feedback text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

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

**RLS Policies** (`20260207070000_shared_tables_rls`): Private to recipient.

| Policy                                     | Operation | Rule                             |
| :----------------------------------------- | :-------- | :------------------------------- |
| Users can read their own notifications     | `SELECT`  | `using (user_id = auth.uid())`   |
| Users can mark their notifications as read | `UPDATE`  | `using (user_id = auth.uid())`   |
| No insert/delete by users                  | —         | Created by system (service role) |

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

  -- 2. Check for Active Signup Reward (Global Scope)
  select points into signup_reward_points
  from incentive_rules
  where action_type = 'signup'
    and scope = 'global'
    and (end_date is null or end_date > now())
  limit 1;

  -- 3. Award Points if Rule Exists
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
[resolve-community/index.ts](file:///Volumes/Seagate%20Portabl/development/casagrown3/supabase/functions/resolve-community/index.ts)

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
[assign-experiment/index.ts](file:///Volumes/Seagate%20Portabl/development/casagrown3/supabase/functions/assign-experiment/index.ts)

### `sync-locations`

Syncs country reference data from the REST Countries API into the `countries`
table.

**Endpoint**: `POST /functions/v1/sync-locations`

**Logic**: Fetches from `restcountries.com/v3.1/all`, maps to schema, upserts on
`iso_3`.

**Source**:
[sync-locations/index.ts](file:///Volumes/Seagate%20Portabl/development/casagrown3/supabase/functions/sync-locations/index.ts)

### `update-zip-codes`

Bulk imports US zip codes with state/city auto-population.

**Endpoint**: `POST /functions/v1/update-zip-codes`

**Logic**: Parses CSV zip code data, extracts unique states/cities, upserts them
in dependency order, then upserts zip codes with resolved `city_id` FKs.

**Source**:
[update-zip-codes/index.ts](file:///Volumes/Seagate%20Portabl/development/casagrown3/supabase/functions/update-zip-codes/index.ts)

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
[pair-delegation/index.ts](file:///Volumes/Seagate%20Portabl/development/casagrown3/supabase/functions/pair-delegation/index.ts)

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
[enrich-communities/index.ts](file:///Users/rkhona/development/casagrown3/supabase/functions/enrich-communities/index.ts)

> [!IMPORTANT]
> Edge functions require `supabase functions serve` to be running locally.
> Without it, requests return **503 Service Temporarily Unavailable**.
