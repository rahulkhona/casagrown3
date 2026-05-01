-- Create a type for the response
DROP TYPE IF EXISTS pending_payout_admin_result CASCADE;
CREATE TYPE pending_payout_admin_result AS (
  id uuid,
  user_id uuid,
  full_name text,
  email text,
  provider text,
  status text,
  point_cost integer,
  metadata jsonb,
  created_at timestamptz,
  failed_reason text
);

-- Note: We intentionally avoid restricting by precise limit for the admin dashboard since 
-- it needs to see the full queue size for reconciliation. The frontend will paginate.
CREATE OR REPLACE FUNCTION get_pending_payouts_admin(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS SETOF pending_payout_admin_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security check is handled by the /api/admin Node endpoint validating the user against staff_members

  RETURN QUERY
  SELECT 
    r.id,
    r.user_id,
    p.full_name,
    u.email::text,
    r.provider::text,
    r.status::text,
    r.point_cost,
    r.metadata,
    r.created_at,
    r.failed_reason
  FROM redemptions r
  LEFT JOIN profiles p ON p.id = r.user_id
  LEFT JOIN auth.users u ON u.id = r.user_id
  WHERE r.status IN ('pending', 'queued', 'failed')
  ORDER BY r.created_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execution to authenticated roles
REVOKE EXECUTE ON FUNCTION get_pending_payouts_admin FROM public;
GRANT EXECUTE ON FUNCTION get_pending_payouts_admin TO authenticated;
