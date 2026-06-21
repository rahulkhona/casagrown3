-- Schedule sync-hubspot-leads to run every hour
-- Fetches and syncs new/modified leads from HubSpot CRM into crm_leads
DO $outer$
DECLARE
  v_url TEXT;
BEGIN
  BEGIN PERFORM cron.unschedule('sync-hubspot-leads'); EXCEPTION WHEN OTHERS THEN END;

  v_url := get_edge_fn_base_url();
  IF v_url LIKE 'https://%' 
     AND v_url NOT LIKE '%host.docker.internal%' 
     AND v_url NOT LIKE '%127.0.0.1%' 
     AND v_url NOT LIKE '%localhost%' 
     AND v_url NOT LIKE '%kong%' THEN
    PERFORM cron.schedule('sync-hubspot-leads', '0 * * * *',
      $inner$
        SELECT net.http_post(
          url := get_edge_fn_base_url() || '/sync-hubspot-leads',
          headers := edge_fn_headers(),
          body := '{}'::jsonb
        )
      $inner$
    );
    RAISE NOTICE 'Scheduled sync-hubspot-leads every hour';
  ELSE
    RAISE NOTICE 'Skipping HubSpot leads sync schedule in local development environment';
  END IF;
END $outer$;
