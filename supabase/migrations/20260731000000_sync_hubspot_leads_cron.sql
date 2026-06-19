-- Schedule sync-hubspot-leads to run every hour
-- Fetches and syncs new/modified leads from HubSpot CRM into crm_leads
DO $outer$
BEGIN
  BEGIN PERFORM cron.unschedule('sync-hubspot-leads'); EXCEPTION WHEN OTHERS THEN END;

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
END $outer$;
