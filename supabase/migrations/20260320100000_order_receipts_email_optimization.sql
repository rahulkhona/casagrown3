-- ============================================================================
-- Order Completion Receipts, Auto-Complete Cron, Email Optimization
-- ============================================================================

-- ============================================================
-- 0. Email optimization for Path B: _send_notification_email
--    Skip non-critical emails when user has push subscription
-- ============================================================
CREATE OR REPLACE FUNCTION public._send_notification_email(
  p_type       text,
  p_recipients jsonb,
  p_payload    jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge_fn_url   text;
  v_service_role_key text;
  v_body jsonb;
  v_has_push BOOLEAN;
  v_is_critical BOOLEAN;
  v_first_email text;
  v_user_id uuid;
BEGIN
  -- Determine if this email type is critical (always send)
  v_is_critical := p_type IN (
    'delegation_revoked',
    'product_flagged', 'product_banned'
  );

  -- For non-critical types, check if user has push subscription
  IF NOT v_is_critical THEN
    -- Get email of first recipient to find user_id
    v_first_email := p_recipients->0->>'email';
    IF v_first_email IS NOT NULL THEN
      SELECT au.id INTO v_user_id
      FROM auth.users au
      WHERE au.email = v_first_email
      LIMIT 1;

      IF v_user_id IS NOT NULL THEN
        SELECT EXISTS(
          SELECT 1 FROM push_subscriptions WHERE user_id = v_user_id
        ) INTO v_has_push;

        IF v_has_push THEN
          RETURN; -- Skip email, push will handle it
        END IF;
      END IF;
    END IF;
  END IF;

  -- Same fallback chain as confirm_delivery_with_emails
  v_service_role_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );

  v_edge_fn_url := COALESCE(
    current_setting('app.settings.edge_functions_base_url', true),
    'http://host.docker.internal:54321/functions/v1'
  ) || '/send-notification-email';

  v_body := p_payload || jsonb_build_object(
    'type', p_type,
    'recipients', p_recipients
  );

  PERFORM net.http_post(
    url := v_edge_fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := v_body
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[_send_notification_email] Failed to send % email: %', p_type, SQLERRM;
END;
$$;

-- ============================================================
-- 1. Helper: generate receipt + send receipt email for market_orders
--    Reusable by both buyer_confirm and auto_complete
-- ============================================================
CREATE OR REPLACE FUNCTION _complete_market_order_with_receipt(p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_buyer_profile RECORD;
  v_seller_profile RECORD;
  v_buyer_email TEXT;
  v_seller_email TEXT;
  v_receipt_footer TEXT;
  v_edge_fn_url TEXT;
  v_service_key TEXT;
  v_email_body JSONB;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id;
  IF v_order IS NULL THEN RETURN; END IF;

  -- Profiles
  SELECT full_name, zip_code INTO v_buyer_profile FROM profiles WHERE id = v_order.buyer_id;
  SELECT full_name, zip_code INTO v_seller_profile FROM profiles WHERE id = v_order.seller_id;

  -- Emails
  v_buyer_email := get_user_email(v_order.buyer_id);
  v_seller_email := get_user_email(v_order.seller_id);

  -- Receipt footer (state-specific compliance text)
  SELECT rf.footer_text INTO v_receipt_footer
  FROM receipt_footers rf
  JOIN profiles p ON p.id = v_order.seller_id
  JOIN communities c ON c.h3_index = p.home_community_h3_index
  WHERE rf.state_code = c.state
  LIMIT 1;

  -- Service role key
  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
  );
  v_edge_fn_url := COALESCE(
    current_setting('app.settings.edge_functions_base_url', true),
    current_setting('app.settings.supabase_url', true) || '/functions/v1',
    'http://host.docker.internal:54321/functions/v1'
  ) || '/send-transaction-email';

  -- Generate digital receipt
  INSERT INTO digital_receipts (order_id, buyer_receipt, seller_receipt)
  VALUES (
    p_order_id,
    jsonb_build_object(
      'transaction_id', v_order.id,
      'date', now(),
      'type', 'CasaGrown Market Purchase',
      'buyer_name', v_buyer_profile.full_name,
      'buyer_zip', v_buyer_profile.zip_code,
      'seller_name', v_seller_profile.full_name,
      'seller_zip', v_seller_profile.zip_code,
      'product', v_order.product_name,
      'quantity', v_order.quantity,
      'price_per_unit', v_order.subtotal_usd / GREATEST(v_order.quantity, 1),
      'subtotal', v_order.subtotal_usd,
      'tax_amount', COALESCE(v_order.tax_usd, 0),
      'total', v_order.total_usd,
      'fulfillment_type', v_order.fulfillment_type,
      'footer', v_receipt_footer
    ),
    jsonb_build_object(
      'transaction_id', v_order.id,
      'date', now(),
      'type', 'CasaGrown Market Sale',
      'buyer_name', v_buyer_profile.full_name,
      'buyer_zip', v_buyer_profile.zip_code,
      'seller_name', v_seller_profile.full_name,
      'seller_zip', v_seller_profile.zip_code,
      'product', v_order.product_name,
      'quantity', v_order.quantity,
      'price_per_unit', v_order.subtotal_usd / GREATEST(v_order.quantity, 1),
      'subtotal', v_order.subtotal_usd,
      'tax_amount', COALESCE(v_order.tax_usd, 0),
      'total', v_order.total_usd,
      'platform_fee', COALESCE(v_order.platform_fee_usd, 0),
      'seller_payout', v_order.subtotal_usd - COALESCE(v_order.platform_fee_usd, 0),
      'fulfillment_type', v_order.fulfillment_type,
      'footer', v_receipt_footer
    )
  ) ON CONFLICT (order_id) DO NOTHING;

  -- Build email payload (send-transaction-email format)
  v_email_body := jsonb_build_object(
    'transactionId', v_order.id,
    'date', now(),
    'product', v_order.product_name,
    'quantity', v_order.quantity,
    'unit', 'unit',
    'pointsPerUnit', ROUND(v_order.subtotal_usd / GREATEST(v_order.quantity, 1), 2),
    'subtotal', v_order.subtotal_usd,
    'tax', COALESCE(v_order.tax_usd, 0),
    'total', v_order.total_usd,
    'sellerName', v_seller_profile.full_name,
    'sellerZip', COALESCE(v_seller_profile.zip_code, ''),
    'buyerName', v_buyer_profile.full_name,
    'buyerZip', COALESCE(v_buyer_profile.zip_code, ''),
    'platformFee', COALESCE(v_order.platform_fee_usd, 0),
    'feeRate', CASE WHEN v_order.subtotal_usd > 0
      THEN COALESCE(v_order.platform_fee_usd, 0) / v_order.subtotal_usd
      ELSE 0 END,
    'sellerPayout', v_order.subtotal_usd - COALESCE(v_order.platform_fee_usd, 0),
    'delegated', false,
    'receiptFooter', COALESCE(v_receipt_footer, '')
  );

  -- Send buyer receipt email
  IF v_buyer_email IS NOT NULL AND v_service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_edge_fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'recipients', jsonb_build_array(
          jsonb_build_object('email', v_buyer_email, 'role', 'buyer')
        ),
        'orderData', v_email_body
      )
    );
  END IF;

  -- Send seller receipt email
  IF v_seller_email IS NOT NULL AND v_service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_edge_fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'recipients', jsonb_build_array(
          jsonb_build_object('email', v_seller_email, 'role', 'seller')
        ),
        'orderData', v_email_body
      )
    );
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Receipt generation failed for order %: %', p_order_id, SQLERRM;
END;
$$;

-- ============================================================
-- 2. Rewrite buyer_confirm_delivery to generate receipt
-- ============================================================
CREATE OR REPLACE FUNCTION buyer_confirm_delivery(p_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'delivered' THEN RETURN jsonb_build_object('error', 'Order is not in delivered status'); END IF;

  UPDATE market_orders SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = p_order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer confirmed delivery of "' || v_order.product_name || '". Order complete! ✓', '/orders/' || p_order_id);

  -- Generate receipt + send receipt emails
  PERFORM _complete_market_order_with_receipt(p_order_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- 3. Rewrite auto_complete_delivered_orders to generate receipts
-- ============================================================
CREATE OR REPLACE FUNCTION auto_complete_delivered_orders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT id, buyer_id, seller_id, product_name
    FROM market_orders
    WHERE status = 'delivered'
      AND auto_complete_at IS NOT NULL
      AND auto_complete_at <= now()
    FOR UPDATE
  LOOP
    UPDATE market_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = v_rec.id;

    INSERT INTO notifications (user_id, content, link_url)
    VALUES (v_rec.seller_id, 'Order for "' || v_rec.product_name || '" auto-completed (buyer did not respond within 4 hours). ✓', '/orders/' || v_rec.id);

    -- Generate receipt + send receipt emails
    PERFORM _complete_market_order_with_receipt(v_rec.id);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================
-- 4. Wire auto_complete to pg_cron (every 5 minutes)
-- ============================================================
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old job if it exists
    PERFORM cron.unschedule('auto-complete-orders')
    FROM cron.job WHERE jobname = 'auto-complete-orders';

    PERFORM cron.schedule(
      'auto-complete-orders',
      '*/5 * * * *',
      $sql$SELECT auto_complete_delivered_orders()$sql$
    );
    RAISE NOTICE 'Scheduled auto-complete-orders cron job every 5 minutes';
  ELSE
    RAISE NOTICE 'pg_cron not available, skipping auto-complete cron setup';
  END IF;
END $do$;

-- ============================================================
-- 5. Email optimization: skip non-critical emails when push active
--    Modifies send_notification_email() trigger on notifications table
-- ============================================================
CREATE OR REPLACE FUNCTION send_notification_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_email TEXT;
  v_full_name TEXT;
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_has_push BOOLEAN;
  v_is_critical BOOLEAN;
BEGIN
  SELECT au.email, COALESCE(p.full_name, split_part(au.email, '@', 1))
  INTO v_email, v_full_name
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  WHERE au.id = NEW.user_id;

  IF v_email IS NULL THEN RETURN NEW; END IF;

  -- Check if user has an active push subscription
  SELECT EXISTS(
    SELECT 1 FROM push_subscriptions WHERE user_id = NEW.user_id
  ) INTO v_has_push;

  -- Determine if this is a critical notification (always email)
  v_is_critical := (
    NEW.content LIKE '%declined%' OR
    NEW.content LIKE '%dispute%' OR NEW.content LIKE '%Dispute%' OR
    NEW.content LIKE '%escalated%' OR
    NEW.content LIKE '%resolved%' OR
    NEW.content LIKE '%cancelled%' OR NEW.content LIKE '%canceled%' OR
    NEW.content LIKE '%cleared%' OR
    NEW.content LIKE '%Settlement%' OR NEW.content LIKE '%settlement%' OR
    NEW.content LIKE '%1099%' OR
    NEW.content LIKE '%failed%' OR
    NEW.content LIKE '%flagged%' OR NEW.content LIKE '%banned%' OR
    NEW.content LIKE '%revoked%'
  );

  -- If user has push and notification is not critical, skip email
  IF v_has_push AND NOT v_is_critical THEN
    RETURN NEW;
  END IF;

  v_supabase_url := coalesce(
    current_setting('app.settings.supabase_url', true),
    'http://host.docker.internal:54321'
  );
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Send email
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/send-market-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, '')
    ),
    body := jsonb_build_object(
      'to', v_email,
      'subject', 'CasaGrown — ' || left(NEW.content, 80),
      'html',
        '<div style="font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">' ||
        '<div style="text-align:center;padding:20px 0;border-bottom:2px solid #16a34a">' ||
          '<img src="https://market.casagrown.com/logo.png" alt="CasaGrown" style="height:40px;width:40px;vertical-align:middle;margin-right:8px">' ||
          '<span style="color:#166534;font-size:22px;font-weight:700;vertical-align:middle">CasaGrown</span>' ||
          '<p style="color:#4b5563;font-size:11px;letter-spacing:2px;margin:4px 0 0;font-weight:500">FRESH • LOCAL • TRUSTED</p>' ||
        '</div>' ||
        '<div style="padding:24px 0">' ||
          '<p style="font-size:14px">Hi ' || v_full_name || ',</p>' ||
          '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:16px 0">' ||
            '<p style="color:#166534;font-size:14px;margin:0">' || NEW.content || '</p>' ||
          '</div>' ||
          CASE WHEN NEW.link_url IS NOT NULL THEN
            '<a href="https://market.casagrown.com' || NEW.link_url || '" style="display:inline-block;background:#16a34a;color:white;padding:10px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">View Details</a>'
          ELSE '' END ||
        '</div>' ||
        '<div style="border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:11px;text-align:center">' ||
          'CasaGrown — Fresh. Local. Trusted.' ||
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

-- ============================================================
-- 6. Metrics RPC: Platform usage (PWA vs browser by OS)
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_platform_usage(
  p_start DATE,
  p_end DATE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'os', t.os,
    'pwa_users', t.pwa_users,
    'browser_users', t.browser_users,
    'pwa_sessions', t.pwa_sessions,
    'browser_sessions', t.browser_sessions
  )), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      COALESCE(ua.metadata->>'os', 'Unknown') AS os,
      COUNT(DISTINCT ua.user_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean = true) AS pwa_users,
      COUNT(DISTINCT ua.user_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean IS DISTINCT FROM true) AS browser_users,
      COUNT(DISTINCT ua.session_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean = true) AS pwa_sessions,
      COUNT(DISTINCT ua.session_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean IS DISTINCT FROM true) AS browser_sessions
    FROM user_analytics ua
    WHERE ua.created_at::date BETWEEN p_start AND p_end
      AND ua.metadata->>'os' IS NOT NULL
    GROUP BY COALESCE(ua.metadata->>'os', 'Unknown')
    ORDER BY (COUNT(DISTINCT ua.user_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean = true) +
              COUNT(DISTINCT ua.user_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean IS DISTINCT FROM true)) DESC
  ) t;

  RETURN jsonb_build_object('platformUsage', v_result);
END;
$$;
