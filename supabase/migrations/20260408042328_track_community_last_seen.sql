-- Add an RPC to forcefully update a user's community "last seen" threshold
-- We map this directly to the existing `buzz_welcomed_at` column to prevent schema drift
CREATE OR REPLACE FUNCTION public.update_profile_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles
    SET buzz_welcomed_at = NOW()
    WHERE id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.update_profile_last_seen IS 'Instantly stamps the user profile exit time from the Community WebSocket layout to freeze unread counts.';
