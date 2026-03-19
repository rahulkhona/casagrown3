-- Fix: FK must point to profiles(id) not auth.users(id)
-- PostgREST discovers joins via FKs in the public schema.
-- The voice app code does: profiles!author_id(full_name, avatar_url)
-- which requires a FK from user_feedback.author_id → profiles.id

-- Drop the auth.users FK
ALTER TABLE public.user_feedback
  DROP CONSTRAINT IF EXISTS user_feedback_author_id_fkey;

-- Add FK to profiles(id) instead
ALTER TABLE public.user_feedback
  ADD CONSTRAINT user_feedback_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id);

-- Also add FK for feedback_comments.author_id → profiles.id if missing
ALTER TABLE public.feedback_comments
  DROP CONSTRAINT IF EXISTS feedback_comments_author_id_fkey;
ALTER TABLE public.feedback_comments
  ADD CONSTRAINT feedback_comments_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id);
