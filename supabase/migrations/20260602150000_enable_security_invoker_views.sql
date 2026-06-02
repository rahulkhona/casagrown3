-- Fix Supabase Security Advisor warnings:
--   1. Security Definer View: public.public_profiles
--   2. Security Definer View: public.catalog_item_allocations
--
-- Re-create views with security_invoker = true so they respect
-- the RLS policies of the calling user instead of the view owner.

-- 1. Re-create public_profiles view with security_invoker enabled
DROP VIEW IF EXISTS public_profiles;
CREATE VIEW public_profiles WITH (security_invoker = true) AS
SELECT
  id,
  full_name,
  avatar_url,
  home_community_h3_index,
  phone_verified,
  created_at,
  closure_status
FROM profiles;

GRANT SELECT ON public_profiles TO anon, authenticated;

-- 2. Re-create catalog_item_allocations view with security_invoker enabled
DROP VIEW IF EXISTS catalog_item_allocations;
CREATE VIEW catalog_item_allocations WITH (security_invoker = true) AS
SELECT
  ci.id AS catalog_item_id,
  ci.owner_id,
  ci.name,
  ci.category,
  ci.total_inventory,
  COALESCE(SUM(mp.inventory), 0)::INTEGER AS allocated_inventory,
  (ci.total_inventory - COALESCE(SUM(mp.inventory), 0))::INTEGER AS available_inventory,
  COUNT(DISTINCT mp.booth_id)::INTEGER AS stand_count
FROM catalog_items ci
LEFT JOIN market_products mp
  ON mp.catalog_item_id = ci.id
  AND mp.is_active = true
  AND mp.is_deleted = false
GROUP BY ci.id;

GRANT SELECT ON catalog_item_allocations TO authenticated;
