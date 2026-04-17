-- 20260416000000_chat_indexes.sql
-- Missing Foreign Key BTREE Indexes for Market App Direct Messaging
-- These are structurally required to prevent O(N^2) Cartesian evaluation loops during row-level security EXISTS subqueries.

CREATE INDEX IF NOT EXISTS idx_market_conversations_participant_a ON public.market_conversations(participant_a);
CREATE INDEX IF NOT EXISTS idx_market_conversations_participant_b ON public.market_conversations(participant_b);
CREATE INDEX IF NOT EXISTS idx_market_chat_messages_conversation ON public.market_chat_messages(conversation_id);
