-- GrowBot Co-pilot: booth settings, reply drafts, and conversation mode tracking

-- 1. Add GrowBot settings to market_booths
ALTER TABLE public.market_booths
  ADD COLUMN IF NOT EXISTS bot_reply_mode TEXT NOT NULL DEFAULT 'copilot'
    CHECK (bot_reply_mode IN ('copilot', 'off')),
  ADD COLUMN IF NOT EXISTS bot_reply_delay_minutes INT NOT NULL DEFAULT 5
    CHECK (bot_reply_delay_minutes BETWEEN 0 AND 15);

COMMENT ON COLUMN public.market_booths.bot_reply_mode IS 'copilot = show suggestions + auto-send after delay; off = no bot replies on DM/order chat';
COMMENT ON COLUMN public.market_booths.bot_reply_delay_minutes IS 'Minutes to wait for seller before GrowBot auto-sends (1-15)';

-- 2. Bot reply drafts table (suggestions shown to seller in copilot mode)
CREATE TABLE IF NOT EXISTS public.bot_reply_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context: which conversation and message triggered this
  channel TEXT NOT NULL CHECK (channel IN ('dm', 'order', 'messenger')),
  conversation_ref TEXT NOT NULL,        -- conversation_id (dm), order_id (order), messenger_conversation_id
  trigger_message_id UUID,               -- the buyer message that triggered suggestions
  booth_id UUID NOT NULL REFERENCES public.market_booths(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Suggestions
  suggestions JSONB NOT NULL DEFAULT '[]',  -- array of 2 draft reply strings
  selected_index INT,                        -- which suggestion seller picked (for learning)

  -- Timer
  auto_send_at TIMESTAMPTZ NOT NULL,         -- when to auto-send if seller hasn't responded
  
  -- State
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'seller_replied', 'cancelled', 'expired')),

  -- Buyer message content (for context in the UI)
  buyer_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_bot_reply_drafts_status ON public.bot_reply_drafts(status, auto_send_at);
CREATE INDEX idx_bot_reply_drafts_conv ON public.bot_reply_drafts(channel, conversation_ref, status);
CREATE INDEX idx_bot_reply_drafts_seller ON public.bot_reply_drafts(seller_id, status);

ALTER TABLE public.bot_reply_drafts ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on bot_reply_drafts"
  ON public.bot_reply_drafts TO service_role
  USING (true) WITH CHECK (true);

-- Sellers can view and update their own drafts
CREATE POLICY "Sellers can view own drafts"
  ON public.bot_reply_drafts FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY "Sellers can update own drafts"
  ON public.bot_reply_drafts FOR UPDATE
  TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

GRANT SELECT, UPDATE ON public.bot_reply_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_reply_drafts TO service_role;

-- 3. Conversation mode tracking on messenger_conversations
-- When GrowBot enters conversation mode (timer fired), it auto-replies immediately
-- until seller steps in or timeout expires
ALTER TABLE public.messenger_conversations
  ADD COLUMN IF NOT EXISTS bot_conversation_mode_until TIMESTAMPTZ;

COMMENT ON COLUMN public.messenger_conversations.bot_conversation_mode_until IS 'If set and > now(), GrowBot is in conversation mode (replies immediately without timer)';

-- 4. Add realtime for bot_reply_drafts so the seller UI gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_reply_drafts;
