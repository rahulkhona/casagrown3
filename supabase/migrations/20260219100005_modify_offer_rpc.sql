-- ============================================================================
-- RPC: modify_offer_with_message (v2 — delivery_dates + community support)
-- Seller modifies a pending offer → system message, bump version
-- ============================================================================
create or replace function public.modify_offer_with_message(
  p_offer_id        uuid,
  p_seller_id       uuid,
  p_quantity         integer  default null,
  p_points_per_unit  integer  default null,
  p_delivery_date    date     default null,
  p_message          text     default null,
  p_media            jsonb    default null,
  p_delivery_dates   date[]   default null,
  p_community_h3_index text   default null,
  p_additional_community_h3_indices text[] default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
  v_new_qty integer;
  v_new_ppu integer;
  v_changes text[];
  v_eff_delivery_date date;
  v_eff_delivery_dates date[];
begin
  select * into v_offer
  from offers
  where id = p_offer_id
  for update;

  if v_offer is null then
    return jsonb_build_object('error', 'Offer not found');
  end if;

  if v_offer.status != 'pending' then
    return jsonb_build_object('error', 'Can only modify pending offers');
  end if;

  if v_offer.created_by != p_seller_id then
    return jsonb_build_object('error', 'Only the offer creator can modify');
  end if;

  v_new_qty := coalesce(p_quantity, v_offer.quantity);
  v_new_ppu := coalesce(p_points_per_unit, v_offer.points_per_unit);

  -- Resolve delivery dates
  if p_delivery_dates is not null and array_length(p_delivery_dates, 1) > 0 then
    v_eff_delivery_dates := p_delivery_dates;
    v_eff_delivery_date := p_delivery_dates[1];
  elsif p_delivery_date is not null then
    v_eff_delivery_dates := ARRAY[p_delivery_date];
    v_eff_delivery_date := p_delivery_date;
  else
    v_eff_delivery_dates := null;
    v_eff_delivery_date := null;
  end if;

  -- Track changes for system message
  if p_quantity is not null and p_quantity != v_offer.quantity then
    v_changes := array_append(v_changes, 'qty: ' || v_offer.quantity || ' → ' || p_quantity);
  end if;
  if p_points_per_unit is not null and p_points_per_unit != v_offer.points_per_unit then
    v_changes := array_append(v_changes, 'price: ' || v_offer.points_per_unit || ' → ' || p_points_per_unit || ' pts');
  end if;
  if v_eff_delivery_date is not null and v_eff_delivery_date != v_offer.delivery_date then
    v_changes := array_append(v_changes, 'delivery: ' || coalesce(v_offer.delivery_date::text, 'TBD') || ' → ' || v_eff_delivery_date::text);
  end if;
  if p_media is not null then
    v_changes := array_append(v_changes, 'media updated');
  end if;

  update offers
  set quantity = v_new_qty,
      points_per_unit = v_new_ppu,
      delivery_date = coalesce(v_eff_delivery_date, delivery_date),
      delivery_dates = coalesce(v_eff_delivery_dates, delivery_dates),
      message = coalesce(p_message, message),
      media = coalesce(p_media, media),
      community_h3_index = coalesce(p_community_h3_index, community_h3_index),
      additional_community_h3_indices = coalesce(p_additional_community_h3_indices, additional_community_h3_indices),
      version = version + 1,
      updated_at = now()
  where id = p_offer_id;

  -- Seller message (shown as from the seller, not system)
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_offer.conversation_id,
    p_seller_id,
    '✏️ Offer modified: ' || coalesce(array_to_string(v_changes, ', '), 'details updated') ||
    '. New total: ' || (v_new_qty * v_new_ppu) || ' pts.',
    'text'
  );

  return jsonb_build_object(
    'success', true,
    'newVersion', v_offer.version + 1
  );
end;
$$;
