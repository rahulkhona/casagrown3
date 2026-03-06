-- =============================================================================
-- Email Notification Triggers
-- Adds net.http_post calls to existing RPC functions to fire email notifications
-- via the unified send-notification-email edge function.
-- =============================================================================

-- Helper: reusable function to send notification emails
CREATE OR REPLACE FUNCTION public._send_notification_email(
  p_type       text,
  p_recipients jsonb,
  p_payload    jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge_fn_url   text;
  v_service_role_key text;
  v_body jsonb;
BEGIN
  -- Same fallback chain as confirm_delivery_with_emails
  v_service_role_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );

  v_edge_fn_url := COALESCE(
    current_setting('app.settings.edge_functions_base_url', true),
    'http://host.docker.internal:54321/functions/v1'
  ) || '/send-notification-email';

  v_body := p_payload || jsonb_build_object(
    'type', p_type,
    'recipients', p_recipients
  );

  PERFORM net.http_post(
    url := v_edge_fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := v_body
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[_send_notification_email] Failed to send % email: %', p_type, SQLERRM;
END;
$$;


-- =============================================================================
-- (a) create_order_atomic — add email notification for order placed
-- =============================================================================

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_buyer_id uuid, p_seller_id uuid, p_post_id uuid,
  p_quantity integer, p_points_per_unit integer, p_total_price integer,
  p_category text, p_product text,
  p_delivery_date date DEFAULT NULL, p_delivery_instructions text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  v_conversation_id uuid; v_offer_id uuid; v_order_id uuid;
  v_current_balance integer; v_unit text;
  v_buyer_email text; v_seller_email text;
  v_buyer_name text; v_seller_name text;
begin
  select coalesce(sum(amount), 0) into v_current_balance from point_ledger where user_id = p_buyer_id;
  if v_current_balance < p_total_price then
    return jsonb_build_object('error', 'Insufficient points', 'currentBalance', v_current_balance, 'required', p_total_price);
  end if;
  select coalesce(wsd.unit::text, 'piece') into v_unit from want_to_sell_details wsd where wsd.post_id = p_post_id limit 1;
  v_unit := coalesce(v_unit, 'piece');
  select id into v_conversation_id from conversations where post_id = p_post_id and buyer_id = p_buyer_id and seller_id = p_seller_id;
  if v_conversation_id is null then
    insert into conversations (post_id, buyer_id, seller_id) values (p_post_id, p_buyer_id, p_seller_id) returning id into v_conversation_id;
  end if;
  insert into offers (conversation_id, created_by, quantity, points_per_unit, status) values (v_conversation_id, p_buyer_id, p_quantity, p_points_per_unit, 'pending') returning id into v_offer_id;
  insert into orders (offer_id, buyer_id, seller_id, category, product, quantity, points_per_unit, delivery_date, delivery_instructions, conversation_id, status)
  values (v_offer_id, p_buyer_id, p_seller_id, p_category, p_product, p_quantity, p_points_per_unit, p_delivery_date, p_delivery_instructions, v_conversation_id, 'pending')
  returning id into v_order_id;
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (p_buyer_id, 'hold', -p_total_price, 0, v_order_id,
    jsonb_build_object('order_id', v_order_id, 'post_id', p_post_id, 'seller_id', p_seller_id, 'product', p_product, 'quantity', p_quantity, 'points_per_unit', p_points_per_unit));
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (v_conversation_id, p_buyer_id,
    'Order placed: ' || p_quantity || ' ' ||
    CASE WHEN v_unit = 'piece' THEN '' WHEN v_unit = 'box' AND p_quantity > 1 THEN 'boxes ' WHEN v_unit = 'bag' AND p_quantity > 1 THEN 'bags ' ELSE v_unit || ' ' END ||
    p_product || ' for ' || p_total_price || ' points. Delivery by ' || coalesce(p_delivery_date::text, 'TBD') || '.'
    || case when p_delivery_instructions is not null then E'\nDelivery info: ' || p_delivery_instructions else '' end, 'text');

  -- === Email Notification ===
  v_buyer_email := public.get_user_email(p_buyer_id);
  v_seller_email := public.get_user_email(p_seller_id);
  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = p_buyer_id;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = p_seller_id;

  IF v_buyer_email IS NOT NULL OR v_seller_email IS NOT NULL THEN
    DECLARE
      v_recipients jsonb := '[]'::jsonb;
    BEGIN
      IF v_buyer_email IS NOT NULL THEN
        v_recipients := v_recipients || jsonb_build_array(
          jsonb_build_object('email', v_buyer_email, 'name', coalesce(v_buyer_name, 'there'))
        );
      END IF;
      IF v_seller_email IS NOT NULL THEN
        v_recipients := v_recipients || jsonb_build_array(
          jsonb_build_object('email', v_seller_email, 'name', coalesce(v_seller_name, 'there'))
        );
      END IF;

      PERFORM public._send_notification_email(
        'order_placed',
        v_recipients,
        jsonb_build_object(
          'product', p_product,
          'quantity', p_quantity,
          'unit', v_unit,
          'pointsPerUnit', p_points_per_unit,
          'total', p_total_price,
          'orderId', v_order_id,
          'buyerName', coalesce(v_buyer_name, 'Buyer'),
          'buyerEmail', v_buyer_email,
          'sellerName', coalesce(v_seller_name, 'Seller'),
          'sellerEmail', v_seller_email
        )
      );
    END;
  END IF;

  return jsonb_build_object('orderId', v_order_id, 'conversationId', v_conversation_id, 'newBalance', v_current_balance - p_total_price);
end;
$$;


-- =============================================================================
-- (b) create_offer_atomic — add email notification for offer made
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_offer_atomic(
  p_seller_id      uuid,
  p_buyer_id       uuid,
  p_post_id        uuid,
  p_quantity       integer,
  p_points_per_unit integer,
  p_category       text,
  p_product        text,
  p_unit           text     default null,
  p_delivery_date  date     default null,
  p_delivery_dates text[]   default '{}'::text[],
  p_message        text     default null,
  p_seller_post_id uuid     default null,
  p_media          jsonb    default '[]'::jsonb,
  p_community_h3_index text default null,
  p_additional_community_h3_indices text[] default '{}'::text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_offer_id        uuid;
  v_existing_offer  record;
  v_existing_order  record;
  v_buyer_email     text;
  v_buyer_name      text;
  v_seller_name     text;
begin
  if p_seller_id = p_buyer_id then
    return jsonb_build_object('error', 'Cannot make an offer on your own post');
  end if;

  select id into v_conversation_id
  from conversations
  where post_id = p_post_id
    and buyer_id = p_buyer_id
    and seller_id = p_seller_id;

  if v_conversation_id is null then
    insert into conversations (post_id, buyer_id, seller_id)
    values (p_post_id, p_buyer_id, p_seller_id)
    returning id into v_conversation_id;
  end if;

  select * into v_existing_offer
  from offers
  where conversation_id = v_conversation_id
    and status = 'pending'
  for update;

  if v_existing_offer is not null then
    return jsonb_build_object(
      'error', 'An active offer already exists in this conversation',
      'existingOfferId', v_existing_offer.id,
      'conversationId', v_conversation_id
    );
  end if;

  select * into v_existing_order
  from orders
  where conversation_id = v_conversation_id
    and status not in ('cancelled', 'completed')
  limit 1;

  if v_existing_order is not null then
    return jsonb_build_object(
      'error', 'An active order exists in this conversation',
      'existingOrderId', v_existing_order.id,
      'conversationId', v_conversation_id
    );
  end if;

  insert into offers (
    conversation_id, created_by, post_id, quantity, points_per_unit,
    category, product, unit, delivery_date,
    message, seller_post_id, status, version, media
  )
  values (
    v_conversation_id, p_seller_id, p_post_id, p_quantity, p_points_per_unit,
    p_category, p_product, p_unit, p_delivery_date,
    p_message, p_seller_post_id, 'pending', 1, p_media
  )
  returning id into v_offer_id;

  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_conversation_id,
    p_seller_id,
    'Offer submitted: ' || p_quantity || ' ' || coalesce(p_unit, '') || ' ' || p_product ||
    ' at ' || p_points_per_unit || ' pts/' || coalesce(p_unit, 'unit') ||
    '. Delivery by ' || coalesce(p_delivery_date::text, 'TBD') || '.',
    'text'
  );

  -- === Email Notification: notify buyer about new offer ===
  v_buyer_email := public.get_user_email(p_buyer_id);
  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = p_buyer_id;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = p_seller_id;

  IF v_buyer_email IS NOT NULL THEN
    PERFORM public._send_notification_email(
      'offer_made',
      jsonb_build_array(
        jsonb_build_object('email', v_buyer_email, 'name', coalesce(v_buyer_name, 'there'))
      ),
      jsonb_build_object(
        'product', p_product,
        'quantity', p_quantity,
        'unit', coalesce(p_unit, 'unit'),
        'pointsPerUnit', p_points_per_unit,
        'sellerName', coalesce(v_seller_name, 'A seller'),
        'deliveryDate', coalesce(p_delivery_date::text, null),
        'offerMessage', p_message
      )
    );
  END IF;

  return jsonb_build_object(
    'offerId', v_offer_id,
    'conversationId', v_conversation_id
  );
end;
$$;


-- =============================================================================
-- (d) dispute_order_with_message — add email notification for order disputed
-- =============================================================================

CREATE OR REPLACE FUNCTION public.dispute_order_with_message(
  p_order_id  uuid,
  p_buyer_id  uuid,
  p_reason    text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_esc_id uuid;
  v_buyer_email text;
  v_seller_email text;
  v_buyer_name text;
  v_seller_name text;
  v_product text;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  IF v_order.buyer_id != p_buyer_id THEN
    RETURN jsonb_build_object('error', 'Only the buyer can dispute');
  END IF;

  IF v_order.status != 'delivered' THEN
    RETURN jsonb_build_object(
      'error', 'Can only dispute a delivered order',
      'currentStatus', v_order.status
    );
  END IF;

  UPDATE orders
  SET status = 'disputed', updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO escalations (order_id, initiator_id, reason)
  VALUES (p_order_id, p_buyer_id, p_reason)
  RETURNING id INTO v_esc_id;

  INSERT INTO chat_messages (conversation_id, sender_id, content, type)
  VALUES (
    v_order.conversation_id,
    p_buyer_id,
    'Delivery disputed: ' || p_reason || '. Seller can make a refund offer or either party can escalate to support.',
    'text'
  );

  -- === Email Notification ===
  v_product := coalesce(v_order.product, 'an item');
  v_buyer_email := public.get_user_email(v_order.buyer_id);
  v_seller_email := public.get_user_email(v_order.seller_id);
  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = v_order.buyer_id;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = v_order.seller_id;

  DECLARE
    v_recipients jsonb := '[]'::jsonb;
  BEGIN
    IF v_buyer_email IS NOT NULL THEN
      v_recipients := v_recipients || jsonb_build_array(
        jsonb_build_object('email', v_buyer_email, 'name', coalesce(v_buyer_name, 'there'))
      );
    END IF;
    IF v_seller_email IS NOT NULL THEN
      v_recipients := v_recipients || jsonb_build_array(
        jsonb_build_object('email', v_seller_email, 'name', coalesce(v_seller_name, 'there'))
      );
    END IF;

    IF jsonb_array_length(v_recipients) > 0 THEN
      PERFORM public._send_notification_email(
        'order_disputed',
        v_recipients,
        jsonb_build_object(
          'product', v_product,
          'orderId', p_order_id,
          'disputeReason', p_reason
        )
      );
    END IF;
  END;

  RETURN jsonb_build_object('success', true, 'escalation_id', v_esc_id);
END;
$$;


-- =============================================================================
-- (e) resolve_dispute_with_message — add email notification for dispute resolved
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_dispute_with_message(
  p_order_id uuid,
  p_user_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_esc_id uuid;
  v_role text;
  v_total integer;
  v_fee integer;
  v_seller_payout integer;
  v_fee_rate numeric;
  v_buyer_email text;
  v_seller_email text;
  v_buyer_name text;
  v_seller_name text;
  v_product text;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  IF v_order.buyer_id != p_user_id AND v_order.seller_id != p_user_id THEN
    RETURN jsonb_build_object('error', 'Only buyer or seller can resolve');
  END IF;

  IF v_order.status NOT IN ('disputed', 'escalated') THEN
    RETURN jsonb_build_object(
      'error', 'Order must be in disputed or escalated status',
      'currentStatus', v_order.status
    );
  END IF;

  IF v_order.buyer_id = p_user_id THEN
    v_role := 'Buyer';
  ELSE
    v_role := 'Seller';
  END IF;

  v_fee_rate := public.get_platform_fee_for_user(v_order.seller_id);

  v_total := v_order.quantity * v_order.points_per_unit;
  v_fee := floor(v_total * v_fee_rate);
  v_seller_payout := v_total - v_fee;

  SELECT id INTO v_esc_id
  FROM escalations
  WHERE order_id = p_order_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_esc_id IS NOT NULL THEN
    UPDATE escalations
    SET status = 'resolved',
        resolution_type = 'resolved_without_refund',
        resolved_at = now(),
        updated_at = now()
    WHERE id = v_esc_id;
  END IF;

  INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  VALUES (
    v_order.seller_id,
    'payment',
    v_seller_payout,
    0,
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'total', v_total,
      'platform_fee', v_fee,
      'seller_payout', v_seller_payout
    )
  );

  INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  VALUES (
    v_order.seller_id,
    'platform_fee',
    -v_fee,
    0,
    v_order.id,
    jsonb_build_object('order_id', v_order.id, 'fee_rate', v_fee_rate)
  );

  UPDATE orders
  SET status = 'completed', updated_at = now()
  WHERE id = p_order_id;

  -- System message to buyer (no escrow language)
  INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
  VALUES (
    v_order.conversation_id,
    NULL,
    '✅ ' || v_role || ' resolved the dispute. ' || v_total || ' held points have been released to the seller. Order complete.',
    'system',
    jsonb_build_object('visible_to', v_order.buyer_id)
  );

  INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
  VALUES (
    v_order.conversation_id,
    NULL,
    '💰 Payment received: ' || v_seller_payout || ' points credited to your account (' || v_total || ' total - ' || v_fee || ' platform fee).',
    'system',
    jsonb_build_object('visible_to', v_order.seller_id)
  );

  -- === Email Notification ===
  v_product := coalesce(v_order.product, 'an item');
  v_buyer_email := public.get_user_email(v_order.buyer_id);
  v_seller_email := public.get_user_email(v_order.seller_id);
  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = v_order.buyer_id;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = v_order.seller_id;

  DECLARE
    v_recipients jsonb := '[]'::jsonb;
  BEGIN
    IF v_buyer_email IS NOT NULL THEN
      v_recipients := v_recipients || jsonb_build_array(
        jsonb_build_object('email', v_buyer_email, 'name', coalesce(v_buyer_name, 'there'))
      );
    END IF;
    IF v_seller_email IS NOT NULL THEN
      v_recipients := v_recipients || jsonb_build_array(
        jsonb_build_object('email', v_seller_email, 'name', coalesce(v_seller_name, 'there'))
      );
    END IF;

    IF jsonb_array_length(v_recipients) > 0 THEN
      PERFORM public._send_notification_email(
        'dispute_resolved',
        v_recipients,
        jsonb_build_object(
          'product', v_product,
          'orderId', p_order_id,
          'resolutionOutcome', v_role || ' resolved without additional refund'
        )
      );
    END IF;
  END;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- =============================================================================
-- (f) Chat Initiated — DB trigger on first message in a conversation
-- =============================================================================

CREATE OR REPLACE FUNCTION public._notify_chat_initiated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg_count integer;
  v_conv record;
  v_other_id uuid;
  v_other_email text;
  v_other_name text;
  v_sender_name text;
  v_product text;
BEGIN
  -- Only fire on the FIRST non-system message in a conversation
  SELECT count(*) INTO v_msg_count
  FROM chat_messages
  WHERE conversation_id = NEW.conversation_id
    AND type != 'system'
    AND id != NEW.id;

  IF v_msg_count > 0 THEN
    RETURN NEW;  -- Not the first message, skip
  END IF;

  -- Skip system messages
  IF NEW.sender_id IS NULL OR NEW.type = 'system' THEN
    RETURN NEW;
  END IF;

  -- Get conversation details
  SELECT * INTO v_conv FROM conversations WHERE id = NEW.conversation_id;
  IF v_conv IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine the other party
  IF NEW.sender_id = v_conv.buyer_id THEN
    v_other_id := v_conv.seller_id;
  ELSE
    v_other_id := v_conv.buyer_id;
  END IF;

  v_other_email := public.get_user_email(v_other_id);
  IF v_other_email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_other_name FROM profiles WHERE id = v_other_id;
  SELECT full_name INTO v_sender_name FROM profiles WHERE id = NEW.sender_id;

  -- Try to get the product from the post
  SELECT coalesce(
    (SELECT wsd.product FROM want_to_sell_details wsd WHERE wsd.post_id = v_conv.post_id LIMIT 1),
    (SELECT wbd.product FROM want_to_buy_details wbd WHERE wbd.post_id = v_conv.post_id LIMIT 1)
  ) INTO v_product;

  PERFORM public._send_notification_email(
    'chat_initiated',
    jsonb_build_array(
      jsonb_build_object('email', v_other_email, 'name', coalesce(v_other_name, 'there'))
    ),
    jsonb_build_object(
      'senderName', coalesce(v_sender_name, 'Someone'),
      'product', v_product,
      'messagePreview', left(NEW.content, 150)
    )
  );

  RETURN NEW;
END;
$$;

-- Create trigger (drop first to be idempotent)
DROP TRIGGER IF EXISTS trigger_chat_initiated_email ON chat_messages;
CREATE TRIGGER trigger_chat_initiated_email
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public._notify_chat_initiated();


-- =============================================================================
-- (m) Delegation Revoked — DB trigger on delegations status change
-- =============================================================================

CREATE OR REPLACE FUNCTION public._notify_delegation_revoked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delegator_email text;
  v_delegate_email text;
  v_delegator_name text;
  v_delegate_name text;
  v_other_email text;
  v_other_name text;
  v_revoked_by text;
BEGIN
  -- Only fire when status changes TO 'revoked' or 'inactive'
  IF NEW.status NOT IN ('revoked', 'inactive') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;  -- No actual change
  END IF;

  SELECT full_name INTO v_delegator_name FROM profiles WHERE id = NEW.delegator_id;
  SELECT full_name INTO v_delegate_name FROM profiles WHERE id = NEW.delegate_id;

  v_delegator_email := public.get_user_email(NEW.delegator_id);
  v_delegate_email := public.get_user_email(NEW.delegate_id);

  -- Determine who revoked (heuristic: check who last changed the record)
  -- Since we can't easily determine this, we'll send to both parties
  IF v_delegator_email IS NOT NULL THEN
    PERFORM public._send_notification_email(
      'delegation_revoked',
      jsonb_build_array(
        jsonb_build_object('email', v_delegator_email, 'name', coalesce(v_delegator_name, 'there'))
      ),
      jsonb_build_object(
        'delegatorName', coalesce(v_delegator_name, 'Delegator'),
        'delegateName', coalesce(v_delegate_name, 'Delegate'),
        'revokedBy', 'delegate'
      )
    );
  END IF;

  IF v_delegate_email IS NOT NULL THEN
    PERFORM public._send_notification_email(
      'delegation_revoked',
      jsonb_build_array(
        jsonb_build_object('email', v_delegate_email, 'name', coalesce(v_delegate_name, 'there'))
      ),
      jsonb_build_object(
        'delegatorName', coalesce(v_delegator_name, 'Delegator'),
        'delegateName', coalesce(v_delegate_name, 'Delegate'),
        'revokedBy', 'delegator'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_delegation_revoked_email ON delegations;
CREATE TRIGGER trigger_delegation_revoked_email
  AFTER UPDATE ON delegations
  FOR EACH ROW
  EXECUTE FUNCTION public._notify_delegation_revoked();


-- =============================================================================
-- (l) 1099-K Tax Reporting Thresholds table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tax_reporting_thresholds (
  state_code  TEXT PRIMARY KEY,
  amount      NUMERIC NOT NULL,
  min_txns    INTEGER NOT NULL DEFAULT 0,
  warn_pct    NUMERIC NOT NULL DEFAULT 0.75,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id)
);

-- Seed with current law (2025+)
INSERT INTO tax_reporting_thresholds (state_code, amount, min_txns, warn_pct)
VALUES
  ('_default', 20000, 200, 0.75),
  ('VA', 600, 0, 0.75),
  ('MA', 600, 0, 0.75),
  ('MD', 600, 0, 0.75),
  ('DC', 600, 0, 0.75),
  ('VT', 600, 0, 0.75),
  ('IL', 600, 0, 0.75),
  ('AR', 600, 0, 0.75),
  ('NJ', 1000, 0, 0.75)
ON CONFLICT (state_code) DO NOTHING;

-- RLS: read by anyone, write by admin only
ALTER TABLE public.tax_reporting_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tax thresholds readable by all"
  ON public.tax_reporting_thresholds FOR SELECT USING (true);


-- =============================================================================
-- (h/k) finalize_redemption & finalize_point_refund — add email triggers
-- These are updated via separate calls since they use the same pattern
-- =============================================================================

-- We use an AFTER trigger on point_ledger for redemption/refund emails
-- rather than modifying the ACID functions directly

CREATE OR REPLACE FUNCTION public._notify_points_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
  v_user_name text;
  v_type text;
  v_dollar_amount numeric;
  v_method text;
BEGIN
  -- Only fire for specific ledger types
  IF NEW.type NOT IN ('redemption', 'refund', 'purchase') THEN
    RETURN NEW;
  END IF;

  v_user_email := public.get_user_email(NEW.user_id);
  IF v_user_email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_user_name FROM profiles WHERE id = NEW.user_id;

  -- Determine email type from ledger type
  IF NEW.type = 'purchase' AND NEW.amount > 0 THEN
    v_type := 'points_purchase';
    v_dollar_amount := abs(NEW.amount) * 0.01;  -- 1 pt = $0.01
    PERFORM public._send_notification_email(
      v_type,
      jsonb_build_array(
        jsonb_build_object('email', v_user_email, 'name', coalesce(v_user_name, 'there'))
      ),
      jsonb_build_object(
        'pointsAmount', abs(NEW.amount),
        'dollarAmount', v_dollar_amount
      )
    );
  ELSIF NEW.type = 'redemption' AND NEW.amount < 0 THEN
    v_type := 'points_redemption';
    v_dollar_amount := abs(NEW.amount) * 0.01;
    v_method := coalesce(NEW.metadata->>'method', 'cashout');
    PERFORM public._send_notification_email(
      v_type,
      jsonb_build_array(
        jsonb_build_object('email', v_user_email, 'name', coalesce(v_user_name, 'there'))
      ),
      jsonb_build_object(
        'pointsAmount', abs(NEW.amount),
        'dollarAmount', v_dollar_amount,
        'redemptionMethod', v_method,
        'redemptionRecipient', coalesce(NEW.metadata->>'recipient', null)
      )
    );
  ELSIF NEW.type = 'refund' AND NEW.amount > 0 THEN
    v_type := 'points_refund';
    PERFORM public._send_notification_email(
      v_type,
      jsonb_build_array(
        jsonb_build_object('email', v_user_email, 'name', coalesce(v_user_name, 'there'))
      ),
      jsonb_build_object(
        'pointsAmount', NEW.amount,
        'refundReason', coalesce(NEW.metadata->>'reason', 'Refund processed')
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_points_event_email ON point_ledger;
CREATE TRIGGER trigger_points_event_email
  AFTER INSERT ON point_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public._notify_points_event();
