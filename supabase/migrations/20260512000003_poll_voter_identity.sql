-- Add voter identity columns to poll tables
-- Allows displaying who voted and who suggested

ALTER TABLE public.growbot_response_votes
  ADD COLUMN IF NOT EXISTS voter_name text;

ALTER TABLE public.growbot_response_suggestions
  ADD COLUMN IF NOT EXISTS voter_name text;
