-- ============================================================================
-- Migration: Fix zone_pulse RLS Trigger Bypass
-- Grants explicit permissions and a trigger-specific RLS policy 
-- so authenticated users can safely trigger the update_zone_pulse function
-- without throwing RLS constraint errors.
-- ============================================================================

-- 1. Grant explicit INSERT and UPDATE privileges to the roles hitting the table.
-- (This does NOT allow them to write arbitrarily yet, because RLS blocks them).
GRANT INSERT, UPDATE ON zone_pulse TO authenticated, anon;

-- 2. Create the RLS policy that specifically uses pg_trigger_depth()
-- This mathematically guarantees that normal API queries ("supabase.from(...)") 
-- are strictly blocked from writing, but if the write originates from our own 
-- server-side trigger (like trg_zone_pulse_products), it is explicitly allowed!
CREATE POLICY "Allow trigger writes to zone_pulse" 
ON zone_pulse 
FOR ALL 
TO authenticated, anon
USING (pg_trigger_depth() > 0)
WITH CHECK (pg_trigger_depth() > 0);

-- Note: We only added FOR ALL here. Existing policies still cover FOR SELECT.
