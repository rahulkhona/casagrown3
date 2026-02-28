-- Mock the State Threshold for CA to $15.00
INSERT INTO small_balance_refund_thresholds (country_iso_3, state_code, threshold_cents)
VALUES ('USA', 'CA', 1500)
ON CONFLICT (country_iso_3, state_code) 
DO UPDATE SET threshold_cents = EXCLUDED.threshold_cents;

-- Mock an old points bucket by backdating a single bucket
-- This requires making the bucket's created_at more than 120 days old,
-- and the linked payment_transaction's created_at as well so they match up.

WITH to_mock AS (
  SELECT pb.id as bucket_id, pb.payment_transaction_id as pt_id
  FROM purchased_points_buckets pb
  WHERE pb.status IN ('active', 'partially_refunded')
  LIMIT 1
)
UPDATE payment_transactions
SET created_at = created_at - interval '130 days'
WHERE id IN (SELECT pt_id FROM to_mock);

WITH to_mock AS (
  SELECT pb.id as bucket_id, pb.payment_transaction_id as pt_id
  FROM purchased_points_buckets pb
  WHERE pb.status IN ('active', 'partially_refunded')
  LIMIT 1
)
UPDATE purchased_points_buckets
SET created_at = created_at - interval '130 days'
WHERE id IN (SELECT bucket_id FROM to_mock);

-- Add some dummy card data to the most recent bucket for UI testing
WITH recent_bucket AS (
  SELECT id
  FROM purchased_points_buckets
  WHERE status IN ('active', 'partially_refunded')
  ORDER BY created_at DESC
  LIMIT 1
)
UPDATE purchased_points_buckets
SET metadata = metadata || '{"card_brand": "visa", "card_last4": "4242"}'::jsonb
WHERE id IN (SELECT id FROM recent_bucket);
