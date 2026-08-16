-- Backfill delivered_at for historical email/SMS campaign sends that were confirmed opened or clicked
UPDATE crm_campaign_sends
SET delivered_at = COALESCE(opened_at, clicked_at, sent_at)
WHERE delivered_at IS NULL
  AND (opened_at IS NOT NULL OR clicked_at IS NOT NULL);
