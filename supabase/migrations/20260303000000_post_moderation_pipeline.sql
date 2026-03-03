-- Post Moderation Pipeline + Notification Auto-Expiry
--
-- 1. post_status enum + column (pass-through: review → available instantly)
-- 2. Flag threshold trigger (≥3 flags → flagged)
-- 3. Notification auto-expiry (30 day)
-- 4. Notification DELETE RLS policy

-- ============================================================
-- 1. Post Status
-- ============================================================
DO $$ BEGIN
  CREATE TYPE post_status AS ENUM (
    'review',      -- Just created, awaiting verification
    'available',   -- Passed review, visible in feed
    'flagged',     -- Community-flagged, hidden pending admin review
    'rejected',    -- AI rejected, user must edit
    'removed'      -- Admin removed
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add status column (default 'available' for pass-through initially)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS status post_status NOT NULL DEFAULT 'available';
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status) WHERE status = 'available';

-- ============================================================
-- 2. Flag Threshold Trigger
-- When a post receives ≥ 3 flags, auto-set status to 'flagged'
-- and notify the author.
-- ============================================================
CREATE OR REPLACE FUNCTION check_post_flag_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_flag_count INTEGER;
  v_post_row RECORD;
BEGIN
  -- Count total flags for this post
  SELECT COUNT(*) INTO v_flag_count
  FROM post_flags WHERE post_id = NEW.post_id;

  IF v_flag_count >= 3 THEN
    -- Get the post
    SELECT id, author_id, status INTO v_post_row
    FROM posts WHERE id = NEW.post_id;

    -- Only flag if currently 'available'
    IF v_post_row.status = 'available' THEN
      UPDATE posts SET status = 'flagged', updated_at = now()
      WHERE id = NEW.post_id;

      -- Notify the author
      INSERT INTO notifications (user_id, content, link_url)
      VALUES (
        v_post_row.author_id,
        'Your post has been flagged by community members and is under review. It will be hidden until an admin reviews it.',
        '/my-posts'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_post_flag_threshold ON post_flags;
CREATE TRIGGER trg_post_flag_threshold
  AFTER INSERT ON post_flags
  FOR EACH ROW
  EXECUTE FUNCTION check_post_flag_threshold();

-- ============================================================
-- 3. Notification Auto-Expiry (30 days)
-- Uses pg_cron if available, otherwise no-op.
-- ============================================================
DO $outer$
BEGIN
  -- Only create the cron job if pg_cron extension is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-old-notifications',
      '0 3 * * *',
      $cron$DELETE FROM public.notifications WHERE created_at < now() - interval '30 days'$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available in local dev, skip silently
  RAISE NOTICE 'pg_cron not available, skipping notification cleanup cron job';
END $outer$;

-- ============================================================
-- 4. Notification DELETE RLS policy
-- Users can delete their own notifications (for "Clear all")
-- ============================================================
DO $$ BEGIN
  CREATE POLICY "Users can delete their own notifications"
    ON notifications FOR DELETE TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
