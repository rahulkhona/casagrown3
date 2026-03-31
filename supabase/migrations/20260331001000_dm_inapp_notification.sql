-- Add in-app notification for DM messages directly via trigger
-- This runs in the database so it works regardless of edge function deployment

CREATE OR REPLACE FUNCTION public.trg_dm_inapp_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_recipient_id UUID;
  v_sender_name TEXT;
  v_conv RECORD;
  v_content TEXT;
BEGIN
  -- Look up conversation
  SELECT participant_a, participant_b INTO v_conv
  FROM public.market_conversations
  WHERE id = NEW.conversation_id;
  
  IF v_conv IS NULL THEN RETURN NEW; END IF;
  
  -- Determine recipient (the OTHER participant)
  IF v_conv.participant_a = NEW.sender_id THEN
    v_recipient_id := v_conv.participant_b;
  ELSE
    v_recipient_id := v_conv.participant_a;
  END IF;
  
  -- Get sender display name
  SELECT COALESCE(full_name, 'Someone') INTO v_sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;
  
  -- Truncate content for notification
  v_content := LEFT(NEW.content, 100);
  IF LENGTH(NEW.content) > 100 THEN
    v_content := v_content || '...';
  END IF;
  
  -- Insert in-app notification
  INSERT INTO public.market_notifications (user_id, content, link_url)
  VALUES (
    v_recipient_id,
    '💬 ' || v_sender_name || ': ' || v_content,
    '/messages/' || NEW.conversation_id
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'DM in-app notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dm_inapp_notification ON public.market_chat_messages;
CREATE TRIGGER trg_dm_inapp_notification
  AFTER INSERT ON public.market_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_dm_inapp_notification();
