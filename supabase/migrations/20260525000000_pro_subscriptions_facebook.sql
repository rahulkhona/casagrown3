-- ============================================================================
-- Migration: CasaGrown Pro Subscriptions + Facebook Catalog Integration
--
-- Creates:
--   1. seller_subscriptions — Stripe-managed subscription state
--   2. subscription_promos — Promotional codes for discounts
--   3. Extends platform_fees — Free vs Pro fee tiers
--   4. seller_fb_connections — Facebook OAuth / page connections
--   5. booth_fb_catalogs — Per-booth FB catalog sync config
--   6. product_fb_sync — Product-level sync tracking
--   7. messenger_conversations — Messenger auto-reply tracking
--   8. widget_chat_sessions — Embeddable website widget sessions
--   9. get_seller_fee_rate() — Plan-aware fee lookup
--  10. Updates place_market_order() — Uses get_seller_fee_rate()
--  11. Updates account closure — Cleans up new tables
-- ============================================================================

SET search_path TO public, extensions;

-- ============================================================================
-- 1. seller_subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS seller_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'inactive')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  promo_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT seller_subscriptions_user_id_key UNIQUE (user_id)
);

ALTER TABLE seller_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON seller_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own subscription"
  ON seller_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own subscription"
  ON seller_subscriptions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access on seller_subscriptions"
  ON seller_subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. subscription_promos — REMOVED
-- Subscription discounts are now handled via crm_promo_subscription_discounts
-- (see migration 20260528000000_crm_promo_subscription_discounts.sql)
-- ============================================================================

-- ============================================================================
-- 3. Extend platform_fees with free/pro tiers
-- ============================================================================

ALTER TABLE platform_fees ADD COLUMN IF NOT EXISTS free_fee_pct NUMERIC(5,2);
ALTER TABLE platform_fees ADD COLUMN IF NOT EXISTS pro_fee_pct NUMERIC(5,2);
ALTER TABLE platform_fees ADD COLUMN IF NOT EXISTS pro_sub_price NUMERIC(10,2);
ALTER TABLE platform_fees ADD COLUMN IF NOT EXISTS stripe_fee_handling TEXT DEFAULT 'pass_through';

UPDATE platform_fees
SET free_fee_pct = COALESCE(fees * 100, 10),
    pro_fee_pct = 5
WHERE free_fee_pct IS NULL;

-- ============================================================================
-- 4. seller_fb_connections
-- ============================================================================

CREATE TABLE IF NOT EXISTS seller_fb_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fb_access_token TEXT NOT NULL,
  fb_token_expires_at TIMESTAMPTZ,
  fb_page_id TEXT,
  fb_page_name TEXT,
  fb_page_access_token TEXT,
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'token_expired', 'error')),
  last_sync_at TIMESTAMPTZ,
  last_sync_product_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT seller_fb_connections_user_id_key UNIQUE (user_id)
);

ALTER TABLE seller_fb_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own FB connection"
  ON seller_fb_connections FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own FB connection"
  ON seller_fb_connections FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access on seller_fb_connections"
  ON seller_fb_connections FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 5. booth_fb_catalogs
-- ============================================================================

CREATE TABLE IF NOT EXISTS booth_fb_catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id UUID NOT NULL REFERENCES market_booths(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES seller_fb_connections(id) ON DELETE CASCADE,
  fb_catalog_id TEXT,
  fb_product_set_id TEXT,
  sync_enabled BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booth_fb_catalogs_booth_id_key UNIQUE (booth_id)
);

ALTER TABLE booth_fb_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Booth owners can view FB catalogs"
  ON booth_fb_catalogs FOR SELECT
  TO authenticated
  USING (
    booth_id IN (SELECT id FROM market_booths WHERE owner_id = auth.uid())
  );

CREATE POLICY "Booth owners can manage FB catalogs"
  ON booth_fb_catalogs FOR ALL
  TO authenticated
  USING (
    booth_id IN (SELECT id FROM market_booths WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    booth_id IN (SELECT id FROM market_booths WHERE owner_id = auth.uid())
  );

CREATE POLICY "Service role full access on booth_fb_catalogs"
  ON booth_fb_catalogs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 6. product_fb_sync
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_fb_sync (
  product_id UUID PRIMARY KEY REFERENCES market_products(id) ON DELETE CASCADE,
  seller_sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (seller_sync_status IN ('pending', 'synced', 'error', 'removed')),
  master_sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (master_sync_status IN ('pending', 'synced', 'error', 'removed')),
  seller_synced_at TIMESTAMPTZ,
  master_synced_at TIMESTAMPTZ,
  seller_error TEXT,
  master_error TEXT,
  content_hash TEXT,
  last_inventory_synced INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE product_fb_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Product owners can view sync status"
  ON product_fb_sync FOR SELECT
  TO authenticated
  USING (
    product_id IN (SELECT id FROM market_products WHERE seller_id = auth.uid())
  );

CREATE POLICY "Service role full access on product_fb_sync"
  ON product_fb_sync FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 7. messenger_conversations
-- ============================================================================

CREATE TABLE IF NOT EXISTS messenger_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fb_sender_id TEXT NOT NULL,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0,
  last_product_id UUID REFERENCES market_products(id) ON DELETE SET NULL,
  last_booth_id UUID REFERENCES market_booths(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messenger_conversations_unique UNIQUE (fb_sender_id, seller_id)
);

ALTER TABLE messenger_conversations ENABLE ROW LEVEL SECURITY;

-- Only service_role (edge functions) manage messenger conversations
CREATE POLICY "Service role full access on messenger_conversations"
  ON messenger_conversations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 8. widget_chat_sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS widget_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id UUID NOT NULL REFERENCES market_booths(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_count INTEGER NOT NULL DEFAULT 0,
  visitor_ip TEXT,
  visitor_user_agent TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE widget_chat_sessions ENABLE ROW LEVEL SECURITY;

-- Only service_role (edge functions) manage widget sessions
CREATE POLICY "Service role full access on widget_chat_sessions"
  ON widget_chat_sessions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_widget_chat_sessions_last_message
  ON widget_chat_sessions (last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_widget_chat_sessions_booth
  ON widget_chat_sessions (booth_id);

-- ============================================================================
-- 9. get_seller_fee_rate() — Plan-aware fee lookup
-- ============================================================================

CREATE OR REPLACE FUNCTION get_seller_fee_rate(p_seller_id UUID)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_pro BOOLEAN;
  v_free_rate NUMERIC(5,2);
  v_pro_rate NUMERIC(5,2);
BEGIN
  -- Check if seller has an active Pro subscription
  SELECT EXISTS(
    SELECT 1 FROM seller_subscriptions
    WHERE user_id = p_seller_id
      AND plan = 'pro'
      AND status IN ('active', 'trialing')
  ) INTO v_is_pro;

  -- Get fee rates from platform_fees (latest USA entry)
  SELECT
    COALESCE(free_fee_pct, fees * 100, 10),
    COALESCE(pro_fee_pct, 5)
  INTO v_free_rate, v_pro_rate
  FROM platform_fees
  WHERE country_code = 'USA'
  ORDER BY creation_date DESC
  LIMIT 1;

  -- Safe fallback if platform_fees is empty
  IF v_free_rate IS NULL THEN v_free_rate := 10; END IF;
  IF v_pro_rate IS NULL THEN v_pro_rate := 5; END IF;

  RETURN CASE WHEN v_is_pro THEN v_pro_rate ELSE v_free_rate END;
END;
$$;

-- ============================================================================
-- 10. Update place_market_order() — Use plan-aware fee rate
-- ============================================================================
-- Only change: fee lookup uses get_seller_fee_rate() instead of platform_fees directly

DROP FUNCTION IF EXISTS place_market_order(UUID, INTEGER, TEXT, TEXT, NUMERIC, UUID);

CREATE OR REPLACE FUNCTION place_market_order(
  p_product_id UUID,
  p_quantity INTEGER,
  p_fulfillment_type TEXT,
  p_buyer_zip TEXT DEFAULT NULL,
  p_expected_price NUMERIC DEFAULT NULL,
  p_hold_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product RECORD;
  v_booth RECORD;
  v_buyer_id UUID;
  v_buyer_address TEXT;
  v_tax_rate NUMERIC(7,4) := 0;
  v_subtotal NUMERIC(10,2);
  v_tax_amount NUMERIC(10,2);
  v_fee_rate NUMERIC(5,2);
  v_fee_amount NUMERIC(10,2);
  v_total NUMERIC(10,2);
  v_order_id UUID;
  v_tax_rule RECORD;
  v_cached_rate RECORD;
  v_state_code TEXT;
  v_seller_state_code TEXT;
  v_quarantined BOOLEAN;
  v_hold RECORD;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Verify hold belongs to buyer (if provided)
  IF p_hold_id IS NOT NULL THEN
    SELECT * INTO v_hold
    FROM market_holds
    WHERE id = p_hold_id
      AND buyer_id = v_buyer_id
      AND status = 'active';

    IF v_hold IS NULL THEN
      RETURN jsonb_build_object('error', 'Hold not found or not active');
    END IF;
  END IF;

  -- Lock product row to prevent race conditions
  SELECT * INTO v_product
  FROM market_products
  WHERE id = p_product_id AND is_active
  FOR UPDATE;

  IF v_product IS NULL THEN
    RETURN jsonb_build_object('error', 'Product not found or inactive');
  END IF;

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('error', 'Quantity must be at least 1');
  END IF;

  IF v_product.inventory < p_quantity THEN
    RETURN jsonb_build_object('error', 'Insufficient inventory',
      'available', v_product.inventory, 'requested', p_quantity);
  END IF;

  -- Price mismatch guard
  IF p_expected_price IS NOT NULL AND v_product.price_usd <> p_expected_price THEN
    RETURN jsonb_build_object('error', 'Price has changed',
      'code', 'price_changed',
      'expected_price', p_expected_price,
      'current_price', v_product.price_usd);
  END IF;

  v_subtotal := v_product.price_usd * p_quantity;

  -- *** MULTI-STAND FIX: resolve booth from the product's booth_id ***
  SELECT * INTO v_booth FROM market_booths WHERE id = v_product.booth_id;
  IF v_booth IS NULL THEN
    RETURN jsonb_build_object('error', 'Stand not found');
  END IF;

  -- Cannot buy your own products
  IF v_product.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('error', 'Cannot purchase your own products');
  END IF;

  -- *** QUARANTINE ENFORCEMENT (county-level only) ***
  SELECT EXISTS(
    SELECT 1 FROM quarantine_zones qz
    JOIN profiles seller_p ON seller_p.id = v_product.seller_id
    LEFT JOIN zip_codes seller_z ON seller_z.zip_code = COALESCE(seller_p.zip_code, LEFT(seller_p.zip_plus4, 5))
      AND seller_z.country_iso_3 = COALESCE(seller_p.country_code, 'USA')
    WHERE qz.is_active = true
      AND qz.county_id IS NOT NULL
      AND qz.county_id = seller_z.county_id
      AND qz.starts_at <= CURRENT_DATE
      AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
      AND (qz.category = v_product.category OR qz.category = 'ALL')
  ) INTO v_quarantined;

  IF v_quarantined THEN
    RETURN jsonb_build_object(
      'error', 'This product is in a quarantined category and cannot be purchased at this time.',
      'code', 'quarantined'
    );
  END IF;

  -- Snapshot buyer's delivery address
  SELECT street_address INTO v_buyer_address
  FROM profiles
  WHERE id = v_buyer_id;

  -- *** SAME-STATE ENFORCEMENT ***
  IF p_buyer_zip IS NOT NULL THEN
    SELECT s.code INTO v_state_code
    FROM zip_codes zc
    JOIN cities ci ON ci.id = zc.city_id
    JOIN states s ON s.id = ci.state_id
    WHERE zc.zip_code = p_buyer_zip
    LIMIT 1;
  END IF;

  SELECT s.code INTO v_seller_state_code
  FROM profiles p
  JOIN zip_codes zc ON zc.zip_code = COALESCE(p.zip_code, LEFT(p.zip_plus4, 5))
    AND zc.country_iso_3 = COALESCE(p.country_code, 'USA')
  JOIN cities ci ON ci.id = zc.city_id
  JOIN states s ON s.id = ci.state_id
  WHERE p.id = v_product.seller_id
  LIMIT 1;

  IF v_state_code IS NOT NULL AND v_seller_state_code IS NOT NULL
     AND v_state_code <> v_seller_state_code THEN
    RETURN jsonb_build_object(
      'error', 'Cross-state purchases are not allowed. You can only buy from sellers in your state.',
      'code', 'cross_state',
      'buyer_state', v_state_code,
      'seller_state', v_seller_state_code
    );
  END IF;

  -- Compute tax rate
  IF v_state_code IS NOT NULL AND v_product.category IS NOT NULL THEN
    SELECT * INTO v_tax_rule
    FROM category_tax_rules
    WHERE state_code = v_state_code
      AND category_name = v_product.category
      AND effective_until IS NULL
    LIMIT 1;

    IF v_tax_rule IS NOT NULL THEN
      IF v_tax_rule.rule_type = 'fixed' THEN
        v_tax_rate := COALESCE(v_tax_rule.rate_pct, 0);
      ELSE
        SELECT * INTO v_cached_rate
        FROM zip_tax_cache
        WHERE zip_code = p_buyer_zip
          AND expires_at > now();

        IF v_cached_rate IS NOT NULL THEN
          v_tax_rate := v_cached_rate.combined_rate;
        ELSE
          v_tax_rate := 0;
        END IF;
      END IF;
    END IF;
  END IF;

  v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);

  -- *** PRO SUBSCRIPTION: Plan-aware platform fee ***
  v_fee_rate := get_seller_fee_rate(v_product.seller_id);

  v_fee_amount := ROUND(v_subtotal * v_fee_rate / 100, 2);
  v_total := v_subtotal + v_tax_amount;

  -- Decrement inventory
  UPDATE market_products
  SET inventory = inventory - p_quantity,
      updated_at = now()
  WHERE id = p_product_id;

  -- Insert order (with hold_id if provided)
  INSERT INTO market_orders (
    buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd,
    tax_rate_pct, tax_amount_usd,
    platform_fee_pct, platform_fee_usd,
    total_usd, fulfillment_type, status,
    delivery_address, hold_id
  ) VALUES (
    v_buyer_id, v_booth.owner_id, v_booth.id, p_product_id, v_product.name,
    p_quantity, v_product.price_usd, v_subtotal,
    v_tax_rate, v_tax_amount,
    v_fee_rate, v_fee_amount,
    v_total, p_fulfillment_type, 'pending',
    CASE WHEN p_fulfillment_type = 'delivery' THEN v_buyer_address ELSE NULL END,
    p_hold_id
  )
  RETURNING id INTO v_order_id;

  -- Update hold spent amount (if hold provided)
  IF p_hold_id IS NOT NULL THEN
    UPDATE market_holds
    SET spent_amount_cents = spent_amount_cents + (v_total * 100)::INTEGER,
        updated_at = now()
    WHERE id = p_hold_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'subtotal_usd', v_subtotal,
    'tax_rate_pct', v_tax_rate,
    'tax_amount_usd', v_tax_amount,
    'platform_fee_pct', v_fee_rate,
    'platform_fee_usd', v_fee_amount,
    'total_usd', v_total,
    'total_cents', (v_total * 100)::INTEGER,
    'product_name', v_product.name,
    'remaining_inventory', v_product.inventory - p_quantity
  );
END;
$$;

-- ============================================================================
-- 11. Update account closure — Clean up new tables
-- ============================================================================

-- 11a. Fast-path delete (zero-footprint users)
CREATE OR REPLACE FUNCTION execute_fast_path_delete(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Verify user exists and is not already closed
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;
  IF v_profile.closure_status IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Account already in closure process');
  END IF;

  -- Verify eligibility
  IF NOT check_fast_path_eligible(p_user_id) THEN
    RETURN jsonb_build_object('error', 'User has footprint — use phase-based closure instead');
  END IF;

  -- ── Booth & Catalog cleanup ──

  -- 1a. Revoke/delete helper relationships on user's booths
  ALTER TABLE booth_helpers DISABLE TRIGGER trg_booth_helper_status;

  DELETE FROM booth_helpers
  WHERE booth_id IN (SELECT id FROM market_booths WHERE owner_id = p_user_id)
     OR helper_id = p_user_id;

  ALTER TABLE booth_helpers ENABLE TRIGGER trg_booth_helper_status;

  -- 1b. Delete fulfillment windows for user's booths
  DELETE FROM booth_fulfillment_windows
  WHERE booth_id IN (SELECT id FROM market_booths WHERE owner_id = p_user_id);

  -- 1c. Delete followers of user's booths
  DELETE FROM market_followers
  WHERE booth_id IN (SELECT id FROM market_booths WHERE owner_id = p_user_id);

  -- 1d. Delete user's own follows
  DELETE FROM market_followers WHERE follower_id = p_user_id;

  -- ── Pro / Facebook cleanup (NEW) ──
  DELETE FROM widget_chat_sessions WHERE booth_id IN (SELECT id FROM market_booths WHERE owner_id = p_user_id);
  DELETE FROM messenger_conversations WHERE seller_id = p_user_id;
  DELETE FROM product_fb_sync WHERE product_id IN (SELECT id FROM market_products WHERE seller_id = p_user_id);
  DELETE FROM booth_fb_catalogs WHERE booth_id IN (SELECT id FROM market_booths WHERE owner_id = p_user_id);
  DELETE FROM seller_fb_connections WHERE user_id = p_user_id;
  DELETE FROM seller_subscriptions WHERE user_id = p_user_id;

  -- 1e. Delete catalog items
  DELETE FROM catalog_items WHERE owner_id = p_user_id;

  -- 1f. Delete booths
  DELETE FROM market_booths WHERE owner_id = p_user_id;

  -- ── Original cleanup ──
  DELETE FROM point_ledger WHERE user_id = p_user_id;
  DELETE FROM grower_produces WHERE user_id = p_user_id;
  DELETE FROM notifications WHERE user_id = p_user_id;
  DELETE FROM market_notifications WHERE user_id = p_user_id;
  DELETE FROM growbot_shared_responses WHERE user_id = p_user_id;
  DELETE FROM community_chat_reactions WHERE user_id = p_user_id;
  DELETE FROM user_balances WHERE user_id = p_user_id;
  DELETE FROM user_garden WHERE user_id = p_user_id;
  DELETE FROM referral_touches WHERE user_id = p_user_id;
  DELETE FROM push_subscriptions WHERE user_id = p_user_id;

  -- Delete growbot conversation config if table exists
  BEGIN
    EXECUTE 'DELETE FROM growbot_conversations WHERE user_id = $1' USING p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- Delete auto-redemption config if table exists
  BEGIN
    EXECUTE 'DELETE FROM user_auto_redemption_config WHERE user_id = $1' USING p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- Delete profile (will be blocked if FK references remain)
  DELETE FROM profiles WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'path', 'fast_delete');
END;
$$;

-- 11b. Phase-1 freeze (users with financial/social history)
CREATE OR REPLACE FUNCTION execute_phase_1_freeze(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile RECORD;
  v_cancelled_orders INTEGER;
  v_escalated_disputes INTEGER;
  v_revoked_helpers INTEGER;
  v_deleted_polls INTEGER;
  v_archived_booths INTEGER;
BEGIN
  -- Verify user exists and is not already closed
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;
  IF v_profile.closure_status IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Account already in closure process: ' || v_profile.closure_status);
  END IF;

  -- ── Lock email before any other changes ──
  INSERT INTO closed_emails (email, original_user_id)
  VALUES (lower(v_profile.email), p_user_id)
  ON CONFLICT (email) DO NOTHING;

  -- Obfuscate email in auth.users AND auth.identities
  UPDATE auth.users
  SET email = 'deleted_' || p_user_id || '@closed.local',
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('original_email', email),
      banned_until = '2099-12-31'::timestamptz,
      updated_at = now()
  WHERE id = p_user_id;

  UPDATE auth.identities
  SET identity_data = identity_data || jsonb_build_object('email', 'deleted_' || p_user_id || '@closed.local'),
      updated_at = now()
  WHERE user_id = p_user_id;

  -- 1. Set closure_status = 'frozen'
  UPDATE profiles
  SET closure_status = 'frozen',
      full_name = 'Deleted User',
      avatar_url = NULL,
      updated_at = now()
  WHERE id = p_user_id;

  -- 2a. Clean up system-generated community posts for products being deleted
  DELETE FROM community_chat_messages
  WHERE is_system = true
    AND product_listing_id IN (
      SELECT id FROM market_products
      WHERE seller_id = p_user_id
        AND NOT EXISTS (SELECT 1 FROM market_orders WHERE product_id = market_products.id)
    );

  -- 2b. Hard-delete products with NO associated orders (no audit trail needed)
  DELETE FROM market_products
  WHERE seller_id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM market_orders WHERE product_id = market_products.id);

  -- 2c. Deactivate products WITH orders (retain for food safety traceability)
  UPDATE market_products SET is_active = false, updated_at = now()
  WHERE seller_id = p_user_id AND is_active = true;

  -- 3. Cancel pending/confirmed orders (as seller AND buyer)
  WITH cancelled AS (
    UPDATE market_orders SET status = 'cancelled'::market_order_status, updated_at = now()
    WHERE (seller_id = p_user_id OR buyer_id = p_user_id)
      AND status IN ('pending'::market_order_status, 'confirmed'::market_order_status)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_cancelled_orders FROM cancelled;

  -- 4. Escalate active disputes on seller's orders
  WITH escalated AS (
    UPDATE order_disputes SET status = 'escalated'::dispute_status, updated_at = now()
    WHERE order_id IN (
      SELECT id FROM market_orders WHERE seller_id = p_user_id
    ) AND status IN ('open'::dispute_status, 'seller_responded'::dispute_status)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_escalated_disputes FROM escalated;

  UPDATE market_orders SET status = 'escalated'::market_order_status, updated_at = now()
  WHERE id IN (
    SELECT order_id FROM order_disputes
    WHERE order_id IN (SELECT id FROM market_orders WHERE seller_id = p_user_id)
      AND status = 'escalated'::dispute_status
  ) AND status = 'disputed'::market_order_status;

  -- 5. Revoke all helper relationships (both directions)
  ALTER TABLE booth_helpers DISABLE TRIGGER trg_booth_helper_status;

  WITH revoked AS (
    UPDATE booth_helpers SET status = 'revoked', updated_at = now()
    WHERE (
      booth_id IN (SELECT id FROM market_booths WHERE owner_id = p_user_id)
      OR helper_id = p_user_id
    )
    AND status IN ('pending', 'accepted')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_revoked_helpers FROM revoked;

  ALTER TABLE booth_helpers ENABLE TRIGGER trg_booth_helper_status;

  -- ── Pro / Facebook cleanup (NEW) ──
  DELETE FROM widget_chat_sessions WHERE booth_id IN (SELECT id FROM market_booths WHERE owner_id = p_user_id);
  DELETE FROM messenger_conversations WHERE seller_id = p_user_id;
  DELETE FROM product_fb_sync WHERE product_id IN (SELECT id FROM market_products WHERE seller_id = p_user_id);
  DELETE FROM booth_fb_catalogs WHERE booth_id IN (SELECT id FROM market_booths WHERE owner_id = p_user_id);
  DELETE FROM seller_fb_connections WHERE user_id = p_user_id;
  -- Keep seller_subscriptions for billing records (Stripe needs them)
  UPDATE seller_subscriptions SET status = 'canceled', canceled_at = now() WHERE user_id = p_user_id;

  -- ── Booth & Catalog cleanup ──

  -- 6a. Archive all user's booths (keep for order history references)
  WITH archived AS (
    UPDATE market_booths SET is_open = false, updated_at = now()
    WHERE owner_id = p_user_id AND is_open = true
    RETURNING id
  )
  SELECT COUNT(*) INTO v_archived_booths FROM archived;

  -- 6b. Delete catalog items (templates, no audit trail needed)
  DELETE FROM catalog_items WHERE owner_id = p_user_id;

  -- 6c. Delete fulfillment windows (no longer needed)
  DELETE FROM booth_fulfillment_windows
  WHERE booth_id IN (SELECT id FROM market_booths WHERE owner_id = p_user_id);

  -- ── Original cleanup continued ──

  -- 7. Anonymize poll participation
  UPDATE growbot_response_votes
  SET voter_key = 'deleted_user'
  WHERE voter_key = p_user_id::text;

  UPDATE growbot_response_suggestions
  SET voter_key = 'deleted_user'
  WHERE voter_key = p_user_id::text;

  -- 8. Delete GrowBot polls they created
  WITH deleted_polls AS (
    DELETE FROM growbot_shared_responses WHERE user_id = p_user_id
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_polls FROM deleted_polls;

  -- 9. Remove followers of user's booths
  DELETE FROM market_followers
  WHERE booth_id IN (SELECT id FROM market_booths WHERE owner_id = p_user_id);

  -- 10. Remove user's own follows
  DELETE FROM market_followers
  WHERE follower_id = p_user_id;

  -- 11. Clear notifications
  DELETE FROM notifications WHERE user_id = p_user_id;
  DELETE FROM market_notifications WHERE user_id = p_user_id;

  -- 12. Remove push subscriptions
  DELETE FROM push_subscriptions WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'cancelled_orders', v_cancelled_orders,
    'escalated_disputes', v_escalated_disputes,
    'revoked_helpers', v_revoked_helpers,
    'deleted_polls', v_deleted_polls,
    'archived_booths', v_archived_booths
  );
END;
$$;

-- ============================================================================
-- 12. Phase 1 Schema Additions — Pro Enhancements
-- ============================================================================

-- 12a. Tag orders with the seller's plan at time of placement
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS seller_plan TEXT DEFAULT 'free';

-- 12b. Per-booth bot instructions (custom context for AI bot)
ALTER TABLE market_booths ADD COLUMN IF NOT EXISTS bot_instructions TEXT;

-- 12c. Seller biography (overall business context for bot)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS seller_bio TEXT;

-- 12d. Bot message flag on chat tables
ALTER TABLE order_chat_messages ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT false;
ALTER TABLE market_chat_messages ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT false;

-- 12e. Stripe fee absorption flag (Pro pricing flexibility)
ALTER TABLE seller_subscriptions ADD COLUMN IF NOT EXISTS absorb_stripe_fees BOOLEAN DEFAULT false;

-- ============================================================================
-- 13. Update place_market_order() — Tag orders with seller_plan
-- ============================================================================

-- Re-create to add seller_plan tagging
DROP FUNCTION IF EXISTS place_market_order(UUID, INTEGER, TEXT, TEXT, NUMERIC, UUID);

CREATE OR REPLACE FUNCTION place_market_order(
  p_product_id UUID,
  p_quantity INTEGER,
  p_fulfillment_type TEXT,
  p_buyer_zip TEXT DEFAULT NULL,
  p_expected_price NUMERIC DEFAULT NULL,
  p_hold_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product RECORD;
  v_booth RECORD;
  v_buyer_id UUID;
  v_buyer_address TEXT;
  v_tax_rate NUMERIC(7,4) := 0;
  v_subtotal NUMERIC(10,2);
  v_tax_amount NUMERIC(10,2);
  v_fee_rate NUMERIC(5,2);
  v_fee_amount NUMERIC(10,2);
  v_total NUMERIC(10,2);
  v_order_id UUID;
  v_tax_rule RECORD;
  v_cached_rate RECORD;
  v_state_code TEXT;
  v_seller_state_code TEXT;
  v_quarantined BOOLEAN;
  v_hold RECORD;
  v_seller_plan TEXT;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Verify hold belongs to buyer (if provided)
  IF p_hold_id IS NOT NULL THEN
    SELECT * INTO v_hold
    FROM market_holds
    WHERE id = p_hold_id
      AND buyer_id = v_buyer_id
      AND status = 'active';

    IF v_hold IS NULL THEN
      RETURN jsonb_build_object('error', 'Hold not found or not active');
    END IF;
  END IF;

  -- Lock product row to prevent race conditions
  SELECT * INTO v_product
  FROM market_products
  WHERE id = p_product_id AND is_active
  FOR UPDATE;

  IF v_product IS NULL THEN
    RETURN jsonb_build_object('error', 'Product not found or inactive');
  END IF;

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('error', 'Quantity must be at least 1');
  END IF;

  IF v_product.inventory < p_quantity THEN
    RETURN jsonb_build_object('error', 'Insufficient inventory',
      'available', v_product.inventory, 'requested', p_quantity);
  END IF;

  -- Price mismatch guard
  IF p_expected_price IS NOT NULL AND v_product.price_usd <> p_expected_price THEN
    RETURN jsonb_build_object('error', 'Price has changed',
      'code', 'price_changed',
      'expected_price', p_expected_price,
      'current_price', v_product.price_usd);
  END IF;

  v_subtotal := v_product.price_usd * p_quantity;

  -- *** MULTI-STAND FIX: resolve booth from the product's booth_id ***
  SELECT * INTO v_booth FROM market_booths WHERE id = v_product.booth_id;
  IF v_booth IS NULL THEN
    RETURN jsonb_build_object('error', 'Stand not found');
  END IF;

  -- Cannot buy your own products
  IF v_product.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('error', 'Cannot purchase your own products');
  END IF;

  -- *** QUARANTINE ENFORCEMENT (county-level only) ***
  SELECT EXISTS(
    SELECT 1 FROM quarantine_zones qz
    JOIN profiles seller_p ON seller_p.id = v_product.seller_id
    LEFT JOIN zip_codes seller_z ON seller_z.zip_code = COALESCE(seller_p.zip_code, LEFT(seller_p.zip_plus4, 5))
      AND seller_z.country_iso_3 = COALESCE(seller_p.country_code, 'USA')
    WHERE qz.is_active = true
      AND qz.county_id IS NOT NULL
      AND qz.county_id = seller_z.county_id
      AND qz.starts_at <= CURRENT_DATE
      AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
      AND (qz.category = v_product.category OR qz.category = 'ALL')
  ) INTO v_quarantined;

  IF v_quarantined THEN
    RETURN jsonb_build_object(
      'error', 'This product is in a quarantined category and cannot be purchased at this time.',
      'code', 'quarantined'
    );
  END IF;

  -- Snapshot buyer's delivery address
  SELECT street_address INTO v_buyer_address
  FROM profiles
  WHERE id = v_buyer_id;

  -- *** SAME-STATE ENFORCEMENT ***
  IF p_buyer_zip IS NOT NULL THEN
    SELECT s.code INTO v_state_code
    FROM zip_codes zc
    JOIN cities ci ON ci.id = zc.city_id
    JOIN states s ON s.id = ci.state_id
    WHERE zc.zip_code = p_buyer_zip
    LIMIT 1;
  END IF;

  SELECT s.code INTO v_seller_state_code
  FROM profiles p
  JOIN zip_codes zc ON zc.zip_code = COALESCE(p.zip_code, LEFT(p.zip_plus4, 5))
    AND zc.country_iso_3 = COALESCE(p.country_code, 'USA')
  JOIN cities ci ON ci.id = zc.city_id
  JOIN states s ON s.id = ci.state_id
  WHERE p.id = v_product.seller_id
  LIMIT 1;

  IF v_state_code IS NOT NULL AND v_seller_state_code IS NOT NULL
     AND v_state_code <> v_seller_state_code THEN
    RETURN jsonb_build_object(
      'error', 'Cross-state purchases are not allowed. You can only buy from sellers in your state.',
      'code', 'cross_state',
      'buyer_state', v_state_code,
      'seller_state', v_seller_state_code
    );
  END IF;

  -- Compute tax rate
  IF v_state_code IS NOT NULL AND v_product.category IS NOT NULL THEN
    SELECT * INTO v_tax_rule
    FROM category_tax_rules
    WHERE state_code = v_state_code
      AND category_name = v_product.category
      AND effective_until IS NULL
    LIMIT 1;

    IF v_tax_rule IS NOT NULL THEN
      IF v_tax_rule.rule_type = 'fixed' THEN
        v_tax_rate := COALESCE(v_tax_rule.rate_pct, 0);
      ELSE
        SELECT * INTO v_cached_rate
        FROM zip_tax_cache
        WHERE zip_code = p_buyer_zip
          AND expires_at > now();

        IF v_cached_rate IS NOT NULL THEN
          v_tax_rate := v_cached_rate.combined_rate;
        ELSE
          v_tax_rate := 0;
        END IF;
      END IF;
    END IF;
  END IF;

  v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);

  -- *** PRO SUBSCRIPTION: Plan-aware platform fee ***
  v_fee_rate := get_seller_fee_rate(v_product.seller_id);

  -- Determine seller plan for order tagging
  v_seller_plan := CASE WHEN v_fee_rate <= 5 THEN 'pro' ELSE 'free' END;

  v_fee_amount := ROUND(v_subtotal * v_fee_rate / 100, 2);
  v_total := v_subtotal + v_tax_amount;

  -- Decrement inventory
  UPDATE market_products
  SET inventory = inventory - p_quantity,
      updated_at = now()
  WHERE id = p_product_id;

  -- Insert order (with hold_id if provided)
  INSERT INTO market_orders (
    buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd,
    tax_rate_pct, tax_amount_usd,
    platform_fee_pct, platform_fee_usd,
    total_usd, fulfillment_type, status,
    delivery_address, hold_id, seller_plan
  ) VALUES (
    v_buyer_id, v_booth.owner_id, v_booth.id, p_product_id, v_product.name,
    p_quantity, v_product.price_usd, v_subtotal,
    v_tax_rate, v_tax_amount,
    v_fee_rate, v_fee_amount,
    v_total, p_fulfillment_type, 'pending',
    CASE WHEN p_fulfillment_type = 'delivery' THEN v_buyer_address ELSE NULL END,
    p_hold_id, v_seller_plan
  )
  RETURNING id INTO v_order_id;

  -- Update hold spent amount (if hold provided)
  IF p_hold_id IS NOT NULL THEN
    UPDATE market_holds
    SET spent_amount_cents = spent_amount_cents + (v_total * 100)::INTEGER,
        updated_at = now()
    WHERE id = p_hold_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'subtotal_usd', v_subtotal,
    'tax_rate_pct', v_tax_rate,
    'tax_amount_usd', v_tax_amount,
    'platform_fee_pct', v_fee_rate,
    'platform_fee_usd', v_fee_amount,
    'total_usd', v_total,
    'total_cents', (v_total * 100)::INTEGER,
    'product_name', v_product.name,
    'remaining_inventory', v_product.inventory - p_quantity,
    'seller_plan', v_seller_plan
  );
END;
$$;
