-- Migration: Guest Experimentation Support
-- Updates the experimentation schema to support guest users and segment-aware targeting.

-- 1. Update experiment_assignments
ALTER TABLE experiment_assignments 
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE experiment_assignments
  ADD COLUMN IF NOT EXISTS context jsonb DEFAULT '{}',
  ADD CONSTRAINT experiment_assignments_identifier_check 
    CHECK (user_id IS NOT NULL OR device_id IS NOT NULL);

-- Add unique constraints for both paths to ensure one assignment per identifier
ALTER TABLE experiment_assignments DROP CONSTRAINT IF EXISTS experiment_assignments_experiment_id_user_id_key;
CREATE UNIQUE INDEX experiment_assignments_user_idx 
  ON experiment_assignments (experiment_id, user_id) 
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX experiment_assignments_device_idx 
  ON experiment_assignments (experiment_id, device_id) 
  WHERE user_id IS NULL;

-- 2. Update experiment_events
ALTER TABLE experiment_events 
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE experiment_events
  ADD COLUMN IF NOT EXISTS device_id text;
