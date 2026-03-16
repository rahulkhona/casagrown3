-- ============================================================================
-- Payout Verification & 90-Day Sweep
--
-- 1. Add payout verification columns to profiles
-- 2. Add last_active_at tracking
-- 3. Trigger to update last_active_at on order activity
-- 4. Rename auto-redemption cashout validation to require verified handle
-- ============================================================================

-- ============================================================
-- 1. Payout verification columns on profiles
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payout_handle TEXT,
  ADD COLUMN IF NOT EXISTS payout_handle_type TEXT CHECK (payout_handle_type IN ('venmo', 'paypal')),
  ADD COLUMN IF NOT EXISTS payout_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payout_verification_amount NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS payout_verification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_verification_attempts INT DEFAULT 0;

COMMENT ON COLUMN profiles.payout_handle IS 'Venmo phone or PayPal email for payouts';
COMMENT ON COLUMN profiles.payout_handle_type IS 'venmo or paypal';
COMMENT ON COLUMN profiles.payout_verified IS 'True once user confirms micro-transaction amount';
COMMENT ON COLUMN profiles.payout_verification_amount IS 'Random amount (0.01-0.99) sent for verification';

-- Migrate existing paypal_payout_id data
UPDATE profiles
  SET payout_handle = paypal_payout_id,
      payout_handle_type = 'paypal',
      payout_verified = TRUE  -- existing users already made transactions
  WHERE paypal_payout_id IS NOT NULL AND paypal_payout_id != '';

-- ============================================================
-- 2. Activity tracking for 90-day sweep
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();

-- Backfill with latest of created_at or last sign-in
UPDATE profiles SET last_active_at = COALESCE(updated_at, created_at, now())
  WHERE last_active_at IS NULL;

-- ============================================================
-- 3. Update last_active_at on order activity
-- ============================================================
CREATE OR REPLACE FUNCTION update_last_active_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Update both buyer and seller activity timestamps
  UPDATE profiles SET last_active_at = now()
    WHERE id IN (NEW.buyer_id, NEW.seller_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_updates_activity ON market_orders;
CREATE TRIGGER trg_order_updates_activity
  AFTER INSERT OR UPDATE ON market_orders
  FOR EACH ROW EXECUTE FUNCTION update_last_active_on_order();

-- ============================================================
-- 4. RPC: initiate payout verification (send random amount)
-- ============================================================
CREATE OR REPLACE FUNCTION initiate_payout_verification(
  p_handle TEXT,
  p_handle_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_amount NUMERIC(4,2);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_handle_type NOT IN ('venmo', 'paypal') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid handle type');
  END IF;

  -- Generate random amount between 0.01 and 0.99
  v_amount := round((random() * 0.98 + 0.01)::numeric, 2);

  UPDATE profiles SET
    payout_handle = p_handle,
    payout_handle_type = p_handle_type,
    payout_verified = FALSE,
    payout_verification_amount = v_amount,
    payout_verification_sent_at = now(),
    payout_verification_attempts = 0
  WHERE id = v_uid;

  -- Return amount so the edge function can send it
  RETURN jsonb_build_object(
    'success', true,
    'amount', v_amount,
    'handle', p_handle,
    'handle_type', p_handle_type
  );
END;
$$;

-- ============================================================
-- 5. RPC: confirm payout verification (user enters received amount)
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_payout_verification(
  p_received_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_expected NUMERIC(4,2);
  v_attempts INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT payout_verification_amount, payout_verification_attempts
    INTO v_expected, v_attempts
    FROM profiles WHERE id = v_uid;

  IF v_expected IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending verification');
  END IF;

  IF v_attempts >= 3 THEN
    -- Reset verification after too many failed attempts
    UPDATE profiles SET
      payout_verified = FALSE,
      payout_verification_amount = NULL,
      payout_verification_sent_at = NULL,
      payout_verification_attempts = 0
    WHERE id = v_uid;
    RETURN jsonb_build_object('success', false, 'error', 'Too many attempts. Please start verification again.');
  END IF;

  IF round(p_received_amount::numeric, 2) = v_expected THEN
    UPDATE profiles SET
      payout_verified = TRUE,
      payout_verification_attempts = v_attempts + 1
    WHERE id = v_uid;
    RETURN jsonb_build_object('success', true, 'verified', true);
  ELSE
    UPDATE profiles SET payout_verification_attempts = v_attempts + 1 WHERE id = v_uid;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Amount does not match. ' || (2 - v_attempts) || ' attempts remaining.',
      'attempts_remaining', 2 - v_attempts
    );
  END IF;
END;
$$;

-- ============================================================
-- 6. RPC: get payout status (for UI badge)
-- ============================================================
CREATE OR REPLACE FUNCTION get_payout_status()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile RECORD;
BEGIN
  SELECT payout_handle, payout_handle_type, payout_verified,
         payout_verification_sent_at, payout_verification_attempts,
         last_active_at
    INTO v_profile FROM profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'handle', v_profile.payout_handle,
    'handle_type', v_profile.payout_handle_type,
    'verified', COALESCE(v_profile.payout_verified, false),
    'verification_pending', v_profile.payout_verification_sent_at IS NOT NULL
                            AND NOT COALESCE(v_profile.payout_verified, false),
    'verification_sent_at', v_profile.payout_verification_sent_at,
    'attempts', COALESCE(v_profile.payout_verification_attempts, 0),
    'last_active_at', v_profile.last_active_at
  );
END;
$$;

-- ============================================================
-- 7. Update save_auto_redemption_config to require verification
-- ============================================================
CREATE OR REPLACE FUNCTION save_auto_redemption_config(
  p_enabled BOOLEAN,
  p_method TEXT,
  p_threshold_usd NUMERIC,
  p_cashout_payout_id TEXT DEFAULT NULL,
  p_gift_card_brand TEXT DEFAULT NULL,
  p_gift_card_amount_usd NUMERIC DEFAULT NULL,
  p_charity_project_id TEXT DEFAULT NULL,
  p_charity_project_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_verified BOOLEAN;
BEGIN
  IF p_enabled THEN
    -- Validate method-specific config
    IF p_method = 'cashout' THEN
      -- Must have verified payout handle
      SELECT payout_verified INTO v_verified FROM profiles WHERE id = v_uid;
      IF NOT COALESCE(v_verified, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout handle must be verified before enabling auto-withdrawal');
      END IF;
    END IF;
    IF p_method = 'giftcards' THEN
      IF p_gift_card_brand IS NULL OR p_gift_card_brand = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Gift card brand is required');
      END IF;
      IF COALESCE(p_threshold_usd, 0) < 1.00 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Minimum threshold for gift cards is $1.00');
      END IF;
    END IF;
    IF p_method = 'charity' AND (p_charity_project_id IS NULL OR p_charity_project_id = '') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Charity project is required');
    END IF;
  END IF;

  INSERT INTO user_auto_redemption_config (
    user_id, enabled, method, threshold_usd,
    cashout_payout_id, gift_card_brand, gift_card_amount_usd,
    charity_project_id, charity_project_name
  ) VALUES (
    v_uid, p_enabled, p_method, GREATEST(p_threshold_usd, 1.00),
    p_cashout_payout_id, p_gift_card_brand, p_gift_card_amount_usd,
    p_charity_project_id, p_charity_project_name
  )
  ON CONFLICT (user_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    method = EXCLUDED.method,
    threshold_usd = EXCLUDED.threshold_usd,
    cashout_payout_id = EXCLUDED.cashout_payout_id,
    gift_card_brand = EXCLUDED.gift_card_brand,
    gift_card_amount_usd = EXCLUDED.gift_card_amount_usd,
    charity_project_id = EXCLUDED.charity_project_id,
    charity_project_name = EXCLUDED.charity_project_name,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;
