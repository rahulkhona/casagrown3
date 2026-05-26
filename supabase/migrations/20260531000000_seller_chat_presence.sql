-- Track seller real-time presence/active state in DM chat threads
ALTER TABLE public.market_conversations
  ADD COLUMN IF NOT EXISTS seller_last_active_at TIMESTAMPTZ;

COMMENT ON COLUMN public.market_conversations.seller_last_active_at IS 'Timestamp of when the seller was last actively viewing this chat thread (updated by heartbeat)';

-- Track seller real-time presence/active state in Facebook Messenger threads
ALTER TABLE public.messenger_conversations
  ADD COLUMN IF NOT EXISTS seller_last_active_at TIMESTAMPTZ;

COMMENT ON COLUMN public.messenger_conversations.seller_last_active_at IS 'Timestamp of when the seller was last actively viewing this Messenger thread (updated by heartbeat)';
