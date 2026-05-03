-- Migration: Fix Payout UI and Notifications
-- 1. Update trg_redemption_notify to use 'Payout completed'
-- 2. Update finalize_redemption to append metadata to redemptions
-- 3. Update get_transaction_log to fix manual cashout/gift card display

CREATE OR REPLACE FUNCTION public.trg_redemption_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
-- SHARED FUNCTION: Do not delete. Used by Market App, Community Web, iOS, and Android.
DECLARE
  v_item_name TEXT;
  v_item_type TEXT;
  v_is_auto   BOOLEAN;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT name, type::text INTO v_item_name, v_item_type
  FROM redemption_merchandize WHERE id = NEW.item_id;

  v_is_auto := COALESCE((NEW.metadata->>'source') = 'auto_payout', false);

  IF NEW.status = 'completed' THEN
    IF v_is_auto THEN
      PERFORM notify_market_event(NEW.user_id, '⚡ Payout completed: ' || coalesce(v_item_name, 'Your payout') || ' is ready!', '/earnings', true, true);
    ELSE
      PERFORM notify_market_event(NEW.user_id, '🎁 Payout completed: ' || coalesce(v_item_name, 'Your payout') || ' is ready!', '/earnings', true, true);
    END IF;
  ELSIF NEW.status = 'failed' THEN
    PERFORM notify_market_event(NEW.user_id, '❌ Payout failed for ' || coalesce(v_item_name, 'your request') || '. Please try again.', '/earnings', true, false);
  ELSIF NEW.status = 'cancelled' THEN
    PERFORM notify_market_event(
      NEW.user_id,
      '❌ Your payout request for $' || (NEW.point_cost / 100.0) || ' was cancelled by administration.' || CHR(10) || 'Reason: ' || COALESCE(NEW.failed_reason, 'No reason provided.'),
      '/earnings',
      true,
      true
    );
  END IF;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.finalize_redemption(
  p_payload JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- SHARED FUNCTION: Do not delete. Used by Market App, Community Web, iOS, and Android.
DECLARE
  v_red_id UUID := (p_payload->>'redemption_id')::UUID;
  v_type TEXT := COALESCE(p_payload->>'redemption_type', 'manual');
  v_provider TEXT := COALESCE(p_payload->>'provider_name', 'admin_manual');
  v_ext_id TEXT := p_payload->>'external_order_id';
  v_cost_cents INT := COALESCE((p_payload->>'actual_cost_cents')::INT, 0);

  v_user_id UUID;
  v_brand_name TEXT;
  v_face_value_cents INT;
  v_item_name TEXT;
  
  v_donor_org TEXT;
  v_donor_project TEXT;
  v_donor_theme TEXT;
  v_usd_amount numeric;

  v_ledger_meta JSONB;
BEGIN

  -- 1. Get and Lock redemption details to prevent race conditions
  SELECT user_id, 
         metadata->>'brand_name', 
         metadata->>'organization',
         metadata->>'project_title',
         metadata->>'theme',
         (metadata->>'usd_amount')::numeric,
         COALESCE((metadata->>'face_value_cents')::int, 0)
  INTO v_user_id, v_brand_name, v_donor_org, v_donor_project, v_donor_theme, v_usd_amount, v_face_value_cents
  FROM public.redemptions
  WHERE id = v_red_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption % not found', v_red_id;
  END IF;

  -- Default ledger updates for EVERY type
  v_ledger_meta := jsonb_build_object('status', 'completed', 'provider_order_id', v_ext_id);

  -- 2. Execute Branching Logic for the specific payload type
  IF v_type = 'gift_card' THEN
    v_item_name := COALESCE(v_brand_name, 'Gift Card') || ' $' || to_char(v_face_value_cents / 100.0, 'FM999999999.00');
    v_ledger_meta := v_ledger_meta || jsonb_build_object(
      'card_code', p_payload->>'card_code',
      'card_url', p_payload->>'card_url',
      'fulfillment_source', v_provider,
      'proof_url', p_payload->>'proof_url'
    );
    
    INSERT INTO public.gift_card_deliveries (
      redemption_id, brand_name, face_value_cents, card_code, card_url, delivered_at
    ) VALUES (
      v_red_id, COALESCE(v_brand_name, 'Unknown'), v_face_value_cents, p_payload->>'card_code', p_payload->>'card_url', now()
    );

  ELSIF v_type = 'donation' THEN
    v_item_name := 'Donation to ' || COALESCE(v_donor_org, 'Charity');
    v_ledger_meta := v_ledger_meta || jsonb_build_object(
      'receipt_number', p_payload->>'receipt_number',
      'receipt_url', p_payload->>'receipt_url',
      'fulfillment_source', v_provider,
      'proof_url', p_payload->>'proof_url'
    );
    
    IF v_face_value_cents = 0 AND v_usd_amount IS NOT NULL THEN
       v_face_value_cents := (v_usd_amount * 100)::int;
    END IF;

    INSERT INTO public.donation_receipts (
      redemption_id, organization_name, project_title, theme, 
      donation_amount_cents, points_spent, receipt_url, receipt_number, tax_deductible
    ) VALUES (
      v_red_id, COALESCE(v_donor_org, 'Unknown'), v_donor_project, v_donor_theme,
      v_face_value_cents, (v_face_value_cents * 100), 
      COALESCE(p_payload->>'receipt_url', 'https://casagrown.com/receipts/' || (p_payload->>'receipt_number')), 
      p_payload->>'receipt_number', true
    );
  
  ELSE
    -- ANY arbitrary cash/source transfer
    v_item_name := COALESCE(p_payload->>'custom_item_name', v_type || ' Cashout');
    v_ledger_meta := v_ledger_meta || jsonb_build_object(
      'batch_id', v_ext_id,
      'fulfillment_source', v_provider,
      'proof_url', p_payload->>'proof_url'
    );
    
    IF v_face_value_cents = 0 AND v_usd_amount IS NOT NULL THEN
       v_face_value_cents := (v_usd_amount * 100)::int;
    END IF;
  END IF;

  -- 3. Log provider transaction for universal financial auditing
  INSERT INTO public.provider_transactions (
    provider_name, redemption_id, user_id, external_order_id, 
    item_type, item_name, face_value_cents, cost_cents, status
  ) VALUES (
    v_provider, v_red_id, v_user_id, v_ext_id,
    v_type, v_item_name, v_face_value_cents, v_cost_cents, 'success'
  );

  -- 4. Update point ledger (The source of truth for the UI)
  UPDATE public.point_ledger
  SET metadata = metadata || v_ledger_meta
  WHERE reference_id = v_red_id
    AND type IN ('redemption', 'refund');

  -- 5. Mark redemption queue as complete
  UPDATE public.redemptions
  SET status = 'completed',
      provider_order_id = v_ext_id,
      metadata = metadata || v_ledger_meta,
      completed_at = now()
  WHERE id = v_red_id;

END;
$$;


CREATE OR REPLACE FUNCTION public.get_transaction_log(p_start_date timestamptz DEFAULT NULL::timestamptz, p_end_date timestamptz DEFAULT NULL::timestamptz, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(tx_id text, tx_type text, tx_date timestamp with time zone, description text, amount numeric, direction text, status text, counterparty text, metadata jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
-- SHARED FUNCTION: Do not delete. Used by Market App, Community Web, iOS, and Android.
DECLARE
  v_uid UUID := auth.uid();
  v_start TIMESTAMPTZ := COALESCE(p_start_date::TIMESTAMPTZ, '2000-01-01'::TIMESTAMPTZ);
  v_end TIMESTAMPTZ := COALESCE((p_end_date + interval '1 day')::TIMESTAMPTZ, '2099-12-31'::TIMESTAMPTZ);
BEGIN
  RETURN QUERY

  -- ── Sales (where user is seller) ──
  SELECT
    'sale-' || o.id::TEXT,
    'sale'::TEXT,
    o.created_at,
    o.product_name || ' × ' || o.quantity,
    o.subtotal_usd,
    'credit'::TEXT,
    o.status::TEXT,
    COALESCE(bp.full_name, 'Buyer'),
    jsonb_build_object(
      'order_id', o.id,
      'product_name', o.product_name,
      'quantity', o.quantity,
      'unit_price', o.unit_price_usd,
      'subtotal', o.subtotal_usd,
      'tax_rate', o.tax_rate_pct,
      'tax_amount', o.tax_amount_usd,
      'platform_fee', o.platform_fee_usd,
      'net_payout', o.subtotal_usd - o.platform_fee_usd,
      'total', o.total_usd,
      'fulfillment', o.fulfillment_type,
      'booth_id', o.booth_id,
      'buyer_name', bp.full_name,
      'settlement_id', o.settlement_id
    )
  FROM market_orders o
  LEFT JOIN profiles bp ON bp.id = o.buyer_id
  WHERE o.seller_id = v_uid
    AND o.created_at >= v_start AND o.created_at <= v_end

  UNION ALL

  -- ── CC Charges from netting (settlement captures) ──
  SELECT
    'capture-' || sc.id::TEXT,
    'cc_charge'::TEXT,
    sc.created_at,
    'Card charge for market settlement',
    sc.capture_amount_usd,
    'debit'::TEXT,
    sc.capture_status::TEXT,
    NULL,
    jsonb_build_object(
      'capture_id', sc.id,
      'hold_amount', sc.hold_amount_usd,
      'captured', sc.capture_amount_usd,
      'released', sc.release_amount_usd,
      'stripe_pi', sc.stripe_payment_intent_id,
      'stripe_charge_id', sc.stripe_capture_id,
      'settlement_id', sc.settlement_id
    )
  FROM settlement_captures sc
  WHERE sc.buyer_id = v_uid
    AND sc.created_at >= v_start AND sc.created_at <= v_end

  UNION ALL

  -- ── Platform fees from ledger ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'platform_fee'::TEXT,
    ml.created_at,
    'Platform fee (10%)',
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata || jsonb_build_object('settlement_id', ml.settlement_id)
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'fee_charged'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Settlement credits ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'settlement_credit'::TEXT,
    ml.created_at,
    'Settlement earnings credited',
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata || jsonb_build_object('settlement_id', ml.settlement_id)
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'settlement_credit'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Funds cleared (pending → available) ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'funds_cleared'::TEXT,
    ml.created_at,
    'Funds available for withdrawal',
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata || jsonb_build_object('settlement_id', ml.settlement_id)
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'funds_cleared'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Balance held for purchases ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'balance_held'::TEXT,
    ml.created_at,
    'Balance applied to purchase',
    ml.amount_usd,
    'debit'::TEXT,
    'active'::TEXT,
    NULL,
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'balance_held'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Balance released (from cancellations/clearance) ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'balance_released'::TEXT,
    ml.created_at,
    'Balance released from purchase hold',
    ml.amount_usd,
    'credit'::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'balance_released'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Refunds ──
  SELECT
    'ledger-' || ml.id::TEXT,
    CASE WHEN ml.metadata->>'type' = 'payout_refund' THEN 'payout_refund' ELSE 'refund' END::TEXT,
    ml.created_at,
    CASE WHEN ml.metadata->>'type' = 'payout_refund' THEN 'Payout cancelled & refunded'
         WHEN ml.direction = 'credit' THEN 'Refund received'
         ELSE 'Refund issued'
    END,
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'refund_issued'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Redemptions (gift cards, charities, cashouts) ──
  SELECT
    'redeem-' || r.id::TEXT,
    CASE COALESCE(rm.type::text, r.metadata->>'item_type', r.metadata->>'redemption_type', 'cashout')
      WHEN 'gift_card' THEN 'gift_card'
      WHEN 'donation' THEN 'charity'
      ELSE 'cashout'
    END::TEXT,
    r.created_at,
    CASE COALESCE(rm.type::text, r.metadata->>'item_type', r.metadata->>'redemption_type', 'cashout')
      WHEN 'gift_card' THEN 'Gift card: ' || COALESCE(rm.name, r.metadata->>'brand_name', 'Unknown')
      WHEN 'donation' THEN 'Donation: ' || COALESCE(rm.name, r.metadata->>'organization', r.metadata->>'project_title', 'Charity')
      ELSE 'Payout completed via ' ||
        CASE
          -- Venmo: PayPal cashout sent to a phone number
          WHEN (r.provider IN ('paypal','venmo') OR r.metadata->>'type' = 'paypal_cashout')
               AND (r.metadata->>'payout_target') ~ '^\+?[1-9][0-9]{6,14}$' THEN 'Venmo'
          -- PayPal: PayPal cashout sent to an email
          WHEN r.provider = 'paypal' OR r.metadata->>'type' = 'paypal_cashout' THEN 'PayPal'
          WHEN r.provider = 'venmo' THEN 'Venmo'
          WHEN r.provider = 'zelle' THEN 'Zelle'
          WHEN r.provider = 'cashapp' THEN 'CashApp'
          -- Named provider (not internal labels)
          WHEN r.provider IS NOT NULL
               AND lower(r.provider) NOT IN ('manual','admin_manual')
               THEN initcap(r.provider)
          -- Admin entered a real name in fulfillment_source (not a generic label)
          WHEN r.metadata->>'fulfillment_source' IS NOT NULL
               AND lower(r.metadata->>'fulfillment_source') NOT IN ('manual','admin_manual','admin manual')
               THEN initcap(r.metadata->>'fulfillment_source')
          ELSE 'Admin'
        END
    END::TEXT,
    (r.point_cost::NUMERIC / 100)::NUMERIC(10,2),
    'debit'::TEXT,
    r.status::TEXT,
    COALESCE(rm.name, r.metadata->>'brand_name', r.metadata->>'fulfillment_source', r.provider),
    r.metadata || jsonb_build_object(
      'point_cost', r.point_cost,
      'item_name', COALESCE(rm.name, r.metadata->>'brand_name', r.metadata->>'fulfillment_source', r.provider),
      'item_type', COALESCE(rm.type::text, r.metadata->>'item_type', r.metadata->>'redemption_type', 'cashout')
    )
  FROM redemptions r
  LEFT JOIN redemption_merchandize rm ON rm.id = r.item_id
  WHERE r.user_id = v_uid
    AND r.created_at >= v_start AND r.created_at <= v_end

  UNION ALL

  -- ── Admin Adjustments ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'admin_adjustment'::TEXT,
    ml.created_at,
    'Admin Adjustment: ' || COALESCE(ml.metadata->>'reason', 'Correction'),
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    'Admin',
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'admin_adjustment'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  ORDER BY tx_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
