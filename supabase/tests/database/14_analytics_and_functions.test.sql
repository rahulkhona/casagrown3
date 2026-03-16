-- ==========================================================================
-- Test: user_analytics table + RLS + core DB functions
-- ==========================================================================
BEGIN;
SELECT plan(7);

-- T1: user_analytics table exists
SELECT has_table('public', 'user_analytics', 'user_analytics table exists');

-- T2: user_analytics has expected columns
SELECT has_column('public', 'user_analytics', 'event_type', 'user_analytics has event_type column');
SELECT has_column('public', 'user_analytics', 'event_name', 'user_analytics has event_name column');
SELECT has_column('public', 'user_analytics', 'session_id', 'user_analytics has session_id column');
SELECT has_column('public', 'user_analytics', 'txn_id', 'user_analytics has txn_id column');
SELECT has_column('public', 'user_analytics', 'page_path', 'user_analytics has page_path column');

-- T3: confirm_order_delivery function exists
SELECT has_function('public', 'confirm_order_delivery', 'confirm_order_delivery function exists');

SELECT * FROM finish();
ROLLBACK;
