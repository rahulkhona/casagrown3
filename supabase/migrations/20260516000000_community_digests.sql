-- Community Digests — AI-generated summaries of recent community discussions
-- Used in share/invite messages to make them timely and compelling
-- Generated hourly via cron; skipped if no new messages since last digest

CREATE TABLE IF NOT EXISTS public.community_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary text NOT NULL,
  message_count int NOT NULL DEFAULT 0,
  last_message_id uuid REFERENCES public.community_chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only need the latest digest
CREATE INDEX idx_community_digests_latest
  ON public.community_digests(created_at DESC);

-- RLS: anyone authenticated can read, service role can write
ALTER TABLE public.community_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_digests_select ON public.community_digests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY community_digests_service_all ON public.community_digests
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.community_digests IS 'Hourly AI-generated summaries of community chat for use in share/invite messages';
