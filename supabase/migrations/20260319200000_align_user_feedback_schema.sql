-- Migration: Align user_feedback table with Community Voice app schema
-- The voice app expects columns (author_id, title, description, visibility)
-- but the table only has (reporter_id, message, screenshot_url)

-- 1. Add missing columns
ALTER TABLE public.user_feedback
  ADD COLUMN IF NOT EXISTS author_id uuid,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public' NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_to uuid;

-- 2. Copy existing data to new columns
UPDATE public.user_feedback
SET
  author_id = reporter_id,
  title = COALESCE(LEFT(message, 80), 'Untitled'),
  description = message
WHERE author_id IS NULL;

-- 3. Add FK from author_id to profiles
ALTER TABLE public.user_feedback
  DROP CONSTRAINT IF EXISTS user_feedback_author_id_fkey;
ALTER TABLE public.user_feedback
  ADD CONSTRAINT user_feedback_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES auth.users(id);

-- 4. Update type constraint to include voice app types
ALTER TABLE public.user_feedback
  DROP CONSTRAINT IF EXISTS user_feedback_type_check;
ALTER TABLE public.user_feedback
  ADD CONSTRAINT user_feedback_type_check
  CHECK (type IN ('bug', 'feature', 'improvement', 'other', 'bug_report', 'feature_request', 'support_request'));

-- 5. Update status constraint to include voice app statuses
ALTER TABLE public.user_feedback
  DROP CONSTRAINT IF EXISTS user_feedback_status_check;
ALTER TABLE public.user_feedback
  ADD CONSTRAINT user_feedback_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix', 'planned', 'under_review', 'completed', 'rejected', 'duplicate'));

-- 6. Add visibility constraint
ALTER TABLE public.user_feedback
  DROP CONSTRAINT IF EXISTS user_feedback_visibility_check;
ALTER TABLE public.user_feedback
  ADD CONSTRAINT user_feedback_visibility_check
  CHECK (visibility IN ('public', 'private'));

-- 7. Create index on author_id
CREATE INDEX IF NOT EXISTS idx_user_feedback_author ON public.user_feedback(author_id);

-- 8. Update RLS policies to allow read access for public tickets
-- First drop existing policies if any
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read public feedback" ON public.user_feedback;
  DROP POLICY IF EXISTS "Users can insert their own feedback" ON public.user_feedback;
  DROP POLICY IF EXISTS "Users can read their own private feedback" ON public.user_feedback;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Enable RLS
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- Public tickets are readable by everyone (including anonymous)
CREATE POLICY "Anyone can read public feedback"
  ON public.user_feedback FOR SELECT
  USING (visibility = 'public');

-- Logged-in users can read their own private feedback
CREATE POLICY "Users can read their own private feedback"
  ON public.user_feedback FOR SELECT
  USING (author_id = auth.uid() AND visibility = 'private');

-- Logged-in users can insert feedback
CREATE POLICY "Users can insert their own feedback"
  ON public.user_feedback FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- Users can update their own feedback
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own feedback" ON public.user_feedback;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "Users can update their own feedback"
  ON public.user_feedback FOR UPDATE
  USING (author_id = auth.uid());

-- 9. Same for feedback_votes, feedback_comments, feedback_flags
ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read votes" ON public.feedback_votes;
  DROP POLICY IF EXISTS "Users can insert votes" ON public.feedback_votes;
  DROP POLICY IF EXISTS "Users can delete own votes" ON public.feedback_votes;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "Anyone can read votes" ON public.feedback_votes FOR SELECT USING (true);
CREATE POLICY "Users can insert votes" ON public.feedback_votes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own votes" ON public.feedback_votes FOR DELETE USING (user_id = auth.uid());

ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read comments" ON public.feedback_comments;
  DROP POLICY IF EXISTS "Users can insert comments" ON public.feedback_comments;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "Anyone can read comments" ON public.feedback_comments FOR SELECT USING (true);
CREATE POLICY "Users can insert comments" ON public.feedback_comments FOR INSERT WITH CHECK (author_id = auth.uid());

ALTER TABLE public.feedback_flags ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read flags" ON public.feedback_flags;
  DROP POLICY IF EXISTS "Users can insert flags" ON public.feedback_flags;
  DROP POLICY IF EXISTS "Users can delete own flags" ON public.feedback_flags;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "Anyone can read flags" ON public.feedback_flags FOR SELECT USING (true);
CREATE POLICY "Users can insert flags" ON public.feedback_flags FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own flags" ON public.feedback_flags FOR DELETE USING (user_id = auth.uid());

-- 10. Grant anon user read access to these tables (for non-logged-in board browsing)
GRANT SELECT ON public.user_feedback TO anon;
GRANT SELECT ON public.feedback_votes TO anon;
GRANT SELECT ON public.feedback_comments TO anon;
GRANT SELECT ON public.feedback_flags TO anon;
GRANT SELECT ON public.profiles TO anon;
