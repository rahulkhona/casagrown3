-- ==========================================================================
-- Test: market_lifecycle_cron + soft_delete flags + notification triggers
-- ==========================================================================
BEGIN;
SELECT plan(8);

-- T1: market_booths has is_open column
SELECT has_column('public', 'market_booths', 'is_open', 'market_booths has is_open column');

-- T2: market_products has is_deleted column
SELECT has_column('public', 'market_products', 'is_deleted', 'market_products has is_deleted soft-delete column');

-- T3: close_market_booths exists
SELECT has_function('public', 'close_market_booths', 'close_market_booths function exists for cron jobs');

-- T4: send_market_lifecycle_ping exists
SELECT has_function('public', 'send_market_lifecycle_ping', 'send_market_lifecycle_ping function exists for prep/launch alerts');

-- T5: trg_booth_open_notify_reminders function exists
SELECT has_function('public', 'trg_booth_open_notify_reminders', 'trg_booth_open_notify_reminders function exists');

-- T6: trigger trg_booth_open_notify is attached to market_booths
SELECT has_trigger('public', 'market_booths', 'trg_booth_open_notify', 'trg_booth_open_notify is attached to market_booths');

-- T7: ensure is_deleted defaults to false
SELECT col_default_is('public', 'market_products', 'is_deleted', 'false', 'is_deleted column defaults to false');

-- T8: ensure notifications table exists since our triggers ping it
SELECT has_table('public', 'notifications', 'notifications table exists for lifecycle events');

SELECT * FROM finish();
ROLLBACK;
