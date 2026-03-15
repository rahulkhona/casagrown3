-- ============================================================================
-- Auto-Redemption Configuration
--
-- Users can configure automatic redemption when their balance exceeds
-- a threshold. The settlement confirmation process checks this and
-- queues redemptions asynchronously.
-- ============================================================================

-- ============================================================
-- 1. User auto-redemption preferences
-- ============================================================
CREATE TABLE user_auto_redemption_config (
  user_id UUID PRIMARY KEY REFERENCES profiles(id),
  enabled BOOLEAN NOT NULL DEFAULT false,
  method TEXT NOT NULL DEFAULT 'cashout' CHECK (method IN ('giftcards', 'charity', 'cashout')),
  threshold_usd NUMERIC(10,2) NOT NULL DEFAULT 50.00 CHECK (threshold_usd >= 5.00),

  -- Method-specific config
  cashout_payout_id TEXT,          -- PayPal email or Venmo phone
  gift_card_brand TEXT,            -- preferred brand name
  gift_card_amount_usd NUMERIC(10,2),  -- preferred denomination
  charity_project_id TEXT,         -- preferred project ID
  charity_project_name TEXT,       -- display name

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_auto_redemption_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own auto-redemption config"
  ON user_auto_redemption_config FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own auto-redemption config"
  ON user_auto_redemption_config FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own auto-redemption config"
  ON user_auto_redemption_config FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 2. Redemption queue — processed asynchronously by CRON/edge fn
-- ============================================================
CREATE TABLE redemption_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  method TEXT NOT NULL CHECK (method IN ('giftcards', 'charity', 'cashout')),
  amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,   -- snapshot of auto-redeem config at queue time
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  error_message TEXT,
  settlement_id UUID REFERENCES market_settlements(id),  -- which settlement triggered this
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE redemption_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own redemption queue"
  ON redemption_queue FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_redemption_queue_status ON redemption_queue (status) WHERE status = 'queued';


-- ============================================================
-- 3. RPC: save_auto_redemption_config
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
BEGIN
  -- Validate method-specific config
  IF p_enabled THEN
    IF p_method = 'cashout' AND (p_cashout_payout_id IS NULL OR p_cashout_payout_id = '') THEN
      RETURN jsonb_build_object('success', false, 'error', 'PayPal/Venmo payout ID is required for cashout');
    END IF;
    IF p_method = 'giftcards' AND (p_gift_card_brand IS NULL OR p_gift_card_brand = '') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Gift card brand is required');
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
    v_uid, p_enabled, p_method, p_threshold_usd,
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


-- ============================================================
-- 4. RPC: get_auto_redemption_config
-- ============================================================
CREATE OR REPLACE FUNCTION get_auto_redemption_config()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_config RECORD;
BEGIN
  SELECT * INTO v_config FROM user_auto_redemption_config WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'enabled', false,
      'method', 'cashout',
      'threshold_usd', 50.00,
      'cashout_payout_id', NULL,
      'gift_card_brand', NULL,
      'gift_card_amount_usd', NULL,
      'charity_project_id', NULL,
      'charity_project_name', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'enabled', v_config.enabled,
    'method', v_config.method,
    'threshold_usd', v_config.threshold_usd,
    'cashout_payout_id', v_config.cashout_payout_id,
    'gift_card_brand', v_config.gift_card_brand,
    'gift_card_amount_usd', v_config.gift_card_amount_usd,
    'charity_project_id', v_config.charity_project_id,
    'charity_project_name', v_config.charity_project_name
  );
END;
$$;
