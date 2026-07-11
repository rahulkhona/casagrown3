-- ============================================================================
-- Migration: Fix get_pending_transactions and growbot-media-cleanup cron
--
-- 1. get_pending_transactions: Fix "invalid UNION/INTERSECT/EXCEPT ORDER BY
--    clause" error (42P01/0A000). PostgreSQL doesn't allow column aliases from
--    RETURNS TABLE in UNION ALL ORDER BY — use positional reference instead.
--
-- 2. growbot-media-cleanup: Supabase blocks direct DELETE from storage.objects
--    via the storage.protect_delete() trigger. Split the cron to only clean up
--    growbot_shared_responses (which works), and move storage cleanup to an
--    edge function call via invoke_edge_function.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Fix get_pending_transactions ORDER BY
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_pending_transactions()
RETURNS TABLE (
  tx_id TEXT,
  tx_type TEXT,
  tx_date TIMESTAMPTZ,
  description TEXT,
  amount NUMERIC(10,2),
  direction TEXT,
  status TEXT,
  counterparty TEXT,
  metadata JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  RETURN QUERY

  -- Unsettled purchases
  SELECT
    'order-' || o.id::TEXT,
    'purchase'::TEXT,
    o.created_at,
    o.product_name || ' × ' || o.quantity,
    o.total_usd,
    'debit'::TEXT,
    o.status::TEXT || ' (pending settlement)',
    COALESCE(sp.full_name, 'Seller'),
    jsonb_build_object(
      'order_id', o.id,
      'product_name', o.product_name,
      'quantity', o.quantity,
      'subtotal', o.subtotal_usd,
      'total', o.total_usd,
      'balance_applied', o.balance_applied_usd,
      'card_amount', o.total_usd - o.balance_applied_usd,
      'booth_id', o.booth_id
    )
  FROM market_orders o
  LEFT JOIN profiles sp ON sp.id = o.seller_id
  WHERE o.buyer_id = v_uid
    AND o.settlement_id IS NULL
    AND o.status IN ('completed', 'delivered', 'confirmed', 'pending')

  UNION ALL

  -- Unsettled sales
  SELECT
    'sale-' || o.id::TEXT,
    'sale'::TEXT,
    o.created_at,
    o.product_name || ' × ' || o.quantity,
    o.subtotal_usd,
    'credit'::TEXT,
    o.status::TEXT || ' (pending settlement)',
    COALESCE(bp.full_name, 'Buyer'),
    jsonb_build_object(
      'order_id', o.id,
      'product_name', o.product_name,
      'quantity', o.quantity,
      'subtotal', o.subtotal_usd,
      'total', o.total_usd,
      'buyer_name', bp.full_name
    )
  FROM market_orders o
  LEFT JOIN profiles bp ON bp.id = o.buyer_id
  WHERE o.seller_id = v_uid
    AND o.settlement_id IS NULL
    AND o.status IN ('completed', 'delivered', 'confirmed', 'pending')

  ORDER BY 3 DESC;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Fix growbot-media-cleanup cron
--    Supabase blocks direct DELETE from storage.objects via protect_delete().
--    Split into two crons:
--    a) SQL cleanup for growbot_shared_responses (works fine)
--    b) Edge function call for storage objects (uses Storage SDK)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Remove the old broken cron
SELECT cron.unschedule('growbot-media-cleanup') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'growbot-media-cleanup'
);

-- a) SQL cleanup for growbot_shared_responses
SELECT cron.schedule(
  'growbot-media-cleanup',
  '0 4 * * *',
  $$
    DELETE FROM public.growbot_shared_responses
    WHERE created_at < now() - interval '180 days';
  $$
);

-- b) Edge function cleanup for storage objects (runs 5 min after SQL cleanup)
SELECT cron.schedule(
  'growbot-storage-cleanup',
  '5 4 * * *',
  $$
    SELECT net.http_post(
      url := get_edge_fn_base_url() || '/cleanup-growbot-media',
      headers := edge_fn_headers(),
      body := '{}'::jsonb
    );
  $$
);
