-- ============================================================================
-- RPC: reject_offer_with_message
-- Buyer rejects a pending offer → system message
-- ============================================================================
create or replace function public.reject_offer_with_message(
  p_offer_id uuid,
  p_buyer_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
  v_conv record;
begin
  select * into v_offer
  from offers
  where id = p_offer_id
  for update;

  if v_offer is null then
    return jsonb_build_object('error', 'Offer not found');
  end if;

  if v_offer.status != 'pending' then
    return jsonb_build_object('error', 'Offer is not pending');
  end if;

  select * into v_conv
  from conversations
  where id = v_offer.conversation_id;

  if v_conv.buyer_id != p_buyer_id then
    return jsonb_build_object('error', 'Only the buyer can reject an offer');
  end if;

  update offers
  set status = 'rejected', updated_at = now()
  where id = p_offer_id;

  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_offer.conversation_id,
    null,
    'Offer rejected: ' || v_offer.quantity || ' ' || coalesce(v_offer.unit, '') ||
    ' ' || v_offer.product || ' at ' || v_offer.points_per_unit || ' pts/' ||
    coalesce(v_offer.unit, 'unit') || '.',
    'system'
  );

  return jsonb_build_object('success', true);
end;
$$;
