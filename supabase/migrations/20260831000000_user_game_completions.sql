-- Migration: User Game Completions Table for Multi-Device Cross-Device Lock
-- Author: Antigravity AI
-- Description: Creates user_game_completions table to track daily game completions for logged-in users across devices.

SET search_path TO public, extensions;

CREATE TABLE IF NOT EXISTS public.user_game_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  game_date DATE NOT NULL DEFAULT CURRENT_DATE,
  solve_time_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT user_game_completions_unique UNIQUE (user_id, game_id, game_date)
);

-- RLS Policies
ALTER TABLE public.user_game_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own game completions"
  ON public.user_game_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own game completions"
  ON public.user_game_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Schema Documentation Comments
COMMENT ON TABLE public.user_game_completions IS 'Tracks completed daily games per user and date for cross-device locking.';
COMMENT ON COLUMN public.user_game_completions.user_id IS 'Foreign key referencing auth.users.';
COMMENT ON COLUMN public.user_game_completions.game_id IS 'Identifier of the daily game instance.';
COMMENT ON COLUMN public.user_game_completions.game_date IS 'Date of completion (YYYY-MM-DD).';
COMMENT ON COLUMN public.user_game_completions.solve_time_seconds IS 'Time taken in seconds to solve the puzzle.';
