-- ============================================================================
-- Migration: Add missing California to states table
-- The original states seed was missing California (CA), causing all
-- CDFA quarantine records to have NULL state_id and breaking
-- jurisdiction-based filtering for CA users.
-- ============================================================================

INSERT INTO public.states (id, country_iso_3, code, name)
VALUES (gen_random_uuid(), 'USA', 'CA', 'California')
ON CONFLICT DO NOTHING;
