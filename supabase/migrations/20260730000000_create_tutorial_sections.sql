-- Migration: Create public.tutorial_sections table
-- Enables administrators to manage customer-facing tutorial video sections.

CREATE TABLE public.tutorial_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text NOT NULL,
  video_url    text NOT NULL, -- Full URL (e.g. YouTube standard, Shorts, or future Cloudflare URL)
  sort_order   integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient ordering
CREATE INDEX idx_tutorial_sections_order ON public.tutorial_sections(sort_order);

-- Enable RLS
ALTER TABLE public.tutorial_sections ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow public read access to tutorial_sections"
  ON public.tutorial_sections FOR SELECT
  TO public
  USING (is_published = true);

CREATE POLICY "Allow staff write access to tutorial_sections"
  ON public.tutorial_sections FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
