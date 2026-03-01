-- Backfill missing gift card metadata to refund point_ledger rows that were generated before the edge function fix.
-- Find point_ledger rows where type = 'refund' and the metadata->>'bucket_id' references a bucket 
-- that has a corresponding redemption ID linked to a successful gift card delivery.

UPDATE point_ledger pl
SET metadata = 
  CASE 
    WHEN jsonb_typeof(pl.metadata) = 'object' THEN pl.metadata
    ELSE '{}'::jsonb
  END
  || jsonb_build_object(
      'card_code', gcd.card_code,
      'card_url', gcd.card_url,
      'status', 'completed'
  )
FROM 
  purchased_points_buckets ppb
JOIN 
  redemptions r ON (r.metadata->'bucket_ids')::jsonb @> to_jsonb(ppb.id)
JOIN 
  gift_card_deliveries gcd ON gcd.redemption_id = r.id
WHERE 
  pl.type = 'refund'
  -- The point_ledger refund row directly references the bucket's original payment transaction
  AND pl.reference_id = ppb.payment_transaction_id
  -- But we can strictly match via the metadata bucket_id injection from the edge function
  AND pl.metadata->>'bucket_id' = ppb.id::text
  -- Only update if it doesn't already have a card_code
  AND NOT (pl.metadata ? 'card_code');
