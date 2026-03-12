-- Migration: Add expires_at to posts with auto-compute trigger
-- This enables index-backed feed filtering without joining post_type_policies at query time.

-- 1. Add expires_at column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- 2. Trigger function: compute expires_at from post_type_policies on insert/repost
CREATE OR REPLACE FUNCTION set_post_expires_at()
RETURNS TRIGGER AS $$
DECLARE
  v_expiration_days integer;
BEGIN
  SELECT expiration_days INTO v_expiration_days
    FROM post_type_policies
   WHERE post_type = NEW.type;

  -- Fallback: 30 days if no policy found for this post type
  IF v_expiration_days IS NULL THEN
    v_expiration_days := 30;
  END IF;

  NEW.expires_at := NEW.created_at + (v_expiration_days || ' days')::interval;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fire on INSERT and on UPDATE of created_at (repost) or type
DROP TRIGGER IF EXISTS trg_set_expires_at ON posts;
CREATE TRIGGER trg_set_expires_at
  BEFORE INSERT OR UPDATE OF created_at, type ON posts
  FOR EACH ROW EXECUTE FUNCTION set_post_expires_at();

-- 3. Backfill existing posts
UPDATE posts SET expires_at = created_at + (
  SELECT (p.expiration_days || ' days')::interval
    FROM post_type_policies p
   WHERE p.post_type = posts.type
)
WHERE expires_at IS NULL;

-- Fallback for any posts with types not in post_type_policies
UPDATE posts SET expires_at = created_at + interval '30 days'
WHERE expires_at IS NULL;

-- 4. Partial index for fast feed queries
-- Postgres will only include rows that are available AND not yet expired
CREATE INDEX IF NOT EXISTS idx_posts_active_feed
  ON posts (community_h3_index, created_at DESC)
  WHERE status = 'available';
