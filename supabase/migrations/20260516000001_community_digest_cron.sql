-- Schedule hourly community digest generation via pg_cron
-- Uses existing helper functions for URL/auth resolution
-- Runs at :15 past each hour to avoid overlap with other cron jobs
DO $outer$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove if already exists (idempotent)
        BEGIN PERFORM cron.unschedule('generate-community-digest'); EXCEPTION WHEN OTHERS THEN END;

        PERFORM cron.schedule('generate-community-digest', '15 * * * *',
            $cmd$
            SELECT net.http_post(
                url := get_edge_fn_base_url() || '/generate-community-digest',
                headers := edge_fn_headers(),
                body := '{}'::jsonb
            )
            $cmd$
        );
        RAISE NOTICE 'Scheduled generate-community-digest (hourly at :15)';
    END IF;
END $outer$;
