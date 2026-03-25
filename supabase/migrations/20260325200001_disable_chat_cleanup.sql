-- =============================================================================
-- Disable message expiry for launch phase
-- Keep all messages until we have critical mass
-- =============================================================================

-- 1. Unschedule the hourly cleanup cron job (if pg_cron is available)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('cleanup-stale-chat-messages');
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Ignore if job doesn't exist
        NULL;
END;
$$;

-- 2. Replace the cleanup function with a no-op that returns 0
--    (keeps the function signature intact for when we re-enable later)
CREATE OR REPLACE FUNCTION public.cleanup_stale_chat_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- DISABLED for launch: keeping all messages until critical mass
    -- Original: DELETE non-pinned messages older than 7 days
    RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_chat_messages IS 'DISABLED for launch — no messages are deleted. Re-enable when community has critical mass.';
