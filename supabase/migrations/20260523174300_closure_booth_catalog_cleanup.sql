-- ============================================================================
-- Migration: Add booth & catalog cleanup to account closure
--
-- Fast-path (clean delete): Hard-delete booths, catalogs, fulfillment windows,
--   and revoke helper relationships before deleting the profile.
-- Phase-based (freeze): Archive booths, delete catalogs & fulfillment windows.
--   Helper relationships already revoked in existing code.
-- ============================================================================

-- ============================================================================
-- 1. Update fast-path delete — add booth/catalog cleanup
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

  -- ── Booth & Catalog cleanup (NEW) ──

  -- 1a. Revoke/delete helper relationships on user's booths
  --     Disable trigger to prevent notification failures during cleanup
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

-- ============================================================================
-- 2. Update phase-1 freeze — add booth archive & catalog cleanup
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

  -- ── Booth & Catalog cleanup (NEW) ──

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
