-- ═══════════════════════════════════════════════════════════════
-- Migration: Add pro_subscription and stripe_fee_passthrough
-- events to the get_transaction_log RPC so they appear
-- in the Earnings & Activity page.
-- ═══════════════════════════════════════════════════════════════

-- We can't easily patch a huge PL/pgSQL function, so we create a
-- helper view and insert a UNION ALL clause by replacing the function.
-- However, the simplest approach: find the source and add 2 new UNION ALL blocks.

-- Approach: We'll use a wrapper function that calls the original and
-- also UNIONs in the new event types. Actually the cleanest approach
-- is to just add a supplementary query in the earnings page client-side.
--
-- BUT the user specifically asked for it to appear in the activity page.
-- So we need to patch get_transaction_log.
--
-- Since we have the source, let's replace it with the new version.

-- First, let's get the return type right:
-- The function returns TABLE(tx_id TEXT, tx_type TEXT, tx_date TIMESTAMPTZ, 
--   description TEXT, amount NUMERIC, direction TEXT, status TEXT,
--   counterparty TEXT, metadata JSONB)

-- Replace the ORDER BY clause with 2 new UNION ALL + ORDER BY:
CREATE OR REPLACE FUNCTION public.get_transaction_log(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  tx_id TEXT,
  tx_type TEXT,
  tx_date TIMESTAMPTZ,
  description TEXT,
  amount NUMERIC,
  direction TEXT,
  status TEXT,
  counterparty TEXT,
  metadata JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_start TIMESTAMPTZ := COALESCE(p_start_date, '2000-01-01'::TIMESTAMPTZ);
  v_end TIMESTAMPTZ := COALESCE(p_end_date, '2099-12-31'::TIMESTAMPTZ);
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY

  -- ── Purchases (where user is buyer) ──
  SELECT
    'order-' || o.id::TEXT,
    'purchase'::TEXT,
    o.created_at,
    o.product_name || ' × ' || o.quantity,
    o.total_usd,
    'debit'::TEXT,
    o.status::TEXT,
    COALESCE(sp.full_name, 'Seller') AS counterparty,
    jsonb_build_object(
      'order_id', o.id,
      'product_name', o.product_name,
      'quantity', o.quantity,
      'unit_price', o.unit_price_usd,
      'subtotal', o.subtotal_usd,
      'tax_rate', o.tax_rate_pct,
      'tax_amount', o.tax_amount_usd,
      'total', o.total_usd,
      'balance_applied', o.balance_applied_usd,
      'card_amount', o.total_usd - o.balance_applied_usd,
      'fulfillment', o.fulfillment_type,
      'seller_plan', o.seller_plan
    )
  FROM market_orders o
  LEFT JOIN profiles sp ON sp.id = o.seller_id
  WHERE o.buyer_id = v_uid
    AND o.created_at >= v_start AND o.created_at <= v_end

  UNION ALL

  -- ── Sales (where user is seller) ──
  SELECT
    'sale-' || o.id::TEXT,
    'sale'::TEXT,
    o.created_at,
    o.product_name || ' × ' || o.quantity,
    o.total_usd,
    'credit'::TEXT,
    o.status::TEXT,
    COALESCE(bp.full_name, 'Buyer'),
    jsonb_build_object(
      'order_id', o.id,
      'product_name', o.product_name,
      'quantity', o.quantity,
      'unit_price', o.unit_price_usd,
      'subtotal', o.subtotal_usd,
      'platform_fee_pct', o.platform_fee_pct,
      'platform_fee', o.platform_fee_usd,
      'stripe_fee', CASE WHEN o.stripe_fee_passed_through THEN o.stripe_processing_fee_usd ELSE 0 END,
      'seller_payout', o.subtotal_usd - COALESCE(o.platform_fee_usd, 0) 
                     - CASE WHEN o.stripe_fee_passed_through THEN COALESCE(o.stripe_processing_fee_usd, 0) ELSE 0 END,
      'fulfillment', o.fulfillment_type,
      'seller_plan', o.seller_plan
    )
  FROM market_orders o
  LEFT JOIN profiles bp ON bp.id = o.buyer_id
  WHERE o.seller_id = v_uid
    AND o.status IN ('completed', 'delivered', 'confirmed', 'pending')
    AND o.created_at >= v_start AND o.created_at <= v_end

  UNION ALL

  -- ── Platform fees from ledger ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'fee_charged'::TEXT,
    ml.created_at,
    'Platform fee charged',
    ml.amount_usd,
    ml.direction,
    'completed'::TEXT,
    'CasaGrown',
    ml.metadata
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
    'Settlement credit',
    ml.amount_usd,
    ml.direction,
    'completed'::TEXT,
    'CasaGrown',
    ml.metadata
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
    'Funds cleared to available balance',
    ml.amount_usd,
    ml.direction,
    'completed'::TEXT,
    'CasaGrown',
    ml.metadata
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
    'Balance held for purchase',
    ml.amount_usd,
    ml.direction,
    'completed'::TEXT,
    'CasaGrown',
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
    'Balance released',
    ml.amount_usd,
    ml.direction,
    'completed'::TEXT,
    'CasaGrown',
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'balance_released'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Stripe payouts ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'stripe_payout'::TEXT,
    ml.created_at,
    'Stripe direct deposit',
    ml.amount_usd,
    ml.direction,
    'completed'::TEXT,
    'Stripe Connect',
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'stripe_payout'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Card charges (cc_charge) ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'cc_charge'::TEXT,
    ml.created_at,
    'Card charged for purchase',
    ml.amount_usd,
    ml.direction,
    'completed'::TEXT,
    'CasaGrown',
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'cc_charge'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ═══ NEW: Pro Subscription charges ═══
  SELECT
    'sub-' || ml.id::TEXT,
    'pro_subscription'::TEXT,
    ml.created_at,
    COALESCE(ml.metadata->>'description', 'CasaGrown Pro — Monthly subscription'),
    ml.amount_usd,
    'debit'::TEXT,
    'completed'::TEXT,
    'CasaGrown',
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'pro_subscription'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ═══ NEW: Stripe fee pass-through ═══
  SELECT
    'stripefee-' || ml.id::TEXT,
    'stripe_fee_passthrough'::TEXT,
    ml.created_at,
    COALESCE(ml.metadata->>'description', 'Stripe processing fee (pass-through)'),
    ml.amount_usd,
    'debit'::TEXT,
    'completed'::TEXT,
    'Stripe',
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'stripe_fee_passthrough'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Transfer reversed / wallet fallback ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'stripe_transfer_reversed'::TEXT,
    ml.created_at,
    CASE
      WHEN ml.metadata->>'reason' = 'transfer.reversed' THEN 'Bank deposit returned — funds restored to wallet'
      ELSE 'Direct deposit failed — funds restored to wallet'
    END,
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'stripe_transfer_reversed'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Credit Grants (promotional credits received) ──
  SELECT
    'credit-' || uc.id::TEXT,
    'credit_received'::TEXT,
    uc.created_at,
    '🎁 Credit received: ' || COALESCE(uc.reason, initcap(replace(uc.source::text, '_', ' '))),
    uc.amount_usd,
    'credit'::TEXT,
    CASE WHEN uc.remaining_usd > 0 AND (uc.expires_at IS NULL OR uc.expires_at > now()) THEN 'active' ELSE 'used' END::TEXT,
    NULL,
    jsonb_build_object(
      'credit_type', uc.credit_type,
      'source', uc.source,
      'reason', uc.reason,
      'remaining_usd', uc.remaining_usd,
      'expires_at', uc.expires_at
    )
  FROM user_credits uc
  WHERE uc.user_id = v_uid
    AND uc.created_at >= v_start AND uc.created_at <= v_end

  ORDER BY 3 DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$fn$;
