-- Add explicit GrowBot visit tracking to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS has_visited_growbot BOOLEAN DEFAULT false;

-- Index for fast lookup during welcome flow
CREATE INDEX IF NOT EXISTS idx_profiles_growbot_visit ON public.profiles(id) WHERE has_visited_growbot = false;
