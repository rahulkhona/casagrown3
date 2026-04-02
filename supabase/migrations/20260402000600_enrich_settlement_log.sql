-- Enrich get_transaction_log: settlement_credit entries now show
-- order details, fees, net payout, settlement status, and expected availability date
--
-- Instead of rewriting the entire 266-line function, we replace it by
-- extracting the full definition, doing a targeted text replacement,
-- and re-executing it.

-- Step 1: save old definition
CREATE TEMP TABLE _txlog_rewrite AS
SELECT pg_get_functiondef(p.oid) AS def
FROM pg_proc p WHERE p.proname = 'get_transaction_log' LIMIT 1;

-- Step 2: drop old function
DROP FUNCTION get_transaction_log;

-- Step 3: apply replacements and recreate
DO $do$
DECLARE
  v_def TEXT;
BEGIN
  SELECT def INTO v_def FROM _txlog_rewrite LIMIT 1;

  -- Replace the bare settlement_credit block with enriched version
  v_def := replace(v_def,
    E'-- \\u2500\\u2500 Settlement credits \\u2500\\u2500\n  SELECT\n    ''ledger-'' || ml.id::TEXT,\n    ''settlement_credit''::TEXT,\n    ml.created_at,\n    ''Settlement earnings credited'',\n    ml.amount_usd,\n    ml.direction::TEXT,\n    ''completed''::TEXT,\n    NULL,\n    ml.metadata || jsonb_build_object(''settlement_id'', ml.settlement_id)\n  FROM market_ledger ml\n  WHERE ml.user_id = v_uid\n    AND ml.event_type = ''settlement_credit''\n    AND ml.created_at >= v_start AND ml.created_at < v_end',
    E'-- \\u2500\\u2500 Settlement credits (enriched with order details + availability) \\u2500\\u2500\n  SELECT\n    ''ledger-'' || ml.id::TEXT,\n    ''settlement_credit''::TEXT,\n    ml.created_at,\n    COALESCE(\n      (SELECT string_agg(o.product_name || '' \\u00d7 '' || o.quantity, '', '' ORDER BY o.product_name)\n       FROM market_orders o WHERE o.seller_id = v_uid AND o.settlement_id = ml.settlement_id),\n      ''Settlement earnings credited''\n    ),\n    ml.amount_usd,\n    ml.direction::TEXT,\n    CASE\n      WHEN s.status = ''cleared'' THEN ''completed''\n      ELSE ''pending''\n    END::TEXT,\n    NULL,\n    ml.metadata || jsonb_build_object(\n      ''settlement_id'', ml.settlement_id,\n      ''settlement_status'', COALESCE(s.status, ''unknown''),\n      ''market_date'', s.market_date,\n      ''orders'', COALESCE(\n        (SELECT jsonb_agg(jsonb_build_object(\n          ''product'', o.product_name, ''qty'', o.quantity, ''amount'', o.total_usd,\n          ''buyer'', bp.full_name, ''fulfillment'', o.fulfillment_type\n        ) ORDER BY o.product_name)\n        FROM market_orders o\n        LEFT JOIN profiles bp ON bp.id = o.buyer_id\n        WHERE o.seller_id = v_uid AND o.settlement_id = ml.settlement_id),\n        ''[]''::jsonb\n      ),\n      ''fees'', COALESCE(us.platform_fees_usd, 0),\n      ''net_payout'', COALESCE(us.net_payout_usd, 0),\n      ''available_at'',\n        CASE\n          WHEN s.status = ''cleared'' THEN s.updated_at\n          ELSE (s.created_at + interval ''2 days'')\n        END\n    )\n  FROM market_ledger ml\n  LEFT JOIN market_settlements s ON s.id = ml.settlement_id\n  LEFT JOIN user_settlements us ON us.settlement_id = ml.settlement_id AND us.user_id = v_uid\n  WHERE ml.user_id = v_uid\n    AND ml.event_type = ''settlement_credit''\n    AND ml.created_at >= v_start AND ml.created_at < v_end'
  );

  EXECUTE v_def;
END;
$do$;

DROP TABLE _txlog_rewrite;
