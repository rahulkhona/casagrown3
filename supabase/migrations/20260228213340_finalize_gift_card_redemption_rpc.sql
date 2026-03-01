-- Unifies the 4 separate edge-function database insert/update calls into a single ACID transaction.
-- This guarantees that if a Gift Card is successfully procured from Tremendous/Reloadly,
-- its metadata will never be orphaned from the point_ledger if the edge function crashes midway.

CREATE OR REPLACE FUNCTION public.finalize_gift_card_redemption(
  p_redemption_id UUID,
  p_provider_name TEXT,
  p_external_order_id TEXT,
  p_card_code TEXT,
  p_card_url TEXT,
  p_actual_cost_cents INT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_brand_name TEXT;
  v_face_value_cents INT;
  v_item_name TEXT;
BEGIN
  -- 1. Get redemption details
  SELECT user_id, 
         metadata->>'brand_name', 
         (metadata->>'face_value_cents')::int
  INTO v_user_id, v_brand_name, v_face_value_cents
  FROM public.redemptions
  WHERE id = p_redemption_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption % not found', p_redemption_id;
  END IF;

  v_item_name := v_brand_name || ' $' || to_char(v_face_value_cents / 100.0, 'FM999999999.00') || ' Gift Card';

  -- 2. Log provider transaction for financial auditing
  INSERT INTO public.provider_transactions (
    provider_name, redemption_id, user_id, external_order_id, 
    item_type, item_name, face_value_cents, cost_cents, status
  ) VALUES (
    p_provider_name, p_redemption_id, v_user_id, p_external_order_id,
    'gift_card', v_item_name, v_face_value_cents, p_actual_cost_cents, 'success'
  );

  -- 3. Update point ledger (The source of truth for the UI)
  UPDATE public.point_ledger
  SET metadata = metadata || jsonb_build_object(
      'card_code', p_card_code,
      'card_url', p_card_url,
      'status', 'completed'
  )
  WHERE reference_id = p_redemption_id
    AND type IN ('redemption', 'refund');

  -- 4. Store delivery record
  INSERT INTO public.gift_card_deliveries (
    redemption_id, brand_name, face_value_cents, card_code, card_url, delivered_at
  ) VALUES (
    p_redemption_id, v_brand_name, v_face_value_cents, p_card_code, p_card_url, now()
  );

  -- 5. Mark redemption queue as complete
  UPDATE public.redemptions
  SET status = 'completed',
      provider_order_id = p_external_order_id,
      completed_at = now()
  WHERE id = p_redemption_id;

END;
$$;
