-- Messenger message history for conversation context

CREATE TABLE IF NOT EXISTS public.messenger_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.messenger_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'bot', 'seller')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messenger_messages_conv ON public.messenger_messages(conversation_id, created_at);

ALTER TABLE public.messenger_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on messenger_messages"
  ON public.messenger_messages TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE ON public.messenger_messages TO service_role;
