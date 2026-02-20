-- ============================================================================
-- RPC: withdraw_offer_with_message
-- Seller withdraws their own pending offer → system message
-- ============================================================================
create or replace function public.withdraw_offer_with_message(
  p_offer_id  uuid,
  p_seller_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
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

  if v_offer.created_by != p_seller_id then
    return jsonb_build_object('error', 'Only the offer creator can withdraw');
  end if;

  update offers
  set status = 'withdrawn', updated_at = now()
  where id = p_offer_id;

  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_offer.conversation_id,
    null,
    'Offer withdrawn: ' || v_offer.quantity || ' ' || coalesce(v_offer.unit, '') ||
    ' ' || v_offer.product || '.',
    'system'
  );

  return jsonb_build_object('success', true);
end;
$$;
