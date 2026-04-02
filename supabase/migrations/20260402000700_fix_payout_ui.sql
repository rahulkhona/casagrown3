-- Fix payout UI: enable charity, seed gift card cache, add sandbox verification hint

-- 1. Enable charity as a payout method
UPDATE available_redemption_methods SET is_active = true WHERE method = 'charity';

-- 2. Add unified_market to giftcard_provider enum for market-specific cache
ALTER TYPE giftcard_provider ADD VALUE IF NOT EXISTS 'unified_market';

-- 3. Update get_payout_status to include verification_amount for sandbox testing
CREATE OR REPLACE FUNCTION get_payout_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile RECORD;
BEGIN
  SELECT payout_handle, payout_handle_type, payout_verified,
         payout_verification_sent_at, payout_verification_attempts,
         payout_verification_amount, last_active_at
    INTO v_profile FROM profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'handle', v_profile.payout_handle,
    'handle_type', v_profile.payout_handle_type,
    'verified', COALESCE(v_profile.payout_verified, false),
    'verification_pending', v_profile.payout_verification_sent_at IS NOT NULL
                            AND NOT COALESCE(v_profile.payout_verified, false),
    'verification_sent_at', v_profile.payout_verification_sent_at,
    'verification_amount', v_profile.payout_verification_amount,
    'attempts', COALESCE(v_profile.payout_verification_attempts, 0),
    'last_active_at', v_profile.last_active_at
  );
END;
$$;
