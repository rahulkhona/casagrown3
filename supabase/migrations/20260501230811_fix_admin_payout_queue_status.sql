CREATE OR REPLACE FUNCTION public.get_pending_payouts_admin(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS SETOF public.pending_payout_admin_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
    r.failed_reason,
    p.payout_handle,
    p.payout_handle_type,
    r.item_id::text
  FROM redemptions r
  LEFT JOIN profiles p ON p.id = r.user_id
  LEFT JOIN auth.users u ON u.id = r.user_id
  WHERE r.status IN ('pending', 'queued', 'failed')
  ORDER BY r.created_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;
