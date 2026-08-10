-- Migration: Daily Puzzles Schema & Morning Generation Cron
-- Author: Antigravity AI
-- Description: Creates daily_puzzles table to store once-per-day generated puzzles and configures morning pg_cron generation.

SET search_path TO public, extensions;

-- 1. Daily Puzzles Table (Central single-source-of-truth for today's puzzles)
CREATE TABLE IF NOT EXISTS public.daily_puzzles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  crop_name TEXT NOT NULL,
  puzzle_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT daily_puzzles_date_category_unique UNIQUE (puzzle_date, category)
);

ALTER TABLE public.daily_puzzles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read daily puzzles"
  ON public.daily_puzzles FOR SELECT
  USING (true);

COMMENT ON TABLE public.daily_puzzles IS 'Central table storing once-per-day generated puzzles for all players.';
COMMENT ON COLUMN public.daily_puzzles.puzzle_date IS 'Calendar date of the puzzle (YYYY-MM-DD).';
COMMENT ON COLUMN public.daily_puzzles.category IS 'Category: garden_spell, math, jigsaw, garden_plots, anagram, memory_match.';
COMMENT ON COLUMN public.daily_puzzles.puzzle_data IS 'JSONB payload containing crop target, equations, grid configuration, or anagram text.';

-- 2. PL/pgSQL Function to generate today's 6 puzzles once per day
CREATE OR REPLACE FUNCTION public.generate_daily_puzzles(p_date DATE DEFAULT CURRENT_DATE)
RETURNS void AS $$
DECLARE
  v_crops TEXT[] := ARRAY['LEMON', 'AVOCADO', 'TOMATO', 'BASIL', 'FIGS', 'SPINACH', 'ZUCCHINI', 'GARLIC', 'PEPPER', 'STRAWBERRY', 'CARROT', 'MINT'];
  v_crop_index INT;
  v_crop TEXT;
BEGIN
  -- Day-of-year index (1 - 366) ensures deterministic daily crop rotation
  v_crop_index := (extract(doy from p_date)::int % array_length(v_crops, 1)) + 1;
  v_crop := v_crops[v_crop_index];

  -- Insert Garden Spell (Wordle)
  INSERT INTO public.daily_puzzles (puzzle_date, category, title, crop_name, puzzle_data)
  VALUES (
    p_date, 'garden_spell', 'Garden Spell', v_crop,
    jsonb_build_object('targetWord', v_crop, 'hint', 'Fresh backyard ' || lower(v_crop))
  ) ON CONFLICT (puzzle_date, category) DO NOTHING;

  -- Insert Nutri-Calc (Math)
  INSERT INTO public.daily_puzzles (puzzle_date, category, title, crop_name, puzzle_data)
  VALUES (
    p_date, 'math', 'Harvest Nutri-Calc', v_crop,
    jsonb_build_object('targetAnswer', '26', 'usdaFact', '1 cup of fresh ' || lower(v_crop) || ' provides 26% daily recommended vitamin C & fiber!')
  ) ON CONFLICT (puzzle_date, category) DO NOTHING;

  -- Insert Harvest Jigsaw
  INSERT INTO public.daily_puzzles (puzzle_date, category, title, crop_name, puzzle_data)
  VALUES (
    p_date, 'jigsaw', 'Harvest Jigsaw', v_crop,
    jsonb_build_object('imageUrl', 'https://upload.wikimedia.org/wikipedia/commons/f/f3/MeyerLemon.jpg', 'rows', 3, 'cols', 3)
  ) ON CONFLICT (puzzle_date, category) DO NOTHING;

  -- Insert Garden Plots (Crowns)
  INSERT INTO public.daily_puzzles (puzzle_date, category, title, crop_name, puzzle_data)
  VALUES (
    p_date, 'garden_plots', 'Garden Plots', v_crop,
    jsonb_build_object('gridSize', 5, 'crownsCount', 5)
  ) ON CONFLICT (puzzle_date, category) DO NOTHING;

  -- Insert Crop Anagram
  INSERT INTO public.daily_puzzles (puzzle_date, category, title, crop_name, puzzle_data)
  VALUES (
    p_date, 'anagram', 'Crop Anagram', v_crop,
    jsonb_build_object('anagramText', 'S-M-O-N-E-L', 'solutionWord', 'LEMONS', 'varietyDetail', 'Meyer Lemons — Sweet, juicy backyard citrus')
  ) ON CONFLICT (puzzle_date, category) DO NOTHING;

  -- Insert Memory Match
  INSERT INTO public.daily_puzzles (puzzle_date, category, title, crop_name, puzzle_data)
  VALUES (
    p_date, 'memory_match', 'Memory Match', v_crop,
    jsonb_build_object('pairsCount', 6)
  ) ON CONFLICT (puzzle_date, category) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate initial batch for today
SELECT public.generate_daily_puzzles(CURRENT_DATE);

-- 3. Schedule morning pg_cron in Supabase (runs every day at 5:00 AM EST / 10:00 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'generate-daily-puzzles-morning',
      '0 10 * * *',
      'SELECT public.generate_daily_puzzles(CURRENT_DATE);'
    );
  END IF;
END $$;
