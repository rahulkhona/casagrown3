# Data Model

This document defines the schema for the application.

## Tables

### `zip_codes`

Reference table for all US Zip Codes. Updated monthly via automated fetch from SimpleMaps/USPS.

| Column | Type | Description |
| :--- | :--- | :--- |
| `zip_code` | `text` | Primary Key (part 1). |
| `country_iso_3` | `text` | Primary Key (part 2). e.g., 'USA'. |
| `city` | `text` | Primary City. |
| `state` | `text` | State/Region code. |
| `county` | `text` | County name (if applicable). |
| `latitude` | `numeric` | Latitude for geo-spatial queries. |
| `longitude` | `numeric` | Longitude for geo-spatial queries. |

### `countries`

Reference for supported countries.

| Column | Type | Description |
| :--- | :--- | :--- |
| `iso_3` | `text` | Primary Key (ISO 3166-1 alpha-3). |
| `name` | `text` | Country name. |
| `currency_symbol` | `text` | e.g., '$', '€'. |
| `phone_code` | `text` | e.g., '+1'. |

### `states`

Administrative regions within a country.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `country_iso_3` | `text` | Reference to `countries.iso_3`. |
| `code` | `text` | ISO 3166-2 code (e.g., 'CA', 'NY'). |
| `name` | `text` | Full state name. |

### `cities`

Cities belonging to a state.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `state_id` | `uuid` | Reference to `states.id`. |
| `name` | `text` | City name. |

### `communities`

The `communities` table stores information about different local areas, identified by their Zip Code and local High School.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key, default `gen_random_uuid()` |
| `zip_code` | `text` | The 5-digit Zip Code. |
| `community_name` | `text` | The name of the Community (e.g., High School or Local Center). |
| `country_iso_3` | `text` | Reference to `countries.iso_3`. |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Default `now()` |

**Unique Constraint**: `unique(zip_code, community_name, country_iso_3)`
**Foreign Key**: `(zip_code, country_iso_3)` references `zip_codes(zip_code, country_iso_3)`

### `incentive_rules`

Defines point values for specific actions in specific locations.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `action_type` | `incentive_action` | Action type (Enum). |
| `points` | `integer` | Points awarded for this action. |
| `scope` | `incentive_scope` | 'global', 'country', 'state', 'city', 'zip', 'community'. |
| `country_iso_3` | `text` | Required for scopes >= 'country'. |
| `state_id` | `uuid` | Required for scopes >= 'state'. |
| `city_id` | `uuid` | Required for scopes >= 'city'. |
| `zip_code` | `text` | Required for scopes >= 'zip'. |
| `community_id` | `uuid` | Required for scopes == 'community'. |
| `start_date` | `timestamptz` | Rule active from. |
| `end_date` | `timestamptz` | Rule active until. |
| `created_at` | `timestamptz` | |

### `profiles`

Extended user profile information linked to Supabase Auth.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key (references `auth.users.id`). |
| `email` | `text` | User's email address (unique). |
| `full_name` | `text` | User's display name. |
| `avatar_url` | `text` | URL to profile photo. |
| `community_id` | `uuid` | Reference to the user's primary community. |
| `phone_number` | `text` | User's phone number for SMS. |
| `notify_on_wanted` | `boolean` | Notify when someone searches for items they grow. |
| `notify_on_available` | `boolean` | Notify when produce they want becomes available. |
| `push_enabled` | `boolean` | Enable push notifications. |
| `sms_enabled` | `boolean` | Enable SMS notifications. |
| `referral_code` | `text` | Unique coupon code for inviting others. |
| `invited_by_id` | `uuid` | Reference to `profiles.id` (who invited this user). |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### `user_garden`

List of produce items a user is currently growing.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `user_id` | `uuid` | Reference to `profiles.id`. |
| `produce_name` | `text` | Name of the produce (e.g., 'Tomatoes', 'Lemons'). |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### `media_assets`

Tracks uploaded videos and images.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `owner_id` | `uuid` | Reference to `profiles.id`. |
| `storage_path` | `text` | Key in Supabase Storage. |
| `media_type` | `media_asset_type` | 'video' or 'image' (Enum). |
| `mime_type` | `text` | e.g., 'video/mp4'. |
| `metadata` | `jsonb` | Width, height, duration, etc. |
| `created_at` | `timestamptz` | |

### `delegations`

Allows users to delegate their sales process to others.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `delegator_id` | `uuid` | Reference to `profiles.id` (User delegating). |
| `delegatee_id` | `uuid` | Reference to `profiles.id` (User receiving delegation). |
| `status` | `delegation_status` | Current state of delegation (Enum). |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### `posts`

Central feed for community content.

> [!NOTE]
> **Enforcement**: This is enforced via Row Level Security (RLS). See the [Security and Enforcement](#security-and-enforcement) section for details.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `author_id` | `uuid` | Reference to `profiles.id`. |
| `community_id` | `uuid` | Reference to `communities.id` (Target community). |
| `type` | `post_type` | Category (sell, buy, advice, etc.). |
| `reach` | `post_reach` | 'community' (local) or 'global' (Enum). |
| `content` | `text` | The message/body of the post. |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### `post_likes`

Tracks "likes" on posts with user and timestamp information.

| Column | Type | Description |
| :--- | :--- | :--- |
| `post_id` | `uuid` | Reference to `posts.id`. |
| `user_id` | `uuid` | Reference to `profiles.id`. |
| `created_at` | `timestamptz` | Time of the like. |

### `post_comments`

Threaded or simple comments on community posts.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `post_id` | `uuid` | Reference to `posts.id`. |
| `user_id` | `uuid` | Reference to `profiles.id`. |
| `content` | `text` | Comment text. |
| `created_at` | `timestamptz` | |

### `post_flags`

Enables reporting of inappropriate content.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `post_id` | `uuid` | Reference to `posts.id`. |
| `user_id` | `uuid` | Who flagged it (from `profiles.id`). |
| `reason` | `text` | Optional reason for flagging. |
| `created_at` | `timestamptz` | |

### `post_media`

Junction table linking posts to media assets (photos/videos).

| Column | Type | Description |
| :--- | :--- | :--- |
| `post_id` | `uuid` | Reference to `posts.id`. |
| `media_id` | `uuid` | Reference to `media_assets.id`. |
| `position` | `integer` | Display order for carousels. |

### `want_to_sell_details`

Extended information for posts of type `want_to_sell`.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `post_id` | `uuid` | Reference to `posts.id`. |
| `category` | `sales_category` | Category of the produce. |
| `produce_name` | `text` | Name of the produce. |
| `unit` | `unit_of_measure` | piece, dozen, box, bag. |
| `total_quantity_available` | `numeric` | Total availability. |
| `price_per_unit` | `numeric` | Cost per specified unit. |
| `delegator_id` | `uuid` | (Optional) Profile ID of the actual owner. |

### `delivery_dates`

Available dates for product delivery associated with a sales post.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `post_id` | `uuid` | Reference to `posts.id`. |
| `delivery_date` | `date` | Date when delivery is available. |

### `want_to_buy_details`

Extended information for posts of type `want_to_buy`.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `post_id` | `uuid` | Reference to `posts.id`. |
| `category` | `sales_category` | Category of the produce items. |
| `produce_names` | `text[]` | List of items being searched for. |
| `need_by_date` | `date` | Deadline for obtaining these items. |

### `offers`

Negotiations/offers made on a post. An offer is created implicitly when a buyer initiates contact with a seller via a post.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `conversation_id` | `uuid` | References `conversations.id`. |
| `post_id` | `uuid` | Contextual post. |
| `buyer_id` | `uuid` | Who is buying. |
| `seller_id` | `uuid` | Who is selling. |
| `quantity` | `numeric` | Proposed quantity. |
| `price_per_unit` | `numeric` | Proposed price. |
| `status` | `offer_status` | pending, accepted, rejected. |

> [!NOTE]
> Creating an offer automatically initializes a `conversation` if one doesn't exist, and injects a system message into the chat.

**Consistency Check**: Unique constraint on `(id, buyer_id, seller_id)` to allow composite foreign keys from `orders`.

### `orders`

Finalized agreements and delivery tracking. Denormalized `buyer_id` and `seller_id` for performance (indexing/RLS) but enforced via foreign key.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `offer_id` | `uuid` | Reference to the accepted `offers.id`. |
| `buyer_id` | `uuid` | Enforced match with `offers.buyer_id`. |
| `seller_id` | `uuid` | Enforced match with `offers.seller_id`. |
| `category` | `sales_category` | |
| `product` | `text` | Name of produce. |
| `quantity` | `numeric` | Final quantity. |
| `price_per_unit` | `numeric` | Final price. |
| `delivery_date` | `date` | |
| `delivery_time` | `time` | |
| `delivery_instructions` | `text` | |
| `delivery_proof_media_id` | `uuid` | Reference to photo in `media_assets`. Geo-location stored in media metadata. |
| `conversation_id` | `uuid` | References `conversations.id` (context for the order). |
| `status` | `order_status` | accepted, disputed. |
| `buyer_rating` | `rating_score` | 1-5 rating of the seller. |
| `buyer_feedback` | `text` | Optional comment from the buyer. |
| `seller_rating` | `rating_score` | 1-5 rating of the buyer. |
| `seller_feedback` | `text` | Optional comment from the seller. |

### `escalations`

Tracking of disputes regarding an order. A dispute can be resolved by accepting a refund or by the buyer resolving it without a refund.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `order_id` | `uuid` | References `orders.id`. |
| `initiator_id` | `uuid` | Usually the buyer. |
| `reason` | `text` | Buyer's description of the issue. |
| `dispute_proof_media_id` | `uuid` | Reference to photo/video in `media_assets`. |
| `status` | `escalation_status` | `open`, `resolved`. |
| `resolution_type` | `escalation_resolution` | `refund_accepted`, `resolved_without_refund`, `dismissed`. |
| `accepted_refund_offer_id` | `uuid` | References `refund_offers.id` (if any). |
| `conversation_id` | `uuid` | References `conversations.id` (context for the dispute). |
| `resolved_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |

### `refund_offers`

Proposed refunds from a seller to a buyer to resolve a dispute.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `escalation_id` | `uuid` | References `escalations.id`. |
| `amount` | `numeric` | Proposed refund amount. |
| `message` | `text` | Seller's comments. |
| `status` | `refund_offer_status` | `pending`, `accepted`, `rejected`. |
| `created_at` | `timestamptz` | |

## Communication

### `conversations`

Groups messages between a buyer and seller regarding a specific post.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `post_id` | `uuid` | References `posts.id`. |
| `buyer_id` | `uuid` | Initializer of the conversation. |
| `seller_id` | `uuid` | Owner of the post. |
| `created_at` | `timestamptz` | |

### `chat_messages`

Individual messages in a conversation. Supports text and media (photo/video).

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `conversation_id` | `uuid` | References `conversations.id`. |
| `sender_id` | `uuid` | `profiles.id`. |
| `content` | `text` | Text content of the message. |
| `media_id` | `uuid` | References `media_assets.id` (photo or video). |
| `type` | `chat_message_type` | `text`, `media`, `mixed`, `system`. |
| `metadata` | `jsonb` | Entity links (e.g., `{ "offer_id": "...", "order_id": "...", "escalation_id": "..." }`). |
| `created_at` | `timestamptz` | Used for chronological ordering. |

### `notifications`

System-generated alerts for users.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `user_id` | `uuid` | Target user (`profiles.id`). |
| `content` | `text` | The message body/blob. |
| `link_url` | `text` | Optional deep-link or external URL. |
| `read_at` | `timestamptz` | Null if unread. |
| `created_at` | `timestamptz` | Timestamp for the alert. |

## Economy

### `point_ledger`

Central ledger for all user point transactions. Provides an immutable audit trail of point movement.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `user_id` | `uuid` | Reference to `profiles.id`. |
| `type` | `point_transaction_type` | purchase, transfer, payment, charge, redemption, reward. |
| `amount` | `integer` | Number of points (positive for gain, negative for loss). |
| `balance_after` | `integer` | Running balance for easier auditing/debugging. |
| `reference_id` | `uuid` | Optional link to `orders.id`, `profiles.id` (for transfer), etc. |
| `metadata` | `jsonb` | Additional context (e.g., reason). |
| `created_at` | `timestamptz` | Timestamp of the transaction. |

### `redemption_merchandize`

Catalog of items available for point redemption.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `name` | `text` | Item name. |
| `description` | `text` | |
| `point_cost` | `integer` | Points required. |
| `type` | `redemption_item_type` | gift_card, merchandize, donation. |
| `reach_type` | `redemption_reach_type` | global, restricted. |
| `is_active` | `boolean` | Default `true`. |
| `created_at` | `timestamptz` | |

### `redemption_merchandize_media`

Links redemption items to multiple photos/videos. Supports 1 or more photos.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `merchandize_id` | `uuid` | Reference to `redemption_merchandize.id`. |
| `media_id` | `uuid` | Reference to `media_assets.id`. |
| `display_order` | `integer` | Sorting order for photos. |

### `redemption_merchandize_restrictions`

Defines where specific redemption items are allowed or banned.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `merchandize_id` | `uuid` | Reference to `redemption_merchandize.id`. |
| `scope` | `restriction_scope` | 'global', 'country', 'state', 'city', 'zip', 'community'. |
| `country_iso_3` | `text` | Required for scopes >= 'country'. |
| `state_id` | `uuid` | Required for scopes >= 'state'. |
| `city_id` | `uuid` | Required for scopes >= 'city'. |
| `zip_code` | `text` | Required for scopes >= 'zip'. |
| `community_id` | `uuid` | Required for scopes == 'community'. |
| `is_allowed` | `boolean` | Default `true`. |

### `redemptions`

User redemption transactions.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `user_id` | `uuid` | Reference to `profiles.id`. |
| `item_id` | `uuid` | Reference to `redemption_merchandize.id`. |
| `point_cost` | `integer` | Captured cost at time of redemption. |
| `status` | `redemption_status` | pending, completed, failed. |
| `metadata` | `jsonb` | Tracking info (e.g., shipping addr, gift card code). |
| `created_at` | `timestamptz` | |

### `sales_category_restrictions`
 
 Defines where specific sales categories are allowed or banned.
 
 | Column | Type | Description |
 | :--- | :--- | :--- |
 | `id` | `uuid` | Primary Key. |
 | `category` | `sales_category` | Category to restrict. |
 | `scope` | `restriction_scope` | 'global', 'country', 'state', 'city', 'zip', 'community'. |
 | `country_iso_3` | `text` | Required for scopes >= 'country'. |
 | `state_id` | `uuid` | Required for scopes >= 'state'. |
 | `city_id` | `uuid` | Required for scopes >= 'city'. |
 | `zip_code` | `text` | Required for scopes >= 'zip'. |
 | `community_id` | `uuid` | Required for scopes == 'community'. References `communities.id`. |
| `is_allowed` | `boolean` | Default `false`. |

### `experiments`

Definition of A/B tests.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `name` | `text` | Internal name (e.g. "New Onboarding Flow"). |
| `status` | `experiment_status` | Status lifecycle. |
| `rollout_percentage` | `integer` | 0-100 traffic allocation. |
| `target_criteria` | `jsonb` | Logic for eligibility. |

### `experiment_variants`

The buckets for each experiment (e.g. A vs B).

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `experiment_id` | `uuid` | FK `experiments`. |
| `name` | `text` | 'Control', 'Variant A'. |
| `weight` | `integer` | Traffic distribution weight. |
| `config` | `jsonb` | Remote configuration payload. |

### `experiment_assignments`

**Persistent** recording of which user is in which variant.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `user_id` | `uuid` | The user. |
| `experiment_id` | `uuid` | The experiment. |
| `variant_id` | `uuid` | The assigned bucket. |
| `unique_constraint` | - | `(experiment_id, user_id)` ensures stickiness. |

---

#### `incentive_action` enum values

- `signup`
- `complete_basic_profile`
- `join_a_community`
- `make_first_post`
- `invite_people_to_community`
- `invitee_signing_up`
- `invitee_making_first_transaction`
- `making_first_transaction`

#### `post_type` enum values

- `want_to_sell`
- `want_to_buy`
- `offering_service`
- `need_service`
- `seeking_advice`
- `general_info`

#### `post_reach` enum values

- `community`: Visible only within the user's community.
- `global`: Visible to the entire platform.

#### `delegation_status` enum values

- `pending`: Waiting for delegatee to accept.
- `accepted`: Delegation active and authorized for posting.
- `rejected`: Delegatee declined.
- `revoked`: Agreement ended; no longer authorized for posting.

#### `media_asset_type` enum values

- `video`
- `image`

#### `sales_category` enum values

- `fruits`
- `vegetables`
- `herbs`
- `flowers`
- `flower_arrangements`
- `garden_equipment`
- `pots`
- `soil`

#### `unit_of_measure` enum values

- `piece`
- `dozen`
- `box`
- `bag`

#### `offer_status` enum values

- `pending`: Active negotiation.
- `accepted`: Basis for an order.
- `rejected`: Declined by either party.

#### `order_status` enum values

- `accepted`: Agreement reached, delivery pending.
- `disputed`: Issues reported by buyer or seller.

#### `point_transaction_type` enum values

- `purchase`: Points bought with currency.
- `transfer`: Points sent between users.
- `payment`: Points used to pay for produce/orders.
- `platform_charge`: Fees or adjustments by the platform.
- `redemption`: Points exchanged for external rewards.
- `reward`: Points earned through community actions (incentives).

#### `redemption_item_type` enum values

- `gift_card`
- `merchandize`
- `donation`

#### `redemption_reach_type` enum values

- `global`: Available to everyone.
- `restricted`: Available only in specific geographic areas defined in restrictions table.

#### `redemption_status` enum values

- `pending`: Awaiting fulfillment.
- `completed`: Item sent or donation confirmed.
- `failed`: Transaction reversed.

#### `escalation_status` enum values

- `open`: Dispute active.
- `resolved`: Agreement reached or closed.

#### `escalation_resolution` enum values

- `refund_accepted`: Resolved by accepting a seller's refund offer.
- `resolved_without_refund`: Buyer closed the dispute without requiring a refund.
- `dismissed`: Invalid or fraudulent report.

- `rejected`: Declined by the buyer.

#### `chat_message_type` enum values

- `text`: Pure text message.
- `media`: Message containing a photo or video.
- `mixed`: Message containing both text and media.
- `system`: System-generated notification.

---

## Security and Enforcement

### Community Posting Rules

To ensure platform integrity and local relevance, `posts` are restricted using Supabase Row Level Security (RLS). **Validation is performed at the point of entry (INSERT)**. Once a post is created, it remains anchored to that `community_id` regardless of whether the author's primary community changes later.

A user (`auth.uid()`) can only insert a post into a `community_id` if at the time of posting:

1. **Direct Member**: Their *current* `profiles.community_id` matches the `posts.community_id`.
2. **Authorized Delegate**:
    - An `accepted` (and non-`revoked`) delegation exists in the `delegations` table.
    - The `posts.community_id` matches the *current* primary community of the `delegator_id`.

### Delegated Sales Validation

For `want_to_sell_details` marked with a `delegator_id`, the database enforces:

- **Delegation Check**: The `delegator_id` must have an `accepted` delegation record pointing to the `posts.author_id`.
- **Ownership**: If no `delegator_id` is provided, the `author_id` is assumed to be the owner of the produce.

### RLS Policies (Conceptual)

Below is the logic for the RLS policies that enforce these rules.

#### Escalations Table (UPDATE)

A dispute can be closed by the person who started it (the buyer/initiator).

```sql
-- Allow the initiator to resolve their own dispute
(initiator_id = auth.uid())
AND
(status = 'open')
AND
(
  -- Setting to resolved without refund
  (new.status = 'resolved' AND new.resolution_type = 'resolved_without_refund')
  OR
  -- Setting to resolved by accepting an offer (logic would normally be in a function/trigger)
  (new.status = 'resolved' AND new.resolution_type = 'refund_accepted' AND new.accepted_refund_offer_id IS NOT NULL)
)
```

#### Posts Table (INSERT)

A user can insert a post if they satisfy one of these conditions:

```sql
-- Is the user posting to their own primary community?
exists (
  select 1 from profiles
  where profiles.id = auth.uid()
  and profiles.community_id = posts.community_id
)
OR
-- Is the user posting as a delegate for someone in the target community?
exists (
  select 1 from delegations
  join profiles on delegations.delegator_id = profiles.id
  where delegations.delegatee_id = auth.uid()
  and delegations.status = 'accepted' -- Implies not revoked/pending/rejected
  and profiles.community_id = posts.community_id
)
```

#### Want to Sell Details (INSERT)

Prevents users from falsely claiming to be a delegate.

```sql
-- If delegator_id is provided, check for a valid delegation contract
(delegator_id is null) -- Self-posting is allowed
OR
exists (
  select 1 from delegations
  where delegations.delegator_id = want_to_sell_details.delegator_id
  and delegations.delegatee_id = auth.uid()
  and delegations.status = 'accepted'
)
```

---

## Scraped Data (Sample - 95120)

| School Name | City | State | Zip Code | Country (ISO3) |
| :--- | :--- | :--- | :--- | :--- |
| Leland High | San Jose | CA | 95120 | USA |

## Schema Implementation Details

The `communities` table will be created with the following SQL:

```sql
create table communities (
  id uuid primary key default gen_random_uuid(),
  zip_code text not null,
  community_name text not null,
  country_iso_3 text not null default 'USA',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(zip_code, community_name, country_iso_3),
  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3)
);

create table countries (
  iso_3 text primary key, -- 'USA', 'CAN'
  name text not null,
  currency_symbol text, -- '$', '€'
  phone_code text, -- '+1'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table states (
  id uuid primary key default gen_random_uuid(),
  country_iso_3 text not null references countries(iso_3),
  code text not null, -- 'CA', 'NY', 'BC'
  name text not null, -- 'California'
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(country_iso_3, code)
);

create table cities (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references states(id),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(state_id, name)
);

create table zip_codes (
  zip_code text not null,
  country_iso_3 text not null references countries(iso_3),
  city_id uuid not null references cities(id), -- Hierarchical link
  latitude numeric,
  longitude numeric,
  primary key (zip_code, country_iso_3)
);

create type incentive_action as enum (
  'signup',
  'complete_basic_profile',
  'join_a_community',
  'make_first_post',
  'invite_people_to_community',
  'invitee_signing_up',
  'invitee_making_first_transaction',
  'making_first_transaction'
);

create type incentive_scope as enum ('global', 'country', 'state', 'city', 'zip', 'community');

create table incentive_rules (
  id uuid primary key default gen_random_uuid(),
  action_type incentive_action not null,
  scope incentive_scope not null default 'global',
  points integer not null default 0,
  
  -- Hierarchical Scopes
  country_iso_3 text references countries(iso_3),
  state_id uuid references states(id),
  city_id uuid references cities(id),
  zip_code text, -- Composite FK
  community_id uuid references communities(id),

  start_date timestamptz not null default now(),
  end_date timestamptz,
  created_at timestamptz default now(),

  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3),

  -- Prevent duplicate active rules for same scope/target
  unique(action_type, scope, country_iso_3, state_id, city_id, zip_code, community_id, start_date)
);

create table profiles (
  id uuid primary key references auth.users(id),
  email text unique not null,
  full_name text,
  avatar_url text,
  community_id uuid references communities(id),
  phone_number text,
  notify_on_wanted boolean not null default true,
  notify_on_available boolean not null default true,
  push_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  referral_code text unique,
  invited_by_id uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table user_garden (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  produce_name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create type media_asset_type as enum ('video', 'image');

create type delegation_status as enum ('pending', 'accepted', 'rejected', 'revoked');

create type post_type as enum (
  'want_to_sell',
  'want_to_buy',
  'offering_service',
  'need_service',
  'seeking_advice',
  'general_info'
);

create type post_reach as enum ('community', 'global');

create type unit_of_measure as enum ('piece', 'dozen', 'box', 'bag');

create type sales_category as enum (
  'fruits',
  'vegetables',
  'herbs',
  'flowers',
  'flower_arrangements',
  'garden_equipment',
  'pots',
  'soil'
);

create type restriction_scope as enum ('global', 'country', 'state', 'city', 'zip', 'community');

create table sales_category_restrictions (
  id uuid primary key default gen_random_uuid(),
  category sales_category not null,
  scope restriction_scope not null default 'global',
  
  -- Hierarchical Scopes
  country_iso_3 text references countries(iso_3),
  state_id uuid references states(id),
  city_id uuid references cities(id),
  zip_code text, -- Composite FK
  community_id uuid references communities(id),

  is_allowed boolean not null default false,
  created_at timestamptz default now(),

  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3),

  unique(category, scope, country_iso_3, state_id, city_id, zip_code, community_id)
);

  created_at timestamptz default now()
);

-- EXPERIMENTATION SYSTEM
-- First-class support for A/B testing with persistent assignments.

create type experiment_status as enum ('draft', 'running', 'completed', 'rolled_out', 'rejected');

create table experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status experiment_status not null default 'draft',
  rollout_percentage integer default 0 check (rollout_percentage between 0 and 100),
  target_criteria jsonb default '{}', -- e.g. {"country": "USA", "platform": "ios"}
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  name text not null, -- e.g. 'control', 'variant_a'
  weight integer not null default 50, -- Probability weight
  is_control boolean default false,
  config jsonb default '{}', -- Client payload (feature flags, UI props)
  created_at timestamptz default now()
);

create table experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  variant_id uuid not null references experiment_variants(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  device_id text, -- Optional: For unauthenticated assignments
  assigned_at timestamptz default now(),
  unique(experiment_id, user_id) -- ENFORCES PERSISTENCE: One variant per user per experiment
);

create table experiment_events (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id),
  variant_id uuid not null references experiment_variants(id),
  user_id uuid references profiles(id),
  event_name text not null, -- e.g. 'click_signup', 'purchase'
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  storage_path text not null,
  media_type media_asset_type not null,
  mime_type text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);


create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id),
  community_id uuid references communities(id),
  type post_type not null,
  reach post_reach not null default 'community',
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table post_likes (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

create table post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id),
  content text not null,
  created_at timestamptz default now()
);

create table post_flags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id),
  reason text,
  created_at timestamptz default now()
);

create table post_media (
  post_id uuid references posts(id) on delete cascade,
  media_id uuid references media_assets(id) on delete cascade,
  position integer default 0,
  primary key (post_id, media_id)
);

create table want_to_sell_details (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  category sales_category not null,
  produce_name text not null,
  unit unit_of_measure not null,
  total_quantity_available numeric not null,
  price_per_unit numeric(10,2) not null,
  delegator_id uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table delivery_dates (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  delivery_date date not null,
  created_at timestamptz default now()
);

create table want_to_buy_details (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  category sales_category not null,
  produce_names text[] not null,
  need_by_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create type offer_status as enum ('pending', 'accepted', 'rejected');

create table offers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  created_by uuid not null references profiles(id), -- Who made the offer
  quantity numeric not null,
  price_per_unit numeric(10,2) not null,
  status offer_status not null default 'pending',
  created_at timestamptz default now()
);

create type order_status as enum ('accepted', 'disputed');

create type rating_score as enum ('1', '2', '3', '4', '5');
create type chat_message_type as enum ('text', 'media', 'mixed', 'system');

create table conversations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  created_at timestamptz default now(),
  unique(post_id, buyer_id, seller_id)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid references profiles(id),
  content text,
  media_id uuid references media_assets(id),
  type chat_message_type not null default 'text',
  metadata jsonb default '{}', -- Stores JSON pointers to offers, orders, etc.
  created_at timestamptz default now(),
  -- Ensure either content or media is present
  check (content is not null or media_id is not null)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null,
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
  updated_at timestamptz default now(),
  foreign key (offer_id) references offers (id)
);

create type escalation_status as enum ('open', 'resolved');
create type escalation_resolution as enum ('refund_accepted', 'resolved_without_refund', 'dismissed');
create type refund_offer_status as enum ('pending', 'accepted', 'rejected');

create table escalations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  initiator_id uuid not null references profiles(id),
  reason text not null,
  dispute_proof_media_id uuid references media_assets(id),
  status escalation_status not null default 'open',
  resolution_type escalation_resolution,
  accepted_refund_offer_id uuid, -- Linked after acceptance
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table refund_offers (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references escalations(id) on delete cascade,
  amount numeric(10,2) not null,
  message text,
  status refund_offer_status not null default 'pending',
  created_at timestamptz default now()
);

-- Add self-reference FK to escalations for the accepted offer
alter table escalations 
add constraint fk_accepted_refund foreign key (accepted_refund_offer_id) references refund_offers(id);

create type point_transaction_type as enum ('purchase', 'transfer', 'payment', 'platform_charge', 'redemption', 'reward');

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

-- Redemption System
-- Defines reward items, their geographic visibility, and user redemptions history.
create type redemption_item_type as enum ('gift_card', 'merchandize', 'donation');
create type redemption_reach_type as enum ('global', 'restricted');
create type redemption_status as enum ('pending', 'completed', 'failed');

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

create table redemption_merchandize_media (
  id uuid primary key default gen_random_uuid(),
  merchandize_id uuid not null references redemption_merchandize(id) on delete cascade,
  media_id uuid not null references media_assets(id) on delete cascade,
  display_order integer default 0,
  created_at timestamptz default now(),
  unique(merchandize_id, media_id)
);

create table redemption_merchandize_restrictions (
  id uuid primary key default gen_random_uuid(),
  merchandize_id uuid not null references redemption_merchandize(id) on delete cascade,
  scope restriction_scope not null default 'global',
  
  -- Hierarchical Scopes
  country_iso_3 text references countries(iso_3),
  state_id uuid references states(id),
  city_id uuid references cities(id),
  zip_code text, -- Composite FK
  community_id uuid references communities(id),

  is_allowed boolean not null default true,
  created_at timestamptz default now(),

  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3),

  unique(merchandize_id, scope, country_iso_3, state_id, city_id, zip_code, community_id)
);

create table redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  item_id uuid not null references redemption_merchandize(id),
  point_cost integer not null,
  status redemption_status not null default 'pending',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  link_url text,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_id uuid not null references profiles(id),
  delegatee_id uuid not null references profiles(id),
  status delegation_status not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (delegator_id <> delegatee_id)
);

create type feedback_type as enum ('feature_request', 'bug_report');
create type feedback_status as enum ('open', 'under_review', 'planned', 'in_progress', 'completed', 'rejected', 'duplicate');

create table user_feedback (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  type feedback_type not null,
  title text not null,
  description text not null,
  status feedback_status not null default 'open',
  created_at timestamptz default now()
);

create table feedback_media (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references user_feedback(id) on delete cascade,
  media_id uuid not null references media_assets(id) on delete cascade,
  display_order integer default 0,
  unique(feedback_id, media_id)
);

create table feedback_votes (
  feedback_id uuid not null references user_feedback(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (feedback_id, user_id),
  created_at timestamptz default now()
);

create table feedback_comments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references user_feedback(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  is_official_response boolean default false,
  created_at timestamptz default now()
);
```

## Periodic Updates Automation

1. **Automation Source**: SimpleMaps US Zip Code Database (Free Tier).
2. **Mechanism**: Supabase Edge Function scheduled via Cron Job (`pg_cron`).
3. **Interval**: Monthly (1st of every month).
4. **Execution**: The function will fetch the CSV, parse it, and use `UPSERT` to keep the `zip_codes` table current.

## Media Delivery & Scaling Strategy

### 1. Delivery via CDN

All assets in `media_assets` are served via the Supabase (Cloudflare) CDN. This ensures that media is cached geographically close to the user, reducing latency and origin server load.

### 2. Image Optimization

The application will use the Supabase Image Transformation API to serve appropriately sized images based on the user's device (e.g., thumbnails vs. full-screen previews).

### 3. Video Handling

- **Short Videos**: Served directly via CDN with byte-range requests for seeking.
- **Longer/High-Scale Video**: Future-proofed to transition to HLS (HTTP Live Streaming) if necessary, with `media_assets` tracking the manifest URLs.

### Edge Function: update-zip-codes

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parse } from 'https://deno.land/std@0.181.0/encoding/csv.ts'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 1. Fetch the latest ZIP data from SimpleMaps
  const response = await fetch('https://simplemaps.com/static/data/us-zips.csv')
  const csvText = await response.text()
  
  // 2. Parse CSV
  const data = await parse(csvText, { skipFirstRow: true, columns: [
    'zip', 'lat', 'lng', 'city', 'state_id', 'state_name', 'zcta', 'parent_zcta', 'population', 'density', 'county_fips', 'county_name', 'county_weights', 'county_names_all', 'county_fips_all', 'imprecise', 'military', 'timezone'
  ]})

  // 3. Map to our schema
  const updates = data.map((row: any) => ({
    zip_code: row.zip,
    city: row.city,
    state: row.state_id,
    county: row.county_name,
    latitude: parseFloat(row.lat),
    longitude: parseFloat(row.lng)
  }))

  // 4. Batch Upsert (Chunks of 1000 to avoid request size limits)
  const chunkSize = 1000
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize)
    // Add default country for this specfic US data source
    const chunkWithCountry = chunk.map(r => ({ ...r, country_iso_3: 'USA' }))

    const { error } = await supabase
      .from('zip_codes')
      .upsert(chunkWithCountry, { onConflict: 'zip_code, country_iso_3' })
    
    if (error) throw error
  }

  return new Response(JSON.stringify({ success: true, count: updates.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

### Edge Function: scrape-communities

This function iterates through the `zip_codes` table, scrapes the NCES website for high schools in each zip code, and populates the `communities` table.

> [!NOTE]
> Since there are 40,000+ zip codes, this function is designed to run in batches (e.g., 100 zip codes per run) triggered by a scheduler or internal loop.

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 1. Fetch a batch of zip codes that haven't been scraped recently
  // (We might want to add a 'last_scraped_at' column to zip_codes)
  const { data: zipRows, error: fetchError } = await supabase
    .from('zip_codes')
    .select('zip_code, country_iso_3')
    .limit(50) // Adjust batch size as needed

  if (fetchError) return new Response(JSON.stringify(fetchError), { status: 500 })

  const allFoundCommunities = []

  for (const row of zipRows) {
    const zip = row.zip_code
    // Only scrape US schools for now
    if (row.country_iso_3 !== 'USA') continue; 
    const url = `https://nces.ed.gov/ccd/schoolsearch/school_list.asp?Search=1&Zip=${zip}&LoGrade=10&HiGrade=13&State=06`
    
    try {
      const response = await fetch(url)
      const html = await response.text()
      const doc = new DOMParser().parseFromString(html, 'text/html')
      
      if (!doc) continue

      const schoolLinks = doc.querySelectorAll('a[href^="school_detail.asp"]')
      schoolLinks.forEach((link: any) => {
        const name = link.textContent.trim()
        const addressText = link.parentElement.innerText.replace(name, '').trim()
        const match = addressText.match(/,\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})/)
        
        if (match) {
          allFoundCommunities.push({
            community_name: name,
            city: match[1].trim(),
            state: match[2].trim(),
            zip_code: match[3].trim(),
            country_iso_3: 'USA'
          })
        }
      })
      
      // Optional: Wait to avoid being blocked
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (e) {
      console.error(`Failed to scrape ${zip}:`, e)
    }
  }

  // 2. Bulk UPSERT communities
  if (allFoundCommunities.length > 0) {
    const { error: upsertError } = await supabase
      .from('communities')
      .upsert(allFoundCommunities, { onConflict: 'zip_code, community_name, country_iso_3' })
    
    if (upsertError) return new Response(JSON.stringify(upsertError), { status: 500 })
  }

  return new Response(JSON.stringify({ 
    success: true, 
    zip_codes_processed: zipRows.length,
    communities_added: allFoundCommunities.length 
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

```typescript
Deno.serve(async (req) => {
  // Function: sync-locations
  // Maintains countries -> states -> cities -> zips hierarchy
  
  // 1. Fetch Country List (e.g. from restcountries.com or provider)
  const countries = await fetchThirdPartyCountries();
  await upsertCountries(countries);

  // 2. Fetch State/City structure (e.g. geonames)
  const states = await fetchStates();
  await upsertStates(states);
  
  const cities = await fetchCities(); 
  await upsertCities(cities);

  // 3. Populate Zip Codes with correct Country/City IDs
  // (This ensures referential integrity for restrictions)
  
  return new Response("Locations Synced", { status: 200 })
})
```

## Scaling & Sharding Strategy

The CasaGrown application is hyper-local by design but global in scope. The data architecture is designed to scale horizontally based on strict geographic and community boundaries.

### 1. Macro-Sharding: Geographic (Country/Region)

- **Physical Isolation**: Data is physically sharded by **Country (`country_iso_3`)**.
- **Rationale**: Data Sovereignty (GDPR/compliance), reduced latency, and fault isolation.
- **Implementation**: Database instances are deployed in regions corresponding to the country (e.g., `us-east-1` for USA, `eu-central-1` for Germany).

### 2. Micro-Sharding: Community (Tenant-like Isolation)

Within each Geographic Shard, `community_id` acts as a tenant identifier. Most user interactions are scoped to a single community.

- **Shard Key**: `community_id`.
- **Community-Scoped Tables**: These tables contain 90% of the system's data and can be easily partitioned or moved to separate physical nodes if a specific community becomes "hot".
  - `profiles` (Users belong to one primary community)
  - `user_garden`
  - `posts` (Type: `sell`, `buy`, `advice` - where `reach = 'community'`)
  - `orders` (transactions are local, except for delegation cases)

### 3. Cross-Shard & Global Entities

Some features span across communities or require global visibility.

- **Delegations**:
  - **Challenge**: A `delegator` and `delegatee` might be in neighboring communities (different `community_id` shards).
  - **Strategy**: Delegations are stored in a **Regional Shared Schema** within the Country Shard, or both profiles must be replicated if they cross physical shard boundaries (rare).
- **Cross-Community Chats**:
  - **Challenge**: Chats between a buyer and a delegate seller in different communities.
  - **Strategy**: Conversations are anchored to the `Country Shard` rather than a specific `Community Shard` to ensure accessibility by both parties.
- **Global Posts**:
  - **Challenge**: Posts with `reach = 'global'` must be visible to all communities.
  - **Strategy**: Stored in a dedicated "Global Feed" partition. Feed construction queries union the **Local Community Partition** + **Global Partition**.
- **(New) Reference Data & Rules**:
  - **Global/Regional Shared Tables**: `countries`, `states`, `cities`, `zip_codes`.
  - **Rule Tables**: `incentive_rules`, `sales_category_restrictions`.
  - **Strategy**: These are high-read, low-write tables. They are typically **replicated** to all read replicas or stored in a common schema accessible by all shards within a region to ensure fast lookups.

### 4. Experimentation (Schema)

**Scope**: `experiments`, `variants`, `assignments`.

- **Persistence**: Assignments are durable (stored in `experiment_assignments`).
- **Strategy**:
  - `experiments` & `variants`: Replicated (Low cardinality, high read).
  - `assignments`: Sharded by `user_id` (High volume, partitioned by experiment).

### 5. Partitioning for High-Volume Data

Independent of community sharding, high-volume logs use time-based partitioning to maintain velocity.

- **`point_ledger`**: Partitioned by **Month** (`created_at`).
- **`notifications`**: Partitioned by **Month** (`created_at`).
- **`chat_messages`**: Hash Partitioned by `conversation_id`(buckets) or Time Partitioned by **Month** (archival).

### 6. Potential Bottlenecks & Mitigations

| Bottleneck | Description | Mitigation Strategy |
| :--- | :--- | :--- |
| **Regional Write Hotspots** | Aggregating all cross-community chats into the Country Shard creates high write pressure. | **Hash Partitioning**: The regional `chat_messages` table must be hash-partitioned by `conversation_id` to distribute lock contention. |
| **Cross-Shard Joins** | Joining `orders` (Community Shard) with `chat_messages` (Country Shard) implies network latency. | **Application-Level Joins**: The API layer fetches Orders first, then fetches Chats in parallel. Do not rely on DB-level foreign keys across shards. |
| **Data Skew** | A large community (e.g., "Brooklyn") might outgrow a standard micro-shard. | **Dedicated Hardware**: The `community_id` tenant model allows moving a specific heavy tenant to its own dedicated physical database instance without code changes. |

## Security & Row Level Security (RLS)

All tables must have RLS enabled. Policies follow a "Deny by Default" architecture.

### 1. Reference Data & Rules

**Scope**: `countries`, `states`, `cities`, `zip_codes`, `incentive_rules`, `sales_category_restrictions`, `redemption_merchandize_restrictions`, `experiments`, `experiment_variants`.

- **SELECT**: `public` role (everyone) can read (filtered by `status='running'`).
- **INSERT/UPDATE/DELETE**: `service_role` (Admin/Edge Functions) ONLY.

### 2. Experimentation (User Sides)

**Scope**: `experiment_assignments`, `experiment_events`.

- **SELECT**: Authenticated users can read their own assignments (`auth.uid() = user_id`).
- **INSERT**: `service_role` (via Edge Function) OR Authenticated User (if auto-assignment logic is client-initiated, though server-side is preferred).
  - *Recommendation*: Use a Postgres Function `assign_experiment(experiment_id)` to handle logic securely.

### 3. User Profiles & Communities

**Scope**: `profiles`, `communities`.

- **SELECT**: Authenticated users can read.
- **UPDATE**: Users can only update their own row (`auth.uid() = id`).
- **INSERT**: Managed via Auth Triggers.

### 4. Marketplace Content

**Scope**: `posts`, `want_to_sell_details`, `want_to_buy_details`.

- **SELECT**: Authenticated users can read (filtered by application logic/UI, but generally public within community).
- **INSERT/UPDATE/DELETE**: Owners only.
  - `posts`: `auth.uid() = author_id`.

### 5. Transactional Privacy

**Scope**: `offers`, `orders`, `conversations`, `chat_messages`.

- **SELECT**: Strictly limited to participants.
  - `conversations`: `auth.uid() IN (buyer_id, seller_id)`.
  - `offers`: `auth.uid() IN (buyer_id, seller_id)`. (Note: `created_by` check not sufficient for visibility, must check context).
  - `orders`: `auth.uid() IN (buyer_id, seller_id)`.
- **INSERT/UPDATE**: Participants only.

### 6. Escalations & Admin

**Scope**: `escalations`, `refund_offers`.

- **SELECT**:
  - Participants: `auth.uid() = initiator_id` OR linked via `order_id` (requires generic join policy).
  - Admins: Special `admin` role or `service_role`.
- **INSERT**: Authenticated users for their own orders.

### 7. User Feedback System

**Scope**: `user_feedback`, `feedback_votes`, `feedback_comments`.

- **SELECT**: Public (Everyone can view requests/bugs).
- **INSERT**: Authenticated Users only.
- **UPDATE**:
  - Author: Can update title/description.
  - Staff: Can update `status` and `is_official_response`.
- **VOTES**: 
  - Insert/Delete: Authenticated users can vote once per item (`primary key` constraint).
