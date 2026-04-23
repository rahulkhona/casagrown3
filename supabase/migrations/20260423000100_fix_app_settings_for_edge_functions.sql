-- ============================================================================
-- Fix: Edge function URL resolution for Supabase Cloud
--
-- Problem: send_push_via_edge and notify_market_event resolve the Supabase URL
-- via current_setting('app.settings.supabase_url'). On Supabase Cloud (staging),
-- this is NULL, causing pg_net to fall back to 'http://host.docker.internal:54321'
-- which doesn't resolve — silently dropping ALL push, email, and SMS notifications
-- triggered by database functions.
--
-- Fix: Add a vault.decrypted_secrets fallback for the Supabase URL, matching the
-- existing pattern used for service_role_key. We store the SUPABASE_URL in vault
-- as 'supabase_url' and fall back to it when app.settings is not available.
-- ============================================================================

-- 1. Store the Supabase URL in vault (idempotent: skip if already exists)
-- NOTE: On Supabase Cloud, app.settings.supabase_url is typically NULL.
-- The correct URL must be set manually after migration via:
--   SELECT vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'supabase_url', 'Supabase project URL');
-- For staging: https://fzdmszvfeewpwswlnfyk.supabase.co
-- For production: set appropriately.
DO $$
DECLARE
  v_url TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'supabase_url') THEN
    v_url := current_setting('app.settings.supabase_url', true);
    IF v_url IS NOT NULL THEN
      PERFORM vault.create_secret(v_url, 'supabase_url', 'Supabase project URL for pg_net edge function calls');
      RAISE NOTICE 'supabase_url vault secret created from app.settings: %', v_url;
    ELSE
      RAISE WARNING '⚠️  supabase_url vault secret NOT created — app.settings.supabase_url is NULL.';
      RAISE WARNING '   Run manually: SELECT vault.create_secret(''https://YOUR_PROJECT_REF.supabase.co'', ''supabase_url'', ''Supabase project URL'');';
    END IF;
  END IF;
END;
$$;

-- 2. Store the app URL in vault (for email links)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'app_url') THEN
    PERFORM vault.create_secret(
      COALESCE(current_setting('app.settings.app_url', true), 'https://www.casagrown.com'),
      'app_url',
      'Market app URL for notification email links'
    );
  END IF;
END;
$$;


-- 3. Rewrite send_push_via_edge with vault URL fallback
CREATE OR REPLACE FUNCTION send_push_via_edge(
  p_user_ids UUID[],
  p_title    TEXT,
  p_body     TEXT,
  p_url      TEXT DEFAULT NULL,
  p_tag      TEXT DEFAULT 'casagrown-market'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url  TEXT;
  v_service_key   TEXT;
  v_user_ids_json JSONB;
BEGIN
  -- Resolve Supabase URL: app.settings → vault → local fallback
  v_supabase_url := COALESCE(
    current_setting('app.settings.supabase_url', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1),
    'http://host.docker.internal:54321'
  );

  -- Resolve service role key: app.settings → vault → empty
  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
    ''
  );

  -- Convert UUID[] to JSON array of strings
  SELECT jsonb_agg(to_jsonb(u::text)) INTO v_user_ids_json
  FROM unnest(p_user_ids) u;

  PERFORM net.http_post(
    url     := v_supabase_url || '/functions/v1/send-push-notification',
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


-- 4. Rewrite notify_market_event with vault URL fallback
CREATE OR REPLACE FUNCTION notify_market_event(
  p_user_id  UUID,
  p_content  TEXT,
  p_link_url TEXT DEFAULT NULL,
  p_send_email BOOLEAN DEFAULT true,
  p_send_sms   BOOLEAN DEFAULT false
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_email TEXT;
  v_user_name TEXT;
  v_edge_fn_base_url TEXT;
  v_service_key TEXT;
  v_app_url TEXT;
BEGIN
  -- 1. In-app notification
  INSERT INTO market_notifications (user_id, content, link_url)
  VALUES (p_user_id, p_content, p_link_url);

  -- 2. Push notification
  PERFORM send_push_via_edge(
    ARRAY[p_user_id],
    'CasaGrown Market',
    p_content,
    p_link_url
  );

  -- Resolve service role key: app.settings → vault → empty
  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
    ''
  );

  -- Resolve app URL: app.settings → vault → localhost
  v_app_url := COALESCE(
    current_setting('app.settings.app_url', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_url' LIMIT 1),
    'http://localhost:3000'
  );

  -- Resolve edge function base URL: app.settings → vault-based → localhost
  v_edge_fn_base_url := COALESCE(
    current_setting('app.settings.edge_functions_base_url', true),
    COALESCE(
      current_setting('app.settings.supabase_url', true),
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1),
      'http://host.docker.internal:54321'
    ) || '/functions/v1'
  );

  -- 3. Email notification
  IF p_send_email THEN
    BEGIN
      v_user_email := public.get_user_email(p_user_id);
      IF v_user_email IS NOT NULL THEN
        SELECT full_name INTO v_user_name FROM profiles WHERE id = p_user_id;

        PERFORM net.http_post(
          url := v_edge_fn_base_url || '/send-market-email',
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

  -- 4. SMS Notification (Fallback)
  IF p_send_sms THEN
    BEGIN
      PERFORM net.http_post(
        url := v_edge_fn_base_url || '/send-sms-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'userId', p_user_id,
          'message', p_content,
          'linkUrl', p_link_url
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[notify_market_event] SMS async trigger failed for user %: %', p_user_id, SQLERRM;
    END;
  END IF;

END;
$$;
