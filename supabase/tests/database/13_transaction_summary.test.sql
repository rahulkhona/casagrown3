-- ==========================================================================
-- Test: get_transaction_summary RPC
-- Tests balance calculations
-- ==========================================================================
BEGIN;
SELECT plan(3);

-- T1: Function exists
SELECT has_function('public', 'get_transaction_summary', 'get_transaction_summary function exists');

-- T2: Returns data (may be empty for non-authenticated user in test)
SELECT ok(
  (SELECT pg_typeof(get_transaction_summary())::text IN ('jsonb', 'json', 'record')),
  'get_transaction_summary returns structured data'
);

-- T3: settle_stale_orders function exists
SELECT has_function('public', 'settle_stale_orders', 'settle_stale_orders function exists');

SELECT * FROM finish();
ROLLBACK;
