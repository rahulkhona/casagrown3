-- ==========================================================================
-- Test: Functions, triggers, and ancillary table schemas
-- ==========================================================================
BEGIN;
SELECT plan(13);

-- Core RPC functions
SELECT has_function('public', 'rate_market_order', 'rate_market_order function exists');
SELECT has_function('public', 'nearby_booths', 'nearby_booths function exists');
SELECT has_function('public', 'refresh_product_data', 'refresh_product_data function exists');
SELECT has_function('public', 'check_product_flag_threshold', 'check_product_flag_threshold function exists');
SELECT has_function('public', 'create_order_atomic', 'create_order_atomic function exists');
SELECT has_function('public', 'place_market_order', 'place_market_order function exists');
SELECT has_function('public', 'settle_stale_orders', 'settle_stale_orders function exists');

-- Conversations table
SELECT has_table('public', 'conversations', 'conversations table exists');
SELECT has_column('public', 'conversations', 'id', 'conversations has id');

-- Ledger table
SELECT has_table('public', 'market_ledger', 'market_ledger table exists');
SELECT has_column('public', 'market_ledger', 'amount_usd', 'ledger has amount_usd');

-- Market holds table
SELECT has_table('public', 'market_holds', 'market_holds table exists');
SELECT has_column('public', 'market_holds', 'buyer_id', 'holds has buyer_id');

SELECT * FROM finish();
ROLLBACK;
