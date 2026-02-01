# Community Data Model Refactor Proposal

## Problem Statement
The current community definitions rely on `Zip Code` + `High School`. This is problematic because:
1.  **Inconsistent Coverage**: Not all zip codes have high schools.
2.  **Arbitrary Boundaries**: Zip codes are administrative postal routes, not reflecting actual neighborhoods or "1-2 mile" walkability zones.
3.  **Scalability**: Logic breaks down in rural areas or dense urban centers where "High School" isn't the primary community anchor.

## Proposed Solution: H3 Geospatial Indexing

We propose moving to **Uber's H3 Hexagonal Hierarchical Spatial Index** system. This divides the world into a grid of hexagonal cells.

### 1. H3 Resolution Selection
**Recommended Resolution: Level 7**

*   **Average Area**: ~5.16 km² (~2.0 sq miles)
*   **Average Edge Length**: ~1.22 km (0.76 miles)
*   **Diameter**: ~2.4 km (1.5 miles)
*   **Fit**: This aligns perfectly with the goal of "1 to 2 mile zones". It creates tight, hyper-local communities where neighbors are likely within walking or short driving distance.

### 2. Naming Strategy (H3 -> Human Readable)
An H3 index (e.g., `87283472bffffff`) is not user-friendly. We need to Assign a "well-known name" to each active H3 zone.

**Methodology:**
1.  **Centroid Mapping**: Calculate the latitude/longitude center of the active H3 cell.
2.  **Landmark Discovery (OSM/Overpass API)**: Query OpenStreetMap data within the hexagon boundaries for significant landmarks.
3.  **Naming Priority Heuristic**:
    1.  **Neighborhood Name** (`place=neighbourhood`, `place=suburb`, `place=quarter`) - *e.g., "Willow Glen", "Noe Valley"*
    2.  **Major Parks/Recreation** (`leisure=park`, `leisure=nature_reserve`) - *e.g., "Golden Gate Park Community"*
    3.  **Educational Institutions** (`amenity=school`, `amenity=university`) - *Retains the original "High School" idea where applicable.*
    4.  **Major POIs** (`amenity=townhall`, `amenity=library`)
    5.  **Major Intersections** (Fallback) - *e.g., "Main St & 1st Ave"*

### 3. Schema Changes

#### New `communities` Table
Replaces the old Zip/School table. One row per active H3 cell.

```sql
create table communities (
    h3_index text primary key, -- The H3 Index (Res 7)
    name text not null,        -- derived from OSM (e.g. "Willow Glen")
    location geometry(Point, 4326), -- Centroid of the cell for fast distance queries
    boundary geometry(Polygon, 4326), -- The exact hexagonal boundary
    city text,                 -- Administrative context
    state text,
    country text,
    metadata jsonb,            -- Store source of name (e.g. { "source": "osm_park", "osm_id": 123 })
    created_at timestamptz default now()
);

-- Index for spatial queries
create index communities_location_idx on communities using gist (location);
```

#### Updates to `profiles` (Users) Table

```sql
alter table profiles 
add column home_community_h3_index text references communities(h3_index),
add column home_location geometry(Point, 4326); -- Exact user location (optional/obfuscated)
```

### 4. Implementation Strategy: "Lazy Loading" (Phase 1)

Instead of importing the entire 1TB+ OSM Planet database upfront, we will populate the `communities` table **on-demand**.

**Workflow:**
1.  **User Joins**: User provides GPS or Address.
2.  **Backend Calculation**: Server calculates the H3 Index (Res 7) for that location (e.g., `8728...`).
3.  **Database Check**: 
    *   Query `communities` table for `h3_index = '8728...'`.
    *   **If Exists**: Assign user to this community immediately.
    *   **If New (MISS)**: Trigger **Community Generation** (Edge Function).
4.  **Community Generation (Edge Function)**:
    *   Call **Overpass API** (Free OSM Query Service).
    *   Search for landmarks/names within the H3 cell boundary.
    *   Apply naming heuristic.
    *   Insert new row into `communities`.
    *   Assign user.

**Pros of Lazy Loading:**
*   **Zero Infrastructure Cost**: No need for massive creating/hosting of tiles.
*   **Scale**: Database grows only with active user base.
*   **Speed**: Immediate implementation.

### 5. Scaling Strategy: "Bulk Import" (Phase 2)

As the platform grows, we can seamlessly transition from "Lazy Loading" to "Pre-filling" without changing the schema or frontend code.

**Transition Logic:**
*   The `communities` table is the source of truth.
*   If we notice API rate limits or latency issues with Overpass API, we can run a one-time "Bulk Import" job.
*   **Bulk Import Job**:
    *   Spin up a temporary worker server.
    *   Download regional OSM PBF extract (e.g., North America).
    *   Iterate through all H3 cells in the region.
    *   Calculate names locally.
    *   Bulk insert into `communities`.
*   **Result**: The Edge Function logic (Check DB -> Miss -> API) will simply stop hitting the "Miss" case because the data is already there.

### 6. Data Requirements & Tooling
1.  **Supabase Database**:
    *   Enable **PostGIS** extension (`create extension postgis;`).
2.  **Server-Side Libraries**:
    *   `h3-js` (Node) or `h3` (Python) for index calculations.
3.  **External Data Source (Phase 1)**:
    *   **Overpass API (Public Instances)**:
        *   `https://overpass-api.de/api/interpreter`
        *   `https://lz4.overpass-api.de/api/interpreter`
    *   **Access Requirements**:
        *   **No API Key required** for public instances.
        *   **Rate Limits**: Fair usage policy applies (usually ~10,000 requests/day or limited concurrent slots).
        *   **User-Agent**: Must include a valid User-Agent string identifying the app.
