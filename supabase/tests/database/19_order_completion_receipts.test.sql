-- ==========================================================================
-- Test: Order completion receipts + auto-complete + email optimization
-- ==========================================================================
BEGIN;
SELECT plan(10);

-- T1: _complete_market_order_with_receipt helper exists
SELECT has_function(
  'public', '_complete_market_order_with_receipt',
  '_complete_market_order_with_receipt function exists'
);

-- T2: buyer_confirm_delivery function exists
SELECT has_function(
  'public', 'buyer_confirm_delivery',
  'buyer_confirm_delivery function exists'
);

-- T3: auto_complete_delivered_orders function exists
SELECT has_function(
  'public', 'auto_complete_delivered_orders',
  'auto_complete_delivered_orders function exists'
);

-- T4: send_notification_email trigger function exists
SELECT has_function(
  'public', 'send_notification_email',
  'send_notification_email trigger function exists'
);

-- T5: _send_notification_email helper exists (with push check)
SELECT has_function(
  'public', '_send_notification_email',
  '_send_notification_email helper function exists'
);

-- T6: digital_receipts table has order_id column
SELECT has_column(
  'public', 'digital_receipts', 'order_id',
  'digital_receipts table has order_id column'
);

-- T7: digital_receipts table has buyer_receipt column
SELECT has_column(
  'public', 'digital_receipts', 'buyer_receipt',
  'digital_receipts table has buyer_receipt column'
);

-- T8: digital_receipts table has seller_receipt column
SELECT has_column(
  'public', 'digital_receipts', 'seller_receipt',
  'digital_receipts table has seller_receipt column'
);

-- T9: push_subscriptions table exists for email optimization
SELECT has_table(
  'public', 'push_subscriptions',
  'push_subscriptions table exists for email optimization'
);

-- T10: metrics_platform_usage RPC exists
SELECT has_function(
  'public', 'metrics_platform_usage',
  'metrics_platform_usage RPC exists'
);

SELECT * FROM finish();
ROLLBACK;
