-- Add IP address tracking to growbot_token_usage for guest rate limiting
-- Allows per-IP enforcement: guests limited to N free exchanges before sign-in wall

ALTER TABLE public.growbot_token_usage
  ADD COLUMN IF NOT EXISTS ip_address inet;

-- Index for fast IP-based guest count lookups (today's guest rows only)
CREATE INDEX IF NOT EXISTS idx_growbot_usage_ip_guest
  ON public.growbot_token_usage (ip_address, created_at)
  WHERE user_id IS NULL;

COMMENT ON COLUMN public.growbot_token_usage.ip_address
  IS 'Client IP at time of request. Used for guest rate limiting (N free exchanges per IP per day).';
