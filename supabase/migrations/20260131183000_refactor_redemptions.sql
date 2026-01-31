-- Refactor Redemption Restrictions to unified table
-- Drops 5 specific restriction tables and replaces with 1 unified table

DROP TABLE IF EXISTS redemption_merchandize_country_restrictions;
DROP TABLE IF EXISTS redemption_merchandize_state_restrictions;
DROP TABLE IF EXISTS redemption_merchandize_city_restrictions;
DROP TABLE IF EXISTS redemption_merchandize_zip_restrictions;
DROP TABLE IF EXISTS redemption_merchandize_community_restrictions;

CREATE TABLE redemption_merchandize_restrictions (
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

ALTER TABLE redemption_merchandize_restrictions ENABLE ROW LEVEL SECURITY;
