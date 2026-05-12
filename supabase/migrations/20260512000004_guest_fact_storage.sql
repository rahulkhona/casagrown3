-- Allow guest users to save progressive profiling facts before authenticating
-- Facts are linked via guest_session_id and migrated to user_id on auth

ALTER TABLE public.growbot_user_facts ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.growbot_user_facts
  ADD COLUMN IF NOT EXISTS guest_session_id text;

CREATE INDEX IF NOT EXISTS idx_guf_guest
  ON public.growbot_user_facts(guest_session_id)
  WHERE guest_session_id IS NOT NULL;
