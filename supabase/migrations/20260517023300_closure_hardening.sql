-- ============================================================================
-- Migration: Closure Hardening
-- 
-- 1. closed_emails table — blocks re-registration for phased deletes
-- 2. Update execute_phase_1_freeze — obfuscate auth.users email + insert blocklist
-- 3. trg_block_closed_email — trigger on auth.users INSERT to reject blocked emails
-- 4. notify_market_event — skip notifications for frozen/closed accounts
-- ============================================================================

-- ============================================================================
-- 1. closed_emails — PII table matching profiles pattern (RLS + no API access)
-- ============================================================================
CREATE TABLE IF NOT EXISTS closed_emails (
  email TEXT PRIMARY KEY,
  original_user_id UUID NOT NULL,
  closed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE closed_emails ENABLE ROW LEVEL SECURITY;
-- Zero policies = full deny to anon/authenticated
REVOKE ALL ON closed_emails FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON closed_emails TO service_role;

COMMENT ON TABLE closed_emails IS 'Blocklist of emails from phased-delete accounts. System-only access via SECURITY DEFINER functions.';

-- ============================================================================
-- 2. Update execute_phase_1_freeze — obfuscate auth email + blocklist
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
  -- Verify user exists and is not already closed
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;
  IF v_profile.closure_status IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Account already in closure process: ' || v_profile.closure_status);
  END IF;

  -- ── NEW: Lock email before any other changes ──
  -- Record the original email in the blocklist (prevents re-registration)
  INSERT INTO closed_emails (email, original_user_id)
  VALUES (lower(v_profile.email), p_user_id)
  ON CONFLICT (email) DO NOTHING;

  -- Obfuscate email in auth.users AND auth.identities (frees the slot)
  -- Supabase checks both for uniqueness; both must be updated
  -- Also set banned_until directly in DB (bypasses flaky auth admin API)
  UPDATE auth.users
  SET email = 'deleted_' || p_user_id || '@closed.local',
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('original_email', email),
      banned_until = '2099-12-31'::timestamptz,
      updated_at = now()
  WHERE id = p_user_id;

  -- Also update identity_data email to prevent identity-level conflicts
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

  -- Also update order status for escalated disputes
  UPDATE market_orders SET status = 'escalated'::market_order_status, updated_at = now()
  WHERE id IN (
    SELECT order_id FROM order_disputes
    WHERE order_id IN (SELECT id FROM market_orders WHERE seller_id = p_user_id)
      AND status = 'escalated'::dispute_status
  ) AND status = 'disputed'::market_order_status;

  -- 5. Revoke all helper relationships (both directions)
  -- Disable the status-notify trigger to prevent notification failures
  -- from aborting the revocation (the helper user's notification URL may be null in test/CI)
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

  -- 7. Remove followers of user's booths
  DELETE FROM market_followers
  WHERE booth_id IN (SELECT id FROM market_booths WHERE owner_id = p_user_id);

  -- 8. Remove user's own follows
  DELETE FROM market_followers
  WHERE follower_id = p_user_id;

  -- 9. Clear notifications
  DELETE FROM notifications WHERE user_id = p_user_id;
  DELETE FROM market_notifications WHERE user_id = p_user_id;

  -- 10. Remove push subscriptions (no more push/email/SMS)
  DELETE FROM push_subscriptions WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'cancelled_orders', v_cancelled_orders,
    'escalated_disputes', v_escalated_disputes,
    'revoked_helpers', v_revoked_helpers,
    'deleted_polls', v_deleted_polls
  );
END;
$$;

-- ============================================================================
-- 3. Signup-blocking trigger — prevents re-registration with locked emails
-- ============================================================================
CREATE OR REPLACE FUNCTION block_closed_email_signup()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.closed_emails WHERE email = lower(NEW.email)
  ) THEN
    RAISE EXCEPTION 'This email address is not available for registration.'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

-- Only create trigger if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_block_closed_email'
  ) THEN
    CREATE TRIGGER trg_block_closed_email
      BEFORE INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION block_closed_email_signup();
  END IF;
END;
$$;

-- ============================================================================
-- 4. Patch notify_market_event — skip notifications for frozen/closed accounts
-- ============================================================================
-- We add a guard at the very top of the function body.
-- First, get the current function signature and re-create with the guard.
CREATE OR REPLACE FUNCTION notify_market_event(
  p_user_id UUID,
  p_content TEXT,
  p_link_url TEXT DEFAULT NULL,
  p_send_email BOOLEAN DEFAULT TRUE,
  p_send_sms BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_email TEXT;
  v_user_name TEXT;
  v_edge_fn_base_url TEXT;
  v_service_key TEXT;
  v_app_url TEXT;
  v_closure_status TEXT;
BEGIN
  -- ── Guard: skip all notifications for frozen/closed accounts ──
  SELECT closure_status INTO v_closure_status
  FROM profiles WHERE id = p_user_id;

  IF v_closure_status IS NOT NULL THEN
    RETURN;  -- Account is frozen or closed — no notifications
  END IF;

  -- 1. In-app notification
  INSERT INTO market_notifications (user_id, content, link_url)
  VALUES (p_user_id, p_content, p_link_url);

  -- 2. Push notification
  PERFORM send_push_via_edge(
    ARRAY[p_user_id],
    'CasaGrown Market',
    p_content,
    p_link_url,
    'casagrown-market-' || gen_random_uuid()::text
  );

  v_edge_fn_base_url := get_edge_fn_base_url();
  v_service_key := current_setting('app.settings.service_role_key', true);
  IF v_service_key IS NULL OR v_service_key = '' THEN
    v_service_key := coalesce(
      current_setting('supabase.service_role_key', true),
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
    );
  END IF;
  v_app_url := coalesce(current_setting('app.settings.app_url', true), 'http://localhost:3001');

  -- 3. Email Notification
  IF p_send_email THEN
    BEGIN
      SELECT email, full_name INTO v_user_email, v_user_name
      FROM profiles WHERE id = p_user_id;

      IF v_user_email IS NOT NULL THEN
        PERFORM net.http_post(
          url := v_edge_fn_base_url || '/send-market-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body := jsonb_build_object(
            'to', v_user_email,
            'subject', 'CasaGrown Market Notification',
            'html',
              '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">' ||
                '<div style="text-align: center; margin-bottom: 24px;">' ||
                  '<span style="font-size: 28px;">🌱</span>' ||
                  '<h2 style="margin: 8px 0 0; color: #166534; font-size: 20px;">CasaGrown Market</h2>' ||
                '</div>' ||
                '<div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin-bottom: 20px;">' ||
                  '<p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.6;">' ||
                    CASE WHEN v_user_name IS NOT NULL THEN 'Hi ' || v_user_name || ',<br><br>' ELSE '' END ||
                    p_content ||
                  '</p>' ||
                '</div>' ||
                CASE WHEN p_link_url IS NOT NULL THEN
                  '<div style="text-align: center; margin-bottom: 24px;">' ||
                    '<a href="' || v_app_url || p_link_url || '" style="display: inline-block; background: #16a34a; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">View Details</a>' ||
                  '</div>'
                ELSE '' END ||
                '<p style="margin-top: 24px; font-size: 11px; color: #9ca3af; text-align: center;">CasaGrown Market &bull; Fresh &bull; Local &bull; Trusted</p>' ||
              '</div>',
            'text', p_content || CASE WHEN p_link_url IS NOT NULL THEN E'\n' || v_app_url || p_link_url ELSE '' END
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[notify_market_event] Email failed for user %: %', p_user_id, SQLERRM;
    END;
  END IF;

  -- 4. SMS Notification (Fallback)
  IF p_send_sms THEN
    BEGIN
      PERFORM net.http_post(
        url := v_edge_fn_base_url || '/send-sms-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'userIds', ARRAY[p_user_id],
          'body', 'CasaGrown: ' || p_content
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[notify_market_event] SMS failed for user %: %', p_user_id, SQLERRM;
    END;
  END IF;
END;
$$;

-- ============================================================================
-- 5. Test helper: setup_community_test_user
--    Atomically creates auth user + profile + community chat message in one TX.
--    This avoids FK race conditions when using sequential REST API calls.
-- ============================================================================
CREATE OR REPLACE FUNCTION setup_community_test_user(
  p_user_id UUID,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_h3 TEXT;
BEGIN
  -- Get the first available community H3 index
  SELECT h3_index INTO v_h3 FROM communities LIMIT 1;
  IF v_h3 IS NULL THEN
    RETURN jsonb_build_object('error', 'No communities found');
  END IF;

  -- 1. Create auth user (idempotent)
  -- No password: platform uses OTP (email magic link), not password auth.
  INSERT INTO auth.users (
    id, email, instance_id, aud, role,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    p_user_id, p_email,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  -- 2. Ensure profile exists (the trigger may have created it)
  INSERT INTO profiles (id, email, full_name, profile_completed_at, tos_accepted_at)
  VALUES (p_user_id, p_email, 'E2E Community User', now(), now())
  ON CONFLICT (id) DO UPDATE SET
    full_name = 'E2E Community User',
    closure_status = NULL;

  -- 3. Create community chat message
  INSERT INTO community_chat_messages (community_h3_index, author_id, content)
  VALUES (v_h3, p_user_id, 'Hello from the community test user!')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'h3', v_h3);
END;
$$;
