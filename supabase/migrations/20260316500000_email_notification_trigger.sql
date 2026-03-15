-- Email notification trigger: sends email via edge function for important events
-- This trigger fires AFTER INSERT on notifications and sends email
-- via the send-market-email edge function for high-priority notifications.

CREATE OR REPLACE FUNCTION send_notification_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_email TEXT;
  v_full_name TEXT;
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Look up user email
  SELECT
    au.email,
    COALESCE(p.full_name, split_part(au.email, '@', 1))
  INTO v_email, v_full_name
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  WHERE au.id = NEW.user_id;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get Supabase URL and service key for edge function call
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key  := current_setting('app.settings.service_role_key', true);

  -- Only send for important notifications (order status, settlements, ratings)
  -- Skip routine ones to avoid spam
  IF NEW.content LIKE '%completed%' OR
     NEW.content LIKE '%delivered%' OR
     NEW.content LIKE '%cleared%' OR
     NEW.content LIKE '%declined%' OR
     NEW.content LIKE '%refund%' OR
     NEW.content LIKE '%disputed%' OR
     NEW.content LIKE '%rating%' OR
     NEW.content LIKE '%Withdrawal%' THEN

    -- Send via net.http_post to Mailpit SMTP (localhost:1025)
    PERFORM net.http_post(
      url := coalesce(v_supabase_url, 'http://host.docker.internal:54321')
              || '/functions/v1/send-market-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_service_key, '')
      ),
      body := jsonb_build_object(
        'to', v_email,
        'subject', 'CasaGrown Market — ' || left(NEW.content, 80),
        'html',
          '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
          '<div style="text-align:center;padding:16px 0;border-bottom:2px solid #22c55e">' ||
            '<h1 style="color:#166534;font-size:22px;margin:0">🌱 CasaGrown Market</h1>' ||
          '</div>' ||
          '<div style="padding:24px 0">' ||
            '<p style="color:#374151;font-size:14px">Hi ' || v_full_name || ',</p>' ||
            '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">' ||
              '<p style="color:#166534;font-size:14px;margin:0">' || NEW.content || '</p>' ||
            '</div>' ||
            CASE WHEN NEW.link_url IS NOT NULL THEN
              '<a href="https://market.casagrown.com' || NEW.link_url || '" style="display:inline-block;background:#22c55e;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Details</a>'
            ELSE '' END ||
          '</div>' ||
          '<div style="border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:11px;text-align:center">' ||
            'CasaGrown Market — Fresh from your neighbors<br>' ||
            'You received this email because of activity on your account.' ||
          '</div>' ||
        '</div>'
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the notification insert if email sending fails
  RAISE WARNING 'Email send failed for notification %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_send_notification_email
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION send_notification_email();
