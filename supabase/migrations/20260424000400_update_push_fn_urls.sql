-- ============================================================================
-- Migration: Update send_push_via_edge to use shared URL helpers
-- ============================================================================

SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION send_push_via_edge(
  p_user_ids UUID[],
  p_title    TEXT,
  p_body     TEXT,
  p_url      TEXT DEFAULT NULL,
  p_tag      TEXT DEFAULT 'casagrown-market'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_edge_fn_base_url TEXT;
  v_service_key      TEXT;
  v_user_ids_json    JSONB;
BEGIN
  v_edge_fn_base_url := get_edge_fn_base_url();
  v_service_key := get_service_role_key();

  IF v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING '[send_push_via_edge] Missing service_role_key';
    RETURN;
  END IF;

  -- Convert UUID[] to JSON array of strings
  SELECT jsonb_agg(to_jsonb(u::text)) INTO v_user_ids_json
  FROM unnest(p_user_ids) u;

  PERFORM net.http_post(
    url     := v_edge_fn_base_url || '/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'userIds', v_user_ids_json,
      'title',   p_title,
      'body',    p_body,
      'url',     COALESCE(p_url, '/notifications'),
      'tag',     p_tag
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[send_push_via_edge] Push send failed: %', SQLERRM;
END;
$$;
