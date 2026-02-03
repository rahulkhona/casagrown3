-- Add zip_code and nearby_community_h3_indices to profiles
alter table profiles 
add column if not exists zip_code text,
add column if not exists nearby_community_h3_indices text[];

-- Add generic GIN index for verifying containment or overlap if needed later for the array
create index if not exists profiles_nearby_communities_idx on profiles using gin (nearby_community_h3_indices);
