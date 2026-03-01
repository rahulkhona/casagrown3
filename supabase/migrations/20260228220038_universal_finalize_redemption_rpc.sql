-- Universal ACID Transaction Wrapper for Casagrown Redemptions & Refunds
-- This function guarantees Atomicity across the 4 accounting tables:
-- 1. Updates `point_ledger` with the final vendor receipt metadata.
-- 2. Inserts strictly into `gift_card_deliveries` OR `donation_receipts` OR nothing for raw USD cashouts (Venmo/PayPal).
-- 3. Inserts into `provider_transactions` to track true wholesale costs vs point costs.
-- 4. Updates `redemptions` table to mark it successful to prevent dual-processing.
--
-- USAGE (JSON p_payload):
-- {
--   "redemption_id": "uuid",
--   "redemption_type": "gift_card" | "donation" | "paypal" | "venmo",
--   "provider_name": "tremendous" | "reloadly" | "globalgiving" | "paypal" | "venmo",
--   "external_order_id": "string",
--   "actual_cost_cents": integer,
--   
--   // Optional fields depending on redemption_type
--   "card_code": "string", // gift_card
--   "card_url": "string",  // gift_card
--   "receipt_number": "string" // donation
-- }

CREATE OR REPLACE FUNCTION public.finalize_redemption(
  p_payload JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_red_id UUID := (p_payload->>'redemption_id')::UUID;
  v_type TEXT := p_payload->>'redemption_type';
  v_provider TEXT := p_payload->>'provider_name';
  v_ext_id TEXT := p_payload->>'external_order_id';
  v_cost_cents INT := COALESCE((p_payload->>'actual_cost_cents')::INT, 0);

  v_user_id UUID;
  v_brand_name TEXT;
  v_face_value_cents INT;
  v_item_name TEXT;
  
  v_donor_org TEXT;
  v_donor_project TEXT;
  v_donor_theme TEXT;
  v_usd_amount numeric;

  v_ledger_meta JSONB;
BEGIN

  -- 1. Get and Lock redemption details to prevent race conditions
  SELECT user_id, 
         metadata->>'brand_name', 
         metadata->>'organization',
         metadata->>'project_title',
         metadata->>'theme',
         (metadata->>'usd_amount')::numeric,
         COALESCE((metadata->>'face_value_cents')::int, 0)
  INTO v_user_id, v_brand_name, v_donor_org, v_donor_project, v_donor_theme, v_usd_amount, v_face_value_cents
  FROM public.redemptions
  WHERE id = v_red_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption % not found', v_red_id;
  END IF;

  -- Default ledger updates for EVERY type
  v_ledger_meta := jsonb_build_object('status', 'completed', 'provider_order_id', v_ext_id);

  -- 2. Execute Branching Logic for the specific payload type
  IF v_type = 'gift_card' THEN
    v_item_name := COALESCE(v_brand_name, 'Gift Card') || ' $' || to_char(v_face_value_cents / 100.0, 'FM999999999.00');
    v_ledger_meta := v_ledger_meta || jsonb_build_object(
      'card_code', p_payload->>'card_code',
      'card_url', p_payload->>'card_url'
    );
    
    INSERT INTO public.gift_card_deliveries (
      redemption_id, brand_name, face_value_cents, card_code, card_url, delivered_at
    ) VALUES (
      v_red_id, COALESCE(v_brand_name, 'Unknown'), v_face_value_cents, p_payload->>'card_code', p_payload->>'card_url', now()
    );

  ELSIF v_type = 'donation' THEN
    v_item_name := 'Donation to ' || COALESCE(v_donor_org, 'Charity');
    v_ledger_meta := v_ledger_meta || jsonb_build_object(
      'receipt_number', p_payload->>'receipt_number'
    );
    
    -- Face value cents for donations is tied directly to usd_amount if it exists.
    IF v_face_value_cents = 0 AND v_usd_amount IS NOT NULL THEN
       v_face_value_cents := (v_usd_amount * 100)::int;
    END IF;

    INSERT INTO public.donation_receipts (
      redemption_id, organization_name, project_title, theme, 
      donation_amount_cents, points_spent, receipt_url, receipt_number, tax_deductible
    ) VALUES (
      v_red_id, COALESCE(v_donor_org, 'Unknown'), v_donor_project, v_donor_theme,
      v_face_value_cents, (v_face_value_cents * 100), -- assuming 100 points per dollar
      'https://casagrown.com/receipts/' || (p_payload->>'receipt_number'), p_payload->>'receipt_number', true
    );

  ELSIF v_type = 'paypal' OR v_type = 'venmo' THEN
    v_item_name := v_type || ' Cashout';
    v_ledger_meta := v_ledger_meta || jsonb_build_object('batch_id', v_ext_id);
    
    IF v_face_value_cents = 0 AND v_usd_amount IS NOT NULL THEN
       v_face_value_cents := (v_usd_amount * 100)::int;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unknown redemption type: %', v_type;
  END IF;

  -- 3. Log provider transaction for universal financial auditing
  INSERT INTO public.provider_transactions (
    provider_name, redemption_id, user_id, external_order_id, 
    item_type, item_name, face_value_cents, cost_cents, status
  ) VALUES (
    v_provider, v_red_id, v_user_id, v_ext_id,
    v_type, v_item_name, v_face_value_cents, v_cost_cents, 'success'
  );

  -- 4. Update point ledger (The source of truth for the UI)
  UPDATE public.point_ledger
  SET metadata = metadata || v_ledger_meta
  WHERE reference_id = v_red_id
    AND type IN ('redemption', 'refund');

  -- 5. Mark redemption queue as complete
  UPDATE public.redemptions
  SET status = 'completed',
      provider_order_id = v_ext_id,
      completed_at = now()
  WHERE id = v_red_id;

END;
$$;
