-- Migration: Add offered column to subscription_tiers configuration
-- =================================================================

SET search_path TO public, extensions;

ALTER TABLE public.subscription_tiers ADD COLUMN IF NOT EXISTS offered BOOLEAN NOT NULL DEFAULT true;

-- Successfully added offered column to subscription_tiers.
