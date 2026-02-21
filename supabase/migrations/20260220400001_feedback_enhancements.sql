-- Migration: Feedback enhancements for Community Voice
-- Adds support_request type, visibility enum, new columns on user_feedback,
-- status history audit table, and comment media junction table.

-------------------------------------------------------------------
-- 1. Extend feedback_type enum with support_request
-------------------------------------------------------------------
ALTER TYPE feedback_type ADD VALUE IF NOT EXISTS 'support_request';

-------------------------------------------------------------------
-- 2. New enum: feedback_visibility
-------------------------------------------------------------------
CREATE TYPE feedback_visibility AS ENUM ('public', 'private');

-------------------------------------------------------------------
-- 3. Add columns to user_feedback
-------------------------------------------------------------------
ALTER TABLE user_feedback
  ADD COLUMN visibility  feedback_visibility NOT NULL DEFAULT 'public',
  ADD COLUMN updated_at  timestamptz DEFAULT now(),
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN assigned_to uuid REFERENCES profiles(id);

-- Index for filtering by visibility
CREATE INDEX idx_user_feedback_visibility ON user_feedback(visibility);

-- Index for assigned staff lookups
CREATE INDEX idx_user_feedback_assigned ON user_feedback(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- Trigger: auto-update updated_at on any change
CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feedback_updated_at
  BEFORE UPDATE ON user_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_feedback_updated_at();

-- Trigger: auto-set resolved_at when status changes to completed/rejected
CREATE OR REPLACE FUNCTION set_feedback_resolved_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('completed', 'rejected') AND OLD.status NOT IN ('completed', 'rejected') THEN
    NEW.resolved_at = now();
  ELSIF NEW.status NOT IN ('completed', 'rejected') AND OLD.status IN ('completed', 'rejected') THEN
    -- If reopened, clear resolved_at
    NEW.resolved_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feedback_resolved_at
  BEFORE UPDATE ON user_feedback
  FOR EACH ROW
  EXECUTE FUNCTION set_feedback_resolved_at();

-------------------------------------------------------------------
-- 4. Status history audit table
-------------------------------------------------------------------
CREATE TABLE feedback_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES user_feedback(id) ON DELETE CASCADE,
  old_status  feedback_status,
  new_status  feedback_status NOT NULL,
  changed_by  uuid NOT NULL REFERENCES profiles(id),
  note        text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_feedback_status_history_feedback
  ON feedback_status_history(feedback_id);

-- Trigger: auto-insert status history row on status change
CREATE OR REPLACE FUNCTION log_feedback_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO feedback_status_history (feedback_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_feedback_status_change
  AFTER UPDATE ON user_feedback
  FOR EACH ROW
  EXECUTE FUNCTION log_feedback_status_change();

-------------------------------------------------------------------
-- 5. Comment media junction table (for document/PDF attachments)
-------------------------------------------------------------------
CREATE TABLE feedback_comment_media (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES feedback_comments(id) ON DELETE CASCADE,
  media_id   uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  UNIQUE(comment_id, media_id)
);
