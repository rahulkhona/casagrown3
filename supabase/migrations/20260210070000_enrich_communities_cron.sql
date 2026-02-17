-- Enable pg_cron and pg_net extensions for scheduled edge function invocation
-- pg_cron: Provides cron-style job scheduling inside Postgres
-- pg_net: Allows making HTTP requests from within Postgres

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage on cron schema to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule enrich-communities to run every minute
-- Processes communities with fallback "Zone XX" names, enriching them via Overpass API.
-- The function is idempotent and handles its own rate-limit backoff.
-- It processes 1 community per invocation to stay under Overpass rate limits.
--
-- NOTE: For production, replace the URL and key below with vault references:
--   url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/enrich-communities'
--   'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')

SELECT cron.schedule(
  'enrich-communities-job',
  '*/5 * * * *',   -- every 5 minutes (avoids Overpass rate-limiting)
  $$
    SELECT net.http_post(
      url := 'http://api.localhost:54321/functions/v1/enrich-communities',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
      ),
      body := '{"limit": 1}'::jsonb
    );
  $$
);
