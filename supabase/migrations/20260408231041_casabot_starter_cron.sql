-- CasaBot Community Starter Cron
-- Runs every day at 9:00 AM and 4:00 PM (16:00) UTC
-- Triggers the Edge Function to natively inject an engaging gardening prompt
-- directly into the community global feed to eliminate cold-starts.

SELECT cron.schedule(
  'casabot-community-starter-job',
  '0 9,16 * * *',
  $$
    SELECT net.http_post(
      url := 'http://host.docker.internal:54321/functions/v1/casabot-starter-post',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- Utilizes the existing Supabase service key token
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
      ),
      body := '{}'::jsonb
    );
  $$
);
