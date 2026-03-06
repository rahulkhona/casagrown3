
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
    (SELECT wsd.produce_name FROM want_to_sell_details wsd WHERE wsd.post_id = v_conv.post_id LIMIT 1),
    (SELECT array_to_string(wbd.produce_names, ', ') FROM want_to_buy_details wbd WHERE wbd.post_id = v_conv.post_id LIMIT 1)
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
