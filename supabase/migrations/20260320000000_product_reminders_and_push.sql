-- ============================================================================
-- Migration: Product Reminders + Send-Market-Reminders Cron
-- 
-- 1. product_reminders table — stores which products a user wants to be
--    reminded about when the market opens. Deleted after notification sent.
-- 2. pg_cron job — calls send-market-reminders edge function every 5 minutes.
-- ============================================================================

-- 1. Create product_reminders table
CREATE TABLE IF NOT EXISTS public.product_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES market_products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- 2. Enable RLS
ALTER TABLE public.product_reminders ENABLE ROW LEVEL SECURITY;

-- 3. Users can manage their own reminders
CREATE POLICY "Users can view own product reminders"
  ON public.product_reminders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own product reminders"
  ON public.product_reminders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own product reminders"
  ON public.product_reminders FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can delete after sending
CREATE POLICY "Service role can manage product reminders"
  ON public.product_reminders FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Index for quick lookup by user
CREATE INDEX idx_product_reminders_user_id
  ON public.product_reminders(user_id);

-- 5. pg_cron: call send-market-reminders every 5 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove any existing job
    BEGIN
      PERFORM cron.unschedule('send-market-reminders');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'send-market-reminders',
      '*/5 * * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
        COALESCE(
          current_setting('app.settings.edge_functions_base_url', true),
          'http://host.docker.internal:54321/functions/v1'
        ) || '/send-market-reminders',
        json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU')
        )::text,
        '{}'::text
      )
    );
    RAISE NOTICE 'Scheduled send-market-reminders cron job every 5 minutes';
  ELSE
    RAISE NOTICE 'pg_cron not available, skipping send-market-reminders cron job';
  END IF;
END
$$;
