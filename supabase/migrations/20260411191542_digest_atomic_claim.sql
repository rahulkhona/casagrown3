-- ============================================================================
-- Migration: Infinite Scale Daily Digest - Atomic Claims & Hourly Schedule
-- ============================================================================

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule old 10am daily job if it exists
    BEGIN
      PERFORM cron.unschedule('daily-grower-digest');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Reschedule to run hourly from 8 AM PT to 7 PM PT (UTC equivalent: 15-23,0-2)
    PERFORM cron.schedule(
      'daily-grower-digest',
      '0 15-23,0-2 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
        COALESCE(
          current_setting('app.settings.edge_functions_base_url', true),
          'http://host.docker.internal:54321/functions/v1'
        ) || '/market-cron',
        json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            current_setting('app.settings.service_role_key', true),
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
          )
        )::text,
        '{"action": "grower_digest"}'::text
      )
    );

    RAISE NOTICE 'Scheduled daily-grower-digest cron strictly hourly from 8 AM to 7 PM PT';
  END IF;
END $outer$;

-- ============================================================================
-- RPC: Atomic Claim Batching (SKIP LOCKED)
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_daily_digest_batch(batch_size INTEGER)
RETURNS TABLE (
  user_id UUID,
  seller_claims JSONB,
  buyer_claims JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH locked_sellers AS (
    UPDATE grower_search_notifications
    SET notified_at = NOW()
    WHERE id IN (
      SELECT id FROM grower_search_notifications
      WHERE notified_at IS NULL
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT batch_size
    )
    RETURNING id, grower_id, keyword, match_source, past_product_id
  ),
  locked_buyers AS (
    UPDATE buyer_product_notifications
    SET notified_at = NOW()
    WHERE id IN (
      SELECT id FROM buyer_product_notifications
      WHERE notified_at IS NULL
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT batch_size
    )
    RETURNING id, buyer_id, product_id, match_source, keyword
  ),
  agg_sellers AS (
    SELECT grower_id AS uid, jsonb_agg(row_to_json(locked_sellers.*)) AS seller_json
    FROM locked_sellers GROUP BY grower_id
  ),
  agg_buyers AS (
    SELECT buyer_id AS uid, jsonb_agg(row_to_json(locked_buyers.*)) AS buyer_json
    FROM locked_buyers GROUP BY buyer_id
  ),
  combined_users AS (
    SELECT COALESCE(s.uid, b.uid) AS final_uid,
           COALESCE(s.seller_json, '[]'::jsonb) AS sc,
           COALESCE(b.buyer_json, '[]'::jsonb) AS bc
    FROM agg_sellers s
    FULL OUTER JOIN agg_buyers b ON s.uid = b.uid
  )
  SELECT final_uid, sc, bc FROM combined_users;
END;
$$;
