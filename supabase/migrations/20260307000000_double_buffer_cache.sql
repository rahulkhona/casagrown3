-- Migration: Double-buffered cache for gift cards and charity projects
-- Adds `status` column for active/building buffer swap pattern.
-- Cron jobs refresh both caches daily at midnight.

-- ── 1. Gift Cards Cache: add status column ──
ALTER TABLE giftcards_cache ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Drop old unique constraint on provider alone
ALTER TABLE giftcards_cache DROP CONSTRAINT IF EXISTS giftcards_cache_provider_key;

-- New unique: (provider, status) allows 2 rows per provider during refresh
ALTER TABLE giftcards_cache ADD CONSTRAINT giftcards_cache_provider_status_key
  UNIQUE (provider, status);

-- ── 2. Charity Projects Cache: add status column ──
ALTER TABLE charity_projects_cache ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- ── 3. Cron jobs: midnight daily refresh ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Gift card catalog refresh at midnight UTC
    PERFORM cron.schedule(
      'refresh-giftcard-catalog',
      '0 0 * * *',
      $job$
        SELECT net.http_post(
          url := 'http://host.docker.internal:54321/functions/v1/fetch-gift-cards',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
          ),
          body := '{"refresh": true}'::jsonb
        );
      $job$
    );

    -- Donation projects refresh 5 min after midnight (stagger)
    PERFORM cron.schedule(
      'refresh-donation-projects',
      '5 0 * * *',
      $job$
        SELECT net.http_post(
          url := 'http://host.docker.internal:54321/functions/v1/fetch-donation-projects',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
          ),
          body := '{"refresh": true}'::jsonb
        );
      $job$
    );

  ELSE
    RAISE NOTICE 'pg_cron not available, skipping cache refresh cron jobs';
  END IF;
END;
$$;
