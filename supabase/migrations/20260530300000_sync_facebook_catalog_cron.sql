-- Schedule sync-facebook-catalog to run every 6 hours
-- Syncs Pro sellers' active products to their connected Facebook catalogs
DO $outer$
BEGIN
  BEGIN PERFORM cron.unschedule('sync-facebook-catalog'); EXCEPTION WHEN OTHERS THEN END;

  PERFORM cron.schedule('sync-facebook-catalog', '15 */6 * * *',
    $inner$
      SELECT net.http_post(
        url := get_edge_fn_base_url() || '/sync-facebook-catalog',
        headers := edge_fn_headers(),
        body := '{}'::jsonb
      )
    $inner$
  );
  RAISE NOTICE 'Scheduled sync-facebook-catalog every 6 hours';
END $outer$;
