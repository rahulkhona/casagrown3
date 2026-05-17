-- ============================================================================
-- Account Closure — Two-Phase Deletion with Fast-Path for Zero-Footprint Users
-- ============================================================================

-- 1. Add closure_status column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS closure_status TEXT
  CHECK (closure_status IN ('frozen', 'closed'));

CREATE INDEX IF NOT EXISTS idx_profiles_closure_status
  ON profiles(closure_status) WHERE closure_status IS NOT NULL;

-- ============================================================================
-- 2. Pre-deletion Preflight — returns counts for the warning UI
-- ============================================================================
CREATE OR REPLACE FUNCTION get_closure_preflight(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_open_orders INTEGER;
  v_available NUMERIC(10,2);
  v_pending NUMERIC(10,2);
  v_disputes INTEGER;
  v_queued_payouts INTEGER;
  v_has_community_footprint BOOLEAN;
  v_is_fast_path BOOLEAN;
BEGIN
  -- Open orders (as buyer or seller)
  SELECT COUNT(*) INTO v_open_orders
  FROM market_orders
  WHERE (buyer_id = p_user_id OR seller_id = p_user_id)
    AND status IN ('pending'::market_order_status, 'confirmed'::market_order_status);

  -- Balance
  SELECT COALESCE(available_usd, 0), COALESCE(pending_usd, 0)
  INTO v_available, v_pending
  FROM user_balances
  WHERE user_id = p_user_id;

  v_available := COALESCE(v_available, 0);
  v_pending := COALESCE(v_pending, 0);

  -- Active disputes
  SELECT COUNT(*) INTO v_disputes
  FROM order_disputes d
  JOIN market_orders o ON o.id = d.order_id
  WHERE (o.buyer_id = p_user_id OR o.seller_id = p_user_id)
    AND d.status IN ('open', 'seller_responded', 'escalated');

  -- Queued payouts
  SELECT COUNT(*) INTO v_queued_payouts
  FROM redemption_queue
  WHERE user_id = p_user_id
    AND status IN ('queued', 'processing');

  -- Community footprint: posts, DMs, orders, products, votes
  v_is_fast_path := check_fast_path_eligible(p_user_id);
  v_has_community_footprint := NOT v_is_fast_path;

  RETURN jsonb_build_object(
    'open_orders', v_open_orders,
    'available_usd', v_available,
    'pending_usd', v_pending,
    'active_disputes', v_disputes,
    'queued_payouts', v_queued_payouts,
    'has_pending_business', (v_open_orders > 0 OR v_available > 0 OR v_pending > 0 OR v_disputes > 0 OR v_queued_payouts > 0),
    'has_community_footprint', v_has_community_footprint,
    'is_fast_path', v_is_fast_path
  );
END;
$$;

-- ============================================================================
-- 3. Fast-Path Eligibility Check
-- ============================================================================
CREATE OR REPLACE FUNCTION check_fast_path_eligible(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN NOT EXISTS (SELECT 1 FROM market_orders WHERE buyer_id = p_user_id OR seller_id = p_user_id)
    AND NOT EXISTS (SELECT 1 FROM community_chat_messages WHERE author_id = p_user_id)
    AND NOT EXISTS (SELECT 1 FROM growbot_response_votes WHERE voter_key = p_user_id::text)
    AND NOT EXISTS (SELECT 1 FROM market_conversations WHERE participant_a = p_user_id OR participant_b = p_user_id)
    AND NOT EXISTS (SELECT 1 FROM market_products WHERE seller_id = p_user_id)
    AND NOT EXISTS (SELECT 1 FROM user_balances WHERE user_id = p_user_id AND (available_usd > 0 OR pending_usd > 0));
END;
$$;

-- ============================================================================
-- 4. Fast-Path Delete — complete hard delete for zero-footprint users
-- ============================================================================
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

  -- Hard delete all related data
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

  -- Delete profile (will be blocked if FK references remain — which shouldn't happen for fast-path users)
  DELETE FROM profiles WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'path', 'fast_delete');
END;
$$;

-- ============================================================================
-- 5. Phase 1 Freeze — for users with financial/social footprint
-- ============================================================================
CREATE OR REPLACE FUNCTION execute_phase_1_freeze(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile RECORD;
  v_cancelled_orders INTEGER;
  v_escalated_disputes INTEGER;
  v_revoked_helpers INTEGER;
  v_deleted_polls INTEGER;
BEGIN
  -- Verify user exists and is not already in closure
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;
  IF v_profile.closure_status IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Account already in closure process: ' || v_profile.closure_status);
  END IF;

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

  -- Also update order status for escalated disputes
  UPDATE market_orders SET status = 'escalated'::market_order_status, updated_at = now()
  WHERE id IN (
    SELECT order_id FROM order_disputes
    WHERE order_id IN (SELECT id FROM market_orders WHERE seller_id = p_user_id)
      AND status = 'escalated'::dispute_status
  ) AND status = 'disputed'::market_order_status;

  -- 5. Revoke all helper relationships (both directions)
  -- Disable the status-notify trigger to prevent notification failures
  -- from aborting the revocation (the helper user's notification URL may be null)
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

  -- 6. Anonymize poll participation (BEFORE deleting polls to avoid cascade-deleting votes)
  UPDATE growbot_response_votes
  SET voter_key = 'deleted_user'
  WHERE voter_key = p_user_id::text;

  UPDATE growbot_response_suggestions
  SET voter_key = 'deleted_user'
  WHERE voter_key = p_user_id::text;

  -- 7. Delete GrowBot polls they created (votes on THESE polls cascade-delete)
  WITH deleted_polls AS (
    DELETE FROM growbot_shared_responses WHERE user_id = p_user_id
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_polls FROM deleted_polls;

  -- 8. Delete push subscriptions (no more notifications)
  DELETE FROM push_subscriptions WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'path', 'phase_1_freeze',
    'cancelled_orders', v_cancelled_orders,
    'escalated_disputes', v_escalated_disputes,
    'revoked_helpers', v_revoked_helpers,
    'deleted_polls', v_deleted_polls
  );
END;
$$;

-- ============================================================================
-- 6. Phase 2 Settlement Processor — called by cron to finalize frozen accounts
-- ============================================================================
CREATE OR REPLACE FUNCTION process_frozen_account_settlements()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user RECORD;
  v_processed INTEGER := 0;
  v_settled INTEGER := 0;
  v_pending INTEGER := 0;
  v_has_auto BOOLEAN;
BEGIN
  FOR v_user IN
    SELECT p.id, p.email,
      COALESCE(ub.available_usd, 0) AS available_usd,
      COALESCE(ub.pending_usd, 0) AS pending_usd
    FROM profiles p
    LEFT JOIN user_balances ub ON ub.user_id = p.id
    WHERE p.closure_status = 'frozen'
  LOOP
    v_processed := v_processed + 1;

    -- Check if settlement is complete
    IF v_user.available_usd = 0 AND v_user.pending_usd = 0
      AND NOT EXISTS (
        SELECT 1 FROM redemption_queue
        WHERE user_id = v_user.id AND status IN ('queued', 'processing')
      )
      AND NOT EXISTS (
        SELECT 1 FROM buyer_debts
        WHERE buyer_id = v_user.id AND status = 'outstanding'
      )
    THEN
      -- Fully settled — finalize closure
      UPDATE profiles SET closure_status = 'closed', updated_at = now()
      WHERE id = v_user.id;

      -- Clean up non-essential data
      DELETE FROM notifications WHERE user_id = v_user.id;
      DELETE FROM market_notifications WHERE user_id = v_user.id;
      DELETE FROM grower_produces WHERE user_id = v_user.id;
      DELETE FROM community_chat_reactions WHERE user_id = v_user.id;
      DELETE FROM community_chat_flags WHERE user_id = v_user.id;

      -- Delete growbot conversations if table exists
      BEGIN
        EXECUTE 'DELETE FROM growbot_conversations WHERE user_id = $1' USING v_user.id;
      EXCEPTION WHEN undefined_table THEN NULL;
      END;

      -- Delete auto-redemption config if table exists
      BEGIN
        EXECUTE 'DELETE FROM user_auto_redemption_config WHERE user_id = $1' USING v_user.id;
      EXCEPTION WHEN undefined_table THEN NULL;
      END;

      v_settled := v_settled + 1;
    ELSE
      -- Still has pending business — check if we need to trigger a payout
      IF v_user.available_usd > 0 THEN
        -- Check if auto-payout is configured
        BEGIN
          SELECT EXISTS(
            SELECT 1 FROM user_auto_redemption_config
            WHERE user_id = v_user.id AND enabled = true
          ) INTO v_has_auto;
        EXCEPTION WHEN undefined_table THEN
          v_has_auto := false;
        END;

        IF NOT v_has_auto THEN
          -- No auto-payout — queue a manual check payout if not already queued
          IF NOT EXISTS (
            SELECT 1 FROM redemption_queue
            WHERE user_id = v_user.id AND status IN ('queued', 'processing')
              AND config->>'closure_payout' = 'true'
          ) THEN
            INSERT INTO redemption_queue (user_id, amount_usd, method, status, config)
            VALUES (
              v_user.id,
              v_user.available_usd,
              'cashout',
              'queued',
              jsonb_build_object(
                'closure_payout', 'true',
                'email', v_user.email,
                'reason', 'Account closure final payout'
              )
            );
          END IF;
        END IF;
      END IF;

      v_pending := v_pending + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'settled', v_settled,
    'pending', v_pending
  );
END;
$$;

-- ============================================================================
-- 6b. Expired Product Cleanup — deletes stale products with no orders
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_products()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- 1. Clean up system-generated community posts for products being deleted
  DELETE FROM community_chat_messages
  WHERE is_system = true
    AND product_listing_id IN (
      SELECT id FROM market_products p
      WHERE p.is_active = false
        AND p.updated_at < now() - interval '3 months'
        AND NOT EXISTS (SELECT 1 FROM market_orders WHERE product_id = p.id)
    );

  -- 2. Delete products that:
  -- a. Have been inactive/expired for 3+ months
  -- b. Have ZERO associated orders (no audit trail needed)
  WITH deleted AS (
    DELETE FROM market_products p
    WHERE p.is_active = false
      AND p.updated_at < now() - interval '3 months'
      AND NOT EXISTS (SELECT 1 FROM market_orders WHERE product_id = p.id)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

-- ============================================================================
-- 7. Proactive Dispute Escalation — modify buyer_dispute_order
-- ============================================================================
CREATE OR REPLACE FUNCTION buyer_dispute_order(
  p_order_id UUID,
  p_reason TEXT,
  p_photos JSONB DEFAULT '[]',
  p_dispute_type TEXT DEFAULT NULL,
  p_quantity_received INTEGER DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_dispute_id UUID;
  v_chat_body TEXT;
  v_rec RECORD;
  v_seller_status TEXT;
  v_dispute_status dispute_status := 'open';
  v_order_status market_order_status := 'disputed';
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'delivered'::market_order_status THEN RETURN jsonb_build_object('error', 'Can only dispute delivered orders'); END IF;

  -- Check if seller's account is frozen/closed → auto-escalate
  SELECT closure_status INTO v_seller_status FROM profiles WHERE id = v_order.seller_id;
  IF v_seller_status IN ('frozen', 'closed') THEN
    v_dispute_status := 'escalated';
    v_order_status := 'escalated';
  END IF;

  -- Status change → trg_market_order_status_notify fires automatically
  UPDATE market_orders SET status = v_order_status, updated_at = now() WHERE id = p_order_id;

  INSERT INTO order_disputes (order_id, initiated_by, reason, photos, dispute_type, quantity_received, status)
  VALUES (p_order_id, auth.uid(), p_reason, p_photos, p_dispute_type, p_quantity_received, v_dispute_status)
  RETURNING id INTO v_dispute_id;

  -- Inject into chat feed
  v_chat_body := '⚠️ Dispute filed';
  IF p_dispute_type IS NOT NULL THEN
    v_chat_body := v_chat_body || ' (' || REPLACE(p_dispute_type, '_', ' ') || ')';
  END IF;
  v_chat_body := v_chat_body || ': ' || p_reason;
  IF v_seller_status IN ('frozen', 'closed') THEN
    v_chat_body := v_chat_body || chr(10) || '📌 Auto-escalated — seller account is inactive.';
  END IF;
  IF jsonb_array_length(p_photos) > 0 THEN
    FOR v_rec IN SELECT * FROM jsonb_array_elements(p_photos) LOOP
      IF v_rec.value->>'url' IS NOT NULL THEN
        v_chat_body := v_chat_body || chr(10) || (v_rec.value->>'url');
      END IF;
    END LOOP;
  END IF;

  INSERT INTO order_chat_messages (order_id, sender_id, content)
  VALUES (p_order_id, auth.uid(), v_chat_body);

  RETURN jsonb_build_object(
    'success', true,
    'dispute_id', v_dispute_id,
    'auto_escalated', v_seller_status IN ('frozen', 'closed')
  );
END;
$$;

-- ============================================================================
-- 8. Marketplace Exclusion — hide frozen/closed sellers from browse
-- ============================================================================

-- Override nearby_booths to exclude frozen/closed sellers
CREATE OR REPLACE FUNCTION nearby_booths(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  max_miles DOUBLE PRECISION DEFAULT 25,
  fulfillment_filter TEXT DEFAULT 'all',
  product_search TEXT DEFAULT NULL
)
RETURNS TABLE(
  booth_id UUID,
  owner_id UUID,
  booth_name TEXT,
  description TEXT,
  decorative_theme TEXT,
  header_image_url TEXT,
  offers_delivery BOOLEAN,
  offers_pickup BOOLEAN,
  delivery_radius_miles INTEGER,
  pickup_address TEXT,
  delivery_windows JSONB,
  pickup_windows JSONB,
  distance_miles DOUBLE PRECISION,
  product_count BIGINT,
  matched_products JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  user_point geometry;
BEGIN
  user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326);

  RETURN QUERY
  WITH booth_distances AS (
    SELECT
      b.id,
      b.owner_id,
      b.name,
      b.description,
      b.decorative_theme,
      b.header_image_url,
      b.offers_delivery,
      b.offers_pickup,
      b.delivery_radius_miles,
      b.pickup_address,
      b.delivery_windows,
      b.pickup_windows,
      ST_Distance(b.pickup_location::geography, user_point::geography) / 1609.34 AS dist_miles
    FROM market_booths b
    -- Exclude frozen/closed sellers
    JOIN profiles pr ON pr.id = b.owner_id AND pr.closure_status IS NULL
    WHERE b.pickup_location IS NOT NULL
      AND ST_DWithin(
        b.pickup_location::geography,
        user_point::geography,
        max_miles * 1609.34
      )
  ),
  filtered AS (
    SELECT bd.*
    FROM booth_distances bd
    WHERE
      CASE fulfillment_filter
        WHEN 'delivery' THEN bd.offers_delivery AND bd.dist_miles <= bd.delivery_radius_miles
        WHEN 'pickup'   THEN bd.offers_pickup
        ELSE (bd.offers_delivery OR bd.offers_pickup)
      END
  ),
  products AS (
    SELECT
      mp.seller_id,
      COUNT(*)::BIGINT AS prod_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mp.id,
            'name', mp.name,
            'price_usd', mp.price_usd,
            'unit', mp.unit,
            'photo', mp.photos[1],
            'inventory', mp.inventory,
            'category', mp.category,
            'harvested_at', mp.harvested_at
          ) ORDER BY mp.created_at
        ) FILTER (WHERE mp.is_active),
        '[]'::jsonb
      ) AS prods
    FROM market_products mp
    WHERE mp.is_active = true
    GROUP BY mp.seller_id
  )
  SELECT
    f.id AS booth_id,
    f.owner_id,
    f.name AS booth_name,
    f.description,
    f.decorative_theme,
    f.header_image_url,
    f.offers_delivery,
    f.offers_pickup,
    f.delivery_radius_miles,
    f.pickup_address,
    f.delivery_windows,
    f.pickup_windows,
    ROUND(f.dist_miles::numeric, 1)::DOUBLE PRECISION AS distance_miles,
    COALESCE(p.prod_count, 0) AS product_count,
    COALESCE(p.prods, '[]'::jsonb) AS matched_products
  FROM filtered f
  LEFT JOIN products p ON p.seller_id = f.owner_id
  WHERE
    (product_search IS NULL OR EXISTS (
      SELECT 1 FROM market_products mp2
      WHERE mp2.seller_id = f.owner_id
        AND mp2.is_active = true
        AND mp2.name ILIKE '%' || product_search || '%'
    ))
  ORDER BY f.dist_miles;
END;
$$;

-- Override get_filtered_feed to exclude posts by frozen/closed accounts
CREATE OR REPLACE FUNCTION get_filtered_feed(
  p_community_h3 text,
  p_viewer_id uuid
)
RETURNS TABLE (
  id uuid,
  author_id uuid,
  type text,
  reach text,
  content text,
  created_at timestamptz,
  community_h3_index text,
  expires_at timestamptz,
  author_full_name text,
  author_avatar_url text,
  author_phone_verified boolean,
  community_name text
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    p.id,
    p.author_id,
    p.type::text,
    p.reach::text,
    p.content,
    p.created_at,
    p.community_h3_index,
    p.expires_at,
    pr.full_name AS author_full_name,
    pr.avatar_url AS author_avatar_url,
    pr.phone_verified AS author_phone_verified,
    c.name AS community_name
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  LEFT JOIN communities c ON c.h3_index = p.community_h3_index
  WHERE
    (p.community_h3_index = p_community_h3 OR p.community_h3_index IS NULL)
    AND p.status = 'available'
    AND p.expires_at > now()
    AND (pr.is_ghosted = false OR p.author_id = p_viewer_id)
    -- Exclude frozen/closed accounts from feed
    AND pr.closure_status IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM category_restrictions cr
      JOIN want_to_sell_details wts ON wts.post_id = p.id
      WHERE cr.category_name = wts.category
        AND (cr.country_iso_3 IS NULL AND cr.state_id IS NULL AND cr.county_id IS NULL AND cr.city_id IS NULL)
    )
    AND NOT EXISTS (
      SELECT 1 FROM category_restrictions cr
      JOIN want_to_buy_details wtb ON wtb.post_id = p.id
      WHERE cr.category_name = wtb.category
        AND (cr.country_iso_3 IS NULL AND cr.state_id IS NULL AND cr.county_id IS NULL AND cr.city_id IS NULL)
    )
    AND NOT EXISTS (
      SELECT 1 FROM blocked_products bp
      JOIN want_to_sell_details wts ON wts.post_id = p.id
      WHERE LOWER(bp.product_name) = LOWER(wts.produce_name)
        AND (bp.country_iso_3 IS NULL AND bp.state_id IS NULL AND bp.county_id IS NULL AND bp.city_id IS NULL)
    )
  ORDER BY p.created_at DESC;
$$;

