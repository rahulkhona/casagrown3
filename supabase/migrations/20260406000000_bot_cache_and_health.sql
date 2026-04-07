-- Migration: Bot Cache and Health Updates
-- Desc: Migrates the Gemini bot cache into Supabase, and streamlines health tracking to save database space since it runs 3x a day.

-- 1. Streamline the health tracking table
ALTER TABLE quarantine_bot_health
DROP COLUMN IF EXISTS log_summary;

-- 2. Create the Pest Categories cache table
CREATE TABLE IF NOT EXISTS quarantine_pest_categories (
  pest_name text PRIMARY KEY,
  category text NOT NULL,
  produce_category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE quarantine_pest_categories ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read it (useful if we want to show category mapping in Next-Admin later)
CREATE POLICY "Admins can view pest categories"
  ON quarantine_pest_categories FOR SELECT
  USING (has_staff_role(auth.uid(), 'admin'));

-- Policy: Only Service Role can insert/update (runs via background bot)
CREATE POLICY "Service roles can insert pest categories"
  ON quarantine_pest_categories FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service roles can update pest categories"
  ON quarantine_pest_categories FOR UPDATE
  USING (true)
  WITH CHECK (true);
