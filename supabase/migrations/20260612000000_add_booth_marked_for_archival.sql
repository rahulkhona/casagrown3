-- Migration: Add marked_for_archival column to public.market_booths
-- =================================================================

SET search_path TO public, extensions;

ALTER TABLE public.market_booths ADD COLUMN IF NOT EXISTS marked_for_archival BOOLEAN DEFAULT FALSE;

-- Ensure RLS and indices are clean (optional but good practice)
CREATE INDEX IF NOT EXISTS market_booths_marked_for_archival_idx ON public.market_booths(marked_for_archival) WHERE marked_for_archival = TRUE;

-- Ensure that the Lite subscription tier always has Stripe fee handling set to 'absorb'
UPDATE public.subscription_tiers SET stripe_fee_handling = 'absorb' WHERE tier_name = 'lite';

