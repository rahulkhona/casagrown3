-- Update public_profiles view to include seller onboarding and business details.
-- Exposes safe, non-PII subset of profiles for public/cross-user details page (PDP) rendering.

-- 1. Grant SELECT on the new profiles columns to anon
GRANT SELECT (
  seller_avg_rating,
  seller_rating_count,
  farm_name,
  business_type,
  seller_bio,
  business_license,
  food_handler_permit,
  cottage_food_permit,
  insurance_provider
) ON public.profiles TO anon;

-- 2. Drop and recreate view with the updated fields
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles WITH (security_invoker = true) AS
SELECT
  id,
  full_name,
  avatar_url,
  home_community_h3_index,
  phone_verified,
  created_at,
  closure_status,
  seller_avg_rating,
  seller_rating_count,
  farm_name,
  business_type,
  seller_bio,
  business_license,
  food_handler_permit,
  cottage_food_permit,
  insurance_provider
FROM public.profiles;

-- 3. Restore grants and revokes
GRANT SELECT ON public.public_profiles TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_profiles FROM anon, authenticated;

-- 4. Apply comment
COMMENT ON VIEW public.public_profiles IS 'Safe public view of profiles for cross-user reads (exposes non-PII profiles data for buyers and guests).';
