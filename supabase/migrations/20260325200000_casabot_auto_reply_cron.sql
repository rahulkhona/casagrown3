-- CasaBot Auto-Reply Cron
-- Runs every 5 minutes, finds unanswered gardening questions, and auto-replies

SELECT cron.schedule(
  'casabot-auto-reply-job',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'http://host.docker.internal:54321/functions/v1/casabot-auto-reply',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
      ),
      body := '{}'::jsonb
    );
  $$
);
