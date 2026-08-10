-- Migration: Guest Gameplay History & Guest Push Subscriptions
-- Enables recording gameplay & push tokens for unauthenticated guests,
-- with seamless merge onto registered user profiles upon login/signup.

SET search_path TO public, extensions;

-- 1. Upgrade user_game_completions table for Guest Users
ALTER TABLE public.user_game_completions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.user_game_completions ADD COLUMN IF NOT EXISTS guest_id TEXT;

CREATE INDEX IF NOT EXISTS idx_user_game_completions_guest_id ON public.user_game_completions(guest_id);
CREATE INDEX IF NOT EXISTS idx_user_game_completions_date ON public.user_game_completions(game_date);

-- Enable RLS inserts/selects for anonymous guests
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Guests can insert own game completions' AND tablename = 'user_game_completions') THEN
    CREATE POLICY "Guests can insert own game completions"
      ON public.user_game_completions FOR INSERT
      WITH CHECK (guest_id IS NOT NULL OR auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Guests can read own game completions' AND tablename = 'user_game_completions') THEN
    CREATE POLICY "Guests can read own game completions"
      ON public.user_game_completions FOR SELECT
      USING (guest_id IS NOT NULL OR auth.uid() = user_id);
  END IF;
END $$;

-- 2. Upgrade push_subscriptions table for Guest Users
ALTER TABLE public.push_subscriptions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS guest_id TEXT;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_guest_id ON public.push_subscriptions(guest_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Guests can insert push subscriptions' AND tablename = 'push_subscriptions') THEN
    CREATE POLICY "Guests can insert push subscriptions"
      ON public.push_subscriptions FOR INSERT
      WITH CHECK (guest_id IS NOT NULL OR auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Guests can select push subscriptions' AND tablename = 'push_subscriptions') THEN
    CREATE POLICY "Guests can select push subscriptions"
      ON public.push_subscriptions FOR SELECT
      USING (guest_id IS NOT NULL OR auth.uid() = user_id);
  END IF;
END $$;

-- 3. Seamless Guest-to-User History Merge RPC Function
CREATE OR REPLACE FUNCTION public.merge_guest_history_on_signup(p_guest_id TEXT, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF p_guest_id IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Merge game completions
  UPDATE public.user_game_completions
  SET user_id = p_user_id
  WHERE guest_id = p_guest_id AND user_id IS NULL;

  -- Merge push subscriptions
  UPDATE public.push_subscriptions
  SET user_id = p_user_id
  WHERE guest_id = p_guest_id AND user_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.merge_guest_history_on_signup(TEXT, UUID) TO authenticated, anon;

-- Comments
COMMENT ON COLUMN public.user_game_completions.guest_id IS 'Anonymous guest device ID for unauthenticated gameplay logging.';
COMMENT ON COLUMN public.push_subscriptions.guest_id IS 'Anonymous guest device ID for web/mobile push tokens prior to login.';
