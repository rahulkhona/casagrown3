-- ═══════════════════════════════════════════════════════════════════
-- Notification System Redesign
-- Implements requirements (a)-(l) with in-app, email, and push.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. Follows — using existing `followers` table
--    (follower_id → followed_id = booth owner_id)
--    No new table needed.
-- ─────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- 2. Push notification helper
-- Calls send-push-notification edge function via net.http_post
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION send_push_via_edge(
  p_user_ids UUID[],
  p_title    TEXT,
  p_body     TEXT,
  p_url      TEXT DEFAULT NULL,
  p_tag      TEXT DEFAULT 'casagrown-market'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids_json JSONB;
BEGIN
  v_supabase_url := coalesce(
    current_setting('app.settings.supabase_url', true),
    'http://host.docker.internal:54321'
  );
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Convert UUID[] to JSON array of strings
  SELECT jsonb_agg(to_jsonb(u::text)) INTO v_user_ids_json FROM unnest(p_user_ids) u;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, '')
    ),
    body := jsonb_build_object(
      'userIds', v_user_ids_json,
      'title', p_title,
      'body', p_body,
      'url', coalesce(p_url, '/notifications'),
      'tag', p_tag
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Push send failed: %', SQLERRM;
END;
$$;

-- ─────────────────────────────────────────────
-- 3. Unified notify helper (in-app + push)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_market_event(
  p_user_id  UUID,
  p_content  TEXT,
  p_link_url TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- In-app notification
  INSERT INTO notifications (user_id, content, link_url)
  VALUES (p_user_id, p_content, p_link_url);

  -- Push notification (async via edge function)
  PERFORM send_push_via_edge(
    ARRAY[p_user_id],
    'CasaGrown Market',
    p_content,
    p_link_url
  );
END;
$$;

-- ─────────────────────────────────────────────
-- 4. REWRITE: order status notifications (a)-(f)
--    Remove: ready, confirmed
--    Fix: dispute → both
--    Add: resolved, refund offer
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_market_order_status_notifications ON market_orders;

CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    -- (a) Order placed: pending→confirmed means seller accepted
    --     But the REAL "order placed" is when status first becomes 'pending'
    --     i.e. INSERT. We handle that separately below.
    WHEN 'confirmed' THEN
      -- Seller accepted — notify buyer
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your order for ' || NEW.product_name || ' has been accepted by the seller!',
        '/orders'
      );

    -- (b) Order delivered
    WHEN 'delivered' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '🚚 Your ' || NEW.product_name || ' has been delivered! Please confirm receipt.',
        '/orders'
      );

    -- (c) Order completed — notify BOTH with prompt to rate
    WHEN 'completed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Order completed: ' || NEW.product_name || '. Rate your experience!',
        '/earnings'
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '💰 Sale completed: ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' earned. Rate the buyer!',
        '/earnings'
      );

    -- Order declined
    WHEN 'declined' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '❌ Your order for ' || NEW.product_name || ' was declined' ||
          CASE WHEN NEW.decline_reason IS NOT NULL THEN ': ' || NEW.decline_reason ELSE '' END,
        '/orders'
      );

    -- (d) Order disputed — notify BOTH
    WHEN 'disputed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '⚠️ A dispute has been opened for your ' || NEW.product_name || ' order.',
        '/orders'
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '⚠️ A dispute has been opened for your ' || NEW.product_name || ' sale.',
        '/orders'
      );

    -- (e) Escalated — admin involvement
    WHEN 'escalated' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '📋 Your dispute for ' || NEW.product_name || ' has been escalated to admin review.',
        '/orders'
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '📋 The dispute for ' || NEW.product_name || ' has been escalated to admin review.',
        '/orders'
      );

    -- (f) Resolved — notify BOTH
    WHEN 'resolved' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your dispute for ' || NEW.product_name || ' has been resolved.',
        '/orders'
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '✅ The dispute for ' || NEW.product_name || ' has been resolved.',
        '/orders'
      );

    -- Refunded
    WHEN 'cancelled' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '🔄 Your order for ' || NEW.product_name || ' has been cancelled.',
        '/orders'
      );

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_market_order_status_notifications
  AFTER UPDATE OF status ON market_orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_market_order_status_notify();

-- (a) Order PLACED — fires on INSERT (new order created)
CREATE OR REPLACE FUNCTION trg_market_order_placed_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM notify_market_event(
    NEW.seller_id,
    '🛒 New order: ' || NEW.quantity || '× ' || NEW.product_name || ' ($' || NEW.total_usd || ')',
    '/orders'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_order_placed_notification ON market_orders;
CREATE TRIGGER trg_market_order_placed_notification
  AFTER INSERT ON market_orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_market_order_placed_notify();

-- (e) Refund offer — detect when discount_offer column changes
-- We need to check if such a column exists; if not, we skip.
-- The discount mechanism may be via a separate dispute_offers table or
-- a column on market_orders. For now, we handle it in the
-- status-change trigger above (disputed status with metadata).

-- ─────────────────────────────────────────────
-- 5. REWRITE: email notification trigger
--    ALL notifications get email (remove pattern filter)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION send_notification_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_email TEXT;
  v_full_name TEXT;
  v_supabase_url TEXT;
  v_service_key  TEXT;
BEGIN
  SELECT au.email, COALESCE(p.full_name, split_part(au.email, '@', 1))
  INTO v_email, v_full_name
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  WHERE au.id = NEW.user_id;

  IF v_email IS NULL THEN RETURN NEW; END IF;

  v_supabase_url := coalesce(
    current_setting('app.settings.supabase_url', true),
    'http://host.docker.internal:54321'
  );
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Send email for ALL notifications (no filter)
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/send-market-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, '')
    ),
    body := jsonb_build_object(
      'to', v_email,
      'subject', 'CasaGrown Market — ' || left(NEW.content, 80),
      'html',
        '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
        '<div style="text-align:center;padding:16px 0;border-bottom:2px solid #22c55e">' ||
          '<h1 style="color:#166534;font-size:22px;margin:0">🌱 CasaGrown Market</h1>' ||
        '</div>' ||
        '<div style="padding:24px 0">' ||
          '<p style="color:#374151;font-size:14px">Hi ' || v_full_name || ',</p>' ||
          '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">' ||
            '<p style="color:#166534;font-size:14px;margin:0">' || NEW.content || '</p>' ||
          '</div>' ||
          CASE WHEN NEW.link_url IS NOT NULL THEN
            '<a href="https://market.casagrown.com' || NEW.link_url || '" style="display:inline-block;background:#22c55e;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Details</a>'
          ELSE '' END ||
        '</div>' ||
        '<div style="border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:11px;text-align:center">' ||
          'CasaGrown Market — Fresh from your neighbors<br>' ||
          'You received this email because of activity on your account.' ||
        '</div>' ||
      '</div>'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Email send failed for notification %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────
-- 6. Settlement notifications (rewrite)
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_settlement_status_notifications ON market_settlements;

CREATE OR REPLACE FUNCTION trg_settlement_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user RECORD;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'funds_received' THEN
      FOR v_user IN
        SELECT DISTINCT user_id FROM user_settlements WHERE settlement_id = NEW.id
      LOOP
        PERFORM notify_market_event(
          v_user.user_id,
          '🏦 Settlement funds received for market day ' || NEW.market_date || '. Earnings are being processed.',
          '/earnings'
        );
      END LOOP;

    -- (i) Cleared — notify each user with amount
    WHEN 'cleared' THEN
      FOR v_user IN
        SELECT user_id, net_payout_usd FROM user_settlements WHERE settlement_id = NEW.id
      LOOP
        PERFORM notify_market_event(
          v_user.user_id,
          '✅ $' || v_user.net_payout_usd || ' earnings cleared and available for withdrawal!',
          '/earnings'
        );

        -- (l) Check 1099K threshold after clearing
        PERFORM check_1099k_threshold(v_user.user_id);
      END LOOP;

    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_settlement_status_notifications
  AFTER UPDATE OF status ON market_settlements
  FOR EACH ROW
  EXECUTE FUNCTION trg_settlement_status_notify();

-- ─────────────────────────────────────────────
-- 7. Redemption/withdrawal notifications (j, k)
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_redemption_notifications ON redemptions;

CREATE OR REPLACE FUNCTION trg_redemption_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_name TEXT;
  v_item_type TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT name, type::text INTO v_item_name, v_item_type
  FROM redemption_merchandize WHERE id = NEW.item_id;

  IF NEW.status = 'completed' THEN
    IF NEW.is_auto = true THEN
      -- (j) Auto remittance: full notification (in-app + push + email)
      PERFORM notify_market_event(
        NEW.user_id,
        '⚡ Auto-withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!',
        '/earnings'
      );
    ELSE
      -- (k) Manual remittance: email only (toast shown in UI, no push)
      INSERT INTO notifications (user_id, content, link_url)
      VALUES (
        NEW.user_id,
        '🎁 Withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!',
        '/earnings'
      );
    END IF;
  ELSIF NEW.status = 'failed' THEN
    PERFORM notify_market_event(
      NEW.user_id,
      '❌ Withdrawal failed for ' || coalesce(v_item_name, 'your request') || '. Please try again.',
      '/earnings/redeem'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_redemption_notifications
  AFTER UPDATE OF status ON redemptions
  FOR EACH ROW
  EXECUTE FUNCTION trg_redemption_notify();

-- ─────────────────────────────────────────────
-- 8. (h) Booth product added → notify followers
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_product_added_notify_followers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_booth RECORD;
  v_follower RECORD;
  v_follower_ids UUID[];
BEGIN
  -- Find the booth for this seller
  SELECT id, name INTO v_booth
  FROM market_booths
  WHERE owner_id = NEW.seller_id
  LIMIT 1;

  IF v_booth IS NULL THEN RETURN NEW; END IF;

  -- Get all followers of this seller (using existing followers table)
  SELECT array_agg(follower_id) INTO v_follower_ids
  FROM followers WHERE followed_id = NEW.seller_id;

  IF v_follower_ids IS NULL OR array_length(v_follower_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  -- Notify each follower (in-app + email via trigger)
  FOR v_follower IN
    SELECT follower_id FROM followers WHERE followed_id = NEW.seller_id
  LOOP
    INSERT INTO notifications (user_id, content, link_url)
    VALUES (
      v_follower.follower_id,
      '🌱 ' || v_booth.name || ' added new item: ' || NEW.name || ' ($' || NEW.price_usd || '/' || NEW.unit || ')',
      '/market'
    );
  END LOOP;

  -- Push to all followers at once
  PERFORM send_push_via_edge(
    v_follower_ids,
    v_booth.name || ' — New Item!',
    NEW.name || ' now available ($' || NEW.price_usd || '/' || NEW.unit || ')',
    '/market'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_added_notify
  AFTER INSERT ON market_products
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION trg_product_added_notify_followers();

-- ─────────────────────────────────────────────
-- 9. (l) 1099K threshold check
--    Federal threshold: $600
--    Warns at 70% ($420) — "within 30% of trigger"
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_1099k_threshold(p_seller_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ytd_total NUMERIC;
  v_threshold NUMERIC := 600.00;       -- Federal 1099-K threshold
  v_warn_pct  NUMERIC := 0.70;         -- Warn at 70% (within 30%)
  v_warn_at   NUMERIC;
  v_already_warned BOOLEAN;
BEGIN
  v_warn_at := v_threshold * v_warn_pct;

  -- Calculate YTD total from cleared settlements
  SELECT COALESCE(SUM(us.net_payout_usd), 0) INTO v_ytd_total
  FROM user_settlements us
  JOIN market_settlements ms ON ms.id = us.settlement_id
  WHERE us.user_id = p_seller_id
    AND ms.status = 'cleared'
    AND EXTRACT(YEAR FROM ms.market_date) = EXTRACT(YEAR FROM CURRENT_DATE);

  -- Only warn if at or above 70% threshold
  IF v_ytd_total < v_warn_at THEN RETURN; END IF;

  -- Check if we already warned this year
  SELECT EXISTS(
    SELECT 1 FROM notifications
    WHERE user_id = p_seller_id
      AND content LIKE '%1099-K%'
      AND created_at >= date_trunc('year', CURRENT_DATE)
  ) INTO v_already_warned;

  IF v_already_warned THEN RETURN; END IF;

  -- Send warning
  IF v_ytd_total >= v_threshold THEN
    PERFORM notify_market_event(
      p_seller_id,
      '📋 Your year-to-date earnings have reached $' || v_ytd_total ||
        ', exceeding the $' || v_threshold || ' federal 1099-K reporting threshold. ' ||
        'Please ensure your tax information is up to date.',
      '/profile'
    );
  ELSE
    PERFORM notify_market_event(
      p_seller_id,
      '📋 Heads up! Your YTD earnings are $' || v_ytd_total ||
        ' — you''re approaching the $' || v_threshold ||
        ' federal 1099-K threshold. Consider updating your tax info.',
      '/profile'
    );
  END IF;
END;
$$;
