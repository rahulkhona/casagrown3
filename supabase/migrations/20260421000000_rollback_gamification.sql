-- ==========================================================================
-- Migration: Rollback Gamification Tables
--
-- Removes all gamification infrastructure (badges, kudos, feature flags)
-- that was introduced prematurely. The feature will be re-added when ready.
--
-- Preserves: get_platform_fee_for_user (restored to pre-gamification form)
-- ==========================================================================

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Drop gamification RPCs
-- ══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_recent_kudos(INTEGER);
DROP FUNCTION IF EXISTS public.search_members_for_kudos(TEXT);
DROP FUNCTION IF EXISTS public.check_and_award_badges(UUID);
DROP FUNCTION IF EXISTS public.get_user_badges(UUID);
DROP FUNCTION IF EXISTS public.give_kudos(UUID, INTEGER, TEXT);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Drop gamification tables (in FK dependency order)
-- ══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.kudos_transactions CASCADE;
DROP TABLE IF EXISTS public.user_badges CASCADE;
DROP TABLE IF EXISTS public.badge_rules CASCADE;
DROP TABLE IF EXISTS public.badge_definitions CASCADE;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Drop badge type enum
-- ══════════════════════════════════════════════════════════════════════════

DROP TYPE IF EXISTS public.badge_type;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. Drop feature flags system
-- ══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.is_feature_enabled(TEXT);
DROP TABLE IF EXISTS public.feature_flags CASCADE;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. Restore get_platform_fee_for_user WITHOUT badge discount logic
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_platform_fee_for_user(
  p_user_id uuid DEFAULT NULL,
  p_country_code varchar(3) DEFAULT NULL
)
RETURNS float AS $$
DECLARE
  v_country_code varchar(3) := 'USA';
  v_fee_rate float;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(country_code, 'USA') INTO v_country_code
    FROM profiles
    WHERE id = p_user_id;

    IF v_country_code IS NULL THEN v_country_code := 'USA'; END IF;
  ELSIF p_country_code IS NOT NULL THEN
    v_country_code := p_country_code;
  END IF;
  
  -- Lookup the latest active fee configuration
  SELECT fees INTO v_fee_rate
  FROM platform_fees
  WHERE country_code = v_country_code
  ORDER BY creation_date DESC
  LIMIT 1;
  
  -- Fallback to 10% if config table is empty
  IF v_fee_rate IS NULL THEN
    v_fee_rate := 0.10;
  END IF;
  
  RETURN v_fee_rate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
