-- ============================================================================
-- Migration: Add last_manual_payout_at to profiles
--
-- BUG-29: Prevents race condition between auto-payout and manual payout.
-- When a user does a manual cashout, we record the timestamp. The
-- get_auto_payout_eligible_users() RPC then excludes users who did a
-- manual payout within the last hour.
-- ============================================================================

-- 1. Add column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_manual_payout_at TIMESTAMPTZ;

-- 2. Update get_auto_payout_eligible_users to exclude recent manual payouts
CREATE OR REPLACE FUNCTION get_auto_payout_eligible_users()
RETURNS TABLE (
  user_id UUID,
  available_usd NUMERIC(10,2),
  trigger_reason TEXT,
  payout_method TEXT,
  threshold_usd NUMERIC(10,2),
  cashout_payout_id TEXT,
  gift_card_brand TEXT,
  gift_card_amount_usd NUMERIC(10,2),
  charity_project_id TEXT,
  charity_project_name TEXT,
  payout_handle TEXT,
  payout_handle_type TEXT,
  payout_verified BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY

  -- A) Users with auto-payout enabled whose balance >= their threshold
  SELECT
    ub.user_id,
    ub.available_usd,
    'threshold'::TEXT AS trigger_reason,
    arc.method AS payout_method,
    arc.threshold_usd,
    arc.cashout_payout_id,
    arc.gift_card_brand,
    arc.gift_card_amount_usd,
    arc.charity_project_id,
    arc.charity_project_name,
    p.payout_handle,
    p.payout_handle_type,
    COALESCE(p.payout_verified, false) AS payout_verified
  FROM user_balances ub
  JOIN user_auto_redemption_config arc ON arc.user_id = ub.user_id AND arc.enabled = true
  JOIN profiles p ON p.id = ub.user_id
  WHERE ub.available_usd >= arc.threshold_usd
    AND ub.available_usd > 0
    AND (p.last_manual_payout_at IS NULL OR p.last_manual_payout_at < now() - INTERVAL '1 hour')

  UNION ALL

  -- B) $500 AML cap (mandatory, regardless of auto-payout setting)
  SELECT
    ub.user_id,
    ub.available_usd,
    'aml_cap'::TEXT AS trigger_reason,
    COALESCE(arc.method, 'giftcards') AS payout_method,
    500.00 AS threshold_usd,
    arc.cashout_payout_id,
    COALESCE(arc.gift_card_brand, 'Visa') AS gift_card_brand,
    arc.gift_card_amount_usd,
    arc.charity_project_id,
    arc.charity_project_name,
    p.payout_handle,
    p.payout_handle_type,
    COALESCE(p.payout_verified, false) AS payout_verified
  FROM user_balances ub
  LEFT JOIN user_auto_redemption_config arc ON arc.user_id = ub.user_id
  JOIN profiles p ON p.id = ub.user_id
  WHERE ub.available_usd >= 500
    -- Exclude users already matched by threshold
    AND NOT (arc.enabled IS TRUE AND ub.available_usd >= arc.threshold_usd)
    AND (p.last_manual_payout_at IS NULL OR p.last_manual_payout_at < now() - INTERVAL '1 hour')

  UNION ALL

  -- C) 90-day inactivity sweep
  SELECT
    ub.user_id,
    ub.available_usd,
    'inactivity_sweep'::TEXT AS trigger_reason,
    COALESCE(arc.method, 'giftcards') AS payout_method,
    0.00 AS threshold_usd,
    arc.cashout_payout_id,
    COALESCE(arc.gift_card_brand, 'Visa') AS gift_card_brand,
    arc.gift_card_amount_usd,
    arc.charity_project_id,
    arc.charity_project_name,
    p.payout_handle,
    p.payout_handle_type,
    COALESCE(p.payout_verified, false) AS payout_verified
  FROM user_balances ub
  LEFT JOIN user_auto_redemption_config arc ON arc.user_id = ub.user_id
  JOIN profiles p ON p.id = ub.user_id
  WHERE ub.available_usd > 0
    AND p.last_active_at < now() - INTERVAL '90 days'
    -- Exclude users already matched by threshold or cap
    AND NOT (arc.enabled IS TRUE AND ub.available_usd >= arc.threshold_usd)
    AND ub.available_usd < 500
    AND (p.last_manual_payout_at IS NULL OR p.last_manual_payout_at < now() - INTERVAL '1 hour');
END;
$$;
