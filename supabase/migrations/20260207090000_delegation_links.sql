-- Migration: Add delegation link columns and new status values to delegations table
-- Supports link-based delegation sharing (similar to invite/referral flow)

-- Add new status enum values needed for the link-based flow
ALTER TYPE delegation_status ADD VALUE IF NOT EXISTS 'pending_pairing';
ALTER TYPE delegation_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE delegation_status ADD VALUE IF NOT EXISTS 'inactive';

-- Allow delegatee_id to be NULL for link-based delegations (unknown until acceptance)
ALTER TABLE delegations ALTER COLUMN delegatee_id DROP NOT NULL;

-- Update the CHECK constraint to allow NULL delegatee_id
ALTER TABLE delegations DROP CONSTRAINT IF EXISTS delegations_check;
ALTER TABLE delegations ADD CONSTRAINT delegations_check
  CHECK (delegatee_id IS NULL OR delegator_id <> delegatee_id);

-- Add delegation_code (URL slug for shareable links) and message columns
ALTER TABLE delegations
  ADD COLUMN IF NOT EXISTS delegation_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS message TEXT;

-- Index for fast lookup by delegation_code (used by landing page)
CREATE UNIQUE INDEX IF NOT EXISTS idx_delegations_delegation_code
  ON delegations(delegation_code)
  WHERE delegation_code IS NOT NULL;

