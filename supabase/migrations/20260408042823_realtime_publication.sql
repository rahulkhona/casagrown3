-- Enable real-time replication for the Community Chat tables
-- This is strictly required for `supabase.channel().on('postgres_changes')` to broadcast!

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'community_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_chat_messages;
  END IF;
END $$;
