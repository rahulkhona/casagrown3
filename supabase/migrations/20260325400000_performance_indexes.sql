-- =============================================================================
-- Emergency hotfix: Database connection exhaustion
-- =============================================================================

-- 1. Unschedule the casabot cron job that is hitting a dead docker-internal URL,
-- which may be exhausting pg_net workers or holding idle connections
SELECT cron.unschedule('casabot-auto-reply-job');

-- 2. Create partial index on created_at for all top-level messages to prevent
-- the global scope RPC query from initiating a full-table scan and executing
-- correlated subqueries on every row for every polling client.
CREATE INDEX IF NOT EXISTS idx_ccm_top_level_created 
ON public.community_chat_messages (created_at DESC) 
WHERE parent_id IS NULL;

-- 3. Optimize the reaction counts to prevent sequential scans during RPC aggregation
CREATE INDEX IF NOT EXISTS idx_ccr_message_id 
ON public.community_chat_reactions (message_id);
