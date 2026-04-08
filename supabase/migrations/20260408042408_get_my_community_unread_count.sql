-- Wrapper RPC to fetch unread community messages efficiently in 1 network trip
CREATE OR REPLACE FUNCTION public.get_my_community_unread_count()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_profile record;
    v_count bigint;
BEGIN
    SELECT home_community_h3_index, buzz_welcomed_at INTO v_profile
    FROM public.profiles 
    WHERE id = auth.uid();
    
    IF v_profile.home_community_h3_index IS NULL THEN 
        RETURN 0; 
    END IF;

    -- Count messages strictly in their local H3 area that are newer than their last visit
    SELECT COUNT(*) INTO v_count
    FROM public.community_chat_messages
    WHERE parent_id IS NULL
      AND created_at > COALESCE(v_profile.buzz_welcomed_at, '2000-01-01'::timestamptz)
      AND author_id != auth.uid()
      AND community_h3_index = v_profile.home_community_h3_index;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.get_my_community_unread_count IS 'Efficiently calculates localized unread community messages by pulling the user profile internally, requiring only 1 network trip from the client.';
