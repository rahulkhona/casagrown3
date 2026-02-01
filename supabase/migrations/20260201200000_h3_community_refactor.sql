-- Enable PostGIS extension
create extension if not exists postgis;

-- Drop legacy scraping tables (no longer needed with on-demand loading)
drop table if exists scraping_logs;
drop table if exists zip_code_tracking;

-- Recreate communities table
-- 1. Remove references from ALL dependent tables first
alter table profiles drop constraint if exists profiles_community_id_fkey;
alter table profiles drop column if exists community_id;

alter table incentive_rules drop constraint if exists incentive_rules_community_id_fkey;
alter table incentive_rules drop column if exists community_id;

alter table sales_category_restrictions drop constraint if exists sales_category_restrictions_community_id_fkey;
alter table sales_category_restrictions drop column if exists community_id;

alter table posts drop constraint if exists posts_community_id_fkey;
alter table posts drop column if exists community_id;

alter table redemption_merchandize_restrictions drop constraint if exists redemption_merchandize_restrictions_community_id_fkey;
alter table redemption_merchandize_restrictions drop column if exists community_id;

-- 2. Drop the old table
drop table if exists communities;

-- 3. Create new H3-based table
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

-- 4. Re-add references to dependent tables
alter table profiles 
    add column if not exists home_community_h3_index text references communities(h3_index),
    add column if not exists home_location geometry(Point, 4326);

alter table incentive_rules 
    add column if not exists community_h3_index text references communities(h3_index);

alter table sales_category_restrictions
    add column if not exists community_h3_index text references communities(h3_index);

alter table posts 
    add column if not exists community_h3_index text references communities(h3_index);

alter table redemption_merchandize_restrictions 
    add column if not exists community_h3_index text references communities(h3_index);

-- Index for fast user location lookups
create index profiles_home_location_idx on profiles using gist (home_location);
create index posts_community_h3_idx on posts(community_h3_index);
