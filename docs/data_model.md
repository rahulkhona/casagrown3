# Data Model

This document defines the schema for the application.

## Tables

### `communities`

The `communities` table stores information about local areas defined by **H3 Hexagonal Spatial Index** (Resolution 7).

| Column | Type | Description |
| :--- | :--- | :--- |
| `h3_index` | `text` | Primary Key. The H3 Index (Res 7). |
| `name` | `text` | Human-readable name (derived from OSM landmarks). |
| `location` | `geometry(Point, 4326)` | Centroid of the cell for spatial queries. |
| `boundary` | `geometry(Polygon, 4326)` | The exact hexagonal boundary. |
| `city` | `text` | Administrative context. |
| `state` | `text` | State/Region. |
| `country` | `text` | Country Code. |
| `metadata` | `jsonb` | Source of name (e.g. `{"source": "osm", "osm_id": 123}`). |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Default `now()` |

### `profiles`

The `profiles` table stores user profile information. It is linked to the Supabase Auth `auth.users` table.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key (FK to `auth.users.id`). |
| `full_name` | `text` | User's display name. |
| `avatar_url` | `text` | URL to user's avatar image. |
| `phone_number` | `text` | User's phone number (for SMS notifications). |
| `country_code` | `varchar(3)` | **ISO 3166-1 alpha-3** country code (e.g., 'USA', 'CAN'). Default: 'USA'. |
| `zip_code` | `text` | User's postal code. |
| `home_community_h3_index` | `text` | FK to `communities(h3_index)`. User's assigned community. |
| `home_location` | `geometry(Point, 4326)` | Exact user location (optional/obfuscated). |
| `nearby_community_h3_indices` | `text[]` | Array of adjacent H3 indices (neighbors). |
| `notify_on_wanted` | `boolean` | Receive notifications for "wanted" posts. Default: `false`. |
| `notify_on_available` | `boolean` | Receive notifications for "available" posts. Default: `false`. |
| `push_enabled` | `boolean` | Push notifications enabled. Default: `true`. |
| `sms_enabled` | `boolean` | SMS notifications enabled. Default: `false`. |
| `created_at` | `timestamptz` | Default `now()`. |
| `updated_at` | `timestamptz` | Default `now()`. |

### `incentive_rules`

The `incentive_rules` table defines reward point values for various user actions, with support for geographic scoping.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `action_type` | `incentive_action` | The action being rewarded (e.g., `join_a_community`, `make_first_post`). |
| `scope` | `incentive_scope` | Geographic scope: `global`, `country`, `state`, `city`, `zip`, or `community`. |
| `points` | `integer` | Points awarded for this action. Default: `0`. |
| `country_iso_3` | `text` | FK to `countries`. Optional country restriction. |
| `state_id` | `uuid` | FK to `states`. Optional state restriction. |
| `city_id` | `uuid` | FK to `cities`. Optional city restriction. |
| `zip_code` | `text` | Optional zip code restriction. |
| `start_date` | `timestamptz` | When this rule becomes active. |
| `end_date` | `timestamptz` | Optional expiration date. |
| `created_at` | `timestamptz` | Default `now()`. |

**Incentive Action Types**: `join_a_community`, `make_first_post`, `complete_transaction`, `complete_first_transaction`

### `point_ledger`

The `point_ledger` table tracks all point transactions for each user, providing a complete audit trail.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `user_id` | `uuid` | FK to `profiles(id)`. The user receiving the transaction. |
| `type` | `point_transaction_type` | Transaction type (see below). |
| `amount` | `integer` | Points added (positive) or subtracted (negative). |
| `balance_after` | `integer` | User's total balance after this transaction. |
| `reference_id` | `uuid` | Optional reference to related entity (e.g., transaction_id). |
| `metadata` | `jsonb` | Additional data (e.g., `{"action_type": "join_a_community"}`). |
| `created_at` | `timestamptz` | Default `now()`. |

**Transaction Types**: `purchase`, `transfer`, `payment`, `platform_charge`, `redemption`, `reward`

**Idempotency**: Reward grants check for existing entries with matching `action_type` in metadata before inserting new rewards.

**RLS Policies**:
- `Users can view own point ledger entries` - SELECT where `auth.uid() = user_id`
- `Users can insert own point ledger entries` - INSERT with check `auth.uid() = user_id`

---

## Schema Implementation Details

### Extensions
`postgis` extension is required.

### `communities` Table SQL

```sql
create extension if not exists postgis;

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

-- Index for spatial queries
create index communities_location_idx on communities using gist (location);
```

## Community Generation Strategy (Eager Loading)

1.  **Trigger**: User provides location -> Calculate H3 Index.
2.  **Check**: Check DB for Primary H3 Index AND 6 Neighbor H3 Indices.
3.  **Generate**: For **ANY** missing index (Primary or Neighbor), call Overpass API in parallel to generate the community record.
4.  **Result**: Return 7 fully resolved communities. No "Unexplored" placeholders for active users.

### Edge Function: `resolve-community`

Resolves a user's location (Address or Lat/Lng) to a Primary Community and identifies neighbors.

**Endpoint**: `/functions/v1/resolve-community`

**Input (JSON)**:
```json
{
  "address": "123 Main St, San Jose, CA", 
  // OR
  "lat": 37.7749,
  "lng": -122.4194
}
```

**Logic**:
1.  **Geocode**: If `address` is provided, resolves to Lat/Lng via Nominatim.
2.  **Indexing**: Calculates H3 Index (Res 7) for Primary and 6 Neighbors.
3.  **Eager Load**: Checks DB for all 7 indices. Generates missing ones via Overpass API (in parallel).
4.  **Return**: Returns 7 named communities.

**Output (JSON)**:
```json
{
  "primary": {
    "h3_index": "87283472bffffff",
    "name": "Willow Glen",
    "city": "San Jose",
    "location": "POINT(...)",
    "boundary": "POLYGON(...)"
  },
  "neighbors": [
    { "h3_index": "8728...", "name": "Campbell", "status": "active" },
    { "h3_index": "8728...", "name": "Rose Garden", "status": "active" }
  ],
  "resolved_location": { "lat": 37.77, "lng": -122.41 }
}
```

