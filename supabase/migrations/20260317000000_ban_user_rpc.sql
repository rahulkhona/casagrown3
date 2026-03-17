-- ============================================================================
-- Staff User Management RPCs
-- Ban/unban users and search user profiles (staff-only, SECURITY DEFINER).
-- ============================================================================

-- 1. staff_ban_user — set is_banned on profiles (bypasses RLS)
CREATE OR REPLACE FUNCTION staff_ban_user(
  target_user_id UUID,
  banned BOOLEAN,
  reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_roles TEXT[];
BEGIN
  -- Check caller is staff with admin or moderator role
  SELECT roles INTO v_caller_roles
  FROM staff_members
  WHERE user_id = auth.uid();

  IF v_caller_roles IS NULL
     OR NOT (v_caller_roles && ARRAY['admin', 'moderator']) THEN
    RETURN jsonb_build_object('error', 'Unauthorized — admin or moderator role required');
  END IF;

  -- Prevent staff from banning themselves
  IF target_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'Cannot ban yourself');
  END IF;

  UPDATE profiles SET
    is_banned = banned,
    ban_reason = CASE WHEN banned THEN COALESCE(reason, 'Banned by staff') ELSE NULL END,
    banned_at = CASE WHEN banned THEN NOW() ELSE NULL END
  WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'userId', target_user_id,
    'banned', banned
  );
END;
$$;

-- 2. staff_fetch_users — paginated user search (staff-only)
CREATE OR REPLACE FUNCTION staff_fetch_users(
  search_text TEXT DEFAULT '',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 25
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entries JSONB;
  v_total BIGINT;
  v_offset INTEGER;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Total matching count
  SELECT COUNT(*) INTO v_total
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE (search_text = '' OR
         p.full_name ILIKE '%' || search_text || '%' OR
         au.email ILIKE '%' || search_text || '%');

  -- Paginated results
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'email', COALESCE(au.email, ''),
    'fullName', COALESCE(p.full_name, ''),
    'avatarUrl', p.avatar_url,
    'isBanned', COALESCE(p.is_banned, false),
    'banReason', p.ban_reason,
    'bannedAt', p.banned_at,
    'createdAt', p.created_at
  )), '[]'::jsonb) INTO v_entries
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE (search_text = '' OR
         p.full_name ILIKE '%' || search_text || '%' OR
         au.email ILIKE '%' || search_text || '%')
  ORDER BY p.created_at DESC
  LIMIT p_page_size OFFSET v_offset;

  RETURN jsonb_build_object(
    'users', v_entries,
    'totalCount', v_total
  );
END;
$$;
