-- 20260418000000_chat_composite_index.sql
-- Optimizing PostgREST LATERAL Limit Queries
-- The addition of `.limit(1, {foreignTable: 'market_chat_messages'})` on the Next.js frontend
-- prevents huge payload downloads but introduces severe O(N log N) sorting overhead per conversation.
-- This composite index allows Postgres to fetch the most recent message bounds in O(1) time.

BEGIN;

-- Drop the old inefficient single-column index targeting the same access path
DROP INDEX IF EXISTS idx_market_chat_messages_conversation;

-- Replace with the LATERAL-optimized composite B-Tree
CREATE INDEX IF NOT EXISTS idx_market_chat_msg_conv_created_desc
ON public.market_chat_messages(conversation_id, created_at DESC);

COMMIT;
