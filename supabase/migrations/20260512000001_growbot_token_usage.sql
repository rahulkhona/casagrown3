-- GrowBot token usage tracking — one row per user exchange
CREATE TABLE IF NOT EXISTS public.growbot_token_usage (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_session_id text,       -- browser-generated UUID for anonymous users
  prompt_tokens    integer     NOT NULL DEFAULT 0,
  response_tokens  integer     NOT NULL DEFAULT 0,
  total_tokens     integer     NOT NULL DEFAULT 0,
  agentic_turns    integer     NOT NULL DEFAULT 1, -- tool-calling round-trips per exchange
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growbot_usage_user_id    ON public.growbot_token_usage (user_id);
CREATE INDEX IF NOT EXISTS idx_growbot_usage_created_at ON public.growbot_token_usage (created_at);
CREATE INDEX IF NOT EXISTS idx_growbot_usage_guest      ON public.growbot_token_usage (guest_session_id)
  WHERE guest_session_id IS NOT NULL;

-- Only the service role (edge function) can write; no direct client access
ALTER TABLE public.growbot_token_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON public.growbot_token_usage USING (false);
