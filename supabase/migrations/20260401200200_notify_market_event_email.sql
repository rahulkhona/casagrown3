-- ============================================================================
-- Add email notification to notify_market_event
--
-- Previously notify_market_event only did:
--   1. In-app notification (INSERT INTO market_notifications)
--   2. Push notification (send_push_via_edge)
--
-- Now also does:
--   3. Email notification (via send-market-email edge function)
--
-- This ensures order status changes are communicated via all 3 channels.
-- ============================================================================

DROP FUNCTION IF EXISTS public.notify_market_event(uuid, text, text);

CREATE OR REPLACE FUNCTION notify_market_event(
  p_user_id  UUID,
  p_content  TEXT,
  p_link_url TEXT DEFAULT NULL,
  p_send_email BOOLEAN DEFAULT true
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_email TEXT;
  v_user_name TEXT;
  v_edge_fn_url TEXT;
  v_service_key TEXT;
  v_app_url TEXT;
BEGIN
  -- 1. In-app notification (market-specific table)
  INSERT INTO market_notifications (user_id, content, link_url)
  VALUES (p_user_id, p_content, p_link_url);

  -- 2. Push notification (async via edge function)
  PERFORM send_push_via_edge(
    ARRAY[p_user_id],
    'CasaGrown Market',
    p_content,
    p_link_url
  );

  -- 3. Email notification (conditionally handled to avoid duplication with structural templates)
  IF p_send_email THEN
    BEGIN
      v_user_email := public.get_user_email(p_user_id);

      IF v_user_email IS NOT NULL THEN
        SELECT full_name INTO v_user_name FROM profiles WHERE id = p_user_id;

        v_edge_fn_url := COALESCE(
          current_setting('app.settings.edge_functions_base_url', true),
          COALESCE(
            current_setting('app.settings.supabase_url', true),
            'http://host.docker.internal:54321'
          ) || '/functions/v1'
        ) || '/send-market-email';

        v_service_key := COALESCE(
          current_setting('app.settings.service_role_key', true),
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
          ''
        );

        v_app_url := COALESCE(
          current_setting('app.settings.app_url', true),
          'http://localhost:3000'
        );

        PERFORM net.http_post(
          url := v_edge_fn_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body := jsonb_build_object(
            'to', v_user_email,
            'subject', 'CasaGrown Market — ' || LEFT(p_content, 60),
            'html',
              '<div style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">' ||
                '<div style="text-align: center; margin-bottom: 24px;">' ||
                  '<img src="' || v_app_url || '/logo.png" alt="CasaGrown" style="height: 40px;" />' ||
                '</div>' ||
                '<div style="background: #f9fafb; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">' ||
                  '<p style="margin: 0 0 8px; font-size: 15px; color: #374151;">Hi ' || COALESCE(v_user_name, 'there') || ',</p>' ||
                  '<p style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">' || p_content || '</p>' ||
                '</div>' ||
                CASE WHEN p_link_url IS NOT NULL THEN
                  '<div style="text-align: center; margin-top: 20px;">' ||
                    '<a href="' || v_app_url || p_link_url || '" style="display: inline-block; padding: 12px 28px; background: #16a34a; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">View Details</a>' ||
                  '</div>'
                ELSE ''
                END ||
                '<p style="margin-top: 24px; font-size: 11px; color: #9ca3af; text-align: center;">CasaGrown Market &bull; Fresh &bull; Local &bull; Trusted</p>' ||
              '</div>',
            'text', p_content || CASE WHEN p_link_url IS NOT NULL THEN E'\n' || v_app_url || p_link_url ELSE '' END
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[notify_market_event] Email failed for user %: %', p_user_id, SQLERRM;
    END;
  END IF;
END;
$$;
