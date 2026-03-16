-- ==========================================================================
-- Test: place_market_order RPC + order management functions
-- ==========================================================================
BEGIN;
SELECT plan(5);

-- T1: place_market_order function exists
SELECT has_function('public', 'place_market_order', 'place_market_order function exists');

-- T2: settle_stale_orders function exists 
SELECT has_function('public', 'settle_stale_orders', 'settle_stale_orders function exists');

-- T3: get_transaction_summary function exists
SELECT has_function('public', 'get_transaction_summary', 'get_transaction_summary function exists');

-- T4: confirm_order_delivery function exists
SELECT has_function('public', 'confirm_order_delivery', 'confirm_order_delivery function exists');

-- T5: market_orders table has expected structure
SELECT has_column('public', 'market_orders', 'status', 'market_orders has status column');

SELECT * FROM finish();
ROLLBACK;
