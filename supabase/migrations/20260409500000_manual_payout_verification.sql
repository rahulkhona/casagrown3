-- ============================================================================
-- Manual Payout Verification 
-- Replaces fractional micro-deposits with standard $1.00 manual test transfers.
-- ============================================================================

CREATE OR REPLACE FUNCTION confirm_manual_payout_verification(
  p_handle TEXT,
  p_handle_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_handle_type NOT IN ('venmo', 'paypal') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid handle type');
  END IF;

  -- The user has manually confirmed they received the $1.00 cashout.
  -- Trust this handle and mark them as verified so they can use auto-cashout.
  UPDATE profiles SET
    payout_handle = p_handle,
    payout_handle_type = p_handle_type,
    payout_verified = TRUE,
    payout_verification_attempts = 0,
    payout_verification_amount = NULL
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'verified', true);
END;
$$;
