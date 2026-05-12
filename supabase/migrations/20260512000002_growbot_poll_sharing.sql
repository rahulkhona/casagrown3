-- Shared GrowBot responses (shareable poll pages)
CREATE TABLE public.growbot_shared_responses (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  question             text        NOT NULL,  -- the final user message that prompted this response
  bot_response         text        NOT NULL,  -- the specific bot response being polled
  conversation_context jsonb       DEFAULT '[]'::jsonb, -- full prior thread [{role,text},...] for context
  actions              jsonb       DEFAULT '[]'::jsonb,
  user_id              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_session_id     text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gsr_user    ON public.growbot_shared_responses (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_gsr_created ON public.growbot_shared_responses (created_at DESC);

ALTER TABLE public.growbot_shared_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read"   ON public.growbot_shared_responses FOR SELECT USING (true);
CREATE POLICY "public_insert" ON public.growbot_shared_responses FOR INSERT WITH CHECK (true);

-- Accuracy votes (one per voter per response)
CREATE TABLE public.growbot_response_votes (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  response_id uuid        NOT NULL REFERENCES public.growbot_shared_responses(id) ON DELETE CASCADE,
  voter_key   text        NOT NULL,  -- user_id or guest_session_id
  rating      text        NOT NULL CHECK (rating IN ('accurate', 'partial', 'inaccurate')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, voter_key)
);
ALTER TABLE public.growbot_response_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read"   ON public.growbot_response_votes FOR SELECT USING (true);
CREATE POLICY "public_insert" ON public.growbot_response_votes FOR INSERT WITH CHECK (true);

-- Community alternative suggestions
CREATE TABLE public.growbot_response_suggestions (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  response_id     uuid        NOT NULL REFERENCES public.growbot_shared_responses(id) ON DELETE CASCADE,
  voter_key       text        NOT NULL,
  suggestion_text text        NOT NULL,
  upvotes         integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_grs_response ON public.growbot_response_suggestions (response_id);
ALTER TABLE public.growbot_response_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read"   ON public.growbot_response_suggestions FOR SELECT USING (true);
CREATE POLICY "public_insert" ON public.growbot_response_suggestions FOR INSERT WITH CHECK (true);
CREATE POLICY "public_upvote" ON public.growbot_response_suggestions FOR UPDATE USING (true);
