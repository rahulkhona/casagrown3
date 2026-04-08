-- Enable real-time replication for the Direct Messaging (Market Chat) tables
-- This is strictly required for `supabase.channel().on('postgres_changes')` to broadcast!

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'market_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.market_chat_messages;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'market_chat_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.market_chat_reactions;
  END IF;
END $$;
