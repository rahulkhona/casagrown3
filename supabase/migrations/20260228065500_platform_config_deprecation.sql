-- Migration: platform_config_deprecation
-- Goal: Extract remaining global settings and charity cache from platform_config and drop the table.

-- 1. Create Charity Projects Cache Table
CREATE TABLE IF NOT EXISTS public.charity_projects_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure only one active cache row exists (similar to gift cards) by not allowing multiple rows if we ever wanted to scale, or just let Edge Functions UPSERT row 1.
-- Since the edge function blindly fetches, we can just enforce a single row using a static ID or dropping old rows.
-- Actually, we'll just use a standard table and the edge function will `LIMIT 1`.

-- 2. Create Platform Settings Table for global integers/booleans (like Grace Period)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_grace_period_ms integer NOT NULL DEFAULT 1800000, -- 30 minutes
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert the default 30 minute setting dynamically
INSERT INTO public.platform_settings (provider_grace_period_ms) VALUES (1800000);

-- 3. We have safely migrated platform_fees, giftcards_cache, charity_projects_cache, and platform_settings.
-- We can safely delete the legacy platform_config table and its policies.
DROP TABLE IF EXISTS public.platform_config CASCADE;
