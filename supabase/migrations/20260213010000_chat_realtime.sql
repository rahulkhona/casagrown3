-- Enable Supabase Realtime for chat_messages table
-- This allows real-time message delivery across all connected clients.
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- REPLICA IDENTITY FULL is required so that UPDATE events broadcast all
-- columns (not just the PK). Without this, the realtime filter
-- `conversation_id=eq.X` cannot match, and delivery/read receipts
-- never reach the sender.
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
