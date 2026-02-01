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

### `profiles` (Updates)

| Column | Type | Description |
| :--- | :--- | :--- |
| `home_community_h3_index` | `text` | FK to `communities(h3_index)`. User's assigned community. |
| `home_location` | `geometry(Point, 4326)` | Exact user location (optional/obfuscated). |

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

## Community Generation Strategy (Lazy Loading)

1.  **Trigger**: User provides location -> Calculate H3 Index.
2.  **Check**: If `h3_index` exists in DB -> Assign.
3.  **Generate**: If missing -> Edge Function calls Overpass API (OSM) to find landmarks (Neighborhood -> Park -> School) and create the row.

