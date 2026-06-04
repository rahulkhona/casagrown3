-- Add social message history tables to supabase_realtime publication
-- to enable real-time message updates on the Merchant Dashboard chat thread screens.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'ig_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ig_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'messenger_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messenger_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'wa_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
  END IF;
END $$;
