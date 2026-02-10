-- Platform configuration key-value store
-- Used for settings like platform fee percentage that can be changed
-- without code deployments.

CREATE TABLE IF NOT EXISTS public.platform_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read config
CREATE POLICY "Authenticated users can read platform config"
  ON public.platform_config
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed default platform fee
INSERT INTO public.platform_config (key, value, description)
VALUES ('platform_fee_percent', '10', 'Platform fee percentage charged on completed sales')
ON CONFLICT (key) DO NOTHING;
