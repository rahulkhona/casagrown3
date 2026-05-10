-- Add backend_function column to growbot_skills
ALTER TABLE public.growbot_skills 
ADD COLUMN backend_function TEXT;

-- Generic tool execution for Market Products
CREATE OR REPLACE FUNCTION public.search_market_products(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_intent text;
  v_keyword text;
  v_result text;
BEGIN
  v_intent := payload->>'search_intent';
  
  -- Simple keyword extraction for matching
  v_keyword := split_part(v_intent, ' ', 1);
  
  SELECT 'Found on CasaGrown: ' || string_agg(name || ' ($' || price_usd::text || ')', ', ')
  INTO v_result
  FROM (
    SELECT name, price_usd
    FROM public.market_products
    WHERE is_active = true AND is_deleted = false
      AND name ILIKE '%' || v_keyword || '%'
    LIMIT 3
  ) sub;

  IF v_result IS NULL THEN
    v_result := 'We couldn''t find any direct matches on CasaGrown right now. Try checking local nurseries like SummerWinds or Yamagami''s.';
  END IF;

  RETURN jsonb_build_object('backend_results', v_result);
END;
$$;

-- Generic tool execution for Broadcast
CREATE OR REPLACE FUNCTION public.execute_broadcast_buy_request(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
AS $$
DECLARE
  v_user_id uuid;
  v_item_name text;
  v_description text;
  v_h3 text;
  v_msg_id uuid;
  v_message text;
BEGIN
  v_user_id := (payload->>'user_id')::uuid;
  v_item_name := COALESCE(payload->>'produce_name', payload->>'plant_name', 'items');
  v_description := COALESCE(payload->>'description', '');

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'produce_name', v_item_name, 'message', 'Sign in to post a buy request.');
  END IF;

  -- Get user's community H3 index
  SELECT home_community_h3_index INTO v_h3 FROM public.profiles WHERE id = v_user_id;
  IF v_h3 IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'produce_name', v_item_name, 'message', 'Set your location in your profile first.');
  END IF;

  -- Build the community message
  v_message := '🔍 Looking for: **' || v_item_name || '**';
  IF v_description != '' THEN
    v_message := v_message || E'\n' || v_description;
  END IF;
  v_message := v_message || E'\nIf you have some, let me know! 🌱';

  -- Post to community chat
  INSERT INTO public.community_chat_messages (community_h3_index, author_id, content)
  VALUES (v_h3, v_user_id, v_message)
  RETURNING id INTO v_msg_id;

  -- Save a product watch so buyer gets notified when matching products appear
  INSERT INTO public.product_watches (user_id, keywords, community_h3_index)
  VALUES (v_user_id, v_item_name, v_h3)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'posted',
    'produce_name', v_item_name,
    'community_message_id', v_msg_id,
    'message', 'Posted to community successfully!'
  );
END;
$$;

-- Update the existing ShoppingResultsCard and BroadcastBuyRequestCard to map to these new RPCs
UPDATE public.growbot_skills
SET backend_function = 'search_market_products'
WHERE name = 'ShoppingResultsCard';

UPDATE public.growbot_skills
SET backend_function = 'execute_broadcast_buy_request'
WHERE name = 'BroadcastBuyRequestCard';
