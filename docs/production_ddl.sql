-- ============================================================================
-- CasaGrown Production DDL
-- Generated from local Supabase schema (all migrations applied)
-- Date: 2026-03-17
--
-- This is a consolidated DDL for first-time production deployment.
-- Run this once on a fresh Supabase project. Future changes should be
-- applied as individual migrations from supabase/migrations/.
--
-- Contents:
--   - Extensions (postgis, pgcrypto, uuid-ossp, pg_cron, pg_net, etc.)
--   - 38 custom ENUM types
--   - 109 tables with columns, defaults, constraints
--   - 121 custom functions (RPCs, triggers, helpers)
--   - 64 indices
--   - 33 triggers
--   - 246 RLS policies
--   - 102 tables with RLS enabled
--
-- Prerequisites:
--   - PostgreSQL 15+ (Supabase)
--   - PostGIS extension available
--   - Supabase project with auth schema configured
-- ============================================================================

\restrict bkh596GxvTPfQf4ibhTtdnHvsHhonEqFW5idjh0TTMSjgnfo4p529rZdEYfOXTy

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE TYPE public.campaign_behavior AS ENUM (
    'signup',
    'first_post',
    'first_purchase',
    'first_sale',
    'per_referral',
    'first_purchase_by_referee',
    'first_sale_by_referee'
);

CREATE TYPE public.chat_message_type AS ENUM (
    'text',
    'media',
    'mixed',
    'system'
);

CREATE TYPE public.clearing_status AS ENUM (
    'captures_sent',
    'funds_pending',
    'funds_received',
    'cleared',
    'reconciliation_failed'
);

CREATE TYPE public.delegation_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'revoked',
    'pending_pairing',
    'active',
    'inactive'
);

CREATE TYPE public.dispute_status AS ENUM (
    'open',
    'seller_responded',
    'buyer_accepted',
    'escalated',
    'staff_resolved'
);

CREATE TYPE public.dispute_type AS ENUM (
    'not_delivered',
    'quantity_mismatch',
    'wrong_item',
    'poor_quality'
);

CREATE TYPE public.escalation_resolution AS ENUM (
    'refund_accepted',
    'resolved_without_refund',
    'dismissed'
);

CREATE TYPE public.escalation_status AS ENUM (
    'open',
    'resolved'
);

CREATE TYPE public.experiment_status AS ENUM (
    'draft',
    'running',
    'completed',
    'rolled_out',
    'rejected'
);

CREATE TYPE public.feedback_status AS ENUM (
    'open',
    'under_review',
    'planned',
    'in_progress',
    'completed',
    'rejected',
    'duplicate'
);

CREATE TYPE public.feedback_type AS ENUM (
    'feature_request',
    'bug_report',
    'support_request'
);

CREATE TYPE public.feedback_visibility AS ENUM (
    'public',
    'private'
);

CREATE TYPE public.giftcard_provider AS ENUM (
    'unified',
    'tremendous',
    'reloadly'
);

CREATE TYPE public.manual_refund_fulfillment_type AS ENUM (
    'physical_check',
    'egift_card',
    'venmo'
);

CREATE TYPE public.manual_refund_status AS ENUM (
    'pending_verification',
    'verification_failed',
    'pending_fulfillment',
    'fulfilled'
);

CREATE TYPE public.market_order_status AS ENUM (
    'pending',
    'confirmed',
    'cancelled',
    'delivering',
    'delivered',
    'completed',
    'declined',
    'disputed',
    'escalated',
    'resolved',
    'ready_for_pickup',
    'pickup_declined'
);

CREATE TYPE public.media_asset_type AS ENUM (
    'video',
    'image',
    'document'
);

CREATE TYPE public.offer_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'withdrawn'
);

CREATE TYPE public.order_status AS ENUM (
    'pending',
    'accepted',
    'delivered',
    'completed',
    'disputed',
    'escalated',
    'cancelled'
);

CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'succeeded',
    'failed',
    'refunded'
);

CREATE TYPE public.point_transaction_type AS ENUM (
    'purchase',
    'transfer',
    'payment',
    'platform_charge',
    'redemption',
    'reward',
    'hold',
    'refund',
    'platform_fee',
    'donation',
    'delegation_split',
    'hold_refund',
    'sales_tax'
);

CREATE TYPE public.post_reach AS ENUM (
    'community',
    'global'
);

CREATE TYPE public.post_status AS ENUM (
    'review',
    'available',
    'flagged',
    'rejected',
    'removed'
);

CREATE TYPE public.post_type AS ENUM (
    'want_to_sell',
    'want_to_buy',
    'offering_service',
    'need_service',
    'seeking_advice',
    'general_info'
);

CREATE TYPE public.provider_transaction_status AS ENUM (
    'pending',
    'success',
    'failed',
    'refunded'
);

CREATE TYPE public.purchased_bucket_status AS ENUM (
    'active',
    'depleted',
    'refunded',
    'partially_refunded',
    'pending_fulfillment'
);

CREATE TYPE public.rating_score AS ENUM (
    '1',
    '2',
    '3',
    '4',
    '5'
);

CREATE TYPE public.redemption_instrument AS ENUM (
    'tremendous',
    'reloadly',
    'globalgiving',
    'paypal',
    'stripe'
);

CREATE TYPE public.redemption_item_type AS ENUM (
    'gift_card',
    'merchandize',
    'donation'
);

CREATE TYPE public.redemption_method AS ENUM (
    'giftcards',
    'charity',
    '529c',
    'cashout'
);

CREATE TYPE public.redemption_reach_type AS ENUM (
    'global',
    'restricted'
);

CREATE TYPE public.redemption_status AS ENUM (
    'pending',
    'completed',
    'failed'
);

CREATE TYPE public.refund_offer_status AS ENUM (
    'pending',
    'accepted',
    'rejected'
);

CREATE TYPE public.restriction_scope AS ENUM (
    'global',
    'country',
    'state',
    'city',
    'zip',
    'community'
);

CREATE TYPE public.scraping_status AS ENUM (
    'success',
    'failure',
    'zero_results'
);

CREATE TYPE public.staff_role AS ENUM (
    'admin',
    'moderator',
    'support'
);

CREATE TYPE public.tax_rule_type AS ENUM (
    'fixed',
    'evaluate'
);

CREATE TYPE public.unit_of_measure AS ENUM (
    'piece',
    'dozen',
    'box',
    'bag'
);

CREATE FUNCTION public._notify_chat_initiated() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

  v_other_email := public.get_user_email(v_other_id);
  IF v_other_email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_other_name FROM profiles WHERE id = v_other_id;
  SELECT full_name INTO v_sender_name FROM profiles WHERE id = NEW.sender_id;

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

CREATE FUNCTION public._notify_delegation_revoked() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public._notify_points_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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

  RETURN NEW;
END;
$_$;

CREATE FUNCTION public._send_notification_email(p_type text, p_recipients jsonb, p_payload jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.accept_offer_atomic(p_offer_id uuid, p_buyer_id uuid, p_delivery_address text, p_delivery_instructions text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_offer record;
  v_order_id uuid;
  v_total_price integer;
  v_current_balance integer;
  v_conv record;
  v_final_instructions text;
begin
  -- Lock and fetch offer
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

  if v_conv.buyer_id != p_buyer_id then
    return jsonb_build_object('error', 'Only the buyer can accept an offer');
  end if;

  if v_current_balance < v_total_price then
    return jsonb_build_object(
      'error', 'Insufficient points',
      'currentBalance', v_current_balance,
      'required', v_total_price
    );
  end if;

  return jsonb_build_object(
    'orderId', v_order_id,
    'conversationId', v_offer.conversation_id,
    'newBalance', v_current_balance - v_total_price
  );
end;
$$;

CREATE FUNCTION public.accept_offer_atomic(p_offer_id uuid, p_buyer_id uuid, p_delivery_address text, p_delivery_instructions text DEFAULT NULL::text, p_quantity numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_offer record; v_order_id uuid; v_total_price integer;
  v_current_balance integer; v_conv record; v_final_instructions text; v_quantity numeric;
begin
  select * into v_offer from offers where id = p_offer_id for update;
  if v_offer is null then return jsonb_build_object('error', 'Offer not found'); end if;
  if v_offer.status != 'pending' then return jsonb_build_object('error', 'Offer is not pending'); end if;
  select * into v_conv from conversations where id = v_offer.conversation_id;
  if v_conv.buyer_id != p_buyer_id then return jsonb_build_object('error', 'Only the buyer can accept an offer'); end if;
  if p_delivery_address is null or trim(p_delivery_address) = '' then return jsonb_build_object('error', 'Delivery address is required'); end if;
  v_quantity := coalesce(p_quantity, v_offer.quantity);
  if v_quantity > v_offer.quantity then return jsonb_build_object('error', 'Requested quantity exceeds offer'); end if;
  if v_quantity <= 0 then return jsonb_build_object('error', 'Quantity must be positive'); end if;
  v_total_price := v_quantity * v_offer.points_per_unit;
  select coalesce(sum(amount), 0) into v_current_balance from point_ledger where user_id = p_buyer_id;
  if v_current_balance < v_total_price then
    return jsonb_build_object('error', 'Insufficient points', 'currentBalance', v_current_balance, 'required', v_total_price);
  end if;
  update offers set status = 'accepted', updated_at = now() where id = p_offer_id;
  if p_delivery_instructions is not null and trim(p_delivery_instructions) != '' then
    v_final_instructions := p_delivery_address || E'\n' || p_delivery_instructions;
  else v_final_instructions := p_delivery_address; end if;
  insert into orders (offer_id, buyer_id, seller_id, category, product, quantity, points_per_unit, delivery_date, delivery_instructions, conversation_id, status)
  values (v_offer.id, v_conv.buyer_id, v_conv.seller_id, v_offer.category, v_offer.product, v_quantity, v_offer.points_per_unit, v_offer.delivery_date, v_final_instructions, v_offer.conversation_id, 'pending')
  returning id into v_order_id;
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (p_buyer_id, 'hold', -v_total_price, 0, v_order_id,
    jsonb_build_object('order_id', v_order_id, 'offer_id', v_offer.id, 'post_id', v_conv.post_id, 'seller_id', v_conv.seller_id, 'product', v_offer.product, 'quantity', v_quantity, 'points_per_unit', v_offer.points_per_unit));
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (v_offer.conversation_id, p_buyer_id,
    '✅ Offer accepted! Order placed: ' || v_quantity || ' ' || coalesce(v_offer.unit, '') || ' ' || v_offer.product || ' for ' || v_total_price || ' points. Points held for this order.', 'text');
  return jsonb_build_object('orderId', v_order_id, 'conversationId', v_offer.conversation_id, 'newBalance', v_current_balance - v_total_price);
end;
$$;

CREATE FUNCTION public.accept_order_versioned(p_order_id uuid, p_expected_version integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order record;
  v_rows  integer;
  v_unit  text;
begin
  -- Lock and fetch order
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

    return jsonb_build_object(
      'error', 'Order was modified by buyer',
      'code', 'VERSION_MISMATCH',
      'currentVersion', v_order.version
    );
  end if;

  return jsonb_build_object('success', true);
end;
$$;

CREATE FUNCTION public.accept_refund_offer_with_message(p_order_id uuid, p_buyer_id uuid, p_offer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order record;
  v_offer record;
  v_esc_id uuid;
  v_total integer;
  v_refund_amount integer;
  v_seller_amount integer;
  v_fee integer;
  v_seller_payout integer;
  v_fee_rate numeric;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.buyer_id != p_buyer_id then
    return jsonb_build_object('error', 'Only the buyer can accept a refund offer');
  end if;

  if v_order.status not in ('disputed', 'escalated') then
    return jsonb_build_object(
      'error', 'Order must be in disputed or escalated status',
      'currentStatus', v_order.status
    );
  end if;

  if v_offer is null then
    return jsonb_build_object('error', 'Refund offer not found');
  end if;

  if v_offer.status != 'pending' then
    return jsonb_build_object('error', 'Offer is no longer pending');
  end if;

  update escalations
  set status = 'resolved',
      resolution_type = 'refund_accepted',
      accepted_refund_offer_id = p_offer_id,
      resolved_at = now(),
      updated_at = now()
  where id = v_esc_id;

  return jsonb_build_object('success', true);
end;
$$;

CREATE FUNCTION public.add_category_restriction(p_category_name text, p_community_h3 text DEFAULT NULL::text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_post RECORD; v_order RECORD;
  v_archived_posts INTEGER := 0; v_cancelled_orders INTEGER := 0;
  v_refunded_points INTEGER := 0; v_hold_amount INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sales_categories WHERE name = p_category_name) THEN
    RETURN jsonb_build_object('error', 'Category not found: ' || p_category_name);
  END IF;
  IF p_community_h3 IS NULL THEN
    DELETE FROM category_restrictions WHERE category_name = p_category_name AND community_h3_index IS NOT NULL;
  END IF;
  INSERT INTO category_restrictions (category_name, community_h3_index, reason)
  VALUES (p_category_name, p_community_h3, p_reason) ON CONFLICT (category_name, community_h3_index) DO NOTHING;
  FOR v_post IN
    SELECT p.id, p.author_id, wsd.produce_name FROM posts p
    JOIN want_to_sell_details wsd ON wsd.post_id = p.id
    WHERE wsd.category = p_category_name AND p.is_archived = false
      AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3)
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your listing "' || v_post.produce_name || '" has been archived because "' || p_category_name || '" is now restricted in your area.', now());
  END LOOP;
  FOR v_post IN
    SELECT p.id, p.author_id FROM posts p
    JOIN want_to_buy_details wbd ON wbd.post_id = p.id
    WHERE wbd.category = p_category_name AND p.is_archived = false
      AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3)
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your wanted post has been archived because "' || p_category_name || '" is now restricted in your area.', now());
  END LOOP;
  FOR v_order IN
    SELECT o.id, o.buyer_id, o.seller_id, o.product, o.conversation_id FROM orders o
    JOIN conversations c ON c.id = o.conversation_id JOIN posts p ON p.id = c.post_id
    WHERE o.category = p_category_name AND o.status IN ('pending', 'accepted')
      AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3) FOR UPDATE OF o
  LOOP
    UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = v_order.id;
    v_cancelled_orders := v_cancelled_orders + 1;
    SELECT coalesce(sum(amount), 0) INTO v_hold_amount FROM point_ledger WHERE reference_id = v_order.id AND type = 'hold';
    IF v_hold_amount < 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (v_order.buyer_id, 'hold_refund', -v_hold_amount, 0, v_order.id,
        jsonb_build_object('reason', 'Category "' || p_category_name || '" restricted', 'order_id', v_order.id, 'product', v_order.product));
      v_refunded_points := v_refunded_points + (-v_hold_amount);
    END IF;
    INSERT INTO chat_messages (conversation_id, sender_id, content, type)
    VALUES (v_order.conversation_id, NULL, '⚠️ This order has been cancelled because "' || p_category_name || '" is now restricted. Held points have been refunded.', 'system');
    INSERT INTO notifications (user_id, content, created_at) VALUES
      (v_order.buyer_id, 'Your order for "' || v_order.product || '" was cancelled (category restricted). Points refunded.', now()),
      (v_order.seller_id, 'An order for "' || v_order.product || '" was cancelled (category restricted).', now());
  END LOOP;
  RETURN jsonb_build_object('success', true, 'archivedPosts', v_archived_posts, 'cancelledOrders', v_cancelled_orders, 'refundedPoints', v_refunded_points);
END;
$$;

CREATE FUNCTION public.append_ledger_entry(p_event_type text, p_user_id uuid, p_amount_usd numeric, p_direction text, p_order_id uuid DEFAULT NULL::uuid, p_settlement_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_current_balance NUMERIC(10,2);
  v_new_balance NUMERIC(10,2);
  v_entry_id INTEGER;
BEGIN
  -- Get current balance from last ledger entry (or 0)
  SELECT COALESCE(
    (SELECT balance_after FROM market_ledger WHERE user_id = p_user_id ORDER BY id DESC LIMIT 1),
    0
  ) INTO v_current_balance;

  INSERT INTO market_ledger (event_type, user_id, order_id, settlement_id, amount_usd, direction, balance_after, metadata)
  VALUES (p_event_type, p_user_id, p_order_id, p_settlement_id, p_amount_usd, p_direction, v_new_balance, p_metadata)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

CREATE FUNCTION public.auto_complete_delivered_orders() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH completed AS (
    UPDATE market_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE status = 'delivered'
      AND auto_complete_at IS NOT NULL
      AND auto_complete_at <= now()
    RETURNING id, buyer_id, seller_id, product_name
  )
  INSERT INTO notifications (user_id, content, link_url)
  SELECT seller_id, 'Order for "' || product_name || '" auto-completed (buyer did not respond within 4 hours). ✓', '/orders/' || id
  FROM completed;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE FUNCTION public.ban_category(p_category_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_post RECORD; v_order RECORD;
  v_archived_posts INTEGER := 0; v_cancelled_orders INTEGER := 0;
  v_refunded_points INTEGER := 0; v_hold_amount INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sales_categories WHERE name = p_category_name) THEN
    RETURN jsonb_build_object('error', 'Category not found: ' || p_category_name);
  END IF;
  FOR v_post IN
    SELECT p.id, p.author_id, wsd.produce_name FROM posts p
    JOIN want_to_sell_details wsd ON wsd.post_id = p.id
    WHERE wsd.category = p_category_name AND p.is_archived = false
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your listing "' || v_post.produce_name || '" has been archived because the "' || p_category_name || '" category has been restricted.', now());
  END LOOP;
  FOR v_post IN
    SELECT p.id, p.author_id FROM posts p
    JOIN want_to_buy_details wbd ON wbd.post_id = p.id
    WHERE wbd.category = p_category_name AND p.is_archived = false
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your wanted post has been archived because the "' || p_category_name || '" category has been restricted.', now());
  END LOOP;
  FOR v_order IN
    SELECT o.id, o.buyer_id, o.seller_id, o.product, o.conversation_id FROM orders o
    WHERE o.category = p_category_name AND o.status IN ('pending', 'accepted') FOR UPDATE
  LOOP
    UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = v_order.id;
    v_cancelled_orders := v_cancelled_orders + 1;
    SELECT coalesce(sum(amount), 0) INTO v_hold_amount FROM point_ledger WHERE reference_id = v_order.id AND type = 'hold';
    IF v_hold_amount < 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (v_order.buyer_id, 'hold_refund', -v_hold_amount, 0, v_order.id,
        jsonb_build_object('reason', 'Category "' || p_category_name || '" restricted', 'order_id', v_order.id, 'product', v_order.product));
      v_refunded_points := v_refunded_points + (-v_hold_amount);
    END IF;
    INSERT INTO chat_messages (conversation_id, sender_id, content, type)
    VALUES (v_order.conversation_id, NULL,
      '⚠️ This order has been cancelled because the "' || p_category_name || '" category has been restricted. Held points have been refunded to the buyer.', 'system');
    INSERT INTO notifications (user_id, content, created_at) VALUES
      (v_order.buyer_id, 'Your order for "' || v_order.product || '" has been cancelled and points refunded. The "' || p_category_name || '" category has been restricted.', now()),
      (v_order.seller_id, 'An order for "' || v_order.product || '" has been cancelled. The "' || p_category_name || '" category has been restricted.', now());
  END LOOP;
  DELETE FROM sales_categories WHERE name = p_category_name;
  RETURN jsonb_build_object('success', true, 'archivedPosts', v_archived_posts, 'cancelledOrders', v_cancelled_orders, 'refundedPoints', v_refunded_points);
END;
$$;

CREATE FUNCTION public.ban_product(p_product_name text, p_community_h3 text DEFAULT NULL::text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_post RECORD; v_order RECORD;
  v_archived_posts INTEGER := 0; v_cancelled_orders INTEGER := 0;
  v_refunded_points INTEGER := 0; v_hold_amount INTEGER;
BEGIN
  IF p_community_h3 IS NULL THEN
    DELETE FROM blocked_products WHERE LOWER(product_name) = LOWER(p_product_name) AND community_h3_index IS NOT NULL;
  END IF;
  INSERT INTO blocked_products (product_name, community_h3_index, reason)
  VALUES (p_product_name, p_community_h3, p_reason) ON CONFLICT (product_name, community_h3_index) DO NOTHING;
  FOR v_post IN
    SELECT p.id, p.author_id, wsd.produce_name FROM posts p
    JOIN want_to_sell_details wsd ON wsd.post_id = p.id
    WHERE LOWER(wsd.produce_name) = LOWER(p_product_name) AND p.is_archived = false
      AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3)
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your listing "' || v_post.produce_name || '" has been archived. This product is now restricted.', now());
  END LOOP;
  FOR v_post IN
    SELECT p.id, p.author_id FROM posts p
    JOIN want_to_buy_details wbd ON wbd.post_id = p.id
    WHERE EXISTS (SELECT 1 FROM unnest(wbd.produce_names) AS pn WHERE LOWER(pn) = LOWER(p_product_name))
      AND p.is_archived = false AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3)
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your wanted post has been archived. The product "' || p_product_name || '" is now restricted.', now());
  END LOOP;
  FOR v_order IN
    SELECT o.id, o.buyer_id, o.seller_id, o.product, o.conversation_id FROM orders o
    JOIN conversations c ON c.id = o.conversation_id JOIN posts p ON p.id = c.post_id
    WHERE LOWER(o.product) = LOWER(p_product_name) AND o.status IN ('pending', 'accepted')
      AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3) FOR UPDATE OF o
  LOOP
    UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = v_order.id;
    v_cancelled_orders := v_cancelled_orders + 1;
    SELECT coalesce(sum(amount), 0) INTO v_hold_amount FROM point_ledger WHERE reference_id = v_order.id AND type = 'hold';
    IF v_hold_amount < 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (v_order.buyer_id, 'hold_refund', -v_hold_amount, 0, v_order.id,
        jsonb_build_object('reason', 'Product "' || p_product_name || '" restricted', 'order_id', v_order.id));
      v_refunded_points := v_refunded_points + (-v_hold_amount);
    END IF;
    INSERT INTO chat_messages (conversation_id, sender_id, content, type)
    VALUES (v_order.conversation_id, NULL,
      '⚠️ This order has been cancelled because "' || p_product_name || '" is now restricted. Held points have been refunded.', 'system');
    INSERT INTO notifications (user_id, content, created_at) VALUES
      (v_order.buyer_id, 'Your order for "' || v_order.product || '" was cancelled (product restricted). Points refunded.', now()),
      (v_order.seller_id, 'An order for "' || v_order.product || '" was cancelled (product restricted).', now());
  END LOOP;
  RETURN jsonb_build_object('success', true, 'archivedPosts', v_archived_posts, 'cancelledOrders', v_cancelled_orders, 'refundedPoints', v_refunded_points);
END;
$$;

CREATE FUNCTION public.buyer_accept_refund(p_dispute_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_dispute.status != 'seller_responded' THEN RETURN jsonb_build_object('error', 'Seller has not responded yet'); END IF;

  UPDATE order_disputes SET status = 'buyer_accepted', resolved_at = now(), updated_at = now() WHERE id = p_dispute_id;
  UPDATE market_orders SET status = 'resolved', updated_at = now() WHERE id = v_dispute.order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer accepted your refund offer for "' || v_order.product_name || '". Dispute resolved. ✓', '/orders/' || v_order.id);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE FUNCTION public.buyer_confirm_delivery(p_order_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'delivered' THEN RETURN jsonb_build_object('error', 'Order is not in delivered status'); END IF;

  UPDATE market_orders SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = p_order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer confirmed delivery of "' || v_order.product_name || '". Order complete! ✓', '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE FUNCTION public.buyer_decline_pickup(p_order_id uuid, p_reason text, p_photos jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'ready_for_pickup' THEN RETURN jsonb_build_object('error', 'Order is not ready for pickup'); END IF;

  UPDATE market_orders
  SET status = 'pickup_declined',
      decline_reason = p_reason,
      delivery_proof = p_photos, -- reuse field for evidence
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer declined pickup for "' || v_order.product_name || '": ' || p_reason, '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE FUNCTION public.buyer_dispute_order(p_order_id uuid, p_reason text, p_photos jsonb DEFAULT '[]'::jsonb, p_dispute_type text DEFAULT NULL::text, p_quantity_received integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_order RECORD;
  v_dispute_id UUID;
  v_suggested_refund NUMERIC;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status NOT IN ('delivered', 'completed') THEN RETURN jsonb_build_object('error', 'Can only dispute delivered orders'); END IF;

  UPDATE market_orders SET status = 'disputed', updated_at = now() WHERE id = p_order_id;

  INSERT INTO order_disputes (order_id, initiated_by, reason, photos, dispute_type, quantity_received, refund_amount_usd)
  VALUES (p_order_id, auth.uid(), p_reason, p_photos, p_dispute_type, p_quantity_received, v_suggested_refund)
  RETURNING id INTO v_dispute_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer has disputed their order for "' || v_order.product_name || '". ⚠️', '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true, 'dispute_id', v_dispute_id, 'suggested_refund', v_suggested_refund);
END;
$_$;

CREATE FUNCTION public.buyer_resolve_dispute(p_dispute_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_dispute.status IN ('buyer_accepted', 'staff_resolved') THEN RETURN jsonb_build_object('error', 'Already resolved'); END IF;

  UPDATE order_disputes SET status = 'buyer_accepted', resolved_at = now(), updated_at = now() WHERE id = p_dispute_id;
  UPDATE market_orders SET status = 'resolved', updated_at = now() WHERE id = v_dispute.order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer resolved the dispute for "' || v_order.product_name || '". ✓', '/orders/' || v_order.id);

  RETURN jsonb_build_object('success', true);
END;
$$;

SET default_table_access_method = heap;

CREATE TABLE public.user_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    type public.feedback_type NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    status public.feedback_status DEFAULT 'open'::public.feedback_status NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    visibility public.feedback_visibility DEFAULT 'public'::public.feedback_visibility NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    assigned_to uuid
);

CREATE FUNCTION public.can_read_feedback(feedback_row public.user_feedback) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    feedback_row.visibility = 'public'
    OR feedback_row.author_id = auth.uid()
    OR is_staff(auth.uid());
$$;

CREATE FUNCTION public.cancel_order_with_message(p_order_id uuid, p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order record;
  v_post_id uuid;
  v_was_accepted boolean;
  v_escrow_amount integer;
  v_canceller_role text;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.buyer_id != p_user_id and v_order.seller_id != p_user_id then
    return jsonb_build_object('error', 'Only buyer or seller can cancel');
  end if;

  if v_order.status not in ('pending', 'accepted') then
    return jsonb_build_object(
      'error', 'Cannot cancel order in ' || v_order.status || ' status'
    );
  end if;

  v_was_accepted := (v_order.status = 'accepted');
  v_escrow_amount := v_order.quantity * v_order.points_per_unit;

    if v_post_id is not null then
      update want_to_sell_details
      set total_quantity_available = total_quantity_available + v_order.quantity,
          updated_at = now()
      where post_id = v_post_id;
    end if;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

CREATE FUNCTION public.check_1099k_threshold(p_seller_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
DECLARE
  v_ytd_total NUMERIC;
  v_threshold NUMERIC := 600.00;       -- Federal 1099-K threshold
  v_warn_pct  NUMERIC := 0.70;         -- Warn at 70% (within 30%)
  v_warn_at   NUMERIC;
  v_already_warned BOOLEAN;
BEGIN
  v_warn_at := v_threshold * v_warn_pct;

  IF v_already_warned THEN RETURN; END IF;

CREATE FUNCTION public.check_comment_flag_threshold() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_flag_count INTEGER;
  v_comment RECORD;
BEGIN
  SELECT COUNT(*) INTO v_flag_count
  FROM comment_flags WHERE comment_id = NEW.comment_id;

  IF v_flag_count >= 3 THEN
    SELECT c.id, c.author_id, c.body, c.is_hidden, p.seller_id, p.name as product_name
    INTO v_comment
    FROM product_comments c
    JOIN market_products p ON p.id = c.product_id
    WHERE c.id = NEW.comment_id;

    IF NOT v_comment.is_hidden THEN
      UPDATE product_comments
      SET is_hidden = true
      WHERE id = NEW.comment_id;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.check_post_flag_threshold() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_flag_count INTEGER;
  v_post_row RECORD;
BEGIN
  -- Count total flags for this post
  SELECT COUNT(*) INTO v_flag_count
  FROM post_flags WHERE post_id = NEW.post_id;

  IF v_flag_count >= 3 THEN
    -- Get the post
    SELECT id, author_id, status INTO v_post_row
    FROM posts WHERE id = NEW.post_id;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.check_product_flag_threshold() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_flag_count INTEGER;
  v_product RECORD;
  v_seller RECORD;
  v_edge_url TEXT;
BEGIN
  SELECT COUNT(*) INTO v_flag_count
  FROM product_flags WHERE product_id = NEW.product_id;

  IF v_flag_count >= 3 THEN
    SELECT id, seller_id, name, is_active INTO v_product
    FROM market_products WHERE id = NEW.product_id;

    IF v_product.is_active THEN
      -- Deactivate + mark as flagged
      UPDATE market_products
      SET is_active = false, is_flagged = true, updated_at = now()
      WHERE id = NEW.product_id;

      BEGIN
        PERFORM net.http_post(
          url := v_edge_url || '/send-push-notification',
          body := jsonb_build_object(
            'user_ids', jsonb_build_array(v_product.seller_id::text),
            'title', '⚠️ Product Flagged',
            'body', 'Your product "' || v_product.name || '" has been hidden due to reports. Tap to edit and republish.',
            'url', '/my-booth/products/' || v_product.id,
            'tag', 'product-flagged-' || v_product.id
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(
              current_setting('app.settings.service_role_key', true),
              current_setting('supabase.service_role_key', true)
            )
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification for flagged product failed (non-blocking): %', SQLERRM;
      END;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.cleanup_sent_reminders() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  DELETE FROM public.market_reminders
  WHERE sent_at IS NOT NULL;
$$;

CREATE FUNCTION public.clear_phone_verification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.phone_number IS DISTINCT FROM NEW.phone_number THEN
    NEW.phone_verified := false;
    NEW.phone_verified_at := NULL;
    NEW.phone_verification_code := NULL;
    NEW.phone_verification_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.clear_product_flags(p_product_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Only the product owner can clear flags
  IF NOT EXISTS (
    SELECT 1 FROM market_products
    WHERE id = p_product_id AND seller_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

CREATE FUNCTION public.compute_balance_after() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  last_balance integer;
begin
  -- Advisory lock on user_id to serialize concurrent inserts for the same user
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  return new;
end;
$$;

CREATE FUNCTION public.confirm_order_delivery(p_order_id uuid, p_buyer_id uuid, p_harvest_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order          RECORD;
  v_post           RECORD;
  v_total          INTEGER;
  v_fee            INTEGER;
  v_after_fee      INTEGER;
  v_delegator_share INTEGER;
  v_delegate_share  INTEGER;
  v_delegate_pct   INTEGER;
  v_fee_rate       NUMERIC;
  v_buyer_profile  RECORD;
  v_seller_profile RECORD;
  v_receipt_footer TEXT;
  v_buyer_zip      TEXT;
  v_seller_zip     TEXT;
  v_buyer_email    TEXT;
  v_seller_email   TEXT;
  v_delegator_email TEXT;
  v_delegator_profile RECORD;
  v_email_body     JSONB;
  v_service_role_key TEXT;
  v_edge_fn_url    TEXT;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  IF v_order.buyer_id != p_buyer_id THEN
    RETURN jsonb_build_object('error', 'Only the buyer can confirm delivery');
  END IF;

  IF v_order.status != 'delivered' THEN
    RETURN jsonb_build_object(
      'error', 'Order must be in delivered status to confirm',
      'currentStatus', v_order.status
    );
  END IF;

  IF v_post.on_behalf_of IS NOT NULL AND v_post.on_behalf_of != v_post.author_id THEN
    -- ─── DELEGATED SALE ──────────────────────────────────────────────
    v_delegate_pct := COALESCE(v_post.delegate_pct, 50);
    v_delegate_share := ROUND(v_after_fee * v_delegate_pct / 100.0);
    v_delegator_share := v_after_fee - v_delegate_share;

    IF v_delegate_share > 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (
        v_post.author_id,
        'delegation_split',
        v_delegate_share,
        0,
        v_order.id,
        jsonb_build_object(
          'order_id', v_order.id,
          'role', 'delegate',
          'delegate_pct', v_delegate_pct,
          'total_before_fee', v_total,
          'platform_fee', v_fee,
          'total_after_fee', v_after_fee,
          'product', v_order.product,
          'delegate_share', v_delegate_share,
          'delegator_share', v_delegator_share,
          'delegator_id', v_post.on_behalf_of,
          'delegator_name', v_delegator_profile.full_name,
          'delegate_name', v_seller_profile.full_name
        )
      );
    END IF;

    IF v_delegator_share > 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (
        v_post.on_behalf_of,
        'delegation_split',
        v_delegator_share,
        0,
        v_order.id,
        jsonb_build_object(
          'order_id', v_order.id,
          'role', 'delegator',
          'delegate_pct', v_delegate_pct,
          'total_before_fee', v_total,
          'platform_fee', v_fee,
          'total_after_fee', v_after_fee,
          'product', v_order.product,
          'delegate_share', v_delegate_share,
          'delegator_share', v_delegator_share,
          'delegate_id', v_post.author_id,
          'delegator_name', v_delegator_profile.full_name,
          'delegate_name', v_seller_profile.full_name
        )
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'delegated', true,
      'delegatePct', v_delegate_pct,
      'delegatorShare', v_delegator_share,
      'delegateShare', v_delegate_share,
      'platformFee', v_fee
    );

  ELSE
    -- ─── NORMAL SALE ─────────────────────────────────────────────────

    INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    VALUES (
      v_order.seller_id,
      'payment',
      v_after_fee,
      0,
      v_order.id,
      jsonb_build_object(
        'order_id', v_order.id,
        'product', v_order.product,
        'total', v_total,
        'platform_fee', v_fee,
        'seller_payout', v_after_fee
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'delegated', false,
      'sellerPayout', v_after_fee,
      'platformFee', v_fee
    );
  END IF;
END;
$$;

CREATE FUNCTION public.confirm_payout_verification(p_received_amount numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_expected NUMERIC(4,2);
  v_attempts INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT payout_verification_amount, payout_verification_attempts
    INTO v_expected, v_attempts
    FROM profiles WHERE id = v_uid;

  IF v_expected IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending verification');
  END IF;

  IF v_attempts >= 3 THEN
    -- Reset verification after too many failed attempts
    UPDATE profiles SET
      payout_verified = FALSE,
      payout_verification_amount = NULL,
      payout_verification_sent_at = NULL,
      payout_verification_attempts = 0
    WHERE id = v_uid;
    RETURN jsonb_build_object('success', false, 'error', 'Too many attempts. Please start verification again.');
  END IF;

  IF round(p_received_amount::numeric, 2) = v_expected THEN
    UPDATE profiles SET
      payout_verified = TRUE,
      payout_verification_attempts = v_attempts + 1
    WHERE id = v_uid;
    RETURN jsonb_build_object('success', true, 'verified', true);
  ELSE
    UPDATE profiles SET payout_verification_attempts = v_attempts + 1 WHERE id = v_uid;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Amount does not match. ' || (2 - v_attempts) || ' attempts remaining.',
      'attempts_remaining', 2 - v_attempts
    );
  END IF;
END;
$$;

CREATE FUNCTION public.confirm_settlement_funds_received(p_settlement_id uuid, p_stripe_payout_id text DEFAULT NULL::text, p_stripe_payout_amount_usd numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_settlement RECORD;
  v_user RECORD;
  v_check3_pass BOOLEAN := true;
  v_stripe_mismatch NUMERIC(10,2) := 0;
  v_capture_count INTEGER;
  v_estimated_stripe_fees NUMERIC(10,2);
  v_expected_after_fees NUMERIC(10,2);
  v_tolerance NUMERIC(10,2);
BEGIN
  SELECT * INTO v_settlement FROM market_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF v_settlement IS NULL THEN RETURN jsonb_build_object('error', 'Settlement not found'); END IF;
  IF v_settlement.status != 'funds_pending' THEN
    RETURN jsonb_build_object('error', 'Settlement not in funds_pending state', 'current_status', v_settlement.status);
  END IF;

    v_stripe_mismatch := ABS(p_stripe_payout_amount_usd - v_expected_after_fees);
    v_check3_pass := v_stripe_mismatch <= v_tolerance;

    IF NOT v_check3_pass THEN
      -- Log mismatch and flag for admin
      UPDATE market_settlements
      SET status = 'reconciliation_failed',
          stripe_payout_id = p_stripe_payout_id,
          stripe_payout_amount_usd = p_stripe_payout_amount_usd,
          stripe_payout_received_at = now(),
          reconciliation_check = reconciliation_check || jsonb_build_object(
            'check3_stripe_reconciliation', false,
            'total_captured_usd', v_settlement.total_captured_usd,
            'estimated_stripe_fees', v_estimated_stripe_fees,
            'expected_after_fees', v_expected_after_fees,
            'received_usd', p_stripe_payout_amount_usd,
            'mismatch_usd', v_stripe_mismatch,
            'tolerance_usd', v_tolerance
          ),
          updated_at = now()
      WHERE id = p_settlement_id;
      RETURN jsonb_build_object('error', 'Stripe amount mismatch beyond tolerance',
        'expected_after_fees', v_expected_after_fees,
        'received', p_stripe_payout_amount_usd,
        'mismatch', v_stripe_mismatch,
        'tolerance', v_tolerance,
        'estimated_stripe_fees', v_estimated_stripe_fees);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'cleared',
    'stripe_reconciled', v_check3_pass,
    'stripe_payout_id', p_stripe_payout_id);
END;
$_$;

CREATE FUNCTION public.consume_fifo_buckets() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_remaining_to_consume integer;
  v_bucket RECORD;
  v_consume_amount integer;
  v_new_bucket_status purchased_bucket_status;
BEGIN
  -- We only consume purchased buckets if points are being spent on platform transactions.
  -- Exclude redemptions/donations because those MUST consume earned points exclusively.
  IF NEW.amount < 0 AND NEW.type IN ('payment', 'platform_charge') THEN
    v_remaining_to_consume := abs(NEW.amount);

    FOR v_bucket IN
      SELECT id, remaining_amount, status
      FROM purchased_points_buckets
      WHERE user_id = NEW.user_id AND status IN ('active', 'partially_refunded')
      ORDER BY created_at ASC
      FOR UPDATE
    LOOP
      IF v_remaining_to_consume <= 0 THEN
        EXIT;
      END IF;

      UPDATE purchased_points_buckets
      SET remaining_amount = remaining_amount - v_consume_amount,
          status = v_new_bucket_status,
          updated_at = now()
      WHERE id = v_bucket.id;

    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.create_offer_atomic(p_seller_id uuid, p_buyer_id uuid, p_post_id uuid, p_quantity integer, p_points_per_unit integer, p_category text, p_product text, p_unit text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date, p_message text DEFAULT NULL::text, p_seller_post_id uuid DEFAULT NULL::uuid, p_media jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_conversation_id uuid;
  v_offer_id        uuid;
  v_existing_offer  record;
  v_existing_order  record;
begin
  -- Can't offer to yourself
  if p_seller_id = p_buyer_id then
    return jsonb_build_object('error', 'Cannot make an offer on your own post');
  end if;

  if v_conversation_id is null then
    insert into conversations (post_id, buyer_id, seller_id)
    values (p_post_id, p_buyer_id, p_seller_id)
    returning id into v_conversation_id;
  end if;

  if v_existing_offer is not null then
    return jsonb_build_object(
      'error', 'An active offer already exists in this conversation',
      'existingOfferId', v_existing_offer.id,
      'conversationId', v_conversation_id
    );
  end if;

  if v_existing_order is not null then
    return jsonb_build_object(
      'error', 'An active order exists in this conversation',
      'existingOrderId', v_existing_order.id,
      'conversationId', v_conversation_id
    );
  end if;

  return jsonb_build_object(
    'offerId', v_offer_id,
    'conversationId', v_conversation_id
  );
end;
$$;

CREATE FUNCTION public.create_offer_atomic(p_seller_id uuid, p_buyer_id uuid, p_post_id uuid, p_quantity integer, p_points_per_unit integer, p_category text, p_product text, p_unit text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date, p_delivery_dates text[] DEFAULT '{}'::text[], p_message text DEFAULT NULL::text, p_seller_post_id uuid DEFAULT NULL::uuid, p_media jsonb DEFAULT '[]'::jsonb, p_community_h3_index text DEFAULT NULL::text, p_additional_community_h3_indices text[] DEFAULT '{}'::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

CREATE FUNCTION public.create_offer_atomic(p_seller_id uuid, p_buyer_id uuid, p_post_id uuid, p_quantity integer, p_points_per_unit integer, p_category text, p_product text, p_unit text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date, p_message text DEFAULT NULL::text, p_seller_post_id uuid DEFAULT NULL::uuid, p_media jsonb DEFAULT '[]'::jsonb, p_delivery_dates date[] DEFAULT '{}'::date[], p_community_h3_index text DEFAULT NULL::text, p_additional_community_h3_indices text[] DEFAULT '{}'::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_conversation_id uuid;
  v_offer_id uuid;
  v_existing_offer record;
  v_existing_order record;
  v_effective_delivery_date date;
  v_effective_delivery_dates date[];
begin
  -- Can't offer to yourself
  if p_seller_id = p_buyer_id then
    return jsonb_build_object('error', 'Cannot make an offer on your own post');
  end if;

  if v_conversation_id is null then
    insert into conversations (post_id, buyer_id, seller_id)
    values (p_post_id, p_buyer_id, p_seller_id)
    returning id into v_conversation_id;
  end if;

  if v_existing_offer is not null then
    return jsonb_build_object(
      'error', 'An active offer already exists in this conversation',
      'existingOfferId', v_existing_offer.id,
      'conversationId', v_conversation_id
    );
  end if;

  if v_existing_order is not null then
    return jsonb_build_object(
      'error', 'An active order exists in this conversation',
      'existingOrderId', v_existing_order.id,
      'conversationId', v_conversation_id
    );
  end if;

  return jsonb_build_object(
    'offerId', v_offer_id,
    'conversationId', v_conversation_id
  );
end;
$$;

CREATE FUNCTION public.create_order_atomic(p_buyer_id uuid, p_seller_id uuid, p_post_id uuid, p_quantity integer, p_points_per_unit integer, p_total_price integer, p_category text, p_product text, p_delivery_date date DEFAULT NULL::date, p_delivery_instructions text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_conversation_id uuid; v_offer_id uuid; v_order_id uuid;
  v_current_balance integer; v_unit text;
  v_buyer_email text; v_seller_email text;
  v_buyer_name text; v_seller_name text;
  v_jur record;
  v_is_blocked boolean := false;
  v_block_reason text;
begin
  -- 1. Check Jurisdiction Restrictions
  SELECT * INTO v_jur FROM get_user_jurisdiction(p_buyer_id) LIMIT 1;
  
  -- Check blocked products
  SELECT true, reason INTO v_is_blocked, v_block_reason
  FROM blocked_products
  WHERE product_name ILIKE p_product
    AND (
      (country_iso_3 IS NULL AND state_id IS NULL AND county_id IS NULL AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND country_iso_3 = v_jur.country_iso_3 AND state_id IS NULL AND county_id IS NULL AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND state_id = v_jur.state_id AND county_id IS NULL AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND county_id = v_jur.county_id AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND city_id = v_jur.city_id)
    )
  LIMIT 1;

  IF v_is_blocked THEN
    RAISE EXCEPTION 'PRODUCT_RESTRICTED:%', coalesce(v_block_reason, 'This product is restricted in your area');
  END IF;

  IF v_is_blocked THEN
    RAISE EXCEPTION 'CATEGORY_RESTRICTED:This category is restricted in your area';
  END IF;

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

CREATE FUNCTION public.debit_buyer_balance(p_buyer_id uuid, p_max_amount_cents integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_max_usd NUMERIC(10,2);
  v_available NUMERIC(10,2);
  v_actual_debit NUMERIC(10,2);
  v_actual_cents INTEGER;
BEGIN
  v_max_usd := p_max_amount_cents::NUMERIC / 100;

  IF v_available IS NULL OR v_available <= 0 THEN
    RETURN 0;
  END IF;

  RETURN v_actual_cents;
END;
$$;

CREATE FUNCTION public.dispute_order_with_message(p_order_id uuid, p_buyer_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.enter_pickup_passcode(p_order_id uuid, p_passcode text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order RECORD;
  v_is_buyer BOOLEAN;
  v_is_seller BOOLEAN;
  v_expected TEXT;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.status != 'ready_for_pickup' THEN RETURN jsonb_build_object('error', 'Order is not ready for pickup'); END IF;

  v_is_buyer := (v_order.buyer_id = auth.uid());
  v_is_seller := (v_order.seller_id = auth.uid());

  IF NOT v_is_buyer AND NOT v_is_seller THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

    INSERT INTO notifications (user_id, content, link_url) VALUES
      (v_order.buyer_id, 'Pickup complete for "' || v_order.product_name || '"! ✓', '/orders/' || p_order_id),
      (v_order.seller_id, 'Pickup complete for "' || v_order.product_name || '"! ✓', '/orders/' || p_order_id);

    RETURN jsonb_build_object('success', true, 'completed', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'completed', false, 'waiting_for_other', true);
END;
$$;

CREATE FUNCTION public.escalate_dispute(p_dispute_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.buyer_id != auth.uid() AND v_order.seller_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;
  IF v_dispute.status IN ('buyer_accepted', 'staff_resolved') THEN
    RETURN jsonb_build_object('error', 'Dispute already resolved');
  END IF;

  UPDATE order_disputes SET status = 'escalated', updated_at = now() WHERE id = p_dispute_id;
  UPDATE market_orders SET status = 'escalated', updated_at = now() WHERE id = v_dispute.order_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE FUNCTION public.escalate_order_with_message(p_order_id uuid, p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order record;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.buyer_id != p_user_id and v_order.seller_id != p_user_id then
    return jsonb_build_object('error', 'Only buyer or seller can escalate');
  end if;

  if v_order.status not in ('disputed', 'escalated') then
    return jsonb_build_object(
      'error', 'Can only escalate a disputed order',
      'currentStatus', v_order.status
    );
  end if;

  return jsonb_build_object('success', true);
end;
$$;

CREATE FUNCTION public.finalize_point_refund(p_user_id uuid, p_bucket_id uuid, p_amount_cents integer, p_reference_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_remaining INT;
  v_new_remaining INT;
BEGIN
  -- 1. Lock and read the bucket to prevent concurrent refund races
  SELECT remaining_amount
  INTO v_remaining
  FROM public.purchased_points_buckets
  WHERE id = p_bucket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bucket % not found', p_bucket_id;
  END IF;

  IF p_amount_cents > v_remaining THEN
    RAISE EXCEPTION 'Refund amount (%) exceeds remaining bucket balance (%)', p_amount_cents, v_remaining;
  END IF;

  v_new_remaining := v_remaining - p_amount_cents;

END;
$$;

CREATE FUNCTION public.finalize_redemption(p_payload jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption % not found', v_red_id;
  END IF;

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
      v_face_value_cents, (v_face_value_cents * 100),
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

END;
$_$;

CREATE FUNCTION public.generate_referral_code() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
  i integer;
begin
  for i in 1..8 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result;
end;
$$;

CREATE FUNCTION public.get_active_redemption_providers() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    AS $$
    SELECT jsonb_agg(
        jsonb_build_object(
            'method', m.method,
            'is_active', m.is_active,
            'instruments', COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'instrument', i.instrument,
                            'is_active', i.is_active
                        )
                    )
                    FROM available_redemption_method_instruments i
                    WHERE i.method = m.method
                ), 
                '[]'::jsonb
            )
        )
    )
    FROM available_redemption_methods m;
$$;

CREATE FUNCTION public.get_allowed_categories(buyer_zip text DEFAULT NULL::text) RETURNS TABLE(name text, display_order integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_country_iso_3 TEXT := 'USA';
  v_state_id UUID;
  v_county_id UUID;
  v_city_id UUID;
BEGIN
  -- Resolve jurisdiction from zip code (same pattern as get_user_jurisdiction)
  IF buyer_zip IS NOT NULL THEN
    SELECT z.city_id, c.state_id, z.county_id
    INTO v_city_id, v_state_id, v_county_id
    FROM zip_codes z
    LEFT JOIN cities c ON z.city_id = c.id
    WHERE z.zip_code = buyer_zip AND z.country_iso_3 = v_country_iso_3;
  END IF;

  RETURN QUERY
  SELECT sc.name, sc.display_order
  FROM sales_categories sc
  WHERE NOT EXISTS (
    -- Check restrictions at all jurisdiction levels (matching filtered_feed pattern)
    SELECT 1 FROM category_restrictions cr
    WHERE cr.category_name = sc.name
      AND (
        -- Global restriction (all jurisdiction columns NULL)
        (cr.country_iso_3 IS NULL AND cr.state_id IS NULL AND cr.county_id IS NULL AND cr.city_id IS NULL)
        -- Country-level restriction
        OR (cr.country_iso_3 = v_country_iso_3 AND cr.state_id IS NULL AND cr.county_id IS NULL AND cr.city_id IS NULL)
        -- State-level restriction
        OR (v_state_id IS NOT NULL AND cr.state_id = v_state_id AND cr.county_id IS NULL AND cr.city_id IS NULL)
        -- County-level restriction
        OR (v_county_id IS NOT NULL AND cr.county_id = v_county_id AND cr.city_id IS NULL)
        -- City-level restriction
        OR (v_city_id IS NOT NULL AND cr.city_id = v_city_id)
      )
  )
  ORDER BY sc.display_order;
END;
$$;

CREATE FUNCTION public.get_auto_redemption_config() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_config RECORD;
BEGIN
  SELECT * INTO v_config FROM user_auto_redemption_config WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'enabled', false,
      'method', 'cashout',
      'threshold_usd', 50.00,
      'cashout_payout_id', NULL,
      'gift_card_brand', NULL,
      'gift_card_amount_usd', NULL,
      'charity_project_id', NULL,
      'charity_project_name', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'enabled', v_config.enabled,
    'method', v_config.method,
    'threshold_usd', v_config.threshold_usd,
    'cashout_payout_id', v_config.cashout_payout_id,
    'gift_card_brand', v_config.gift_card_brand,
    'gift_card_amount_usd', v_config.gift_card_amount_usd,
    'charity_project_id', v_config.charity_project_id,
    'charity_project_name', v_config.charity_project_name
  );
END;
$$;

CREATE FUNCTION public.get_filtered_feed(p_community_h3 text, p_viewer_id uuid) RETURNS TABLE(id uuid, author_id uuid, type text, reach text, content text, created_at timestamp with time zone, community_h3_index text, expires_at timestamp with time zone, author_full_name text, author_avatar_url text, author_phone_verified boolean, community_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    p.id,
    p.author_id,
    p.type::text,
    p.reach::text,
    p.content,
    p.created_at,
    p.community_h3_index,
    p.expires_at,
    -- Author
    pr.full_name AS author_full_name,
    pr.avatar_url AS author_avatar_url,
    pr.phone_verified AS author_phone_verified,
    -- Community
    c.name AS community_name
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  LEFT JOIN communities c ON c.h3_index = p.community_h3_index
  WHERE
    -- Community filter (same as current: community or global)
    (p.community_h3_index = p_community_h3 OR p.community_h3_index IS NULL)
    -- Status filter
    AND p.status = 'available'
    -- Expiration filter (index-backed via idx_posts_active_feed)
    AND p.expires_at > now()
    -- Ghosted user filter: hide ghosted users' posts UNLESS viewer is the author
    AND (pr.is_ghosted = false OR p.author_id = p_viewer_id)
    -- Blocked category filter: exclude posts whose sell/buy category is restricted
    -- Checks global restrictions (all jurisdiction columns NULL) and any matching jurisdiction
    AND NOT EXISTS (
      SELECT 1 FROM category_restrictions cr
      JOIN want_to_sell_details wts ON wts.post_id = p.id
      WHERE cr.category_name = wts.category
        AND (cr.country_iso_3 IS NULL AND cr.state_id IS NULL AND cr.county_id IS NULL AND cr.city_id IS NULL)
    )
    AND NOT EXISTS (
      SELECT 1 FROM category_restrictions cr
      JOIN want_to_buy_details wtb ON wtb.post_id = p.id
      WHERE cr.category_name = wtb.category
        AND (cr.country_iso_3 IS NULL AND cr.state_id IS NULL AND cr.county_id IS NULL AND cr.city_id IS NULL)
    )
    -- Blocked product filter: exclude posts whose produce_name is blocked globally
    AND NOT EXISTS (
      SELECT 1 FROM blocked_products bp
      JOIN want_to_sell_details wts ON wts.post_id = p.id
      WHERE LOWER(bp.product_name) = LOWER(wts.produce_name)
        AND (bp.country_iso_3 IS NULL AND bp.state_id IS NULL AND bp.county_id IS NULL AND bp.city_id IS NULL)
    )
  ORDER BY p.created_at DESC;
$$;

CREATE FUNCTION public.get_helper_queue() RETURNS TABLE(order_id uuid, product_name text, quantity integer, status public.market_order_status, fulfillment_type text, buyer_name text, booth_name text, booth_id uuid, seller_name text, total_usd numeric, created_at timestamp with time zone, delivered_by_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    o.id AS order_id,
    o.product_name,
    o.quantity,
    o.status,
    o.fulfillment_type,
    COALESCE(bp.full_name, 'Buyer') AS buyer_name,
    COALESCE(mb.name, 'Booth') AS booth_name,
    o.booth_id,
    COALESCE(sp.full_name, 'Seller') AS seller_name,
    o.total_usd,
    o.created_at,
    dp.full_name AS delivered_by_name
  FROM market_orders o
  JOIN booth_helpers bh ON bh.booth_id = o.booth_id
    AND bh.helper_id = v_uid
    AND bh.status = 'accepted'
  JOIN market_booths mb ON mb.id = o.booth_id
  LEFT JOIN profiles bp ON bp.id = o.buyer_id
  LEFT JOIN profiles sp ON sp.id = o.seller_id
  LEFT JOIN profiles dp ON dp.id = o.delivered_by
  WHERE o.status IN ('pending', 'confirmed', 'delivering', 'delivered')
  ORDER BY
    CASE o.status
      WHEN 'pending' THEN 1
      WHEN 'confirmed' THEN 2
      WHEN 'delivering' THEN 3
      WHEN 'delivered' THEN 4
    END,
    o.created_at DESC;
END;
$$;

CREATE FUNCTION public.get_market_config() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_schedule JSONB;
  v_settings RECORD;
BEGIN
  -- Load settings
  SELECT ms.products_never_expire, ms.market_never_closes
  INTO v_settings
  FROM market_settings ms
  WHERE ms.id = true;

  RETURN jsonb_build_object(
    'schedule', COALESCE(v_schedule, '[]'::jsonb),
    'productsNeverExpire', COALESCE(v_settings.products_never_expire, false),
    'marketNeverCloses', COALESCE(v_settings.market_never_closes, false)
  );
END;
$$;

CREATE FUNCTION public.get_payout_status() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile RECORD;
BEGIN
  SELECT payout_handle, payout_handle_type, payout_verified,
         payout_verification_sent_at, payout_verification_attempts,
         last_active_at
    INTO v_profile FROM profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'handle', v_profile.payout_handle,
    'handle_type', v_profile.payout_handle_type,
    'verified', COALESCE(v_profile.payout_verified, false),
    'verification_pending', v_profile.payout_verification_sent_at IS NOT NULL
                            AND NOT COALESCE(v_profile.payout_verified, false),
    'verification_sent_at', v_profile.payout_verification_sent_at,
    'attempts', COALESCE(v_profile.payout_verification_attempts, 0),
    'last_active_at', v_profile.last_active_at
  );
END;
$$;

CREATE FUNCTION public.get_pending_transactions() RETURNS TABLE(tx_id text, tx_type text, tx_date timestamp with time zone, description text, amount numeric, direction text, status text, counterparty text, metadata jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  RETURN QUERY

  UNION ALL

  ORDER BY tx_date DESC;
END;
$$;

CREATE FUNCTION public.get_platform_fee_for_user(p_user_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_country_code varchar(3);
  v_fee_rate numeric;
BEGIN
  -- Get user's country code (default to 'USA' if null to gracefully fallback)
  SELECT COALESCE(country_code, 'USA') INTO v_country_code
  FROM profiles
  WHERE id = p_user_id;
  
  -- Attempt to lookup the latest fee for this country
  SELECT fees INTO v_fee_rate
  FROM platform_fees
  WHERE country_code = v_country_code
  ORDER BY creation_date DESC
  LIMIT 1;
  
  -- Fallback to global 10% defaults if strictly no country match
  IF v_fee_rate IS NULL THEN
    v_fee_rate := 0.10;
  END IF;
  
  RETURN v_fee_rate;
END;
$$;

CREATE FUNCTION public.get_popular_produce_for_zip(p_zip text) RETURNS TABLE(produce_name text, category text, emoji text, season text, rank integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_prefix TEXT;
  v_zone   TEXT;
BEGIN
  -- Extract 3-digit prefix
  v_prefix := LEFT(COALESCE(p_zip, ''), 3);

  RETURN QUERY
    SELECT z.produce_name, z.category, z.emoji, z.season, z.rank
    FROM usda_zone_produce z
    WHERE z.zone_group = v_zone
    ORDER BY z.category, z.rank;
END;
$$;

CREATE FUNCTION public.get_transaction_log(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(tx_id text, tx_type text, tx_date timestamp with time zone, description text, amount numeric, direction text, status text, counterparty text, metadata jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_start TIMESTAMPTZ := COALESCE(p_start_date::TIMESTAMPTZ, '2000-01-01'::TIMESTAMPTZ);
  v_end TIMESTAMPTZ := COALESCE((p_end_date + 1)::TIMESTAMPTZ, '2099-12-31'::TIMESTAMPTZ);
BEGIN
  RETURN QUERY

  UNION ALL

  UNION ALL

  UNION ALL

  UNION ALL

  UNION ALL

  UNION ALL

  UNION ALL

  UNION ALL

  UNION ALL

  UNION ALL

  ORDER BY tx_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

CREATE FUNCTION public.get_transaction_summary(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_start TIMESTAMPTZ := COALESCE(p_start_date::TIMESTAMPTZ, '2000-01-01'::TIMESTAMPTZ);
  v_end TIMESTAMPTZ := COALESCE((p_end_date + 1)::TIMESTAMPTZ, '2099-12-31'::TIMESTAMPTZ);
  v_sales NUMERIC(10,2) := 0;
  v_sales_count INTEGER := 0;
  v_purchases NUMERIC(10,2) := 0;
  v_purchase_count INTEGER := 0;
  v_fees NUMERIC(10,2) := 0;
  v_redeemed NUMERIC(10,2) := 0;
  v_cc_charged NUMERIC(10,2) := 0;
  v_refunds_received NUMERIC(10,2) := 0;
  v_refunds_issued NUMERIC(10,2) := 0;
  v_balance RECORD;
BEGIN
  -- Sales
  SELECT COALESCE(SUM(subtotal_usd), 0), COUNT(*)
  INTO v_sales, v_sales_count
  FROM market_orders
  WHERE seller_id = v_uid
    AND status IN ('completed', 'delivered')
    AND created_at >= v_start AND created_at < v_end;

  RETURN jsonb_build_object(
    'total_sales', v_sales,
    'sales_count', v_sales_count,
    'total_purchases', v_purchases,
    'purchase_count', v_purchase_count,
    'total_fees', v_fees,
    'total_redeemed', v_redeemed,
    'total_cc_charged', v_cc_charged,
    'refunds_received', v_refunds_received,
    'refunds_issued', v_refunds_issued,
    'net_earnings', v_sales - v_fees - v_refunds_issued + v_refunds_received,
    -- Current balances (always live)
    'available_usd', COALESCE(v_balance.available_usd, 0),
    'pending_usd', COALESCE(v_balance.pending_usd, 0),
    'held_balance_usd', COALESCE(v_balance.held_balance_usd, 0),
    'total_earned_usd', COALESCE(v_balance.total_earned_usd, 0),
    'total_spent_usd', COALESCE(v_balance.total_spent_usd, 0),
    'total_withdrawn_usd', COALESCE(v_balance.total_withdrawn_usd, 0)
  );
END;
$$;

CREATE FUNCTION public.get_user_balances(p_user_id uuid) RETURNS TABLE(total_balance integer, purchased_balance integer, earned_balance integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_total integer;
  v_purchased integer;
BEGIN
  -- Get total balance
  SELECT coalesce(sum(amount), 0) INTO v_total
  FROM point_ledger
  WHERE user_id = p_user_id;

  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.get_user_email(p_user_id uuid) RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT email FROM auth.users WHERE id = p_user_id;
$$;

CREATE FUNCTION public.get_user_jurisdiction(p_user_id uuid) RETURNS TABLE(country_iso_3 text, state_id uuid, county_id uuid, city_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_country_iso_3 TEXT;
  v_state_id UUID;
  v_county_id UUID;
  v_city_id UUID;
  v_zip_code TEXT;
BEGIN
  -- 1. Get user's zip code and country from profiles
  SELECT profiles.zip_code, profiles.country_code
  INTO v_zip_code, v_country_iso_3
  FROM profiles
  WHERE id = p_user_id;

  IF v_zip_code IS NULL THEN
    RETURN; -- User doesn't have an address set
  END IF;

CREATE FUNCTION public.get_user_ledger_balance(p_user_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN COALESCE(
    (SELECT balance_after FROM market_ledger WHERE user_id = p_user_id ORDER BY id DESC LIMIT 1),
    0
  );
END;
$$;

CREATE FUNCTION public.get_zips_without_communities(batch_size integer) RETURNS TABLE(zip_code text, country_iso_3 text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  return query
  select z.zip_code, z.country_iso_3
  from zip_codes z
  where z.country_iso_3 = 'USA'
    and (z.last_scraped_at is null or z.last_scraped_at < now() - interval '90 days')
  order by z.last_scraped_at nulls first, z.zip_code
  limit batch_size;
end;
$$;

CREATE FUNCTION public.handle_delegation_revocation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_active_posts_count integer;
  v_delegator_name text;
  v_delegate_name text;
BEGIN
  -- Only act if status changed to 'revoked'
  IF NEW.status = 'revoked' AND OLD.status != 'revoked' THEN
    
    -- Check if delegate has any active posts on behalf of this delegator
    SELECT count(*)
    INTO v_active_posts_count
    FROM posts
    WHERE author_id = NEW.delegatee_id
      AND on_behalf_of = NEW.delegator_id
      AND status = 'active';

    IF v_active_posts_count > 0 THEN
      -- Get names for notifications
      SELECT full_name INTO v_delegator_name FROM profiles WHERE id = NEW.delegator_id;
      SELECT full_name INTO v_delegate_name FROM profiles WHERE id = NEW.delegatee_id;

  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  signup_reward_points INTEGER;
  v_provider TEXT;
  v_email_verified BOOLEAN;
BEGIN
  -- Determine auth provider and email verification status
  v_provider := new.raw_app_meta_data->>'provider';
  -- OTP (email) logins prove email ownership; social logins need verification
  v_email_verified := CASE
    WHEN v_provider = 'email' THEN true
    ELSE false
  END;

  RETURN new;
END;
$$;

CREATE FUNCTION public.helper_mark_delivered(p_order_id uuid, p_proof_urls text[] DEFAULT '{}'::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order RECORD;
  v_helper_name TEXT;
  v_booth_name TEXT;
BEGIN
  -- Get order + validate helper access
  SELECT o.*, mb.name AS booth_name, mb.owner_id
  INTO v_order
  FROM market_orders o
  JOIN market_booths mb ON mb.id = o.booth_id
  WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE FUNCTION public.initiate_payout_verification(p_handle text, p_handle_type text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_amount NUMERIC(4,2);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_handle_type NOT IN ('venmo', 'paypal') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid handle type');
  END IF;

  UPDATE profiles SET
    payout_handle = p_handle,
    payout_handle_type = p_handle_type,
    payout_verified = FALSE,
    payout_verification_amount = v_amount,
    payout_verification_sent_at = now(),
    payout_verification_attempts = 0
  WHERE id = v_uid;

CREATE FUNCTION public.is_booth_helper(p_booth_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM booth_helpers
    WHERE booth_id = p_booth_id
      AND helper_id = auth.uid()
      AND status = 'accepted'
  );
END;
$$;

CREATE FUNCTION public.is_staff(uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_members
    WHERE email = (SELECT email FROM auth.users WHERE id = uid)
  );
$$;

CREATE FUNCTION public.is_staff_email(check_email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (SELECT 1 FROM staff_members WHERE email = check_email);
$$;

CREATE FUNCTION public.join_booth_as_helper(p_passcode text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_booth_id UUID;
  v_helper_id UUID;
BEGIN
  v_helper_id := auth.uid();
  IF v_helper_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_booth_id IS NULL THEN
    RAISE EXCEPTION 'Invalid passcode';
  END IF;

  RETURN v_booth_id;
END;
$$;

CREATE FUNCTION public.log_feedback_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO feedback_status_history (feedback_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.make_refund_offer_with_message(p_order_id uuid, p_seller_id uuid, p_amount integer, p_message text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order record;
  v_esc_id uuid;
  v_offer_id uuid;
  v_total integer;
  v_msg text;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.seller_id != p_seller_id then
    return jsonb_build_object('error', 'Only the seller can make a refund offer');
  end if;

  if v_order.status not in ('disputed', 'escalated') then
    return jsonb_build_object(
      'error', 'Order must be in disputed or escalated status',
      'currentStatus', v_order.status
    );
  end if;

  v_total := v_order.quantity * v_order.points_per_unit;

  if v_esc_id is null then
    return jsonb_build_object('error', 'No escalation found for this order');
  end if;

  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    p_seller_id,
    v_msg,
    'text'
  );

  return jsonb_build_object('success', true, 'offer_id', v_offer_id);
end;
$$;

CREATE FUNCTION public.mark_order_delivered(p_order_id uuid, p_seller_id uuid, p_proof_media_id uuid, p_harvest_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order record;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.seller_id != p_seller_id then
    return jsonb_build_object('error', 'Only the seller can mark as delivered');
  end if;

  if v_order.status != 'accepted' then
    return jsonb_build_object(
      'error', 'Order must be in accepted status to mark as delivered',
      'currentStatus', v_order.status
    );
  end if;

  return jsonb_build_object('success', true);
end;
$$;

CREATE FUNCTION public.modify_offer_with_message(p_offer_id uuid, p_seller_id uuid, p_quantity integer DEFAULT NULL::integer, p_points_per_unit integer DEFAULT NULL::integer, p_delivery_date date DEFAULT NULL::date, p_message text DEFAULT NULL::text, p_media jsonb DEFAULT NULL::jsonb, p_delivery_dates date[] DEFAULT NULL::date[], p_community_h3_index text DEFAULT NULL::text, p_additional_community_h3_indices text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

  return jsonb_build_object(
    'success', true,
    'newVersion', v_offer.version + 1
  );
end;
$$;

CREATE FUNCTION public.modify_order(p_order_id uuid, p_buyer_id uuid, p_quantity integer DEFAULT NULL::integer, p_delivery_date date DEFAULT NULL::date, p_points_per_unit integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order record;
  v_new_quantity integer;
  v_new_ppu integer;
  v_new_date date;
  v_old_total integer;
  v_new_total integer;
  v_diff integer;
  v_current_balance integer;
begin
  -- Lock and fetch
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  v_old_total := v_order.quantity * v_order.points_per_unit;
  v_new_total := v_new_quantity * v_new_ppu;
  v_diff := v_new_total - v_old_total;

    if v_current_balance < v_diff then
      return jsonb_build_object(
        'error', 'Insufficient points for modification',
        'currentBalance', v_current_balance,
        'additionalRequired', v_diff
      );
    end if;

  return jsonb_build_object(
    'success', true,
    'newVersion', v_order.version + 1,
    'newTotal', v_new_total
  );
end;
$$;

CREATE FUNCTION public.modify_order(p_order_id uuid, p_buyer_id uuid, p_quantity integer DEFAULT NULL::integer, p_points_per_unit integer DEFAULT NULL::integer, p_delivery_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_order record;
  v_new_quantity integer;
  v_new_ppu integer;
  v_new_date date;
  v_old_total integer;
  v_new_total integer;
  v_diff integer;
  v_current_balance integer;
  v_unit text;
begin
  -- Fetch order
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.buyer_id != p_buyer_id then
    return jsonb_build_object('error', 'Only the buyer can modify this order');
  end if;

  if v_order.status != 'pending' then
    return jsonb_build_object(
      'error', 'Order was already ' || v_order.status || '. Modification not possible.',
      'currentStatus', v_order.status
    );
  end if;

  v_new_quantity := coalesce(p_quantity, v_order.quantity);
  v_new_ppu := coalesce(p_points_per_unit, v_order.points_per_unit);
  v_new_date := coalesce(p_delivery_date, v_order.delivery_date);

  v_old_total := v_order.quantity * v_order.points_per_unit;
  v_new_total := v_new_quantity * v_new_ppu;
  v_diff := v_new_total - v_old_total;

    if v_current_balance < v_diff then
      return jsonb_build_object(
        'error', 'Insufficient points for modification',
        'currentBalance', v_current_balance,
        'required', v_diff
      );
    end if;

    insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    values (
      p_buyer_id, 'escrow', -v_diff, 0,
      v_order.id,
      jsonb_build_object('order_id', v_order.id, 'reason', 'Order modification — additional escrow')
    );
  elsif v_diff < 0 then
    insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    values (
      p_buyer_id, 'refund', -v_diff, 0,
      v_order.id,
      jsonb_build_object('order_id', v_order.id, 'reason', 'Order modification — partial refund')
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'newVersion', v_order.version + 1,
    'newTotal', v_new_total
  );
end;
$$;

CREATE FUNCTION public.modify_order(p_order_id uuid, p_buyer_id uuid, p_quantity integer DEFAULT NULL::integer, p_delivery_date date DEFAULT NULL::date, p_points_per_unit integer DEFAULT NULL::integer, p_delivery_address text DEFAULT NULL::text, p_delivery_instructions text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order record;
  v_new_quantity integer;
  v_new_ppu integer;
  v_new_date date;
  v_old_total integer;
  v_new_total integer;
  v_diff integer;
  v_current_balance integer;
  v_unit text;
  v_new_delivery_instructions text;
begin
  -- Lock and fetch
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  v_old_total := v_order.quantity * v_order.points_per_unit;
  v_new_total := v_new_quantity * v_new_ppu;
  v_diff := v_new_total - v_old_total;

    if v_current_balance < v_diff then
      return jsonb_build_object(
        'error', 'Insufficient points for modification',
        'currentBalance', v_current_balance,
        'additionalRequired', v_diff
      );
    end if;

  return jsonb_build_object(
    'success', true,
    'newVersion', v_order.version + 1,
    'newTotal', v_new_total
  );
end;
$$;

CREATE FUNCTION public.nearby_booths(user_lat double precision, user_lng double precision, max_miles double precision DEFAULT 25, fulfillment_filter text DEFAULT 'all'::text, product_search text DEFAULT NULL::text) RETURNS TABLE(booth_id uuid, owner_id uuid, booth_name text, description text, decorative_theme text, header_image_url text, offers_delivery boolean, offers_pickup boolean, delivery_radius_miles integer, pickup_address text, delivery_windows jsonb, pickup_windows jsonb, distance_miles double precision, product_count bigint, matched_products jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  user_point geometry;
BEGIN
  user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326);

  RETURN QUERY
  WITH booth_distances AS (
    SELECT
      b.id,
      b.owner_id,
      b.name,
      b.description,
      b.decorative_theme,
      b.header_image_url,
      b.offers_delivery,
      b.offers_pickup,
      b.delivery_radius_miles,
      b.pickup_address,
      b.delivery_windows,
      b.pickup_windows,
      ST_Distance(b.pickup_location::geography, user_point::geography) / 1609.34 AS dist_miles
    FROM market_booths b
    WHERE b.pickup_location IS NOT NULL
      AND ST_DWithin(b.pickup_location::geography, user_point::geography, max_miles * 1609.34)
  ),
  filtered AS (
    SELECT bd.*
    FROM booth_distances bd
    WHERE
      CASE fulfillment_filter
        WHEN 'delivery' THEN bd.offers_delivery AND bd.dist_miles <= bd.delivery_radius_miles
        WHEN 'pickup'   THEN bd.offers_pickup
        ELSE (bd.offers_delivery OR bd.offers_pickup)
      END
  ),
  -- Products CTE: filter by search term when provided
  products AS (
    SELECT
      mp.seller_id,
      COUNT(*) FILTER (WHERE mp.is_active)::BIGINT AS total_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mp.id,
            'name', mp.name,
            'description', mp.description,
            'price_usd', mp.price_usd,
            'unit', mp.unit,
            'photo', mp.photos[1],
            'inventory', mp.inventory,
            'category', mp.category,
            'harvested_at', mp.harvested_at
          ) ORDER BY mp.created_at
        ) FILTER (WHERE mp.is_active AND (
          product_search IS NULL
          OR mp.name ILIKE '%' || product_search || '%'
        )),
        '[]'::jsonb
      ) AS prods
    FROM market_products mp
    GROUP BY mp.seller_id
  )
  SELECT
    f.id AS booth_id,
    f.owner_id,
    f.name AS booth_name,
    f.description,
    f.decorative_theme,
    f.header_image_url,
    f.offers_delivery,
    f.offers_pickup,
    f.delivery_radius_miles,
    f.pickup_address,
    f.delivery_windows,
    f.pickup_windows,
    ROUND(f.dist_miles::numeric, 1)::DOUBLE PRECISION AS distance_miles,
    COALESCE(p.total_count, 0) AS product_count,
    COALESCE(p.prods, '[]'::jsonb) AS matched_products
  FROM filtered f
  LEFT JOIN products p ON p.seller_id = f.owner_id
  WHERE
    product_search IS NULL
    OR jsonb_array_length(COALESCE(p.prods, '[]'::jsonb)) > 0
  ORDER BY f.dist_miles;
END;
$$;

CREATE FUNCTION public.nearby_booths(user_lat double precision, user_lng double precision, max_miles double precision DEFAULT 25, fulfillment_filter text DEFAULT 'all'::text, product_search text DEFAULT NULL::text, min_price numeric DEFAULT NULL::numeric, max_price numeric DEFAULT NULL::numeric) RETURNS TABLE(booth_id uuid, owner_id uuid, booth_name text, description text, decorative_theme text, header_image_url text, offers_delivery boolean, offers_pickup boolean, delivery_radius_miles integer, pickup_address text, delivery_windows jsonb, pickup_windows jsonb, distance_miles double precision, product_count bigint, matched_products jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  user_point geometry;
BEGIN
  user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326);

  RETURN QUERY
  WITH booth_distances AS (
    SELECT
      b.id, b.owner_id, b.name, b.description, b.decorative_theme, b.header_image_url,
      b.offers_delivery, b.offers_pickup, b.delivery_radius_miles, b.pickup_address,
      b.delivery_windows, b.pickup_windows,
      ST_Distance(b.pickup_location::geography, user_point::geography) / 1609.34 AS dist_miles
    FROM market_booths b
    WHERE b.pickup_location IS NOT NULL
      AND ST_DWithin(b.pickup_location::geography, user_point::geography, max_miles * 1609.34)
  ),
  filtered AS (
    SELECT bd.*
    FROM booth_distances bd
    WHERE CASE fulfillment_filter
      WHEN 'delivery' THEN bd.offers_delivery AND bd.dist_miles <= bd.delivery_radius_miles
      WHEN 'pickup'   THEN bd.offers_pickup
      ELSE (bd.offers_delivery OR bd.offers_pickup)
    END
  ),
  products AS (
    SELECT
      mp.seller_id,
      COUNT(*) FILTER (WHERE mp.is_active)::BIGINT AS total_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mp.id, 'name', mp.name, 'description', mp.description,
            'price_usd', mp.price_usd, 'unit', mp.unit,
            'photo', mp.photos[1], 'inventory', mp.inventory,
            'category', mp.category, 'harvested_at', mp.harvested_at
          ) ORDER BY mp.created_at
        ) FILTER (WHERE mp.is_active AND (
          product_search IS NULL OR mp.name ILIKE '%' || product_search || '%'
        ) AND (
          min_price IS NULL OR mp.price_usd >= min_price
        ) AND (
          max_price IS NULL OR mp.price_usd <= max_price
        )),
        '[]'::jsonb
      ) AS prods
    FROM market_products mp
    GROUP BY mp.seller_id
  )
  SELECT
    f.id, f.owner_id, f.name, f.description, f.decorative_theme, f.header_image_url,
    f.offers_delivery, f.offers_pickup, f.delivery_radius_miles, f.pickup_address,
    f.delivery_windows, f.pickup_windows,
    ROUND(f.dist_miles::numeric, 1)::DOUBLE PRECISION AS distance_miles,
    COALESCE(p.total_count, 0) AS product_count,
    COALESCE(p.prods, '[]'::jsonb) AS matched_products
  FROM filtered f
  LEFT JOIN products p ON p.seller_id = f.owner_id
  WHERE product_search IS NULL OR jsonb_array_length(COALESCE(p.prods, '[]'::jsonb)) > 0
  ORDER BY f.dist_miles;
END;
$$;

CREATE FUNCTION public.nearby_booths(user_lat double precision, user_lng double precision, max_miles double precision DEFAULT 25, fulfillment_filter text DEFAULT 'all'::text, product_search text DEFAULT NULL::text, min_price numeric DEFAULT NULL::numeric, max_price numeric DEFAULT NULL::numeric, category_filter text DEFAULT NULL::text) RETURNS TABLE(booth_id uuid, owner_id uuid, booth_name text, description text, decorative_theme text, header_image_url text, offers_delivery boolean, offers_pickup boolean, delivery_radius_miles integer, pickup_address text, delivery_windows jsonb, pickup_windows jsonb, distance_miles double precision, product_count bigint, matched_products jsonb, seller_avatar_url text, seller_avg_rating numeric, seller_rating_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  user_point geometry;
  v_never_expire BOOLEAN;
BEGIN
  user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326);

  RETURN QUERY
  WITH booth_distances AS (
    SELECT b.id, b.owner_id, b.name, b.description, b.decorative_theme, b.header_image_url,
      b.offers_delivery, b.offers_pickup, b.delivery_radius_miles, b.pickup_address,
      b.delivery_windows, b.pickup_windows,
      ST_Distance(b.pickup_location::geography, user_point::geography) / 1609.34 AS dist_miles
    FROM market_booths b
    JOIN profiles pr_check ON pr_check.id = b.owner_id AND NOT pr_check.is_banned
    WHERE b.pickup_location IS NOT NULL
      AND ST_DWithin(b.pickup_location::geography, user_point::geography, max_miles * 1609.34)
  ),
  filtered AS (
    SELECT bd.* FROM booth_distances bd
    WHERE CASE fulfillment_filter
      WHEN 'delivery' THEN bd.offers_delivery AND bd.dist_miles <= bd.delivery_radius_miles
      WHEN 'pickup'   THEN bd.offers_pickup
      ELSE (bd.offers_delivery OR bd.offers_pickup)
    END
  ),
  products AS (
    SELECT mp.seller_id,
      COUNT(*) FILTER (WHERE mp.is_active AND (v_never_expire OR mp.market_date >= CURRENT_DATE))::BIGINT AS total_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mp.id, 'name', mp.name, 'description', mp.description,
            'price_usd', mp.price_usd, 'unit', mp.unit,
            'photo', mp.photos[1], 'inventory', mp.inventory,
            'category', mp.category, 'harvested_at', mp.harvested_at
          ) ORDER BY mp.created_at
        ) FILTER (WHERE mp.is_active
          AND (v_never_expire OR mp.market_date >= CURRENT_DATE)
          AND (product_search IS NULL OR mp.name ILIKE '%' || product_search || '%')
          AND (min_price IS NULL OR mp.price_usd >= min_price)
          AND (max_price IS NULL OR mp.price_usd <= max_price)
          AND (category_filter IS NULL OR mp.category = category_filter)
        ), '[]'::jsonb
      ) AS prods
    FROM market_products mp GROUP BY mp.seller_id
  )
  SELECT f.id, f.owner_id, f.name, f.description, f.decorative_theme, f.header_image_url,
    f.offers_delivery, f.offers_pickup, f.delivery_radius_miles, f.pickup_address,
    f.delivery_windows, f.pickup_windows,
    ROUND(f.dist_miles::numeric, 1)::DOUBLE PRECISION AS distance_miles,
    COALESCE(p.total_count, 0) AS product_count,
    COALESCE(p.prods, '[]'::jsonb) AS matched_products,
    pr.avatar_url AS seller_avatar_url,
    pr.seller_avg_rating,
    pr.seller_rating_count
  FROM filtered f
  LEFT JOIN products p ON p.seller_id = f.owner_id
  LEFT JOIN profiles pr ON pr.id = f.owner_id
  WHERE (product_search IS NULL AND category_filter IS NULL AND min_price IS NULL AND max_price IS NULL)
    OR jsonb_array_length(COALESCE(p.prods, '[]'::jsonb)) > 0
  ORDER BY f.dist_miles;
END;
$$;

CREATE FUNCTION public.notify_delegator_on_order() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_on_behalf_of UUID;
BEGIN
    -- Check if the order's post was made on behalf of someone
    SELECT p.on_behalf_of INTO v_on_behalf_of
    FROM conversations c
    JOIN posts p ON p.id = c.post_id
    WHERE c.id = NEW.conversation_id;

    IF v_on_behalf_of IS NOT NULL THEN
        -- Fire-and-forget HTTP call to the send-push-notification edge function
        PERFORM net.http_post(
            url := 'http://host.docker.internal:54321/functions/v1/send-push-notification',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
            ),
            body := jsonb_build_object(
                'userIds', jsonb_build_array(v_on_behalf_of),
                'title', 'Delegated Sale Complete',
                'body', 'An order for your delegated post ' || COALESCE(NEW.product, 'an item') || ' has just been completed.',
                'url', '/transaction-history',
                'tag', 'delegated-order-' || NEW.id
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE FUNCTION public.notify_delegator_on_post() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.on_behalf_of IS NOT NULL THEN
        -- Fire-and-forget HTTP call to the send-push-notification edge function
        PERFORM net.http_post(
            url := 'http://host.docker.internal:54321/functions/v1/send-push-notification',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
            ),
            body := jsonb_build_object(
                'userIds', jsonb_build_array(NEW.on_behalf_of),
                'title', 'New Delegated Post',
                'body', 'Your delegate just published a new post for ' || COALESCE(NEW.title, 'an item') || ' on your behalf.',
                'url', '/post/' || NEW.id,
                'tag', 'new-delegated-post-' || NEW.id
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE FUNCTION public.notify_followers_new_product() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_booth market_booths%ROWTYPE;
  r RECORD;
BEGIN
  -- Get the booth for this seller
  SELECT * INTO v_booth
  FROM market_booths
  WHERE owner_id = NEW.seller_id
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.notify_market_event(p_user_id uuid, p_content text, p_link_url text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- In-app notification (market-specific table)
  INSERT INTO market_notifications (user_id, content, link_url)
  VALUES (p_user_id, p_content, p_link_url);

CREATE FUNCTION public.notify_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    service_role_key text;
BEGIN
    service_role_key := COALESCE(
        current_setting('app.settings.service_role_key', true),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
    );

    RETURN NEW;
END;
$$;

CREATE FUNCTION public.notify_on_delegation_revoked() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    service_role_key text;
    push_title text;
    push_body text;
    push_payload jsonb;
    request_id bigint;
BEGIN
    service_role_key := COALESCE(
        current_setting('app.settings.service_role_key', true),
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
    );
    
    -- Only trigger when the status transitions to 'revoked'
    IF NEW.status = 'revoked' AND OLD.status != 'revoked' THEN
        
        IF OLD.status = 'pending_pairing' THEN
            push_title := 'Delegation Rejected';
            push_body := 'The delegation request was rejected or cancelled.';
        ELSE
            push_title := 'Delegation Revoked';
            push_body := 'An active delegation relationship has been revoked.';
        END IF;

        push_payload := jsonb_build_object(
            'userIds', (
                SELECT jsonb_agg(id) 
                FROM (
                    SELECT NEW.delegator_id AS id
                    UNION 
                    SELECT NEW.delegatee_id AS id WHERE NEW.delegatee_id IS NOT NULL
                ) AS users
            ),
            'title', push_title,
            'body', push_body,
            'url', '/delegate'
        );

CREATE FUNCTION public.notify_user_on_redemption() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Fire-and-forget HTTP call to the send-push-notification edge function
    PERFORM net.http_post(
        url := 'http://host.docker.internal:54321/functions/v1/send-push-notification',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
        ),
        body := jsonb_build_object(
            'userIds', jsonb_build_array(NEW.user_id),
            'title', 'Redemption Complete!',
            'body', 'Your redemption for ' || COALESCE(NEW.metadata->>'brand_name', NEW.metadata->>'organization', 'a gift card') || ' has been successfully processed.',
            'url', '/transaction-history',
            'tag', 'redemption-' || NEW.id
        )
    );

    RETURN NEW;
END;
$$;

CREATE FUNCTION public.place_market_order(p_product_id uuid, p_quantity integer, p_fulfillment_type text, p_buyer_zip text DEFAULT NULL::text, p_expected_price numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_product RECORD;
  v_booth RECORD;
  v_buyer_id UUID;
  v_buyer_address TEXT;
  v_tax_rate NUMERIC(7,4) := 0;
  v_subtotal NUMERIC(10,2);
  v_tax_amount NUMERIC(10,2);
  v_fee_rate NUMERIC(5,2);
  v_fee_amount NUMERIC(10,2);
  v_total NUMERIC(10,2);
  v_order_id UUID;
  v_tax_rule RECORD;
  v_cached_rate RECORD;
  v_state_code TEXT;
  v_min_qty INTEGER;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  IF v_product IS NULL THEN
    RETURN jsonb_build_object('error', 'Product not found or inactive');
  END IF;

  IF v_product.inventory < p_quantity THEN
    RETURN jsonb_build_object('error', 'Insufficient inventory',
      'available', v_product.inventory, 'requested', p_quantity);
  END IF;

  IF v_state_code IS NOT NULL AND v_product.category IS NOT NULL THEN
    -- Check category tax rule
    SELECT * INTO v_tax_rule
    FROM category_tax_rules
    WHERE state_code = v_state_code
      AND category_name = v_product.category
      AND effective_until IS NULL
    LIMIT 1;

    IF v_tax_rule IS NOT NULL THEN
      IF v_tax_rule.rule_type = 'fixed' THEN
        v_tax_rate := COALESCE(v_tax_rule.rate_pct, 0);
      ELSE
        -- 'evaluate' type: check zip_tax_cache
        SELECT * INTO v_cached_rate
        FROM zip_tax_cache
        WHERE zip_code = p_buyer_zip
          AND expires_at > now();

        IF v_cached_rate IS NOT NULL THEN
          v_tax_rate := v_cached_rate.combined_rate;
        ELSE
          v_tax_rate := 0; -- Fallback if no cached rate
        END IF;
      END IF;
    END IF;
  END IF;

  v_fee_amount := ROUND(v_subtotal * v_fee_rate / 100, 2);
  -- total_usd is what the BUYER pays: subtotal + tax (platform fee is deducted from seller payout)
  v_total := v_subtotal + v_tax_amount;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'subtotal_usd', v_subtotal,
    'tax_rate_pct', v_tax_rate,
    'tax_amount_usd', v_tax_amount,
    'platform_fee_pct', v_fee_rate,
    'platform_fee_usd', v_fee_amount,
    'total_usd', v_total,
    'total_cents', (v_total * 100)::INTEGER,
    'product_name', v_product.name,
    'remaining_inventory', v_product.inventory - p_quantity
  );
END;
$_$;

CREATE FUNCTION public.rate_market_order(p_order_id uuid, p_rating smallint, p_review text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order RECORD;
  v_caller UUID := auth.uid();
  v_role TEXT;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('completed', 'delivered') THEN
    RETURN jsonb_build_object('error', 'Order must be completed to rate');
  END IF;

  ELSIF v_caller = v_order.seller_id THEN
    v_role := 'seller';
    -- Seller rates the buyer
    IF v_order.buyer_rating IS NOT NULL THEN
      RETURN jsonb_build_object('error', 'You have already rated this order');
    END IF;
    UPDATE market_orders SET
      buyer_rating = p_rating,
      buyer_review = p_review,
      updated_at = now()
    WHERE id = p_order_id;

  ELSE
    RETURN jsonb_build_object('error', 'You are not part of this order');
  END IF;

  RETURN jsonb_build_object('success', true, 'role', v_role, 'rating', p_rating);
END;
$$;

CREATE FUNCTION public.recompute_market_seller_rating() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_old_avg NUMERIC;
  v_old_count INTEGER;
  v_new_rating NUMERIC;
BEGIN
  SELECT COALESCE(seller_avg_rating, 0), seller_rating_count
  INTO v_old_avg, v_old_count
  FROM profiles WHERE id = NEW.seller_id;

  v_new_rating := NEW.seller_rating;

  IF TG_OP = 'UPDATE' AND OLD.seller_rating IS NOT NULL THEN
    DECLARE v_old_rating NUMERIC;
    BEGIN
      v_old_rating := OLD.seller_rating;
      UPDATE profiles SET
        seller_avg_rating = ROUND((v_old_avg * v_old_count - v_old_rating + v_new_rating) / v_old_count, 1)
      WHERE id = NEW.seller_id;
    END;
  ELSE
    UPDATE profiles SET
      seller_avg_rating = ROUND((v_old_avg * v_old_count + v_new_rating) / (v_old_count + 1), 1),
      seller_rating_count = v_old_count + 1
    WHERE id = NEW.seller_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.recompute_seller_rating() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_old_avg NUMERIC;
  v_old_count INTEGER;
  v_new_rating NUMERIC;
BEGIN
  SELECT COALESCE(seller_avg_rating, 0), seller_rating_count
  INTO v_old_avg, v_old_count
  FROM profiles WHERE id = NEW.seller_id;

  v_new_rating := NEW.seller_rating::text::numeric;

  IF TG_OP = 'UPDATE' AND OLD.seller_rating IS NOT NULL THEN
    -- Rating changed: subtract old, add new
    DECLARE v_old_rating NUMERIC;
    BEGIN
      v_old_rating := OLD.seller_rating::text::numeric;
      UPDATE profiles SET
        seller_avg_rating = ROUND((v_old_avg * v_old_count - v_old_rating + v_new_rating) / v_old_count, 1)
      WHERE id = NEW.seller_id;
    END;
  ELSE
    -- New rating: increment count and compute new average
    UPDATE profiles SET
      seller_avg_rating = ROUND((v_old_avg * v_old_count + v_new_rating) / (v_old_count + 1), 1),
      seller_rating_count = v_old_count + 1
    WHERE id = NEW.seller_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.refresh_product_data(product_ids uuid[]) RETURNS TABLE(id uuid, price_usd numeric, inventory integer, is_active boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_never_expire BOOLEAN;
BEGIN
  SELECT COALESCE(ms.products_never_expire, false) INTO v_never_expire
  FROM market_settings ms WHERE ms.id = true;

  RETURN QUERY
  SELECT mp.id, mp.price_usd, mp.inventory,
    (mp.is_active AND (v_never_expire OR mp.market_date >= CURRENT_DATE)) AS is_active
  FROM market_products mp
  WHERE mp.id = ANY(product_ids);
END;
$$;

CREATE FUNCTION public.refund_buyer_balance(p_buyer_id uuid, p_amount_cents integer, p_reason text DEFAULT 'order_cancelled'::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_amount_usd NUMERIC(10,2);
BEGIN
  v_amount_usd := p_amount_cents::NUMERIC / 100;

  RETURN true;
END;
$$;

CREATE FUNCTION public.reject_offer_with_message(p_offer_id uuid, p_buyer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

CREATE FUNCTION public.reject_order_versioned(p_order_id uuid, p_expected_version integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order record;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.status != 'pending' then
    return jsonb_build_object(
      'error', 'Order is no longer pending',
      'currentStatus', v_order.status
    );
  end if;

  if v_order.version != p_expected_version then
    insert into chat_messages (conversation_id, sender_id, content, type)
    values (
      v_order.conversation_id,
      null,
      'Order was modified by the buyer. Please review the updated terms before rejecting.',
      'system'
    );

    return jsonb_build_object(
      'error', 'Order was modified by buyer',
      'code', 'VERSION_MISMATCH',
      'currentVersion', v_order.version
    );
  end if;

  update orders
  set status = 'cancelled', updated_at = now()
  where id = p_order_id;

  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.buyer_id,
    'refund',
    v_order.quantity * v_order.points_per_unit,
    0,
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'reason', 'Order rejected by seller'
    )
  );

  return jsonb_build_object('success', true);
end;
$$;

CREATE FUNCTION public.resolve_dispute_with_message(p_order_id uuid, p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

  INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
  VALUES (
    v_order.conversation_id,
    NULL,
    '💰 Payment received: ' || v_seller_payout || ' points credited to your account (' || v_total || ' total - ' || v_fee || ' platform fee).',
    'system',
    jsonb_build_object('visible_to', v_order.seller_id)
  );

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

CREATE FUNCTION public.run_market_settlement(p_market_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_settlement_id UUID;
  v_user RECORD;
  v_total_orders INTEGER := 0;
  v_total_captured NUMERIC(10,2) := 0;
  v_total_payouts NUMERIC(10,2) := 0;
  v_total_fees NUMERIC(10,2) := 0;
  v_total_refunds NUMERIC(10,2) := 0;
  v_user_count INTEGER := 0;
  v_check1_pass BOOLEAN;
  v_check2_pass BOOLEAN;
  v_reconciliation JSONB;
  v_clearing_date DATE;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('market_settlement')) THEN
    RETURN jsonb_build_object('error', 'Settlement already in progress');
  END IF;

  v_clearing_date := COALESCE(p_market_date, CURRENT_DATE);

  SELECT COUNT(*) INTO v_total_orders
  FROM market_orders
  WHERE settlement_id IS NULL
    AND status IN ('completed', 'delivered');

  IF v_total_orders = 0 THEN
    RETURN jsonb_build_object('error', 'No unsettled orders to process');
  END IF;

  INSERT INTO market_settlements (market_date, status)
  VALUES (v_clearing_date, 'captures_sent')
  RETURNING id INTO v_settlement_id;

  UPDATE market_orders
  SET settlement_id = v_settlement_id
  WHERE settlement_id IS NULL
    AND status IN ('completed', 'delivered');

  FOR v_user IN
    SELECT
      u.user_id,
      COALESCE(SUM(u.gross_sales), 0) AS gross_sales,
      COALESCE(SUM(u.total_purchases), 0) AS total_purchases,
      COALESCE(SUM(u.platform_fees), 0) AS platform_fees,
      COALESCE(SUM(u.refunds_issued), 0) AS refunds_issued,
      COALESCE(SUM(u.refunds_received), 0) AS refunds_received,
      COALESCE(SUM(u.balance_applied), 0) AS balance_applied
    FROM (
      -- Seller side
      SELECT seller_id AS user_id,
        SUM(total_usd) AS gross_sales,
        0::NUMERIC AS total_purchases,
        SUM(platform_fee_usd) AS platform_fees,
        0::NUMERIC AS refunds_issued,
        0::NUMERIC AS refunds_received,
        0::NUMERIC AS balance_applied
      FROM market_orders
      WHERE settlement_id = v_settlement_id
      GROUP BY seller_id

      UNION ALL

      UNION ALL

      UNION ALL

        PERFORM append_ledger_entry('balance_consumed', v_user.user_id, v_user.balance_applied, 'debit', NULL, v_settlement_id,
          jsonb_build_object('type', 'purchase_settlement', 'balance_applied', v_user.balance_applied));
      END IF;

      IF v_hold IS NOT NULL THEN
        v_hold_captured := LEAST(v_hold.hold_amount_cents::NUMERIC / 100, v_card_purchases);
        v_hold_released := (v_hold.hold_amount_cents::NUMERIC / 100) - v_hold_captured;

        UPDATE market_holds
        SET status = 'captured',
            spent_amount_cents = (v_hold_captured * 100)::INTEGER,
            updated_at = now()
        WHERE id = v_hold.id;

        INSERT INTO settlement_captures (
          settlement_id, hold_id, buyer_id, stripe_payment_intent_id,
          hold_amount_usd, capture_amount_usd, release_amount_usd, capture_status
        ) VALUES (
          v_settlement_id, v_hold.id, v_user.user_id, v_hold.stripe_payment_intent_id,
          v_hold.hold_amount_cents::NUMERIC / 100, v_hold_captured, v_hold_released, 'captured'
        );

        IF v_hold_captured > 0 THEN
          PERFORM append_ledger_entry('hold_captured', v_user.user_id, v_hold_captured, 'debit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id, 'stripe_pi', v_hold.stripe_payment_intent_id));
        END IF;

        IF v_hold_released > 0 THEN
          PERFORM append_ledger_entry('hold_released', v_user.user_id, v_hold_released, 'credit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id));
        END IF;
      END IF;

      v_total_captured := v_total_captured + v_hold_captured;
      v_total_payouts := v_total_payouts + GREATEST(v_net, 0);
      v_total_fees := v_total_fees + v_user.platform_fees;
      v_total_refunds := v_total_refunds + v_user.refunds_issued;
      v_user_count := v_user_count + 1;
    END;
  END LOOP;

  v_check2_pass := (v_total_payouts + v_total_fees) <= (v_total_captured + v_total_payouts + v_total_fees);

  v_reconciliation := jsonb_build_object(
    'check1_ledger_consistency', v_check1_pass,
    'check2_settlement_balance', v_check2_pass,
    'total_orders', v_total_orders,
    'total_users', v_user_count,
    'total_captured_usd', v_total_captured,
    'total_payouts_usd', v_total_payouts,
    'total_fees_usd', v_total_fees,
    'total_refunds_usd', v_total_refunds
  );

  DECLARE
    v_total_released NUMERIC(10,2) := 0;
  BEGIN
    SELECT COALESCE(SUM(release_amount_usd), 0) INTO v_total_released
    FROM settlement_captures WHERE settlement_id = v_settlement_id;

    v_reconciliation := v_reconciliation || jsonb_build_object(
      'total_released_usd', v_total_released,
      'capture_count', (SELECT COUNT(*) FROM settlement_captures WHERE settlement_id = v_settlement_id)
    );

    UPDATE market_settlements
    SET total_orders = v_total_orders,
        total_captured_usd = v_total_captured,
        total_released_usd = v_total_released,
        total_payouts_usd = v_total_payouts,
        total_fees_usd = v_total_fees,
        total_refunds_usd = v_total_refunds,
        reconciliation_check = v_reconciliation,
        status = CASE
          WHEN v_check1_pass AND v_check2_pass THEN 'funds_pending'::clearing_status
          ELSE 'reconciliation_failed'::clearing_status
        END,
        updated_at = now()
    WHERE id = v_settlement_id;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'users_settled', v_user_count,
    'orders_settled', v_total_orders,
    'reconciliation', v_reconciliation
  );
END;
$_$;

CREATE FUNCTION public.save_auto_redemption_config(p_enabled boolean, p_method text, p_threshold_usd numeric, p_cashout_payout_id text DEFAULT NULL::text, p_gift_card_brand text DEFAULT NULL::text, p_gift_card_amount_usd numeric DEFAULT NULL::numeric, p_charity_project_id text DEFAULT NULL::text, p_charity_project_name text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_uid UUID := auth.uid();
  v_verified BOOLEAN;
BEGIN
  IF p_enabled THEN
    -- Validate method-specific config
    IF p_method = 'cashout' THEN
      -- Must have verified payout handle
      SELECT payout_verified INTO v_verified FROM profiles WHERE id = v_uid;
      IF NOT COALESCE(v_verified, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout handle must be verified before enabling auto-withdrawal');
      END IF;
    END IF;
    IF p_method = 'giftcards' THEN
      IF p_gift_card_brand IS NULL OR p_gift_card_brand = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Gift card brand is required');
      END IF;
      IF COALESCE(p_threshold_usd, 0) < 1.00 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Minimum threshold for gift cards is $1.00');
      END IF;
    END IF;
    IF p_method = 'charity' AND (p_charity_project_id IS NULL OR p_charity_project_id = '') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Charity project is required');
    END IF;
  END IF;

  INSERT INTO user_auto_redemption_config (
    user_id, enabled, method, threshold_usd,
    cashout_payout_id, gift_card_brand, gift_card_amount_usd,
    charity_project_id, charity_project_name
  ) VALUES (
    v_uid, p_enabled, p_method, GREATEST(p_threshold_usd, 1.00),
    p_cashout_payout_id, p_gift_card_brand, p_gift_card_amount_usd,
    p_charity_project_id, p_charity_project_name
  )
  ON CONFLICT (user_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    method = EXCLUDED.method,
    threshold_usd = EXCLUDED.threshold_usd,
    cashout_payout_id = EXCLUDED.cashout_payout_id,
    gift_card_brand = EXCLUDED.gift_card_brand,
    gift_card_amount_usd = EXCLUDED.gift_card_amount_usd,
    charity_project_id = EXCLUDED.charity_project_id,
    charity_project_name = EXCLUDED.charity_project_name,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$_$;

CREATE FUNCTION public.seller_decline_order(p_order_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only decline pending orders'); END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE FUNCTION public.seller_mark_delivered(p_order_id uuid, p_proof jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status NOT IN ('pending', 'delivering') THEN RETURN jsonb_build_object('error', 'Invalid status for delivery'); END IF;
  IF v_order.fulfillment_type != 'delivery' THEN RETURN jsonb_build_object('error', 'Only delivery orders'); END IF;

  UPDATE market_orders
  SET status = 'delivered',
      delivery_proof = p_proof,
      delivered_at = now(),
      auto_complete_at = now() + interval '4 hours',
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id, 'Your order for "' || v_order.product_name || '" has been delivered! Please confirm receipt within 4 hours. 📦', '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true, 'auto_complete_at', (now() + interval '4 hours'));
END;
$$;

CREATE FUNCTION public.seller_mark_delivering(p_order_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only mark pending orders as delivering'); END IF;
  IF v_order.fulfillment_type != 'delivery' THEN RETURN jsonb_build_object('error', 'Only delivery orders'); END IF;

  UPDATE market_orders SET status = 'delivering', updated_at = now() WHERE id = p_order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id, 'Your order for "' || v_order.product_name || '" is on its way! 🚗', '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE FUNCTION public.seller_mark_ready_pickup(p_order_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order RECORD;
  v_buyer_code TEXT;
  v_seller_code TEXT;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only mark pending orders as ready'); END IF;
  IF v_order.fulfillment_type != 'pickup' THEN RETURN jsonb_build_object('error', 'Only pickup orders'); END IF;

  UPDATE market_orders
  SET status = 'ready_for_pickup',
      buyer_passcode = v_buyer_code,
      seller_passcode = v_seller_code,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id, 'Your order for "' || v_order.product_name || '" is ready for pickup! Check your order for the pickup passcode. 📍', '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true, 'seller_passcode', v_seller_code);
END;
$$;

CREATE FUNCTION public.seller_mark_ready_pickup(p_order_id uuid, p_proof jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only hand off pending orders'); END IF;
  IF v_order.fulfillment_type != 'pickup' THEN RETURN jsonb_build_object('error', 'Only pickup orders'); END IF;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id,
    'Your order for "' || v_order.product_name || '" has been handed off! Confirm pickup within 4 hours. 📍',
    '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true, 'auto_complete_at', (now() + interval '4 hours'));
END;
$$;

CREATE FUNCTION public.seller_respond_dispute(p_dispute_id uuid, p_refund_type text, p_refund_amount numeric, p_pickup_offered boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_dispute.status != 'open' THEN RETURN jsonb_build_object('error', 'Dispute already responded to'); END IF;

  UPDATE order_disputes
  SET status = 'seller_responded',
      refund_type = p_refund_type,
      refund_amount_usd = p_refund_amount,
      pickup_offered = p_pickup_offered,
      updated_at = now()
  WHERE id = p_dispute_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id, 'Seller has responded to your dispute for "' || v_order.product_name || '" with a ' || p_refund_type || ' refund offer.', '/orders/' || v_order.id);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE FUNCTION public.send_notification_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_email TEXT;
  v_full_name TEXT;
  v_supabase_url TEXT;
  v_service_key  TEXT;
BEGIN
  SELECT au.email, COALESCE(p.full_name, split_part(au.email, '@', 1))
  INTO v_email, v_full_name
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  WHERE au.id = NEW.user_id;

  IF v_email IS NULL THEN RETURN NEW; END IF;

  v_supabase_url := coalesce(
    current_setting('app.settings.supabase_url', true),
    'http://host.docker.internal:54321'
  );
  v_service_key := current_setting('app.settings.service_role_key', true);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Email send failed for notification %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.send_push_via_edge(p_user_ids uuid[], p_title text, p_body text, p_url text DEFAULT NULL::text, p_tag text DEFAULT 'casagrown-market'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids_json JSONB;
BEGIN
  v_supabase_url := coalesce(
    current_setting('app.settings.supabase_url', true),
    'http://host.docker.internal:54321'
  );
  v_service_key := current_setting('app.settings.service_role_key', true);

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, '')
    ),
    body := jsonb_build_object(
      'userIds', v_user_ids_json,
      'title', p_title,
      'body', p_body,
      'url', coalesce(p_url, '/notifications'),
      'tag', p_tag
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Push send failed: %', SQLERRM;
END;
$$;

CREATE FUNCTION public.set_feedback_resolved_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status IN ('completed', 'rejected') AND OLD.status NOT IN ('completed', 'rejected') THEN
    NEW.resolved_at = now();
  ELSIF NEW.status NOT IN ('completed', 'rejected') AND OLD.status IN ('completed', 'rejected') THEN
    -- If reopened, clear resolved_at
    NEW.resolved_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.set_post_expires_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_expiration_days integer;
BEGIN
  SELECT expiration_days INTO v_expiration_days
    FROM post_type_policies
   WHERE post_type = NEW.type;

  NEW.expires_at := NEW.created_at + (v_expiration_days || ' days')::interval;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.set_provider_disabled_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.is_active = false AND OLD.is_active = true THEN
    NEW.disabled_at = NOW();
  ELSIF NEW.is_active = true THEN
    NEW.disabled_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.set_referral_code_on_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  new_code text;
  code_exists boolean;
begin
  -- Only generate if not already set
  if NEW.referral_code is null then
    loop
      new_code := generate_referral_code();
      -- Check if code already exists
      select exists(select 1 from profiles where referral_code = new_code) into code_exists;
      exit when not code_exists;
    end loop;
    NEW.referral_code := new_code;
  end if;
  return NEW;
end;
$$;

CREATE FUNCTION public.settle_stale_orders() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec RECORD;
BEGIN
  -- Cancel pending orders from before today
  FOR v_rec IN
    SELECT id, buyer_id, seller_id, product_id, product_name, quantity
    FROM market_orders
    WHERE status IN ('pending', 'ready_for_pickup')
      AND created_at < CURRENT_DATE
    FOR UPDATE
  LOOP
    UPDATE market_orders
    SET status = 'cancelled',
        decline_reason = 'Auto-cancelled: market day ended without completion',
        updated_at = now()
    WHERE id = v_rec.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE FUNCTION public.trg_booth_helper_status_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_booth_name TEXT;
  v_owner_id   UUID;
  v_helper_name TEXT;
  v_owner_name  TEXT;
  v_passcode    TEXT;
BEGIN
  -- Get booth info
  SELECT name, owner_id, helper_passcode
  INTO v_booth_name, v_owner_id, v_passcode
  FROM market_booths WHERE id = NEW.booth_id;

  IF v_booth_name IS NULL THEN RETURN NEW; END IF;

      WHEN 'revoked' THEN
        -- Notify helper they were revoked
        PERFORM notify_market_event(
          NEW.helper_id,
          '⚠️ Your helper access to "' || v_booth_name || '" has been revoked by ' || coalesce(v_owner_name, 'the booth owner') || '.',
          '/market'
        );
        -- Also notify owner for confirmation
        PERFORM notify_market_event(
          v_owner_id,
          '✅ Helper access revoked for ' || coalesce(v_helper_name, 'a helper') || ' from "' || v_booth_name || '".',
          '/my-booth'
        );

      ELSE NULL;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.trg_market_order_status_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    -- (a) Order placed: pending→confirmed means seller accepted
    --     But the REAL "order placed" is when status first becomes 'pending'
    --     i.e. INSERT. We handle that separately below.
    WHEN 'confirmed' THEN
      -- Seller accepted — notify buyer
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your order for ' || NEW.product_name || ' has been accepted by the seller!',
        '/orders'
      );

        v_dispute_label := coalesce(v_dispute_label, 'Dispute Opened');

        PERFORM notify_market_event(
          NEW.buyer_id,
          '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' order.',
          '/orders'
        );
        PERFORM notify_market_event(
          NEW.seller_id,
          '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' sale.',
          '/orders'
        );
      END;

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$_$;

CREATE FUNCTION public.trg_notify_market_chat_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Fire the edge function via pg_net
  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/notify-on-market-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object(
      'messageId', NEW.id,
      'orderId', NEW.order_id,
      'senderId', NEW.sender_id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Market chat notify failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.trg_product_added_notify_followers() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
DECLARE
  v_booth RECORD;
  v_follower RECORD;
  v_follower_ids UUID[];
BEGIN
  -- Find the booth for this seller
  SELECT id, name INTO v_booth
  FROM market_booths
  WHERE owner_id = NEW.seller_id
  LIMIT 1;

  IF v_booth IS NULL THEN RETURN NEW; END IF;

  IF v_follower_ids IS NULL OR array_length(v_follower_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$_$;

CREATE FUNCTION public.trg_profile_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old JSONB := '{}'::jsonb;
  v_new JSONB := '{}'::jsonb;
BEGIN
  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    v_old := v_old || jsonb_build_object('full_name', OLD.full_name);
    v_new := v_new || jsonb_build_object('full_name', NEW.full_name);
  END IF;
  IF OLD.street_address IS DISTINCT FROM NEW.street_address THEN
    v_old := v_old || jsonb_build_object('street_address', OLD.street_address);
    v_new := v_new || jsonb_build_object('street_address', NEW.street_address);
  END IF;
  IF OLD.zip_code IS DISTINCT FROM NEW.zip_code THEN
    v_old := v_old || jsonb_build_object('zip_code', OLD.zip_code);
    v_new := v_new || jsonb_build_object('zip_code', NEW.zip_code);
  END IF;
  IF OLD.city IS DISTINCT FROM NEW.city THEN
    v_old := v_old || jsonb_build_object('city', OLD.city);
    v_new := v_new || jsonb_build_object('city', NEW.city);
  END IF;
  IF OLD.state_code IS DISTINCT FROM NEW.state_code THEN
    v_old := v_old || jsonb_build_object('state_code', OLD.state_code);
    v_new := v_new || jsonb_build_object('state_code', NEW.state_code);
  END IF;
  IF OLD.home_location IS DISTINCT FROM NEW.home_location THEN
    v_old := v_old || jsonb_build_object('home_location', ST_AsText(OLD.home_location));
    v_new := v_new || jsonb_build_object('home_location', ST_AsText(NEW.home_location));
  END IF;
  IF OLD.avatar_url IS DISTINCT FROM NEW.avatar_url THEN
    v_old := v_old || jsonb_build_object('avatar_url', OLD.avatar_url);
    v_new := v_new || jsonb_build_object('avatar_url', NEW.avatar_url);
  END IF;
  IF v_old <> '{}'::jsonb THEN
    INSERT INTO profile_audit_log (user_id, changed_by, old_values, new_values)
    VALUES (NEW.id, auth.uid(), v_old, v_new);
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.trg_redemption_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_item_name TEXT;
  v_item_type TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT name, type::text INTO v_item_name, v_item_type
  FROM redemption_merchandize WHERE id = NEW.item_id;

  IF NEW.status = 'completed' THEN
    IF NEW.is_auto = true THEN
      -- (j) Auto remittance: full notification (in-app + push + email)
      PERFORM notify_market_event(
        NEW.user_id,
        '⚡ Auto-withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!',
        '/earnings'
      );
    ELSE
      -- (k) Manual remittance: email only (toast shown in UI, no push)
      INSERT INTO notifications (user_id, content, link_url)
      VALUES (
        NEW.user_id,
        '🎁 Withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!',
        '/earnings'
      );
    END IF;
  ELSIF NEW.status = 'failed' THEN
    PERFORM notify_market_event(
      NEW.user_id,
      '❌ Withdrawal failed for ' || coalesce(v_item_name, 'your request') || '. Please try again.',
      '/earnings/redeem'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.trg_settlement_status_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
DECLARE
  v_user RECORD;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'funds_received' THEN
      FOR v_user IN
        SELECT DISTINCT user_id FROM user_settlements WHERE settlement_id = NEW.id
      LOOP
        PERFORM notify_market_event(
          v_user.user_id,
          '🏦 Settlement funds received for market day ' || NEW.market_date || '. Earnings are being processed.',
          '/earnings'
        );
      END LOOP;

    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$_$;

CREATE FUNCTION public.update_feedback_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.update_last_active_on_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Update both buyer and seller activity timestamps
  UPDATE profiles SET last_active_at = now()
    WHERE id IN (NEW.buyer_id, NEW.seller_id);
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.verify_phone(p_code text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_expected TEXT;
  v_expires TIMESTAMPTZ;
  v_attempts INT;
  v_locked_until TIMESTAMPTZ;
BEGIN
  SELECT phone_verification_code, phone_verification_expires_at,
         phone_verification_attempts, phone_verification_locked_until
    INTO v_expected, v_expires, v_attempts, v_locked_until
    FROM profiles
    WHERE id = auth.uid();

  RETURN true;
END;
$$;

CREATE FUNCTION public.withdraw_offer_with_message(p_offer_id uuid, p_seller_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

CREATE TABLE public.available_redemption_method_instruments (
    instrument public.redemption_instrument NOT NULL,
    method public.redemption_method NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    disabled_at timestamp with time zone
);

CREATE TABLE public.available_redemption_methods (
    method public.redemption_method NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.blocked_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_name text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    country_iso_3 text,
    state_id uuid,
    county_id uuid,
    city_id uuid
);

CREATE TABLE public.booth_helpers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booth_id uuid NOT NULL,
    helper_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    role text DEFAULT 'delivery'::text,
    CONSTRAINT booth_helpers_role_check CHECK ((role = ANY (ARRAY['delivery'::text, 'full_access'::text]))),
    CONSTRAINT booth_helpers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text])))
);

CREATE TABLE public.campaign_rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    behavior public.campaign_behavior NOT NULL,
    points integer NOT NULL,
    CONSTRAINT campaign_rewards_points_check CHECK ((points > 0))
);

CREATE TABLE public.campaign_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    community_h3_index text
);

CREATE TABLE public.category_restrictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_name text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    country_iso_3 text,
    state_id uuid,
    county_id uuid,
    city_id uuid
);

CREATE TABLE public.category_tax_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    state_code text NOT NULL,
    category_name text NOT NULL,
    rule_type public.tax_rule_type DEFAULT 'evaluate'::public.tax_rule_type NOT NULL,
    rate_pct numeric(5,3) DEFAULT 0,
    notes text,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_until date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT category_tax_rules_rate_pct_check CHECK (((rate_pct >= (0)::numeric) AND (rate_pct <= (100)::numeric))),
    CONSTRAINT chk_fixed_has_rate CHECK (((rule_type <> 'fixed'::public.tax_rule_type) OR (rate_pct IS NOT NULL)))
);

CREATE TABLE public.charity_projects_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL
);

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid,
    content text,
    media_id uuid,
    type public.chat_message_type DEFAULT 'text'::public.chat_message_type NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    CONSTRAINT chat_messages_check CHECK (((content IS NOT NULL) OR (media_id IS NOT NULL)))
);

ALTER TABLE ONLY public.chat_messages REPLICA IDENTITY FULL;

CREATE TABLE public.cities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    state_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.comment_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reason text NOT NULL,
    details text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT comment_flags_reason_check CHECK ((reason = ANY (ARRAY['offensive'::text, 'spam'::text, 'misleading'::text, 'other'::text])))
);

CREATE TABLE public.comment_likes (
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.communities (
    h3_index text NOT NULL,
    name text NOT NULL,
    location public.geometry(Point,4326),
    boundary public.geometry(Polygon,4326),
    city text,
    state text,
    country text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.counties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    state_id uuid NOT NULL,
    name text NOT NULL,
    fips_code text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.countries (
    iso_3 text NOT NULL,
    name text NOT NULL,
    currency_symbol text,
    phone_code text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.country_refund_fees (
    country_iso_3 text NOT NULL,
    stripe_identity_fee_cents integer NOT NULL,
    transaction_fee_percent numeric NOT NULL,
    transaction_fee_fixed_cents integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.delegations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delegator_id uuid NOT NULL,
    delegatee_id uuid,
    status public.delegation_status DEFAULT 'pending'::public.delegation_status NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pairing_code text,
    pairing_expires_at timestamp with time zone,
    delegation_code text,
    message text,
    delegate_pct smallint DEFAULT 50,
    CONSTRAINT delegations_check CHECK (((delegatee_id IS NULL) OR (delegator_id <> delegatee_id))),
    CONSTRAINT delegations_delegate_pct_check CHECK (((delegate_pct >= 0) AND (delegate_pct <= 100)))
);

ALTER TABLE ONLY public.delegations REPLICA IDENTITY FULL;

CREATE TABLE public.delivery_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    delivery_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.digital_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    buyer_receipt jsonb NOT NULL,
    seller_receipt jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.donation_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    redemption_id uuid NOT NULL,
    provider_transaction_id uuid,
    organization_name text NOT NULL,
    project_title text,
    theme text,
    donation_amount_cents integer NOT NULL,
    points_spent integer NOT NULL,
    receipt_url text,
    receipt_number text,
    tax_deductible boolean DEFAULT true,
    donated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.edge_function_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    function_name text NOT NULL,
    error_message text NOT NULL,
    error_stack text,
    request_method text,
    request_path text
);

CREATE TABLE public.escalations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    initiator_id uuid NOT NULL,
    reason text NOT NULL,
    dispute_proof_media_id uuid,
    status public.escalation_status DEFAULT 'open'::public.escalation_status NOT NULL,
    resolution_type public.escalation_resolution,
    accepted_refund_offer_id uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.experiment_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    experiment_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    user_id uuid,
    device_id text,
    assigned_at timestamp with time zone DEFAULT now(),
    context jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT experiment_assignments_identifier_check CHECK (((user_id IS NOT NULL) OR (device_id IS NOT NULL)))
);

CREATE TABLE public.experiment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    experiment_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    user_id uuid,
    event_name text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    device_id text
);

CREATE TABLE public.experiment_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    experiment_id uuid NOT NULL,
    name text NOT NULL,
    weight integer DEFAULT 50 NOT NULL,
    is_control boolean DEFAULT false,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.experiments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    status public.experiment_status DEFAULT 'draft'::public.experiment_status NOT NULL,
    rollout_percentage integer DEFAULT 0,
    target_criteria jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT experiments_rollout_percentage_check CHECK (((rollout_percentage >= 0) AND (rollout_percentage <= 100)))
);

CREATE TABLE public.feature_waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    feature text DEFAULT '529'::text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.feedback_comment_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    media_id uuid NOT NULL
);

CREATE TABLE public.feedback_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feedback_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    is_official_response boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.feedback_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feedback_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.feedback_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feedback_id uuid NOT NULL,
    media_id uuid NOT NULL,
    display_order integer DEFAULT 0
);

CREATE TABLE public.feedback_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feedback_id uuid NOT NULL,
    old_status public.feedback_status,
    new_status public.feedback_status NOT NULL,
    changed_by uuid NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.feedback_votes (
    feedback_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.followers (
    follower_id uuid NOT NULL,
    followed_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT no_self_follow CHECK ((follower_id <> followed_id))
);

CREATE TABLE public.garden_produce_catalog (
    name text NOT NULL,
    category text NOT NULL,
    emoji text,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT garden_produce_catalog_category_check CHECK ((category = ANY (ARRAY['fruits'::text, 'vegetables'::text, 'flowers'::text, 'herbs'::text])))
);

CREATE TABLE public.gift_card_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    redemption_id uuid NOT NULL,
    provider_transaction_id uuid,
    brand_name text NOT NULL,
    face_value_cents integer NOT NULL,
    card_code text,
    card_url text,
    card_pin text,
    expiry_date date,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.giftcards_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider public.giftcard_provider NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL
);

CREATE TABLE public.incentive_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_campaign_dates CHECK ((ends_at > starts_at))
);

CREATE TABLE public.instrument_queuing_status (
    instrument public.redemption_instrument NOT NULL,
    is_queuing boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.manual_refund_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    bucket_ids uuid[] NOT NULL,
    fulfillment_type public.manual_refund_fulfillment_type NOT NULL,
    stripe_verification_session_id text,
    amount_cents integer NOT NULL,
    mailing_address jsonb,
    target_email text,
    status public.manual_refund_status DEFAULT 'pending_verification'::public.manual_refund_status NOT NULL,
    tracking_number text,
    fulfilled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.market_booths (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text DEFAULT 'My Booth'::text NOT NULL,
    description text,
    decorative_theme text DEFAULT 'floral'::text,
    about_html text,
    invite_code text,
    offers_delivery boolean DEFAULT true,
    delivery_radius_miles integer DEFAULT 5,
    offers_pickup boolean DEFAULT true,
    pickup_address text,
    market_day_of_week integer DEFAULT 6,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    header_image_url text,
    delivery_windows jsonb DEFAULT '[]'::jsonb,
    pickup_windows jsonb DEFAULT '[]'::jsonb,
    payment_method text DEFAULT 'automatic'::text,
    venmo_handle text,
    charity_name text,
    helper_passcode text,
    status text DEFAULT 'draft'::text NOT NULL,
    pickup_location public.geometry(Point,4326),
    CONSTRAINT market_booths_market_day_of_week_check CHECK (((market_day_of_week >= 0) AND (market_day_of_week <= 6))),
    CONSTRAINT market_booths_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);

CREATE TABLE public.market_followers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    follower_id uuid NOT NULL,
    booth_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.market_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_id uuid NOT NULL,
    stripe_payment_intent_id text NOT NULL,
    stripe_client_secret text NOT NULL,
    hold_amount_cents integer NOT NULL,
    spent_amount_cents integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    balance_applied_cents integer DEFAULT 0 NOT NULL,
    CONSTRAINT market_holds_status_check CHECK ((status = ANY (ARRAY['active'::text, 'captured'::text, 'cancelled'::text, 'expired'::text])))
);

CREATE TABLE public.market_ledger (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    user_id uuid NOT NULL,
    order_id uuid,
    settlement_id uuid,
    amount_usd numeric(10,2) NOT NULL,
    direction text NOT NULL,
    balance_after numeric(10,2) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT market_ledger_amount_usd_check CHECK ((amount_usd >= (0)::numeric)),
    CONSTRAINT market_ledger_direction_check CHECK ((direction = ANY (ARRAY['debit'::text, 'credit'::text]))),
    CONSTRAINT market_ledger_event_type_check CHECK ((event_type = ANY (ARRAY['hold_placed'::text, 'hold_captured'::text, 'hold_released'::text, 'order_completed'::text, 'fee_charged'::text, 'refund_issued'::text, 'settlement_credit'::text, 'funds_cleared'::text, 'payout_sent'::text, 'balance_held'::text, 'balance_released'::text, 'balance_consumed'::text])))
);

CREATE SEQUENCE public.market_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.market_ledger_id_seq OWNED BY public.market_ledger.id;

CREATE TABLE public.market_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    link_url text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.market_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    booth_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    unit_price_usd numeric(10,2) NOT NULL,
    subtotal_usd numeric(10,2) NOT NULL,
    tax_rate_pct numeric(7,4) DEFAULT 0 NOT NULL,
    tax_amount_usd numeric(10,2) DEFAULT 0 NOT NULL,
    platform_fee_pct numeric(5,2) DEFAULT 10 NOT NULL,
    platform_fee_usd numeric(10,2) DEFAULT 0 NOT NULL,
    total_usd numeric(10,2) NOT NULL,
    fulfillment_type text NOT NULL,
    status public.market_order_status DEFAULT 'pending'::public.market_order_status NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    hold_id uuid,
    decline_reason text,
    delivery_proof jsonb DEFAULT '[]'::jsonb,
    delivered_at timestamp with time zone,
    auto_complete_at timestamp with time zone,
    completed_at timestamp with time zone,
    buyer_passcode text,
    seller_passcode text,
    buyer_passcode_entered boolean DEFAULT false,
    seller_passcode_entered boolean DEFAULT false,
    settlement_id uuid,
    buyer_rating smallint,
    seller_rating smallint,
    buyer_review text,
    seller_review text,
    delivered_by uuid,
    balance_applied_usd numeric(10,2) DEFAULT 0 NOT NULL,
    delivery_address text,
    CONSTRAINT chk_minimum_order_subtotal CHECK ((subtotal_usd >= 5.00)),
    CONSTRAINT market_orders_buyer_rating_check CHECK (((buyer_rating >= 1) AND (buyer_rating <= 5))),
    CONSTRAINT market_orders_fulfillment_type_check CHECK ((fulfillment_type = ANY (ARRAY['delivery'::text, 'pickup'::text]))),
    CONSTRAINT market_orders_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT market_orders_seller_rating_check CHECK (((seller_rating >= 1) AND (seller_rating <= 5)))
);

CREATE TABLE public.market_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    market_date date NOT NULL,
    name text NOT NULL,
    description text,
    category text DEFAULT 'produce'::text NOT NULL,
    price_usd numeric(10,2) NOT NULL,
    unit text DEFAULT 'each'::text NOT NULL,
    inventory integer DEFAULT 0 NOT NULL,
    photos text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    harvested_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_flagged boolean DEFAULT false,
    CONSTRAINT chk_minimum_product_potential CHECK (((price_usd * (inventory)::numeric) >= 5.00))
);

CREATE TABLE public.market_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    remind_at timestamp with time zone NOT NULL,
    market_date timestamp with time zone NOT NULL,
    reminder_minutes integer DEFAULT 30 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone
);

CREATE TABLE public.market_schedule_policies (
    day_of_week integer NOT NULL,
    day_name text NOT NULL,
    open_time text DEFAULT '08:00'::text NOT NULL,
    close_time text DEFAULT '14:00'::text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid,
    CONSTRAINT market_schedule_policies_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);

CREATE TABLE public.market_settings (
    id boolean DEFAULT true NOT NULL,
    products_never_expire boolean DEFAULT false NOT NULL,
    market_never_closes boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid,
    CONSTRAINT market_settings_id_check CHECK ((id = true))
);

CREATE TABLE public.market_settlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    market_date date NOT NULL,
    status public.clearing_status DEFAULT 'captures_sent'::public.clearing_status NOT NULL,
    total_orders integer DEFAULT 0 NOT NULL,
    total_captured_usd numeric(10,2) DEFAULT 0 NOT NULL,
    total_released_usd numeric(10,2) DEFAULT 0 NOT NULL,
    total_payouts_usd numeric(10,2) DEFAULT 0 NOT NULL,
    total_fees_usd numeric(10,2) DEFAULT 0 NOT NULL,
    total_refunds_usd numeric(10,2) DEFAULT 0 NOT NULL,
    stripe_payout_id text,
    stripe_payout_amount_usd numeric(10,2),
    stripe_payout_received_at timestamp with time zone,
    reconciliation_check jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.media_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    storage_path text NOT NULL,
    media_type public.media_asset_type NOT NULL,
    mime_type text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    link_url text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    created_by uuid NOT NULL,
    quantity numeric NOT NULL,
    points_per_unit integer NOT NULL,
    status public.offer_status DEFAULT 'pending'::public.offer_status NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    post_id uuid,
    category text,
    product text,
    unit text,
    delivery_date date,
    message text,
    seller_post_id uuid,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    media jsonb DEFAULT '[]'::jsonb,
    delivery_dates date[] DEFAULT '{}'::date[],
    community_h3_index text,
    additional_community_h3_indices text[] DEFAULT '{}'::text[]
);

CREATE TABLE public.order_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT order_chat_messages_content_check CHECK ((length(TRIM(BOTH FROM content)) > 0))
);

CREATE TABLE public.order_dispute_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispute_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    photos jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.order_disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    initiated_by uuid NOT NULL,
    reason text NOT NULL,
    photos jsonb DEFAULT '[]'::jsonb,
    refund_type text,
    refund_amount_usd numeric(10,2),
    pickup_offered boolean DEFAULT false,
    status public.dispute_status DEFAULT 'open'::public.dispute_status NOT NULL,
    staff_decision text,
    staff_notes text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    type public.dispute_type,
    quantity_received integer,
    dispute_type text,
    CONSTRAINT order_disputes_refund_type_check CHECK ((refund_type = ANY (ARRAY['full'::text, 'partial'::text])))
);

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offer_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    category text NOT NULL,
    product text NOT NULL,
    quantity numeric NOT NULL,
    points_per_unit integer NOT NULL,
    delivery_date date,
    delivery_time time without time zone,
    delivery_instructions text,
    delivery_proof_media_id uuid,
    conversation_id uuid NOT NULL,
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    buyer_rating public.rating_score,
    buyer_feedback text,
    seller_rating public.rating_score,
    seller_feedback text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    version integer DEFAULT 1 NOT NULL,
    tax_rate_pct numeric(7,4) DEFAULT 0,
    tax_amount integer DEFAULT 0,
    harvest_date date
);

ALTER TABLE ONLY public.orders REPLICA IDENTITY FULL;

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_payment_intent_id text,
    stripe_client_secret text,
    amount_cents integer NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    service_fee_cents integer DEFAULT 0 NOT NULL,
    points_amount integer NOT NULL,
    status public.payment_status DEFAULT 'pending'::public.payment_status NOT NULL,
    provider text DEFAULT 'mock'::text NOT NULL,
    webhook_received_at timestamp with time zone,
    point_ledger_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.platform_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creation_date timestamp with time zone DEFAULT now() NOT NULL,
    country_code character varying(3) NOT NULL,
    fees double precision NOT NULL
);

CREATE TABLE public.platform_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_grace_period_ms integer DEFAULT 1800000 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.point_bucket_consumptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id uuid NOT NULL,
    ledger_id uuid NOT NULL,
    amount_consumed integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.point_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.point_transaction_type NOT NULL,
    amount integer NOT NULL,
    balance_after integer NOT NULL,
    reference_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    campaign_id uuid,
    campaign_behavior public.campaign_behavior
);

CREATE TABLE public.point_purchase_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_iso_3 text DEFAULT 'USA'::text NOT NULL,
    max_outstanding_cents integer DEFAULT 200000 NOT NULL,
    daily_limit_cents integer DEFAULT 50000 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.post_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    user_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.post_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    user_id uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.post_likes (
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.post_media (
    post_id uuid NOT NULL,
    media_id uuid NOT NULL,
    "position" integer DEFAULT 0
);

CREATE TABLE public.post_type_policies (
    post_type public.post_type NOT NULL,
    expiration_days integer DEFAULT 30 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    type public.post_type NOT NULL,
    reach public.post_reach DEFAULT 'community'::public.post_reach NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    community_h3_index text,
    on_behalf_of uuid,
    is_archived boolean DEFAULT false NOT NULL,
    status public.post_status DEFAULT 'available'::public.post_status NOT NULL,
    expires_at timestamp with time zone
);

CREATE TABLE public.produce_interests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    produce_name text NOT NULL,
    is_custom boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.product_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    author_id uuid NOT NULL,
    parent_id uuid,
    body text NOT NULL,
    is_hidden boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT product_comments_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)))
);

CREATE TABLE public.product_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reason text NOT NULL,
    details text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_flags_reason_check CHECK ((reason = ANY (ARRAY['offensive'::text, 'misleading'::text, 'prohibited'::text, 'other'::text])))
);

CREATE TABLE public.product_tax_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_rule_id uuid NOT NULL,
    product_name text NOT NULL,
    rule_type public.tax_rule_type NOT NULL,
    rate_pct numeric(5,3) DEFAULT 0,
    notes text,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_until date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_override_fixed_has_rate CHECK (((rule_type <> 'fixed'::public.tax_rule_type) OR (rate_pct IS NOT NULL))),
    CONSTRAINT product_tax_overrides_rate_pct_check CHECK (((rate_pct >= (0)::numeric) AND (rate_pct <= (100)::numeric)))
);

CREATE TABLE public.profile_audit_log (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_by uuid,
    old_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    new_values jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public.profile_audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.profile_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    phone_number text,
    notify_on_wanted boolean DEFAULT true NOT NULL,
    notify_on_available boolean DEFAULT true NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    sms_enabled boolean DEFAULT false NOT NULL,
    referral_code text,
    invited_by_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    home_community_h3_index text,
    home_location public.geometry(Point,4326),
    zip_code text,
    nearby_community_h3_indices text[],
    country_code character varying(3) DEFAULT 'USA'::character varying,
    paypal_payout_id text,
    street_address text,
    city text,
    state_code text,
    zip_plus4 text,
    email_verified boolean DEFAULT false NOT NULL,
    phone_verified boolean DEFAULT false NOT NULL,
    phone_verified_at timestamp with time zone,
    phone_verification_code text,
    phone_verification_expires_at timestamp with time zone,
    profile_completed_at timestamp with time zone,
    tos_accepted_at timestamp with time zone,
    phone_verification_attempts integer DEFAULT 0 NOT NULL,
    phone_verification_locked_until timestamp with time zone,
    is_ghosted boolean DEFAULT false NOT NULL,
    county text,
    seller_avg_rating numeric(2,1),
    seller_rating_count integer DEFAULT 0 NOT NULL,
    payout_handle text,
    payout_handle_type text,
    payout_verified boolean DEFAULT false,
    payout_verification_amount numeric(4,2),
    payout_verification_sent_at timestamp with time zone,
    payout_verification_attempts integer DEFAULT 0,
    last_active_at timestamp with time zone DEFAULT now(),
    is_banned boolean DEFAULT false NOT NULL,
    ban_reason text,
    banned_at timestamp with time zone,
    CONSTRAINT profiles_payout_handle_type_check CHECK ((payout_handle_type = ANY (ARRAY['venmo'::text, 'paypal'::text])))
);

CREATE TABLE public.provider_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_name text NOT NULL,
    display_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    balance_cents integer,
    balance_updated_at timestamp with time zone,
    low_balance_threshold_cents integer DEFAULT 10000,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.provider_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_name text NOT NULL,
    redemption_id uuid,
    user_id uuid NOT NULL,
    external_order_id text,
    item_type text NOT NULL,
    item_name text NOT NULL,
    face_value_cents integer NOT NULL,
    cost_cents integer,
    discount_cents integer DEFAULT 0,
    fee_cents integer DEFAULT 0,
    status public.provider_transaction_status DEFAULT 'pending'::public.provider_transaction_status NOT NULL,
    status_message text,
    request_payload jsonb DEFAULT '{}'::jsonb,
    response_payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.purchased_points_buckets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    payment_transaction_id uuid NOT NULL,
    point_ledger_id uuid,
    original_amount integer NOT NULL,
    remaining_amount integer NOT NULL,
    status public.purchased_bucket_status DEFAULT 'active'::public.purchased_bucket_status NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text NOT NULL,
    endpoint text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_subscriptions_platform_check CHECK ((platform = ANY (ARRAY['web'::text, 'ios'::text, 'android'::text])))
);

CREATE TABLE public.receipt_footers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_iso_3 text DEFAULT 'USA'::text NOT NULL,
    state_code text NOT NULL,
    footer_text text NOT NULL,
    font_size_pt integer DEFAULT 10 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.redemption_merchandize (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    point_cost integer NOT NULL,
    type public.redemption_item_type NOT NULL,
    reach_type public.redemption_reach_type DEFAULT 'global'::public.redemption_reach_type NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.redemption_merchandize_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchandize_id uuid NOT NULL,
    media_id uuid NOT NULL,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.redemption_merchandize_restrictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchandize_id uuid NOT NULL,
    scope public.restriction_scope DEFAULT 'global'::public.restriction_scope NOT NULL,
    country_iso_3 text,
    state_id uuid,
    city_id uuid,
    is_allowed boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    county_id uuid
);

CREATE TABLE public.redemption_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    method text NOT NULL,
    amount_usd numeric(10,2) NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    error_message text,
    settlement_id uuid,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT redemption_queue_amount_usd_check CHECK ((amount_usd > (0)::numeric)),
    CONSTRAINT redemption_queue_method_check CHECK ((method = ANY (ARRAY['giftcards'::text, 'charity'::text, 'cashout'::text]))),
    CONSTRAINT redemption_queue_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);

CREATE TABLE public.redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    item_id uuid,
    point_cost integer NOT NULL,
    status public.redemption_status DEFAULT 'pending'::public.redemption_status NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    provider text,
    provider_order_id text,
    failed_reason text,
    completed_at timestamp with time zone,
    refunded_at timestamp with time zone
);

CREATE TABLE public.refund_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    escalation_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    message text,
    status public.refund_offer_status DEFAULT 'pending'::public.refund_offer_status NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.sales_categories (
    name text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_produce boolean DEFAULT false NOT NULL
);

CREATE TABLE public.settlement_captures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settlement_id uuid NOT NULL,
    hold_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    stripe_payment_intent_id text NOT NULL,
    hold_amount_usd numeric(10,2) NOT NULL,
    capture_amount_usd numeric(10,2) NOT NULL,
    release_amount_usd numeric(10,2) NOT NULL,
    capture_status text DEFAULT 'pending'::text NOT NULL,
    stripe_capture_id text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT settlement_captures_capture_status_check CHECK ((capture_status = ANY (ARRAY['pending'::text, 'captured'::text, 'failed'::text, 'released'::text])))
);

CREATE TABLE public.small_balance_refund_thresholds (
    country_iso_3 text NOT NULL,
    threshold_cents integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    state_id uuid,
    county_id uuid,
    city_id uuid
);

CREATE TABLE public.sms_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number text NOT NULL,
    user_id uuid,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.staff_members (
    user_id uuid,
    roles public.staff_role[] DEFAULT '{support}'::public.staff_role[] NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL
);

CREATE TABLE public.state_redemption_method_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_iso_3 text DEFAULT 'USA'::text NOT NULL,
    state_code text NOT NULL,
    method public.redemption_method NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_iso_3 text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tax_reporting_thresholds (
    state_code text NOT NULL,
    amount numeric NOT NULL,
    min_txns integer DEFAULT 0 NOT NULL,
    warn_pct numeric DEFAULT 0.75 NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);

CREATE TABLE public.usda_zone_produce (
    zone_group text NOT NULL,
    produce_name text NOT NULL,
    category text NOT NULL,
    emoji text,
    season text,
    rank integer DEFAULT 0,
    CONSTRAINT usda_zone_produce_category_check CHECK ((category = ANY (ARRAY['fruits'::text, 'vegetables'::text, 'flowers'::text, 'herbs'::text]))),
    CONSTRAINT usda_zone_produce_season_check CHECK ((season = ANY (ARRAY['spring'::text, 'summer'::text, 'fall'::text, 'winter'::text, 'year_round'::text])))
);

CREATE TABLE public.user_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    session_id text NOT NULL,
    txn_id text NOT NULL,
    event_type text NOT NULL,
    event_name text NOT NULL,
    page_path text,
    metadata jsonb DEFAULT '{}'::jsonb,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.user_auto_redemption_config (
    user_id uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    method text DEFAULT 'cashout'::text NOT NULL,
    threshold_usd numeric(10,2) DEFAULT 50.00 NOT NULL,
    cashout_payout_id text,
    gift_card_brand text,
    gift_card_amount_usd numeric(10,2),
    charity_project_id text,
    charity_project_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_auto_redemption_config_method_check CHECK ((method = ANY (ARRAY['giftcards'::text, 'charity'::text, 'cashout'::text]))),
    CONSTRAINT user_auto_redemption_config_threshold_usd_check CHECK ((threshold_usd >= 5.00))
);

CREATE TABLE public.user_balances (
    user_id uuid NOT NULL,
    available_usd numeric(10,2) DEFAULT 0 NOT NULL,
    pending_usd numeric(10,2) DEFAULT 0 NOT NULL,
    total_earned_usd numeric(10,2) DEFAULT 0 NOT NULL,
    total_spent_usd numeric(10,2) DEFAULT 0 NOT NULL,
    total_withdrawn_usd numeric(10,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    held_balance_usd numeric(10,2) DEFAULT 0 NOT NULL
);

CREATE TABLE public.user_garden (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    produce_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_custom boolean DEFAULT false NOT NULL
);

CREATE TABLE public.user_settlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settlement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    gross_sales_usd numeric(10,2) DEFAULT 0 NOT NULL,
    total_purchases_usd numeric(10,2) DEFAULT 0 NOT NULL,
    refunds_issued_usd numeric(10,2) DEFAULT 0 NOT NULL,
    refunds_received_usd numeric(10,2) DEFAULT 0 NOT NULL,
    platform_fees_usd numeric(10,2) DEFAULT 0 NOT NULL,
    hold_captured_usd numeric(10,2) DEFAULT 0 NOT NULL,
    hold_released_usd numeric(10,2) DEFAULT 0 NOT NULL,
    net_payout_usd numeric(10,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_settlements_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'available'::text, 'paid_out'::text])))
);

CREATE TABLE public.want_to_buy_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    category text NOT NULL,
    produce_names text[] NOT NULL,
    need_by_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    desired_quantity numeric,
    desired_unit public.unit_of_measure
);

CREATE TABLE public.want_to_sell_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    category text NOT NULL,
    produce_name text NOT NULL,
    unit public.unit_of_measure NOT NULL,
    total_quantity_available numeric NOT NULL,
    points_per_unit integer NOT NULL,
    delegator_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    need_by_date date,
    delegate_pct integer,
    is_produce boolean DEFAULT false NOT NULL,
    harvest_date date
);

CREATE TABLE public.zip_codes (
    zip_code text NOT NULL,
    country_iso_3 text NOT NULL,
    city_id uuid NOT NULL,
    latitude numeric,
    longitude numeric,
    last_scraped_at timestamp with time zone,
    county_id uuid
);

CREATE TABLE public.zip_prefix_to_zone (
    zip_prefix text NOT NULL,
    zone_group text NOT NULL
);

CREATE TABLE public.zip_tax_cache (
    zip_code text NOT NULL,
    combined_rate numeric(7,4) NOT NULL,
    state_rate numeric(7,4),
    county_rate numeric(7,4),
    city_rate numeric(7,4),
    district_rate numeric(7,4),
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (date_trunc('month'::text, now()) + '1 mon'::interval) NOT NULL
);

ALTER TABLE ONLY public.market_ledger ALTER COLUMN id SET DEFAULT nextval('public.market_ledger_id_seq'::regclass);

ALTER TABLE ONLY public.available_redemption_method_instruments
    ADD CONSTRAINT available_redemption_method_instruments_pkey PRIMARY KEY (instrument);

ALTER TABLE ONLY public.available_redemption_methods
    ADD CONSTRAINT available_redemption_methods_pkey PRIMARY KEY (method);

ALTER TABLE ONLY public.blocked_products
    ADD CONSTRAINT blocked_products_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.booth_helpers
    ADD CONSTRAINT booth_helpers_booth_id_helper_id_key UNIQUE (booth_id, helper_id);

ALTER TABLE ONLY public.booth_helpers
    ADD CONSTRAINT booth_helpers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.campaign_rewards
    ADD CONSTRAINT campaign_rewards_campaign_id_behavior_key UNIQUE (campaign_id, behavior);

ALTER TABLE ONLY public.campaign_rewards
    ADD CONSTRAINT campaign_rewards_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.campaign_zones
    ADD CONSTRAINT campaign_zones_campaign_id_community_h3_index_key UNIQUE (campaign_id, community_h3_index);

ALTER TABLE ONLY public.campaign_zones
    ADD CONSTRAINT campaign_zones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.category_restrictions
    ADD CONSTRAINT category_restrictions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.category_tax_rules
    ADD CONSTRAINT category_tax_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.charity_projects_cache
    ADD CONSTRAINT charity_projects_cache_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_state_id_name_key UNIQUE (state_id, name);

ALTER TABLE ONLY public.comment_flags
    ADD CONSTRAINT comment_flags_comment_id_user_id_key UNIQUE (comment_id, user_id);

ALTER TABLE ONLY public.comment_flags
    ADD CONSTRAINT comment_flags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (comment_id, user_id);

ALTER TABLE ONLY public.communities
    ADD CONSTRAINT communities_pkey PRIMARY KEY (h3_index);

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_post_id_buyer_id_seller_id_key UNIQUE (post_id, buyer_id, seller_id);

ALTER TABLE ONLY public.counties
    ADD CONSTRAINT counties_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.counties
    ADD CONSTRAINT counties_state_id_name_key UNIQUE (state_id, name);

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (iso_3);

ALTER TABLE ONLY public.country_refund_fees
    ADD CONSTRAINT country_refund_fees_pkey PRIMARY KEY (country_iso_3);

ALTER TABLE ONLY public.delegations
    ADD CONSTRAINT delegations_delegation_code_key UNIQUE (delegation_code);

ALTER TABLE ONLY public.delegations
    ADD CONSTRAINT delegations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_dates
    ADD CONSTRAINT delivery_dates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.digital_receipts
    ADD CONSTRAINT digital_receipts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.donation_receipts
    ADD CONSTRAINT donation_receipts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.edge_function_errors
    ADD CONSTRAINT edge_function_errors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experiment_assignments
    ADD CONSTRAINT experiment_assignments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experiment_events
    ADD CONSTRAINT experiment_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experiment_variants
    ADD CONSTRAINT experiment_variants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feature_waitlist
    ADD CONSTRAINT feature_waitlist_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feature_waitlist
    ADD CONSTRAINT feature_waitlist_user_id_feature_key UNIQUE (user_id, feature);

ALTER TABLE ONLY public.feedback_comment_media
    ADD CONSTRAINT feedback_comment_media_comment_id_media_id_key UNIQUE (comment_id, media_id);

ALTER TABLE ONLY public.feedback_comment_media
    ADD CONSTRAINT feedback_comment_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feedback_comments
    ADD CONSTRAINT feedback_comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feedback_flags
    ADD CONSTRAINT feedback_flags_feedback_id_user_id_key UNIQUE (feedback_id, user_id);

ALTER TABLE ONLY public.feedback_flags
    ADD CONSTRAINT feedback_flags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feedback_media
    ADD CONSTRAINT feedback_media_feedback_id_media_id_key UNIQUE (feedback_id, media_id);

ALTER TABLE ONLY public.feedback_media
    ADD CONSTRAINT feedback_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feedback_status_history
    ADD CONSTRAINT feedback_status_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feedback_votes
    ADD CONSTRAINT feedback_votes_pkey PRIMARY KEY (feedback_id, user_id);

ALTER TABLE ONLY public.followers
    ADD CONSTRAINT followers_pkey PRIMARY KEY (follower_id, followed_id);

ALTER TABLE ONLY public.garden_produce_catalog
    ADD CONSTRAINT garden_produce_catalog_pkey PRIMARY KEY (name);

ALTER TABLE ONLY public.gift_card_deliveries
    ADD CONSTRAINT gift_card_deliveries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.giftcards_cache
    ADD CONSTRAINT giftcards_cache_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.giftcards_cache
    ADD CONSTRAINT giftcards_cache_provider_status_key UNIQUE (provider, status);

ALTER TABLE ONLY public.incentive_campaigns
    ADD CONSTRAINT incentive_campaigns_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.instrument_queuing_status
    ADD CONSTRAINT instrument_queuing_status_pkey PRIMARY KEY (instrument);

ALTER TABLE ONLY public.manual_refund_checks
    ADD CONSTRAINT manual_refund_checks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.market_booths
    ADD CONSTRAINT market_booths_invite_code_key UNIQUE (invite_code);

ALTER TABLE ONLY public.market_booths
    ADD CONSTRAINT market_booths_owner_id_key UNIQUE (owner_id);

ALTER TABLE ONLY public.market_booths
    ADD CONSTRAINT market_booths_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.market_followers
    ADD CONSTRAINT market_followers_follower_id_booth_id_key UNIQUE (follower_id, booth_id);

ALTER TABLE ONLY public.market_followers
    ADD CONSTRAINT market_followers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.market_holds
    ADD CONSTRAINT market_holds_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.market_ledger
    ADD CONSTRAINT market_ledger_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.market_notifications
    ADD CONSTRAINT market_notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.market_orders
    ADD CONSTRAINT market_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.market_products
    ADD CONSTRAINT market_products_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.market_reminders
    ADD CONSTRAINT market_reminders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.market_reminders
    ADD CONSTRAINT market_reminders_user_id_market_date_key UNIQUE (user_id, market_date);

ALTER TABLE ONLY public.market_schedule_policies
    ADD CONSTRAINT market_schedule_policies_pkey PRIMARY KEY (day_of_week);

ALTER TABLE ONLY public.market_settings
    ADD CONSTRAINT market_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.market_settlements
    ADD CONSTRAINT market_settlements_market_date_key UNIQUE (market_date);

ALTER TABLE ONLY public.market_settlements
    ADD CONSTRAINT market_settlements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_chat_messages
    ADD CONSTRAINT order_chat_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_dispute_messages
    ADD CONSTRAINT order_dispute_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_disputes
    ADD CONSTRAINT order_disputes_order_id_key UNIQUE (order_id);

ALTER TABLE ONLY public.order_disputes
    ADD CONSTRAINT order_disputes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);

ALTER TABLE ONLY public.platform_fees
    ADD CONSTRAINT platform_fees_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.point_bucket_consumptions
    ADD CONSTRAINT point_bucket_consumptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.point_ledger
    ADD CONSTRAINT point_ledger_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.point_purchase_limits
    ADD CONSTRAINT point_purchase_limits_country_iso_3_key UNIQUE (country_iso_3);

ALTER TABLE ONLY public.point_purchase_limits
    ADD CONSTRAINT point_purchase_limits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post_flags
    ADD CONSTRAINT post_flags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_pkey PRIMARY KEY (post_id, user_id);

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_pkey PRIMARY KEY (post_id, media_id);

ALTER TABLE ONLY public.post_type_policies
    ADD CONSTRAINT post_type_policies_pkey PRIMARY KEY (post_type);

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.produce_interests
    ADD CONSTRAINT produce_interests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.produce_interests
    ADD CONSTRAINT produce_interests_user_id_produce_name_key UNIQUE (user_id, produce_name);

ALTER TABLE ONLY public.product_comments
    ADD CONSTRAINT product_comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_flags
    ADD CONSTRAINT product_flags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_flags
    ADD CONSTRAINT product_flags_product_id_user_id_key UNIQUE (product_id, user_id);

ALTER TABLE ONLY public.product_tax_overrides
    ADD CONSTRAINT product_tax_overrides_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profile_audit_log
    ADD CONSTRAINT profile_audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);

ALTER TABLE ONLY public.provider_accounts
    ADD CONSTRAINT provider_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.provider_accounts
    ADD CONSTRAINT provider_accounts_provider_name_key UNIQUE (provider_name);

ALTER TABLE ONLY public.provider_transactions
    ADD CONSTRAINT provider_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchased_points_buckets
    ADD CONSTRAINT purchased_points_buckets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_token_key UNIQUE (user_id, token);

ALTER TABLE ONLY public.receipt_footers
    ADD CONSTRAINT receipt_footers_country_iso_3_state_code_key UNIQUE (country_iso_3, state_code);

ALTER TABLE ONLY public.receipt_footers
    ADD CONSTRAINT receipt_footers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.redemption_merchandize_media
    ADD CONSTRAINT redemption_merchandize_media_merchandize_id_media_id_key UNIQUE (merchandize_id, media_id);

ALTER TABLE ONLY public.redemption_merchandize_media
    ADD CONSTRAINT redemption_merchandize_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.redemption_merchandize
    ADD CONSTRAINT redemption_merchandize_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.redemption_merchandize_restrictions
    ADD CONSTRAINT redemption_merchandize_restrictions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.redemption_queue
    ADD CONSTRAINT redemption_queue_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.redemptions
    ADD CONSTRAINT redemptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.refund_offers
    ADD CONSTRAINT refund_offers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sales_categories
    ADD CONSTRAINT sales_categories_pkey PRIMARY KEY (name);

ALTER TABLE ONLY public.settlement_captures
    ADD CONSTRAINT settlement_captures_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sms_rate_limits
    ADD CONSTRAINT sms_rate_limits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_email_unique UNIQUE (email);

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.state_redemption_method_blocks
    ADD CONSTRAINT state_redemption_method_block_country_iso_3_state_code_meth_key UNIQUE (country_iso_3, state_code, method);

ALTER TABLE ONLY public.state_redemption_method_blocks
    ADD CONSTRAINT state_redemption_method_blocks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_country_iso_3_code_key UNIQUE (country_iso_3, code);

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tax_reporting_thresholds
    ADD CONSTRAINT tax_reporting_thresholds_pkey PRIMARY KEY (state_code);

ALTER TABLE ONLY public.usda_zone_produce
    ADD CONSTRAINT usda_zone_produce_pkey PRIMARY KEY (zone_group, produce_name);

ALTER TABLE ONLY public.user_analytics
    ADD CONSTRAINT user_analytics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_auto_redemption_config
    ADD CONSTRAINT user_auto_redemption_config_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.user_balances
    ADD CONSTRAINT user_balances_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.user_feedback
    ADD CONSTRAINT user_feedback_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_garden
    ADD CONSTRAINT user_garden_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_settlements
    ADD CONSTRAINT user_settlements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_settlements
    ADD CONSTRAINT user_settlements_settlement_id_user_id_key UNIQUE (settlement_id, user_id);

ALTER TABLE ONLY public.want_to_buy_details
    ADD CONSTRAINT want_to_buy_details_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.want_to_sell_details
    ADD CONSTRAINT want_to_sell_details_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.zip_codes
    ADD CONSTRAINT zip_codes_pkey PRIMARY KEY (zip_code, country_iso_3);

ALTER TABLE ONLY public.zip_prefix_to_zone
    ADD CONSTRAINT zip_prefix_to_zone_pkey PRIMARY KEY (zip_prefix);

ALTER TABLE ONLY public.zip_tax_cache
    ADD CONSTRAINT zip_tax_cache_pkey PRIMARY KEY (zip_code);

CREATE UNIQUE INDEX blocked_products_unified_idx ON public.blocked_products USING btree (product_name, COALESCE(country_iso_3, ''::text), COALESCE(state_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(county_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE UNIQUE INDEX category_restrictions_unified_idx ON public.category_restrictions USING btree (category_name, COALESCE(country_iso_3, ''::text), COALESCE(state_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(county_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX communities_location_idx ON public.communities USING gist (location);

CREATE UNIQUE INDEX experiment_assignments_device_idx ON public.experiment_assignments USING btree (experiment_id, device_id) WHERE (user_id IS NULL);

CREATE UNIQUE INDEX experiment_assignments_user_idx ON public.experiment_assignments USING btree (experiment_id, user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX idx_analytics_txn ON public.user_analytics USING btree (txn_id);

CREATE INDEX idx_analytics_user ON public.user_analytics USING btree (user_id, created_at);

CREATE INDEX idx_booth_helpers_booth ON public.booth_helpers USING btree (booth_id);

CREATE INDEX idx_booth_helpers_helper ON public.booth_helpers USING btree (helper_id);

CREATE INDEX idx_campaign_zones_h3 ON public.campaign_zones USING btree (community_h3_index);

CREATE INDEX idx_campaigns_active ON public.incentive_campaigns USING btree (is_active, starts_at, ends_at) WHERE (is_active = true);

CREATE INDEX idx_category_tax_state ON public.category_tax_rules USING btree (state_code);

CREATE UNIQUE INDEX idx_category_tax_unique ON public.category_tax_rules USING btree (state_code, category_name) WHERE (effective_until IS NULL);

CREATE UNIQUE INDEX idx_delegation_pairing_code ON public.delegations USING btree (pairing_code) WHERE (pairing_code IS NOT NULL);

CREATE UNIQUE INDEX idx_delegations_delegation_code ON public.delegations USING btree (delegation_code) WHERE (delegation_code IS NOT NULL);

CREATE INDEX idx_digital_receipts_order ON public.digital_receipts USING btree (order_id);

CREATE INDEX idx_donation_receipt_redemption ON public.donation_receipts USING btree (redemption_id);

CREATE INDEX idx_efe_fn_created ON public.edge_function_errors USING btree (function_name, created_at DESC);

CREATE INDEX idx_feedback_status_history_feedback ON public.feedback_status_history USING btree (feedback_id);

CREATE INDEX idx_followers_followed ON public.followers USING btree (followed_id);

CREATE INDEX idx_followers_follower ON public.followers USING btree (follower_id);

CREATE INDEX idx_gc_delivery_redemption ON public.gift_card_deliveries USING btree (redemption_id);

CREATE UNIQUE INDEX idx_ledger_campaign_dedup ON public.point_ledger USING btree (campaign_id, user_id, campaign_behavior, COALESCE(reference_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (campaign_id IS NOT NULL);

CREATE INDEX idx_manual_refund_checks_status ON public.manual_refund_checks USING btree (status);

CREATE INDEX idx_manual_refund_checks_user ON public.manual_refund_checks USING btree (user_id);

CREATE INDEX idx_market_booths_owner ON public.market_booths USING btree (owner_id);

CREATE INDEX idx_market_booths_pickup_loc ON public.market_booths USING gist (pickup_location);

CREATE INDEX idx_market_followers_booth ON public.market_followers USING btree (booth_id);

CREATE INDEX idx_market_followers_user ON public.market_followers USING btree (follower_id);

CREATE UNIQUE INDEX idx_market_holds_buyer_active ON public.market_holds USING btree (buyer_id) WHERE (status = 'active'::text);

CREATE INDEX idx_market_notifications_user ON public.market_notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_market_orders_unrated_buyer ON public.market_orders USING btree (buyer_id) WHERE ((status = 'completed'::public.market_order_status) AND (buyer_rating IS NULL));

CREATE INDEX idx_market_orders_unrated_seller ON public.market_orders USING btree (seller_id) WHERE ((status = 'completed'::public.market_order_status) AND (seller_rating IS NULL));

CREATE INDEX idx_market_orders_unsettled ON public.market_orders USING btree (status) WHERE (settlement_id IS NULL);

CREATE INDEX idx_market_products_date ON public.market_products USING btree (market_date);

CREATE INDEX idx_market_products_seller ON public.market_products USING btree (seller_id);

CREATE INDEX idx_market_products_seller_date ON public.market_products USING btree (seller_id, market_date);

CREATE INDEX idx_market_reminders_remind_at ON public.market_reminders USING btree (remind_at) WHERE (sent_at IS NULL);

CREATE INDEX idx_order_chat_order ON public.order_chat_messages USING btree (order_id, created_at);

CREATE INDEX idx_payment_transactions_status ON public.payment_transactions USING btree (status);

CREATE INDEX idx_payment_transactions_stripe_id ON public.payment_transactions USING btree (stripe_payment_intent_id);

CREATE INDEX idx_payment_transactions_user ON public.payment_transactions USING btree (user_id);

CREATE INDEX idx_point_bucket_consumptions_bucket ON public.point_bucket_consumptions USING btree (bucket_id);

CREATE INDEX idx_point_bucket_consumptions_ledger ON public.point_bucket_consumptions USING btree (ledger_id);

CREATE INDEX idx_posts_active_feed ON public.posts USING btree (community_h3_index, created_at DESC) WHERE (status = 'available'::public.post_status);

CREATE INDEX idx_posts_is_archived ON public.posts USING btree (is_archived) WHERE (is_archived = false);

CREATE INDEX idx_posts_status ON public.posts USING btree (status) WHERE (status = 'available'::public.post_status);

CREATE INDEX idx_produce_interests_produce ON public.produce_interests USING btree (produce_name);

CREATE INDEX idx_produce_interests_user ON public.produce_interests USING btree (user_id);

CREATE INDEX idx_product_comments_parent ON public.product_comments USING btree (parent_id);

CREATE INDEX idx_product_comments_product ON public.product_comments USING btree (product_id);

CREATE INDEX idx_product_flags_product ON public.product_flags USING btree (product_id);

CREATE UNIQUE INDEX idx_product_tax_override_unique ON public.product_tax_overrides USING btree (category_rule_id, lower(product_name)) WHERE (effective_until IS NULL);

CREATE INDEX idx_profile_audit_user ON public.profile_audit_log USING btree (user_id, changed_at DESC);

CREATE INDEX idx_profiles_ghosted ON public.profiles USING btree (id) WHERE (is_ghosted = true);

CREATE INDEX idx_provider_txn_created ON public.provider_transactions USING btree (created_at DESC);

CREATE INDEX idx_provider_txn_redemption ON public.provider_transactions USING btree (redemption_id);

CREATE INDEX idx_provider_txn_status ON public.provider_transactions USING btree (status);

CREATE INDEX idx_provider_txn_user ON public.provider_transactions USING btree (user_id);

CREATE INDEX idx_purchased_points_buckets_status ON public.purchased_points_buckets USING btree (status);

CREATE INDEX idx_purchased_points_buckets_user ON public.purchased_points_buckets USING btree (user_id);

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);

CREATE INDEX idx_redemption_queue_status ON public.redemption_queue USING btree (status) WHERE (status = 'queued'::text);

CREATE INDEX idx_sms_rate_ip ON public.sms_rate_limits USING btree (ip_address, created_at DESC);

CREATE INDEX idx_sms_rate_phone ON public.sms_rate_limits USING btree (phone_number, created_at DESC);

CREATE INDEX idx_sms_rate_user ON public.sms_rate_limits USING btree (user_id, created_at DESC);

CREATE INDEX idx_staff_members_email ON public.staff_members USING btree (email);

CREATE INDEX idx_staff_members_user_id ON public.staff_members USING btree (user_id);

CREATE INDEX idx_user_feedback_assigned ON public.user_feedback USING btree (assigned_to) WHERE (assigned_to IS NOT NULL);

CREATE INDEX idx_user_feedback_visibility ON public.user_feedback USING btree (visibility);

CREATE UNIQUE INDEX idx_user_garden_unique ON public.user_garden USING btree (user_id, produce_name);

CREATE INDEX posts_community_h3_idx ON public.posts USING btree (community_h3_index);

CREATE INDEX posts_on_behalf_of_idx ON public.posts USING btree (on_behalf_of) WHERE (on_behalf_of IS NOT NULL);

CREATE INDEX profiles_home_location_idx ON public.profiles USING gist (home_location);

CREATE INDEX profiles_nearby_communities_idx ON public.profiles USING gin (nearby_community_h3_indices);

CREATE UNIQUE INDEX redemption_merchandize_restrictions_unified_idx ON public.redemption_merchandize_restrictions USING btree (merchandize_id, scope, COALESCE(country_iso_3, ''::text), COALESCE(state_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(county_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE UNIQUE INDEX small_balance_refund_thresholds_pk_idx ON public.small_balance_refund_thresholds USING btree (COALESCE(country_iso_3, ''::text), COALESCE(state_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(county_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE UNIQUE INDEX want_to_buy_details_post_id_key ON public.want_to_buy_details USING btree (post_id);

CREATE TRIGGER trg_booth_helper_status AFTER INSERT OR UPDATE OF status ON public.booth_helpers FOR EACH ROW EXECUTE FUNCTION public.trg_booth_helper_status_notify();

CREATE TRIGGER trg_check_comment_flag_threshold AFTER INSERT ON public.comment_flags FOR EACH ROW EXECUTE FUNCTION public.check_comment_flag_threshold();

CREATE TRIGGER trg_clear_phone_verification BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.clear_phone_verification();

CREATE TRIGGER trg_compute_balance_after BEFORE INSERT ON public.point_ledger FOR EACH ROW EXECUTE FUNCTION public.compute_balance_after();

CREATE TRIGGER trg_consume_fifo_buckets AFTER INSERT ON public.point_ledger FOR EACH ROW EXECUTE FUNCTION public.consume_fifo_buckets();

CREATE TRIGGER trg_feedback_resolved_at BEFORE UPDATE ON public.user_feedback FOR EACH ROW EXECUTE FUNCTION public.set_feedback_resolved_at();

CREATE TRIGGER trg_feedback_updated_at BEFORE UPDATE ON public.user_feedback FOR EACH ROW EXECUTE FUNCTION public.update_feedback_updated_at();

CREATE TRIGGER trg_log_feedback_status_change AFTER UPDATE ON public.user_feedback FOR EACH ROW EXECUTE FUNCTION public.log_feedback_status_change();

CREATE TRIGGER trg_market_order_status_notifications AFTER UPDATE OF status ON public.market_orders FOR EACH ROW EXECUTE FUNCTION public.trg_market_order_status_notify();

CREATE TRIGGER trg_notify_delegator_on_order AFTER UPDATE ON public.orders FOR EACH ROW WHEN (((new.status = 'completed'::public.order_status) AND (old.status <> 'completed'::public.order_status))) EXECUTE FUNCTION public.notify_delegator_on_order();

CREATE TRIGGER trg_notify_delegator_on_post AFTER INSERT ON public.posts FOR EACH ROW WHEN ((new.on_behalf_of IS NOT NULL)) EXECUTE FUNCTION public.notify_delegator_on_post();

CREATE TRIGGER trg_notify_followers_new_product AFTER INSERT ON public.market_products FOR EACH ROW EXECUTE FUNCTION public.notify_followers_new_product();

CREATE TRIGGER trg_notify_market_chat AFTER INSERT ON public.order_chat_messages FOR EACH ROW EXECUTE FUNCTION public.trg_notify_market_chat_message();

CREATE TRIGGER trg_notify_new_message AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

CREATE TRIGGER trg_notify_on_delegation_revoked AFTER UPDATE ON public.delegations FOR EACH ROW EXECUTE FUNCTION public.handle_delegation_revocation();

CREATE TRIGGER trg_notify_user_on_redemption AFTER UPDATE ON public.redemptions FOR EACH ROW WHEN (((new.status = 'completed'::public.redemption_status) AND (old.status <> 'completed'::public.redemption_status))) EXECUTE FUNCTION public.notify_user_on_redemption();

CREATE TRIGGER trg_order_updates_activity AFTER INSERT OR UPDATE ON public.market_orders FOR EACH ROW EXECUTE FUNCTION public.update_last_active_on_order();

CREATE TRIGGER trg_post_flag_threshold AFTER INSERT ON public.post_flags FOR EACH ROW EXECUTE FUNCTION public.check_post_flag_threshold();

CREATE TRIGGER trg_product_added_notify AFTER INSERT ON public.market_products FOR EACH ROW WHEN ((new.is_active = true)) EXECUTE FUNCTION public.trg_product_added_notify_followers();

CREATE TRIGGER trg_product_flag_threshold AFTER INSERT ON public.product_flags FOR EACH ROW EXECUTE FUNCTION public.check_product_flag_threshold();

CREATE TRIGGER trg_profile_audit AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.trg_profile_audit();

CREATE TRIGGER trg_recompute_market_seller_rating AFTER INSERT OR UPDATE OF seller_rating ON public.market_orders FOR EACH ROW WHEN ((new.seller_rating IS NOT NULL)) EXECUTE FUNCTION public.recompute_market_seller_rating();

CREATE TRIGGER trg_recompute_seller_rating AFTER INSERT OR UPDATE OF seller_rating ON public.orders FOR EACH ROW WHEN ((new.seller_rating IS NOT NULL)) EXECUTE FUNCTION public.recompute_seller_rating();

CREATE TRIGGER trg_redemption_notifications AFTER UPDATE OF status ON public.redemptions FOR EACH ROW EXECUTE FUNCTION public.trg_redemption_notify();

CREATE TRIGGER trg_send_notification_email AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.send_notification_email();

CREATE TRIGGER trg_set_expires_at BEFORE INSERT OR UPDATE OF created_at, type ON public.posts FOR EACH ROW EXECUTE FUNCTION public.set_post_expires_at();

CREATE TRIGGER trg_set_instrument_disabled_at BEFORE UPDATE ON public.available_redemption_method_instruments FOR EACH ROW EXECUTE FUNCTION public.set_provider_disabled_at();

CREATE TRIGGER trg_settlement_status_notifications AFTER UPDATE OF status ON public.market_settlements FOR EACH ROW EXECUTE FUNCTION public.trg_settlement_status_notify();

CREATE TRIGGER trigger_chat_initiated_email AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public._notify_chat_initiated();

CREATE TRIGGER trigger_delegation_revoked_email AFTER UPDATE ON public.delegations FOR EACH ROW EXECUTE FUNCTION public._notify_delegation_revoked();

CREATE TRIGGER trigger_notify_on_delegation_revoked AFTER UPDATE ON public.delegations FOR EACH ROW EXECUTE FUNCTION public.notify_on_delegation_revoked();

CREATE TRIGGER trigger_points_event_email AFTER INSERT ON public.point_ledger FOR EACH ROW EXECUTE FUNCTION public._notify_points_event();

CREATE TRIGGER trigger_set_referral_code BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_referral_code_on_insert();

ALTER TABLE ONLY public.available_redemption_method_instruments
    ADD CONSTRAINT available_redemption_method_instruments_method_fkey FOREIGN KEY (method) REFERENCES public.available_redemption_methods(method) ON DELETE CASCADE;

ALTER TABLE ONLY public.blocked_products
    ADD CONSTRAINT blocked_products_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id);

ALTER TABLE ONLY public.blocked_products
    ADD CONSTRAINT blocked_products_country_iso_3_fkey FOREIGN KEY (country_iso_3) REFERENCES public.countries(iso_3);

ALTER TABLE ONLY public.blocked_products
    ADD CONSTRAINT blocked_products_county_id_fkey FOREIGN KEY (county_id) REFERENCES public.counties(id);

ALTER TABLE ONLY public.blocked_products
    ADD CONSTRAINT blocked_products_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);

ALTER TABLE ONLY public.booth_helpers
    ADD CONSTRAINT booth_helpers_booth_id_fkey FOREIGN KEY (booth_id) REFERENCES public.market_booths(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.booth_helpers
    ADD CONSTRAINT booth_helpers_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.campaign_rewards
    ADD CONSTRAINT campaign_rewards_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.incentive_campaigns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.campaign_zones
    ADD CONSTRAINT campaign_zones_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.incentive_campaigns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.campaign_zones
    ADD CONSTRAINT campaign_zones_community_h3_index_fkey FOREIGN KEY (community_h3_index) REFERENCES public.communities(h3_index);

ALTER TABLE ONLY public.category_restrictions
    ADD CONSTRAINT category_restrictions_category_name_fkey FOREIGN KEY (category_name) REFERENCES public.sales_categories(name) ON DELETE CASCADE;

ALTER TABLE ONLY public.category_restrictions
    ADD CONSTRAINT category_restrictions_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id);

ALTER TABLE ONLY public.category_restrictions
    ADD CONSTRAINT category_restrictions_country_iso_3_fkey FOREIGN KEY (country_iso_3) REFERENCES public.countries(iso_3);

ALTER TABLE ONLY public.category_restrictions
    ADD CONSTRAINT category_restrictions_county_id_fkey FOREIGN KEY (county_id) REFERENCES public.counties(id);

ALTER TABLE ONLY public.category_restrictions
    ADD CONSTRAINT category_restrictions_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);

ALTER TABLE ONLY public.category_tax_rules
    ADD CONSTRAINT category_tax_rules_category_name_fkey FOREIGN KEY (category_name) REFERENCES public.sales_categories(name) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_assets(id);

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);

ALTER TABLE ONLY public.comment_flags
    ADD CONSTRAINT comment_flags_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.product_comments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.comment_flags
    ADD CONSTRAINT comment_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.product_comments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.counties
    ADD CONSTRAINT counties_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.delegations
    ADD CONSTRAINT delegations_delegatee_id_fkey FOREIGN KEY (delegatee_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.delegations
    ADD CONSTRAINT delegations_delegator_id_fkey FOREIGN KEY (delegator_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.delivery_dates
    ADD CONSTRAINT delivery_dates_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.digital_receipts
    ADD CONSTRAINT digital_receipts_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE ONLY public.donation_receipts
    ADD CONSTRAINT donation_receipts_provider_transaction_id_fkey FOREIGN KEY (provider_transaction_id) REFERENCES public.provider_transactions(id);

ALTER TABLE ONLY public.donation_receipts
    ADD CONSTRAINT donation_receipts_redemption_id_fkey FOREIGN KEY (redemption_id) REFERENCES public.redemptions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_dispute_proof_media_id_fkey FOREIGN KEY (dispute_proof_media_id) REFERENCES public.media_assets(id);

ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_initiator_id_fkey FOREIGN KEY (initiator_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiment_assignments
    ADD CONSTRAINT experiment_assignments_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiment_assignments
    ADD CONSTRAINT experiment_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiment_assignments
    ADD CONSTRAINT experiment_assignments_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.experiment_variants(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experiment_events
    ADD CONSTRAINT experiment_events_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);

ALTER TABLE ONLY public.experiment_events
    ADD CONSTRAINT experiment_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.experiment_events
    ADD CONSTRAINT experiment_events_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.experiment_variants(id);

ALTER TABLE ONLY public.experiment_variants
    ADD CONSTRAINT experiment_variants_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feature_waitlist
    ADD CONSTRAINT feature_waitlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.feedback_comment_media
    ADD CONSTRAINT feedback_comment_media_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.feedback_comments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_comment_media
    ADD CONSTRAINT feedback_comment_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_comments
    ADD CONSTRAINT feedback_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_comments
    ADD CONSTRAINT feedback_comments_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.user_feedback(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_flags
    ADD CONSTRAINT feedback_flags_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.user_feedback(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_flags
    ADD CONSTRAINT feedback_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_media
    ADD CONSTRAINT feedback_media_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.user_feedback(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_media
    ADD CONSTRAINT feedback_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_status_history
    ADD CONSTRAINT feedback_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.feedback_status_history
    ADD CONSTRAINT feedback_status_history_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.user_feedback(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_votes
    ADD CONSTRAINT feedback_votes_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.user_feedback(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_votes
    ADD CONSTRAINT feedback_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT fk_accepted_refund FOREIGN KEY (accepted_refund_offer_id) REFERENCES public.refund_offers(id);

ALTER TABLE ONLY public.want_to_buy_details
    ADD CONSTRAINT fk_buy_category FOREIGN KEY (category) REFERENCES public.sales_categories(name);

ALTER TABLE ONLY public.market_products
    ADD CONSTRAINT fk_market_product_category FOREIGN KEY (category) REFERENCES public.sales_categories(name);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_order_category FOREIGN KEY (category) REFERENCES public.sales_categories(name);

ALTER TABLE ONLY public.want_to_sell_details
    ADD CONSTRAINT fk_sell_category FOREIGN KEY (category) REFERENCES public.sales_categories(name);

ALTER TABLE ONLY public.followers
    ADD CONSTRAINT followers_followed_id_fkey FOREIGN KEY (followed_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.followers
    ADD CONSTRAINT followers_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gift_card_deliveries
    ADD CONSTRAINT gift_card_deliveries_provider_transaction_id_fkey FOREIGN KEY (provider_transaction_id) REFERENCES public.provider_transactions(id);

ALTER TABLE ONLY public.gift_card_deliveries
    ADD CONSTRAINT gift_card_deliveries_redemption_id_fkey FOREIGN KEY (redemption_id) REFERENCES public.redemptions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.instrument_queuing_status
    ADD CONSTRAINT instrument_queuing_status_instrument_fkey FOREIGN KEY (instrument) REFERENCES public.available_redemption_method_instruments(instrument) ON DELETE CASCADE;

ALTER TABLE ONLY public.manual_refund_checks
    ADD CONSTRAINT manual_refund_checks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.market_booths
    ADD CONSTRAINT market_booths_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.market_followers
    ADD CONSTRAINT market_followers_booth_id_fkey FOREIGN KEY (booth_id) REFERENCES public.market_booths(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.market_followers
    ADD CONSTRAINT market_followers_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.market_holds
    ADD CONSTRAINT market_holds_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.market_ledger
    ADD CONSTRAINT market_ledger_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.market_orders(id);

ALTER TABLE ONLY public.market_ledger
    ADD CONSTRAINT market_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.market_notifications
    ADD CONSTRAINT market_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.market_orders
    ADD CONSTRAINT market_orders_booth_id_fkey FOREIGN KEY (booth_id) REFERENCES public.market_booths(id);

ALTER TABLE ONLY public.market_orders
    ADD CONSTRAINT market_orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.market_orders
    ADD CONSTRAINT market_orders_delivered_by_fkey FOREIGN KEY (delivered_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.market_orders
    ADD CONSTRAINT market_orders_hold_id_fkey FOREIGN KEY (hold_id) REFERENCES public.market_holds(id);

ALTER TABLE ONLY public.market_orders
    ADD CONSTRAINT market_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.market_products(id);

ALTER TABLE ONLY public.market_orders
    ADD CONSTRAINT market_orders_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.market_orders
    ADD CONSTRAINT market_orders_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.market_settlements(id);

ALTER TABLE ONLY public.market_products
    ADD CONSTRAINT market_products_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.market_reminders
    ADD CONSTRAINT market_reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.market_schedule_policies
    ADD CONSTRAINT market_schedule_policies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.market_settings
    ADD CONSTRAINT market_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_seller_post_id_fkey FOREIGN KEY (seller_post_id) REFERENCES public.posts(id);

ALTER TABLE ONLY public.order_chat_messages
    ADD CONSTRAINT order_chat_messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.market_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_chat_messages
    ADD CONSTRAINT order_chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.order_dispute_messages
    ADD CONSTRAINT order_dispute_messages_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.order_disputes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_dispute_messages
    ADD CONSTRAINT order_dispute_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.order_disputes
    ADD CONSTRAINT order_disputes_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.order_disputes
    ADD CONSTRAINT order_disputes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.market_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_delivery_proof_media_id_fkey FOREIGN KEY (delivery_proof_media_id) REFERENCES public.media_assets(id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id);

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_point_ledger_id_fkey FOREIGN KEY (point_ledger_id) REFERENCES public.point_ledger(id);

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.point_bucket_consumptions
    ADD CONSTRAINT point_bucket_consumptions_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES public.purchased_points_buckets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.point_bucket_consumptions
    ADD CONSTRAINT point_bucket_consumptions_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.point_ledger(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.point_ledger
    ADD CONSTRAINT point_ledger_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.incentive_campaigns(id);

ALTER TABLE ONLY public.point_ledger
    ADD CONSTRAINT point_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.post_flags
    ADD CONSTRAINT post_flags_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_flags
    ADD CONSTRAINT post_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_community_h3_index_fkey FOREIGN KEY (community_h3_index) REFERENCES public.communities(h3_index);

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_on_behalf_of_fkey FOREIGN KEY (on_behalf_of) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.produce_interests
    ADD CONSTRAINT produce_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_comments
    ADD CONSTRAINT product_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_comments
    ADD CONSTRAINT product_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.product_comments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_comments
    ADD CONSTRAINT product_comments_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.market_products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_flags
    ADD CONSTRAINT product_flags_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.market_products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_flags
    ADD CONSTRAINT product_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.product_tax_overrides
    ADD CONSTRAINT product_tax_overrides_category_rule_id_fkey FOREIGN KEY (category_rule_id) REFERENCES public.category_tax_rules(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profile_audit_log
    ADD CONSTRAINT profile_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_home_community_h3_index_fkey FOREIGN KEY (home_community_h3_index) REFERENCES public.communities(h3_index);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_invited_by_id_fkey FOREIGN KEY (invited_by_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.provider_transactions
    ADD CONSTRAINT provider_transactions_redemption_id_fkey FOREIGN KEY (redemption_id) REFERENCES public.redemptions(id);

ALTER TABLE ONLY public.provider_transactions
    ADD CONSTRAINT provider_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.purchased_points_buckets
    ADD CONSTRAINT purchased_points_buckets_payment_transaction_id_fkey FOREIGN KEY (payment_transaction_id) REFERENCES public.payment_transactions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.purchased_points_buckets
    ADD CONSTRAINT purchased_points_buckets_point_ledger_id_fkey FOREIGN KEY (point_ledger_id) REFERENCES public.point_ledger(id);

ALTER TABLE ONLY public.purchased_points_buckets
    ADD CONSTRAINT purchased_points_buckets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.redemption_merchandize_media
    ADD CONSTRAINT redemption_merchandize_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.redemption_merchandize_media
    ADD CONSTRAINT redemption_merchandize_media_merchandize_id_fkey FOREIGN KEY (merchandize_id) REFERENCES public.redemption_merchandize(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.redemption_merchandize_restrictions
    ADD CONSTRAINT redemption_merchandize_restrictions_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id);

ALTER TABLE ONLY public.redemption_merchandize_restrictions
    ADD CONSTRAINT redemption_merchandize_restrictions_country_iso_3_fkey FOREIGN KEY (country_iso_3) REFERENCES public.countries(iso_3);

ALTER TABLE ONLY public.redemption_merchandize_restrictions
    ADD CONSTRAINT redemption_merchandize_restrictions_county_id_fkey FOREIGN KEY (county_id) REFERENCES public.counties(id);

ALTER TABLE ONLY public.redemption_merchandize_restrictions
    ADD CONSTRAINT redemption_merchandize_restrictions_merchandize_id_fkey FOREIGN KEY (merchandize_id) REFERENCES public.redemption_merchandize(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.redemption_merchandize_restrictions
    ADD CONSTRAINT redemption_merchandize_restrictions_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);

ALTER TABLE ONLY public.redemption_queue
    ADD CONSTRAINT redemption_queue_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.market_settlements(id);

ALTER TABLE ONLY public.redemption_queue
    ADD CONSTRAINT redemption_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.redemptions
    ADD CONSTRAINT redemptions_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.redemption_merchandize(id);

ALTER TABLE ONLY public.redemptions
    ADD CONSTRAINT redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.refund_offers
    ADD CONSTRAINT refund_offers_escalation_id_fkey FOREIGN KEY (escalation_id) REFERENCES public.escalations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.settlement_captures
    ADD CONSTRAINT settlement_captures_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.settlement_captures
    ADD CONSTRAINT settlement_captures_hold_id_fkey FOREIGN KEY (hold_id) REFERENCES public.market_holds(id);

ALTER TABLE ONLY public.settlement_captures
    ADD CONSTRAINT settlement_captures_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.market_settlements(id);

ALTER TABLE ONLY public.small_balance_refund_thresholds
    ADD CONSTRAINT small_balance_refund_thresholds_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id);

ALTER TABLE ONLY public.small_balance_refund_thresholds
    ADD CONSTRAINT small_balance_refund_thresholds_country_iso_3_fkey FOREIGN KEY (country_iso_3) REFERENCES public.countries(iso_3);

ALTER TABLE ONLY public.small_balance_refund_thresholds
    ADD CONSTRAINT small_balance_refund_thresholds_county_id_fkey FOREIGN KEY (county_id) REFERENCES public.counties(id);

ALTER TABLE ONLY public.small_balance_refund_thresholds
    ADD CONSTRAINT small_balance_refund_thresholds_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);

ALTER TABLE ONLY public.sms_rate_limits
    ADD CONSTRAINT sms_rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_country_iso_3_fkey FOREIGN KEY (country_iso_3) REFERENCES public.countries(iso_3);

ALTER TABLE ONLY public.tax_reporting_thresholds
    ADD CONSTRAINT tax_reporting_thresholds_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.user_analytics
    ADD CONSTRAINT user_analytics_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.user_auto_redemption_config
    ADD CONSTRAINT user_auto_redemption_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.user_balances
    ADD CONSTRAINT user_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.user_feedback
    ADD CONSTRAINT user_feedback_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.user_feedback
    ADD CONSTRAINT user_feedback_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_garden
    ADD CONSTRAINT user_garden_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.user_settlements
    ADD CONSTRAINT user_settlements_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.market_settlements(id);

ALTER TABLE ONLY public.user_settlements
    ADD CONSTRAINT user_settlements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.want_to_buy_details
    ADD CONSTRAINT want_to_buy_details_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.want_to_sell_details
    ADD CONSTRAINT want_to_sell_details_delegator_id_fkey FOREIGN KEY (delegator_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.want_to_sell_details
    ADD CONSTRAINT want_to_sell_details_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.zip_codes
    ADD CONSTRAINT zip_codes_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id);

ALTER TABLE ONLY public.zip_codes
    ADD CONSTRAINT zip_codes_country_iso_3_fkey FOREIGN KEY (country_iso_3) REFERENCES public.countries(iso_3);

ALTER TABLE ONLY public.zip_codes
    ADD CONSTRAINT zip_codes_county_id_fkey FOREIGN KEY (county_id) REFERENCES public.counties(id) ON DELETE SET NULL;

CREATE POLICY "Admins can delete staff members" ON public.staff_members FOR DELETE USING (public.has_staff_role(auth.uid(), 'admin'::public.staff_role));

CREATE POLICY "Admins can insert staff members" ON public.staff_members FOR INSERT WITH CHECK (public.has_staff_role(auth.uid(), 'admin'::public.staff_role));

CREATE POLICY "Admins can manage blocked products" ON public.blocked_products TO authenticated USING (public.has_staff_role(auth.uid(), 'admin'::public.staff_role)) WITH CHECK (public.has_staff_role(auth.uid(), 'admin'::public.staff_role));

CREATE POLICY "Admins can manage categories" ON public.sales_categories TO authenticated USING (public.has_staff_role(auth.uid(), 'admin'::public.staff_role)) WITH CHECK (public.has_staff_role(auth.uid(), 'admin'::public.staff_role));

CREATE POLICY "Admins can manage category restrictions" ON public.category_restrictions TO authenticated USING (public.has_staff_role(auth.uid(), 'admin'::public.staff_role)) WITH CHECK (public.has_staff_role(auth.uid(), 'admin'::public.staff_role));

CREATE POLICY "Admins can manage country refund fees" ON public.country_refund_fees USING ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid()))));

CREATE POLICY "Admins can manage post type policies" ON public.post_type_policies TO authenticated USING (public.has_staff_role(auth.uid(), 'admin'::public.staff_role)) WITH CHECK (public.has_staff_role(auth.uid(), 'admin'::public.staff_role));

CREATE POLICY "Admins can manage product tax overrides" ON public.product_tax_overrides TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid()))));

CREATE POLICY "Admins can manage purchase limits" ON public.point_purchase_limits TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid()))));

CREATE POLICY "Admins can manage receipt footers" ON public.receipt_footers TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid()))));

CREATE POLICY "Admins can manage redemption blocks" ON public.state_redemption_method_blocks TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid()))));

CREATE POLICY "Admins can manage tax rules" ON public.category_tax_rules TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_members
  WHERE (staff_members.user_id = auth.uid()))));

CREATE POLICY "Admins can update available redemption method instruments" ON public.available_redemption_method_instruments FOR UPDATE USING (public.has_staff_role(auth.uid(), 'admin'::public.staff_role));

CREATE POLICY "Admins can update available redemption methods" ON public.available_redemption_methods FOR UPDATE USING (public.has_staff_role(auth.uid(), 'admin'::public.staff_role));

CREATE POLICY "Admins can update instrument queuing status" ON public.instrument_queuing_status FOR UPDATE USING (public.has_staff_role(auth.uid(), 'admin'::public.staff_role));

CREATE POLICY "Admins can update staff members" ON public.staff_members FOR UPDATE USING (public.has_staff_role(auth.uid(), 'admin'::public.staff_role));

CREATE POLICY "Admins can view instrument queuing status" ON public.instrument_queuing_status FOR SELECT USING (public.has_staff_role(auth.uid(), 'admin'::public.staff_role));

CREATE POLICY "Anon can read categories" ON public.sales_categories FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read counties" ON public.counties FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read product tax overrides" ON public.product_tax_overrides FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read tax rules" ON public.category_tax_rules FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read zip zones" ON public.zip_prefix_to_zone FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read zone produce" ON public.usda_zone_produce FOR SELECT TO anon USING (true);

CREATE POLICY "Anonymous can view profiles" ON public.profiles FOR SELECT TO anon USING (true);

CREATE POLICY "Anonymous users can read communities" ON public.communities FOR SELECT TO anon USING (true);

CREATE POLICY "Anyone can read blocked products" ON public.blocked_products FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read booths" ON public.market_booths FOR SELECT USING (true);

CREATE POLICY "Anyone can read categories" ON public.sales_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read category restrictions" ON public.category_restrictions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read counties" ON public.counties FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read garden catalog" ON public.garden_produce_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read product tax overrides" ON public.product_tax_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read products" ON public.market_products FOR SELECT USING (true);

CREATE POLICY "Anyone can read purchase limits" ON public.point_purchase_limits FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read receipt footers" ON public.receipt_footers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read redemption blocks" ON public.state_redemption_method_blocks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read schedule" ON public.market_schedule_policies FOR SELECT USING (true);

CREATE POLICY "Anyone can read settings" ON public.market_settings FOR SELECT USING (true);

CREATE POLICY "Anyone can read small balance thresholds" ON public.small_balance_refund_thresholds FOR SELECT USING (true);

CREATE POLICY "Anyone can read states" ON public.states FOR SELECT USING (true);

CREATE POLICY "Anyone can read tax rules" ON public.category_tax_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read visible comments" ON public.product_comments FOR SELECT USING ((NOT is_hidden));

CREATE POLICY "Anyone can read zip zones" ON public.zip_prefix_to_zone FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read zone produce" ON public.usda_zone_produce FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can see likes" ON public.comment_likes FOR SELECT USING (true);

CREATE POLICY "Anyone can view follow relationships" ON public.followers FOR SELECT USING (true);

CREATE POLICY "Anyone can view profiles for invite lookup" ON public.profiles FOR SELECT TO anon USING (true);

CREATE POLICY "Authenticated can read settlements" ON public.market_settlements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can flag content" ON public.feedback_flags FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Authenticated users can flag products" ON public.product_flags FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Authenticated users can insert communities" ON public.communities FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can like" ON public.comment_likes FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Authenticated users can post comments" ON public.product_comments FOR INSERT WITH CHECK ((auth.uid() = author_id));

CREATE POLICY "Authenticated users can read cached rates" ON public.zip_tax_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read communities" ON public.communities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update communities" ON public.communities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Author can delete own comments" ON public.product_comments FOR DELETE USING ((auth.uid() = author_id));

CREATE POLICY "Authors and admins can delete feedback" ON public.user_feedback FOR DELETE USING (((author_id = auth.uid()) OR public.has_staff_role(auth.uid(), 'admin'::public.staff_role)));

CREATE POLICY "Authors and staff can remove feedback media" ON public.feedback_media FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.user_feedback f
  WHERE ((f.id = feedback_media.feedback_id) AND ((f.author_id = auth.uid()) OR public.is_staff(auth.uid()))))));

CREATE POLICY "Authors and staff can update feedback" ON public.user_feedback FOR UPDATE USING (((author_id = auth.uid()) OR public.is_staff(auth.uid())));

CREATE POLICY "Authors can attach media to own feedback" ON public.feedback_media FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_feedback f
  WHERE ((f.id = feedback_media.feedback_id) AND (f.author_id = auth.uid())))));

CREATE POLICY "Authors can create their own posts" ON public.posts FOR INSERT TO authenticated WITH CHECK ((author_id = auth.uid()));

CREATE POLICY "Authors can delete their own posts" ON public.posts FOR DELETE TO authenticated USING ((author_id = auth.uid()));

CREATE POLICY "Authors can update their own posts" ON public.posts FOR UPDATE TO authenticated USING ((author_id = auth.uid()));

CREATE POLICY "Booth helpers can insert products" ON public.market_products FOR INSERT TO authenticated WITH CHECK ((seller_id IN ( SELECT mb.owner_id
   FROM (public.booth_helpers bh
     JOIN public.market_booths mb ON ((mb.id = bh.booth_id)))
  WHERE ((bh.helper_id = auth.uid()) AND (bh.status = 'accepted'::text)))));

CREATE POLICY "Booth helpers can update products" ON public.market_products FOR UPDATE TO authenticated USING ((seller_id IN ( SELECT mb.owner_id
   FROM (public.booth_helpers bh
     JOIN public.market_booths mb ON ((mb.id = bh.booth_id)))
  WHERE ((bh.helper_id = auth.uid()) AND (bh.status = 'accepted'::text)))));

CREATE POLICY "Booth owner can add helpers" ON public.booth_helpers FOR INSERT TO authenticated WITH CHECK ((booth_id IN ( SELECT market_booths.id
   FROM public.market_booths
  WHERE (market_booths.owner_id = auth.uid()))));

CREATE POLICY "Booth owner can delete helpers" ON public.booth_helpers FOR DELETE TO authenticated USING ((booth_id IN ( SELECT market_booths.id
   FROM public.market_booths
  WHERE (market_booths.owner_id = auth.uid()))));

CREATE POLICY "Booth parties can read helpers" ON public.booth_helpers FOR SELECT TO authenticated USING (((helper_id = auth.uid()) OR (booth_id IN ( SELECT market_booths.id
   FROM public.market_booths
  WHERE (market_booths.owner_id = auth.uid())))));

CREATE POLICY "Buy details are viewable by anonymous users" ON public.want_to_buy_details FOR SELECT TO anon USING (true);

CREATE POLICY "Buy details are viewable by authenticated users" ON public.want_to_buy_details FOR SELECT TO authenticated USING (true);

CREATE POLICY "Buyers can initiate conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK ((buyer_id = auth.uid()));

CREATE POLICY "Buyers can read own holds" ON public.market_holds FOR SELECT TO authenticated USING ((buyer_id = auth.uid()));

CREATE POLICY "Buyers can read own orders" ON public.market_orders FOR SELECT TO authenticated USING ((buyer_id = auth.uid()));

CREATE POLICY "Buyers can update their orders" ON public.market_orders FOR UPDATE TO authenticated USING ((buyer_id = auth.uid()));

CREATE POLICY "Comment authors and staff can remove media" ON public.feedback_comment_media FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.feedback_comments c
  WHERE ((c.id = feedback_comment_media.comment_id) AND ((c.author_id = auth.uid()) OR public.is_staff(auth.uid()))))));

CREATE POLICY "Comment authors can attach media" ON public.feedback_comment_media FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.feedback_comments c
  WHERE ((c.id = feedback_comment_media.comment_id) AND (c.author_id = auth.uid())))));

CREATE POLICY "Comment media readable if ticket accessible" ON public.feedback_comment_media FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.feedback_comments c
     JOIN public.user_feedback f ON ((f.id = c.feedback_id)))
  WHERE ((c.id = feedback_comment_media.comment_id) AND ((f.visibility = 'public'::public.feedback_visibility) OR (f.author_id = auth.uid()) OR public.is_staff(auth.uid()))))));

CREATE POLICY "Comments readable if ticket is accessible" ON public.feedback_comments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_feedback f
  WHERE ((f.id = feedback_comments.feedback_id) AND ((f.visibility = 'public'::public.feedback_visibility) OR (f.author_id = auth.uid()) OR public.is_staff(auth.uid()))))));

CREATE POLICY "Conversation parties can create offers" ON public.offers FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND (conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE ((conversations.buyer_id = auth.uid()) OR (conversations.seller_id = auth.uid()))))));

CREATE POLICY "Conversation parties can read" ON public.conversations FOR SELECT TO authenticated USING (((buyer_id = auth.uid()) OR (seller_id = auth.uid())));

CREATE POLICY "Conversation parties can read messages" ON public.chat_messages FOR SELECT TO authenticated USING ((conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE ((conversations.buyer_id = auth.uid()) OR (conversations.seller_id = auth.uid())))));

CREATE POLICY "Conversation parties can read offers" ON public.offers FOR SELECT TO authenticated USING ((conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE ((conversations.buyer_id = auth.uid()) OR (conversations.seller_id = auth.uid())))));

CREATE POLICY "Conversation parties can send messages" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE ((conversations.buyer_id = auth.uid()) OR (conversations.seller_id = auth.uid()))))));

CREATE POLICY "Conversation parties can update offer status" ON public.offers FOR UPDATE TO authenticated USING ((conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE ((conversations.buyer_id = auth.uid()) OR (conversations.seller_id = auth.uid())))));

CREATE POLICY "Conversation parties can update offers" ON public.offers FOR UPDATE TO authenticated USING ((conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE ((conversations.buyer_id = auth.uid()) OR (conversations.seller_id = auth.uid())))));

CREATE POLICY "Delegation parties can read" ON public.delegations FOR SELECT TO authenticated USING (((delegator_id = auth.uid()) OR (delegatee_id = auth.uid())));

CREATE POLICY "Delegation parties can update status" ON public.delegations FOR UPDATE TO authenticated USING (((delegator_id = auth.uid()) OR (delegatee_id = auth.uid())));

CREATE POLICY "Delegators can create delegations" ON public.delegations FOR INSERT TO authenticated WITH CHECK ((delegator_id = auth.uid()));

CREATE POLICY "Delegators can delete delegations" ON public.delegations FOR DELETE TO authenticated USING ((delegator_id = auth.uid()));

CREATE POLICY "Delivery dates are viewable by authenticated users" ON public.delivery_dates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.platform_fees FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable read access for all users" ON public.platform_fees FOR SELECT USING (true);

CREATE POLICY "Feedback media readable if ticket accessible" ON public.feedback_media FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_feedback f
  WHERE ((f.id = feedback_media.feedback_id) AND ((f.visibility = 'public'::public.feedback_visibility) OR (f.author_id = auth.uid()) OR public.is_staff(auth.uid()))))));

CREATE POLICY "Feedback readable based on visibility" ON public.user_feedback FOR SELECT USING (((visibility = 'public'::public.feedback_visibility) OR (author_id = auth.uid()) OR public.is_staff(auth.uid())));

CREATE POLICY "Follow relationships are publicly readable" ON public.followers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Helper or owner can update" ON public.booth_helpers FOR UPDATE TO authenticated USING (((helper_id = auth.uid()) OR (booth_id IN ( SELECT market_booths.id
   FROM public.market_booths
  WHERE (market_booths.owner_id = auth.uid())))));

CREATE POLICY "Helpers can read booth order chat" ON public.order_chat_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.market_orders o
  WHERE ((o.id = order_chat_messages.order_id) AND public.is_booth_helper(o.booth_id)))));

CREATE POLICY "Helpers can read booth orders" ON public.market_orders FOR SELECT TO authenticated USING (public.is_booth_helper(booth_id));

CREATE POLICY "Helpers can send booth order chat" ON public.order_chat_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.market_orders o
  WHERE ((o.id = order_chat_messages.order_id) AND public.is_booth_helper(o.booth_id))))));

CREATE POLICY "Helpers can update booth orders" ON public.market_orders FOR UPDATE TO authenticated USING (public.is_booth_helper(booth_id));

CREATE POLICY "Media assets are publicly readable" ON public.media_assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Media assets are readable by anonymous users" ON public.media_assets FOR SELECT TO anon USING (true);

CREATE POLICY "Order participants can read chat" ON public.order_chat_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.market_orders
  WHERE ((market_orders.id = order_chat_messages.order_id) AND ((market_orders.buyer_id = auth.uid()) OR (market_orders.seller_id = auth.uid()))))));

CREATE POLICY "Order participants can send chat" ON public.order_chat_messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.market_orders
  WHERE ((market_orders.id = order_chat_messages.order_id) AND ((market_orders.buyer_id = auth.uid()) OR (market_orders.seller_id = auth.uid())))))));

CREATE POLICY "Order participants can send dispute messages" ON public.order_dispute_messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM (public.order_disputes d
     JOIN public.market_orders o ON ((o.id = d.order_id)))
  WHERE ((d.id = order_dispute_messages.dispute_id) AND ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid())))))));

CREATE POLICY "Order participants can view dispute messages" ON public.order_dispute_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.order_disputes d
     JOIN public.market_orders o ON ((o.id = d.order_id)))
  WHERE ((d.id = order_dispute_messages.dispute_id) AND ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid()))))));

CREATE POLICY "Order participants can view disputes" ON public.order_disputes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.market_orders o
  WHERE ((o.id = order_disputes.order_id) AND ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid()))))));

CREATE POLICY "Order parties can create escalations" ON public.escalations FOR INSERT TO authenticated WITH CHECK (((initiator_id = auth.uid()) AND (order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE ((orders.buyer_id = auth.uid()) OR (orders.seller_id = auth.uid()))))));

CREATE POLICY "Order parties can create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (((buyer_id = auth.uid()) OR (seller_id = auth.uid())));

CREATE POLICY "Order parties can create refund offers" ON public.refund_offers FOR INSERT TO authenticated WITH CHECK ((escalation_id IN ( SELECT e.id
   FROM (public.escalations e
     JOIN public.orders o ON ((e.order_id = o.id)))
  WHERE ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid())))));

CREATE POLICY "Order parties can read escalations" ON public.escalations FOR SELECT TO authenticated USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE ((orders.buyer_id = auth.uid()) OR (orders.seller_id = auth.uid())))));

CREATE POLICY "Order parties can read refund offers" ON public.refund_offers FOR SELECT TO authenticated USING ((escalation_id IN ( SELECT e.id
   FROM (public.escalations e
     JOIN public.orders o ON ((e.order_id = o.id)))
  WHERE ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid())))));

CREATE POLICY "Order parties can read their orders" ON public.orders FOR SELECT TO authenticated USING (((buyer_id = auth.uid()) OR (seller_id = auth.uid())));

CREATE POLICY "Order parties can update escalations" ON public.escalations FOR UPDATE TO authenticated USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE ((orders.buyer_id = auth.uid()) OR (orders.seller_id = auth.uid())))));

CREATE POLICY "Order parties can update refund offer status" ON public.refund_offers FOR UPDATE TO authenticated USING ((escalation_id IN ( SELECT e.id
   FROM (public.escalations e
     JOIN public.orders o ON ((e.order_id = o.id)))
  WHERE ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid())))));

CREATE POLICY "Order parties can update their orders" ON public.orders FOR UPDATE TO authenticated USING (((buyer_id = auth.uid()) OR (seller_id = auth.uid())));

CREATE POLICY "Owner can delete booth" ON public.market_booths FOR DELETE USING ((auth.uid() = owner_id));

CREATE POLICY "Owner can insert booth" ON public.market_booths FOR INSERT WITH CHECK ((auth.uid() = owner_id));

CREATE POLICY "Owner can update booth" ON public.market_booths FOR UPDATE USING ((auth.uid() = owner_id));

CREATE POLICY "Owners can delete their media" ON public.media_assets FOR DELETE TO authenticated USING ((owner_id = auth.uid()));

CREATE POLICY "Owners can upload media" ON public.media_assets FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));

CREATE POLICY "Post authors can attach media" ON public.post_media FOR INSERT TO authenticated WITH CHECK ((post_id IN ( SELECT posts.id
   FROM public.posts
  WHERE (posts.author_id = auth.uid()))));

CREATE POLICY "Post authors can detach media" ON public.post_media FOR DELETE TO authenticated USING ((post_id IN ( SELECT posts.id
   FROM public.posts
  WHERE (posts.author_id = auth.uid()))));

CREATE POLICY "Post comments are readable by all authenticated users" ON public.post_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Post comments are readable by anonymous users" ON public.post_comments FOR SELECT TO anon USING (true);

CREATE POLICY "Post flags are readable by all authenticated users" ON public.post_flags FOR SELECT TO authenticated USING (true);

CREATE POLICY "Post flags are readable by anonymous users" ON public.post_flags FOR SELECT TO anon USING (true);

CREATE POLICY "Post likes are readable by all authenticated users" ON public.post_likes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Post likes are readable by anonymous users" ON public.post_likes FOR SELECT TO anon USING (true);

CREATE POLICY "Post media is readable by all authenticated users" ON public.post_media FOR SELECT TO authenticated USING (true);

CREATE POLICY "Post media is readable by anonymous users" ON public.post_media FOR SELECT TO anon USING (true);

CREATE POLICY "Post type policies are readable by all authenticated users" ON public.post_type_policies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Posts are readable by all authenticated users" ON public.posts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Posts are readable by anonymous users" ON public.posts FOR SELECT TO anon USING (true);

CREATE POLICY "Public can view available redemption method instruments" ON public.available_redemption_method_instruments FOR SELECT USING (true);

CREATE POLICY "Public can view available redemption methods" ON public.available_redemption_methods FOR SELECT USING (true);

CREATE POLICY "Public can view country refund fees" ON public.country_refund_fees FOR SELECT USING (true);

CREATE POLICY "Recipients can mark messages as delivered or read" ON public.chat_messages FOR UPDATE TO authenticated USING (((sender_id <> auth.uid()) AND (conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE ((conversations.buyer_id = auth.uid()) OR (conversations.seller_id = auth.uid())))))) WITH CHECK (((sender_id <> auth.uid()) AND (conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE ((conversations.buyer_id = auth.uid()) OR (conversations.seller_id = auth.uid()))))));

CREATE POLICY "Sell details are viewable by anonymous users" ON public.want_to_sell_details FOR SELECT TO anon USING (true);

CREATE POLICY "Sell details are viewable by authenticated users" ON public.want_to_sell_details FOR SELECT TO authenticated USING (true);

CREATE POLICY "Seller can delete comments on own products" ON public.product_comments FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.market_products
  WHERE ((market_products.id = product_comments.product_id) AND (market_products.seller_id = auth.uid())))));

CREATE POLICY "Seller can delete products" ON public.market_products FOR DELETE USING ((auth.uid() = seller_id));

CREATE POLICY "Seller can insert products" ON public.market_products FOR INSERT WITH CHECK ((auth.uid() = seller_id));

CREATE POLICY "Seller can update products" ON public.market_products FOR UPDATE USING ((auth.uid() = seller_id));

CREATE POLICY "Sellers can read orders for their products" ON public.market_orders FOR SELECT TO authenticated USING ((seller_id = auth.uid()));

CREATE POLICY "Sellers can update their orders" ON public.market_orders FOR UPDATE TO authenticated USING ((seller_id = auth.uid()));

CREATE POLICY "Service role can insert market notifications" ON public.market_notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role full access on sms_rate_limits" ON public.sms_rate_limits USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Service roles can manage counties" ON public.counties TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Staff can insert status history" ON public.feedback_status_history FOR INSERT WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can read all staff members" ON public.staff_members FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Status history readable if ticket accessible" ON public.feedback_status_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_feedback f
  WHERE ((f.id = feedback_status_history.feedback_id) AND ((f.visibility = 'public'::public.feedback_visibility) OR (f.author_id = auth.uid()) OR public.is_staff(auth.uid()))))));

CREATE POLICY "Tax thresholds readable by all" ON public.tax_reporting_thresholds FOR SELECT USING (true);

CREATE POLICY "Users and staff can delete comments" ON public.feedback_comments FOR DELETE USING (((author_id = auth.uid()) OR public.is_staff(auth.uid())));

CREATE POLICY "Users can add their own produce interests" ON public.produce_interests FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can comment on accessible tickets" ON public.feedback_comments FOR INSERT WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.user_feedback f
  WHERE ((f.id = feedback_comments.feedback_id) AND ((f.visibility = 'public'::public.feedback_visibility) OR (f.author_id = auth.uid()) OR public.is_staff(auth.uid())))))));

CREATE POLICY "Users can create feedback" ON public.user_feedback FOR INSERT WITH CHECK ((author_id = auth.uid()));

CREATE POLICY "Users can create own reminders" ON public.market_reminders FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can create their own comments" ON public.post_comments FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can delete buy details for their own posts" ON public.want_to_buy_details FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = want_to_buy_details.post_id) AND (posts.author_id = auth.uid())))));

CREATE POLICY "Users can delete delivery dates for their own posts" ON public.delivery_dates FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = delivery_dates.post_id) AND (posts.author_id = auth.uid())))));

CREATE POLICY "Users can delete own garden items" ON public.user_garden FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete own market notifications" ON public.market_notifications FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete own reminders" ON public.market_reminders FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete sell details for their own posts" ON public.want_to_sell_details FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = want_to_sell_details.post_id) AND (posts.author_id = auth.uid())))));

CREATE POLICY "Users can delete their own comments" ON public.post_comments FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can flag comments" ON public.comment_flags FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can flag posts" ON public.post_flags FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can follow booths" ON public.market_followers FOR INSERT WITH CHECK ((auth.uid() = follower_id));

CREATE POLICY "Users can follow others" ON public.followers FOR INSERT TO authenticated WITH CHECK ((follower_id = auth.uid()));

CREATE POLICY "Users can insert buy details for their own posts" ON public.want_to_buy_details FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = want_to_buy_details.post_id) AND (posts.author_id = auth.uid())))));

CREATE POLICY "Users can insert delivery dates for their own posts" ON public.delivery_dates FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = delivery_dates.post_id) AND (posts.author_id = auth.uid())))));

CREATE POLICY "Users can insert own auto-redemption config" ON public.user_auto_redemption_config FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can insert own garden items" ON public.user_garden FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can insert own point ledger entries" ON public.point_ledger FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can insert own redemptions" ON public.redemptions FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can insert sell details for their own posts" ON public.want_to_sell_details FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = want_to_sell_details.post_id) AND (posts.author_id = auth.uid())))));

CREATE POLICY "Users can join waitlist" ON public.feature_waitlist FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can like posts" ON public.post_likes FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can mark their notifications as read" ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can read own audit log" ON public.profile_audit_log FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can read own auto-redemption config" ON public.user_auto_redemption_config FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can read own balance" ON public.user_balances FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can read own bucket consumptions via bucket" ON public.point_bucket_consumptions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.purchased_points_buckets ppb
  WHERE ((ppb.id = point_bucket_consumptions.bucket_id) AND (ppb.user_id = auth.uid())))));

CREATE POLICY "Users can read own captures" ON public.settlement_captures FOR SELECT TO authenticated USING ((buyer_id = auth.uid()));

CREATE POLICY "Users can read own ledger" ON public.market_ledger FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can read own manual refund checks" ON public.manual_refund_checks FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can read own payment transactions" ON public.payment_transactions FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can read own purchased buckets" ON public.purchased_points_buckets FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can read own receipts" ON public.digital_receipts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = digital_receipts.order_id) AND ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid()))))));

CREATE POLICY "Users can read own redemption queue" ON public.redemption_queue FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can read own redemptions" ON public.redemptions FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can read own settlements" ON public.user_settlements FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can read own waitlist entries" ON public.feature_waitlist FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can read their own notifications" ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can remove own flags" ON public.comment_flags FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY "Users can remove own product flags" ON public.product_flags FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can remove own votes" ON public.feedback_votes FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY "Users can remove their own flags" ON public.post_flags FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can remove their own likes" ON public.post_likes FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can remove their own produce interests" ON public.produce_interests FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can see own flags" ON public.comment_flags FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can see own flags, staff see all" ON public.feedback_flags FOR SELECT USING (((user_id = auth.uid()) OR public.is_staff(auth.uid())));

CREATE POLICY "Users can see own product flags" ON public.product_flags FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can unflag own, staff can delete any" ON public.feedback_flags FOR DELETE USING (((user_id = auth.uid()) OR public.is_staff(auth.uid())));

CREATE POLICY "Users can unfollow" ON public.followers FOR DELETE TO authenticated USING ((follower_id = auth.uid()));

CREATE POLICY "Users can unfollow booths" ON public.market_followers FOR DELETE USING ((auth.uid() = follower_id));

CREATE POLICY "Users can unlike" ON public.comment_likes FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY "Users can update buy details for their own posts" ON public.want_to_buy_details FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = want_to_buy_details.post_id) AND (posts.author_id = auth.uid())))));

CREATE POLICY "Users can update delivery dates for their own posts" ON public.delivery_dates FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = delivery_dates.post_id) AND (posts.author_id = auth.uid())))));

CREATE POLICY "Users can update own auto-redemption config" ON public.user_auto_redemption_config FOR UPDATE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can update own comments" ON public.feedback_comments FOR UPDATE USING ((author_id = auth.uid()));

CREATE POLICY "Users can update own garden items" ON public.user_garden FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own market notifications" ON public.market_notifications FOR UPDATE USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));

CREATE POLICY "Users can update own redemptions" ON public.redemptions FOR UPDATE USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own reminders" ON public.market_reminders FOR UPDATE USING ((auth.uid() = user_id));

CREATE POLICY "Users can update sell details for their own posts" ON public.want_to_sell_details FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = want_to_sell_details.post_id) AND (posts.author_id = auth.uid())))));

CREATE POLICY "Users can update their own comments" ON public.post_comments FOR UPDATE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can update their own produce interests" ON public.produce_interests FOR UPDATE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can view all produce interests" ON public.produce_interests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can view follows" ON public.market_followers FOR SELECT USING (true);

CREATE POLICY "Users can view own garden items" ON public.user_garden FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own market notifications" ON public.market_notifications FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own point ledger entries" ON public.point_ledger FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own reminders" ON public.market_reminders FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own sms_rate_limits" ON public.sms_rate_limits FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can vote on public feedback" ON public.feedback_votes FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.user_feedback f
  WHERE ((f.id = feedback_votes.feedback_id) AND (f.visibility = 'public'::public.feedback_visibility))))));

CREATE POLICY "Users insert own events" ON public.user_analytics FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users read own events" ON public.user_analytics FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Votes are readable on public feedback" ON public.feedback_votes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_feedback f
  WHERE ((f.id = feedback_votes.feedback_id) AND (f.visibility = 'public'::public.feedback_visibility)))));

ALTER TABLE public.available_redemption_method_instruments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.available_redemption_methods ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.blocked_products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booth_helpers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.category_restrictions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.category_tax_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comment_flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.counties ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.country_refund_fees ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.delegations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.delivery_dates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.digital_receipts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.donation_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY donation_receipts_service_write ON public.donation_receipts TO service_role USING (true) WITH CHECK (true);

CREATE POLICY donation_receipts_user_read ON public.donation_receipts FOR SELECT TO authenticated USING ((redemption_id IN ( SELECT redemptions.id
   FROM public.redemptions
  WHERE (redemptions.user_id = auth.uid()))));

ALTER TABLE public.edge_function_errors ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.experiment_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.experiment_variants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feature_waitlist ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feedback_comment_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feedback_flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feedback_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feedback_status_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.garden_produce_catalog ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gift_card_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY gift_card_deliveries_service_write ON public.gift_card_deliveries TO service_role USING (true) WITH CHECK (true);

CREATE POLICY gift_card_deliveries_user_read ON public.gift_card_deliveries FOR SELECT TO authenticated USING ((redemption_id IN ( SELECT redemptions.id
   FROM public.redemptions
  WHERE (redemptions.user_id = auth.uid()))));

ALTER TABLE public.instrument_queuing_status ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.manual_refund_checks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_booths ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_followers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_holds ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_ledger ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_reminders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_schedule_policies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_settlements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_chat_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_dispute_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_disputes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_fees ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.point_bucket_consumptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.point_ledger ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.point_purchase_limits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_type_policies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.produce_interests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_tax_overrides ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.provider_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_accounts_service_role ON public.provider_accounts TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.provider_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_transactions_service_role ON public.provider_transactions TO service_role USING (true) WITH CHECK (true);

CREATE POLICY provider_transactions_user_read ON public.provider_transactions FOR SELECT TO authenticated USING ((user_id = auth.uid()));

ALTER TABLE public.purchased_points_buckets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_delete ON public.push_subscriptions FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY push_subscriptions_insert ON public.push_subscriptions FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY push_subscriptions_select ON public.push_subscriptions FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY push_subscriptions_service_all ON public.push_subscriptions USING ((auth.role() = 'service_role'::text));

CREATE POLICY push_subscriptions_update ON public.push_subscriptions FOR UPDATE USING ((auth.uid() = user_id));

ALTER TABLE public.receipt_footers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.redemption_merchandize ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.redemption_merchandize_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.redemption_merchandize_restrictions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.redemption_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.refund_offers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sales_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.settlement_captures ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.small_balance_refund_thresholds ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sms_rate_limits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.state_redemption_method_blocks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tax_reporting_thresholds ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usda_zone_produce ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_analytics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_auto_redemption_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_garden ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_settlements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.want_to_buy_details ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.want_to_sell_details ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.zip_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.zip_prefix_to_zone ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.zip_tax_cache ENABLE ROW LEVEL SECURITY;

\unrestrict bkh596GxvTPfQf4ibhTtdnHvsHhonEqFW5idjh0TTMSjgnfo4p529rZdEYfOXTy
-- ============================================================================
-- Functions from migrations not yet applied to local dev DB
-- Source: 20260317000000_ban_user_rpc.sql, 20260318500000_metrics_rpcs.sql
-- ============================================================================

-- ============================================================================
-- Staff User Management RPCs
-- Ban/unban users and search user profiles (staff-only, SECURITY DEFINER).
-- ============================================================================

-- 1. staff_ban_user — set is_banned on profiles (bypasses RLS)
CREATE OR REPLACE FUNCTION staff_ban_user(
  target_user_id UUID,
  banned BOOLEAN,
  reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_roles TEXT[];
BEGIN
  -- Check caller is staff with admin or moderator role
  SELECT roles INTO v_caller_roles
  FROM staff_members
  WHERE user_id = auth.uid();

  IF v_caller_roles IS NULL
     OR NOT (v_caller_roles && ARRAY['admin', 'moderator']) THEN
    RETURN jsonb_build_object('error', 'Unauthorized — admin or moderator role required');
  END IF;

  -- Prevent staff from banning themselves
  IF target_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'Cannot ban yourself');
  END IF;

  UPDATE profiles SET
    is_banned = banned,
    ban_reason = CASE WHEN banned THEN COALESCE(reason, 'Banned by staff') ELSE NULL END,
    banned_at = CASE WHEN banned THEN NOW() ELSE NULL END
  WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'userId', target_user_id,
    'banned', banned
  );
END;
$$;

-- 2. staff_fetch_users — paginated user search (staff-only)
CREATE OR REPLACE FUNCTION staff_fetch_users(
  search_text TEXT DEFAULT '',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 25
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entries JSONB;
  v_total BIGINT;
  v_offset INTEGER;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Total matching count
  SELECT COUNT(*) INTO v_total
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE (search_text = '' OR
         p.full_name ILIKE '%' || search_text || '%' OR
         au.email ILIKE '%' || search_text || '%');

  -- Paginated results
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'email', COALESCE(au.email, ''),
    'fullName', COALESCE(p.full_name, ''),
    'avatarUrl', p.avatar_url,
    'isBanned', COALESCE(p.is_banned, false),
    'banReason', p.ban_reason,
    'bannedAt', p.banned_at,
    'createdAt', p.created_at
  )), '[]'::jsonb) INTO v_entries
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE (search_text = '' OR
         p.full_name ILIKE '%' || search_text || '%' OR
         au.email ILIKE '%' || search_text || '%')
  ORDER BY p.created_at DESC
  LIMIT p_page_size OFFSET v_offset;

  RETURN jsonb_build_object(
    'users', v_entries,
    'totalCount', v_total
  );
END;
$$;

-- ============================================================================
-- Metrics Dashboard RPCs
-- SECURITY DEFINER functions for staff-only analytics queries.
-- Each function checks is_staff(auth.uid()) and returns JSONB.
--
-- Response shapes are aligned 1:1 with the TypeScript interfaces in
-- apps/next-metrics/lib/metrics-service.ts so the service layer can
-- pass RPC data through without transformation.
-- ============================================================================

-- ============================================================
-- 0. Add element tracking columns to user_analytics
-- ============================================================
ALTER TABLE user_analytics ADD COLUMN IF NOT EXISTS element_id TEXT;
ALTER TABLE user_analytics ADD COLUMN IF NOT EXISTS element_label TEXT;
ALTER TABLE user_analytics ADD COLUMN IF NOT EXISTS stack_trace TEXT;

CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON user_analytics(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON user_analytics(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_page ON user_analytics(page_path, created_at);

-- ============================================================
-- 1. metrics_user_growth
--    → UserGrowthData { timeSeries, cumulative, byGeo, total, newInPeriod }
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_user_growth(
  p_start DATE,
  p_end DATE,
  p_granularity TEXT DEFAULT 'daily',
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total BIGINT;
  v_new_in_period BIGINT;
  v_time_series JSONB;
  v_cumulative JSONB;
  v_by_geo JSONB;
  v_date_trunc TEXT;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_date_trunc := CASE p_granularity
    WHEN 'weekly' THEN 'week'
    WHEN 'monthly' THEN 'month'
    ELSE 'day'
  END;

  -- Total users (with geo filter)
  SELECT COUNT(*) INTO v_total
  FROM profiles p
  LEFT JOIN communities co ON co.id = p.community_id
  LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
  LEFT JOIN cities ci ON ci.id = zc.city_id
  LEFT JOIN states st ON st.id = ci.state_id
  WHERE (p_state IS NULL OR st.code = p_state)
    AND (p_city IS NULL OR ci.name ILIKE p_city)
    AND (p_zip IS NULL OR co.zip_code = p_zip);

  -- New users in range
  SELECT COUNT(*) INTO v_new_in_period
  FROM profiles p
  LEFT JOIN communities co ON co.id = p.community_id
  LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
  LEFT JOIN cities ci ON ci.id = zc.city_id
  LEFT JOIN states st ON st.id = ci.state_id
  WHERE p.created_at::date BETWEEN p_start AND p_end
    AND (p_state IS NULL OR st.code = p_state)
    AND (p_city IS NULL OR ci.name ILIKE p_city)
    AND (p_zip IS NULL OR co.zip_code = p_zip);

  -- timeSeries: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text,
    'value', t.cnt
  ) ORDER BY t.d), '[]'::jsonb) INTO v_time_series
  FROM (
    SELECT
      date_trunc(v_date_trunc, p.created_at)::date AS d,
      COUNT(*) AS cnt
    FROM profiles p
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE p.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
    GROUP BY date_trunc(v_date_trunc, p.created_at)::date
  ) t;

  -- cumulative: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text,
    'value', t.running
  ) ORDER BY t.d), '[]'::jsonb) INTO v_cumulative
  FROM (
    SELECT
      d,
      SUM(cnt) OVER (ORDER BY d) AS running
    FROM (
      SELECT
        date_trunc(v_date_trunc, p.created_at)::date AS d,
        COUNT(*) AS cnt
      FROM profiles p
      LEFT JOIN communities co ON co.id = p.community_id
      LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
      LEFT JOIN cities ci ON ci.id = zc.city_id
      LEFT JOIN states st ON st.id = ci.state_id
      WHERE p.created_at::date BETWEEN p_start AND p_end
        AND (p_state IS NULL OR st.code = p_state)
        AND (p_city IS NULL OR ci.name ILIKE p_city)
        AND (p_zip IS NULL OR co.zip_code = p_zip)
      GROUP BY date_trunc(v_date_trunc, p.created_at)::date
    ) sub
  ) t;

  -- byGeo: [{region, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'region', t.region,
    'count', t.cnt
  ) ORDER BY t.cnt DESC), '[]'::jsonb) INTO v_by_geo
  FROM (
    SELECT
      COALESCE(st.name, 'Unknown') AS region,
      COUNT(*) AS cnt
    FROM profiles p
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE p.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
    GROUP BY COALESCE(st.name, 'Unknown')
  ) t;

  RETURN jsonb_build_object(
    'timeSeries', v_time_series,
    'cumulative', v_cumulative,
    'byGeo', v_by_geo,
    'total', v_total,
    'newInPeriod', v_new_in_period
  );
END;
$$;

-- ============================================================
-- 2. metrics_sales_summary
--    → SalesSummaryData { gmvTimeSeries, orderCountTimeSeries, avgOrderValue,
--      totalGMV, totalOrders, totalTax, totalFees, fulfillmentSplit,
--      topProducts, topSellers }
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_sales_summary(
  p_start DATE,
  p_end DATE,
  p_granularity TEXT DEFAULT 'daily',
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_gmv NUMERIC;
  v_total_orders BIGINT;
  v_avg_order NUMERIC;
  v_total_tax NUMERIC;
  v_total_fees NUMERIC;
  v_gmv_series JSONB;
  v_order_series JSONB;
  v_fulfillment JSONB;
  v_top_products JSONB;
  v_top_sellers JSONB;
  v_date_trunc TEXT;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_date_trunc := CASE p_granularity
    WHEN 'weekly' THEN 'week'
    WHEN 'monthly' THEN 'month'
    ELSE 'day'
  END;

  -- KPIs
  SELECT
    COALESCE(SUM(o.total_usd), 0),
    COUNT(*),
    COALESCE(AVG(o.total_usd), 0),
    COALESCE(SUM(o.tax_usd), 0),
    COALESCE(SUM(o.platform_fee_usd), 0)
  INTO v_total_gmv, v_total_orders, v_avg_order, v_total_tax, v_total_fees
  FROM market_orders o
  JOIN profiles p ON p.id = o.buyer_id
  LEFT JOIN communities co ON co.id = p.community_id
  LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
  LEFT JOIN cities ci ON ci.id = zc.city_id
  LEFT JOIN states st ON st.id = ci.state_id
  WHERE o.status != 'cancelled'
    AND o.created_at::date BETWEEN p_start AND p_end
    AND (p_state IS NULL OR st.code = p_state)
    AND (p_city IS NULL OR ci.name ILIKE p_city)
    AND (p_zip IS NULL OR co.zip_code = p_zip);

  -- gmvTimeSeries: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'value', t.rev
  ) ORDER BY t.d), '[]'::jsonb) INTO v_gmv_series
  FROM (
    SELECT date_trunc(v_date_trunc, o.created_at)::date AS d, SUM(o.total_usd) AS rev
    FROM market_orders o
    JOIN profiles p ON p.id = o.buyer_id
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE o.status != 'cancelled' AND o.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
    GROUP BY 1
  ) t;

  -- orderCountTimeSeries: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'value', t.cnt
  ) ORDER BY t.d), '[]'::jsonb) INTO v_order_series
  FROM (
    SELECT date_trunc(v_date_trunc, o.created_at)::date AS d, COUNT(*) AS cnt
    FROM market_orders o
    JOIN profiles p ON p.id = o.buyer_id
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE o.status != 'cancelled' AND o.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
    GROUP BY 1
  ) t;

  -- fulfillmentSplit: [{type, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', t.ft, 'count', t.cnt
  )), '[]'::jsonb) INTO v_fulfillment
  FROM (
    SELECT o.fulfillment_type AS ft, COUNT(*) AS cnt
    FROM market_orders o
    WHERE o.status != 'cancelled' AND o.created_at::date BETWEEN p_start AND p_end
    GROUP BY o.fulfillment_type
  ) t;

  -- topProducts: [{name, revenue, orders}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', t.pname, 'revenue', t.rev, 'orders', t.cnt
  )), '[]'::jsonb) INTO v_top_products
  FROM (
    SELECT o.product_name AS pname, SUM(o.total_usd) AS rev, COUNT(*) AS cnt
    FROM market_orders o
    WHERE o.status != 'cancelled' AND o.created_at::date BETWEEN p_start AND p_end
    GROUP BY o.product_name ORDER BY SUM(o.total_usd) DESC LIMIT 5
  ) t;

  -- topSellers: [{name, revenue, orders}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', t.sname, 'revenue', t.rev, 'orders', t.cnt
  )), '[]'::jsonb) INTO v_top_sellers
  FROM (
    SELECT sp.full_name AS sname, SUM(o.total_usd) AS rev, COUNT(*) AS cnt
    FROM market_orders o
    JOIN profiles sp ON sp.id = o.seller_id
    WHERE o.status != 'cancelled' AND o.created_at::date BETWEEN p_start AND p_end
    GROUP BY sp.full_name ORDER BY SUM(o.total_usd) DESC LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'gmvTimeSeries', v_gmv_series,
    'orderCountTimeSeries', v_order_series,
    'avgOrderValue', ROUND(v_avg_order, 2),
    'totalGMV', v_total_gmv,
    'totalOrders', v_total_orders,
    'totalTax', v_total_tax,
    'totalFees', v_total_fees,
    'fulfillmentSplit', v_fulfillment,
    'topProducts', v_top_products,
    'topSellers', v_top_sellers
  );
END;
$$;

-- ============================================================
-- 3. metrics_payout_trends
--    → PayoutData { methodTrends, methodTotals, instrumentTotals, successRates }
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_payout_trends(
  p_start DATE,
  p_end DATE,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_method_totals JSONB;
  v_instrument_totals JSONB;
  v_method_trends JSONB;
  v_success_rates JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- methodTotals: [{method, amount, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', t.method, 'amount', t.amt, 'count', t.cnt
  )), '[]'::jsonb) INTO v_method_totals
  FROM (
    SELECT
      CASE rm.type
        WHEN 'gift_card' THEN 'Gift Cards'
        WHEN 'donation' THEN 'Charity Donation'
        ELSE 'Cash Out ($)'
      END AS method,
      SUM(r.point_cost) AS amt,
      COUNT(*) AS cnt
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    JOIN profiles p ON p.id = r.user_id
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE r.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
    GROUP BY 1
  ) t;

  -- instrumentTotals: [{method, instrument, amount, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', t.method, 'instrument', t.instrument, 'amount', t.amt, 'count', t.cnt
  )), '[]'::jsonb) INTO v_instrument_totals
  FROM (
    SELECT
      CASE rm.type
        WHEN 'gift_card' THEN 'Gift Cards'
        WHEN 'donation' THEN 'Charity Donation'
        ELSE 'Cash Out ($)'
      END AS method,
      COALESCE(rm.metadata->>'provider',
        CASE rm.type
          WHEN 'gift_card' THEN 'Gift Card Provider'
          WHEN 'donation' THEN 'Direct'
          ELSE 'Stripe Payout'
        END
      ) AS instrument,
      SUM(r.point_cost) AS amt,
      COUNT(*) AS cnt
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    JOIN profiles p ON p.id = r.user_id
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE r.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
    GROUP BY 1, 2
  ) t;

  -- methodTrends: [{date, giftcards, charity, cashout}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'giftcards', t.gc, 'charity', t.ch, 'cashout', t.co
  ) ORDER BY t.d), '[]'::jsonb) INTO v_method_trends
  FROM (
    SELECT
      r.created_at::date AS d,
      COUNT(*) FILTER (WHERE rm.type = 'gift_card') AS gc,
      COUNT(*) FILTER (WHERE rm.type = 'donation') AS ch,
      COUNT(*) FILTER (WHERE rm.type NOT IN ('gift_card', 'donation')) AS co
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    WHERE r.created_at::date BETWEEN p_start AND p_end
    GROUP BY r.created_at::date
  ) t;

  -- successRates: [{method, success, failure}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', t.method, 'success', t.succ, 'failure', t.fail
  )), '[]'::jsonb) INTO v_success_rates
  FROM (
    SELECT
      CASE rm.type
        WHEN 'gift_card' THEN 'Gift Cards'
        WHEN 'donation' THEN 'Charity Donation'
        ELSE 'Cash Out ($)'
      END AS method,
      ROUND(100.0 * COUNT(*) FILTER (WHERE r.status = 'completed') / GREATEST(COUNT(*), 1)) AS succ,
      ROUND(100.0 * COUNT(*) FILTER (WHERE r.status = 'failed') / GREATEST(COUNT(*), 1)) AS fail
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    WHERE r.created_at::date BETWEEN p_start AND p_end
    GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'methodTrends', v_method_trends,
    'methodTotals', v_method_totals,
    'instrumentTotals', v_instrument_totals,
    'successRates', v_success_rates
  );
END;
$$;

-- ============================================================
-- 4. metrics_page_analytics
--    → PageAnalyticsData { routes, dropOffDistribution, errorHotspots, sessionDurations }
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_page_analytics(
  p_start DATE,
  p_end DATE,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_routes JSONB;
  v_drop_off JSONB;
  v_session_durations JSONB;
  v_error_hotspots JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- routes: [{route, pageLoads, uniqueUsers, avgDwellTime, bounceRate, dropOffRate, errors}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'route', t.route,
    'pageLoads', t.page_loads,
    'uniqueUsers', t.unique_users,
    'avgDwellTime', 0,
    'bounceRate', t.bounce_rate,
    'dropOffRate', t.drop_off_rate,
    'errors', t.errors
  )), '[]'::jsonb) INTO v_routes
  FROM (
    WITH page_sessions AS (
      SELECT
        ua.page_path,
        ua.session_id,
        COUNT(*) AS event_count
      FROM user_analytics ua
      JOIN profiles p ON p.id = ua.user_id
      LEFT JOIN communities co ON co.id = p.community_id
      LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
      LEFT JOIN cities ci ON ci.id = zc.city_id
      LEFT JOIN states st ON st.id = ci.state_id
      WHERE ua.created_at::date BETWEEN p_start AND p_end
        AND (p_state IS NULL OR st.code = p_state)
        AND (p_city IS NULL OR ci.name ILIKE p_city)
        AND (p_zip IS NULL OR co.zip_code = p_zip)
      GROUP BY ua.page_path, ua.session_id
    ),
    last_page AS (
      SELECT DISTINCT ON (session_id) session_id, page_path AS last_path
      FROM user_analytics
      WHERE created_at::date BETWEEN p_start AND p_end
      ORDER BY session_id, created_at DESC
    )
    SELECT
      ps.page_path AS route,
      SUM(ps.event_count)::bigint AS page_loads,
      COUNT(DISTINCT ps.session_id)::bigint AS unique_users,
      ROUND(100.0 * COUNT(*) FILTER (WHERE ps.event_count = 1) / GREATEST(COUNT(*), 1))::int AS bounce_rate,
      ROUND(100.0 * COUNT(*) FILTER (WHERE lp.last_path = ps.page_path) / GREATEST(COUNT(*), 1))::int AS drop_off_rate,
      COALESCE((SELECT COUNT(*) FROM user_analytics ua2 WHERE ua2.page_path = ps.page_path AND ua2.event_type = 'error' AND ua2.created_at::date BETWEEN p_start AND p_end), 0)::bigint AS errors
    FROM page_sessions ps
    LEFT JOIN last_page lp ON lp.session_id = ps.session_id
    GROUP BY ps.page_path
    ORDER BY SUM(ps.event_count) DESC
    LIMIT 20
  ) t;

  -- dropOffDistribution: [{route, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'route', t.route, 'count', t.cnt
  )), '[]'::jsonb) INTO v_drop_off
  FROM (
    SELECT page_path AS route, COUNT(*) AS cnt
    FROM (
      SELECT DISTINCT ON (session_id) session_id, page_path
      FROM user_analytics
      WHERE created_at::date BETWEEN p_start AND p_end
      ORDER BY session_id, created_at DESC
    ) last_pages
    GROUP BY page_path
    ORDER BY COUNT(*) DESC
    LIMIT 8
  ) t;

  -- sessionDurations: [{bucket, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'bucket', t.bucket, 'count', t.cnt
  )), '[]'::jsonb) INTO v_session_durations
  FROM (
    SELECT bucket, COUNT(*) AS cnt FROM (
      SELECT
        CASE
          WHEN dur < 30 THEN '0-30s'
          WHEN dur < 60 THEN '30-60s'
          WHEN dur < 180 THEN '1-3m'
          WHEN dur < 600 THEN '3-10m'
          ELSE '10m+'
        END AS bucket
      FROM (
        SELECT session_id,
          EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) AS dur
        FROM user_analytics
        WHERE created_at::date BETWEEN p_start AND p_end
        GROUP BY session_id
      ) s
    ) b
    GROUP BY bucket
    ORDER BY MIN(CASE bucket
      WHEN '0-30s' THEN 1 WHEN '30-60s' THEN 2
      WHEN '1-3m' THEN 3 WHEN '3-10m' THEN 4 ELSE 5 END)
  ) t;

  -- errorHotspots: [{route, errorName, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'route', t.route, 'errorName', t.err_name, 'count', t.cnt
  )), '[]'::jsonb) INTO v_error_hotspots
  FROM (
    SELECT page_path AS route, event_name AS err_name, COUNT(*) AS cnt
    FROM user_analytics
    WHERE event_type = 'error'
      AND created_at::date BETWEEN p_start AND p_end
    GROUP BY page_path, event_name
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'routes', v_routes,
    'dropOffDistribution', v_drop_off,
    'sessionDurations', v_session_durations,
    'errorHotspots', v_error_hotspots
  );
END;
$$;

-- ============================================================
-- 5. metrics_marketplace_health
--    → MarketplaceHealthData { activeSellers, activeBuyers, newBooths,
--      productListings, flagActivity, avgSellerRating }
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_marketplace_health(
  p_start DATE,
  p_end DATE,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active_sellers JSONB;
  v_active_buyers JSONB;
  v_new_booths JSONB;
  v_product_active BIGINT;
  v_product_inactive BIGINT;
  v_flag_activity JSONB;
  v_avg_seller_rating NUMERIC;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- activeSellers: [{date, value}] — sellers who had an order each day
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'value', t.cnt
  ) ORDER BY t.d), '[]'::jsonb) INTO v_active_sellers
  FROM (
    SELECT o.created_at::date AS d, COUNT(DISTINCT o.seller_id) AS cnt
    FROM market_orders o
    WHERE o.created_at::date BETWEEN p_start AND p_end
    GROUP BY o.created_at::date
  ) t;

  -- activeBuyers: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'value', t.cnt
  ) ORDER BY t.d), '[]'::jsonb) INTO v_active_buyers
  FROM (
    SELECT o.created_at::date AS d, COUNT(DISTINCT o.buyer_id) AS cnt
    FROM market_orders o
    WHERE o.created_at::date BETWEEN p_start AND p_end
    GROUP BY o.created_at::date
  ) t;

  -- newBooths: [{date, value}]
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', t.d::text, 'value', t.cnt
    ) ORDER BY t.d), '[]'::jsonb) INTO v_new_booths
    FROM (
      SELECT created_at::date AS d, COUNT(*) AS cnt
      FROM market_booths
      WHERE created_at::date BETWEEN p_start AND p_end
      GROUP BY created_at::date
    ) t;
  EXCEPTION WHEN undefined_table THEN
    v_new_booths := '[]'::jsonb;
  END;

  -- productListings: {active, inactive}
  BEGIN
    SELECT COUNT(*) FILTER (WHERE is_active), COUNT(*) FILTER (WHERE NOT is_active)
    INTO v_product_active, v_product_inactive
    FROM market_products;
  EXCEPTION WHEN undefined_table THEN
    v_product_active := 0;
    v_product_inactive := 0;
  END;

  -- flagActivity: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'value', t.cnt
  ) ORDER BY t.d), '[]'::jsonb) INTO v_flag_activity
  FROM (
    SELECT created_at::date AS d, COUNT(*) AS cnt
    FROM post_flags
    WHERE created_at::date BETWEEN p_start AND p_end
    GROUP BY created_at::date
  ) t;

  -- avgSellerRating
  SELECT COALESCE(AVG(seller_rating::int), 0) INTO v_avg_seller_rating
  FROM orders
  WHERE seller_rating IS NOT NULL
    AND created_at::date BETWEEN p_start AND p_end;

  RETURN jsonb_build_object(
    'activeSellers', v_active_sellers,
    'activeBuyers', v_active_buyers,
    'newBooths', v_new_booths,
    'productListings', jsonb_build_object('active', v_product_active, 'inactive', v_product_inactive),
    'flagActivity', v_flag_activity,
    'avgSellerRating', ROUND(v_avg_seller_rating, 1)
  );
END;
$$;

-- ============================================================
-- 6. metrics_settlement_summary
--    → SettlementData { dailySummary, payoutTotals, recentSettlements }
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_settlement_summary(
  p_start DATE,
  p_end DATE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_daily JSONB;
  v_payout_totals NUMERIC;
  v_recent JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- dailySummary: [{date, captured, released, refunded}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text,
    'captured', t.captured,
    'released', t.released,
    'refunded', t.refunded
  ) ORDER BY t.d), '[]'::jsonb) INTO v_daily
  FROM (
    SELECT
      market_date AS d,
      total_captured_usd AS captured,
      total_released_usd AS released,
      total_refunds_usd AS refunded
    FROM market_settlements
    WHERE market_date BETWEEN p_start AND p_end
  ) t;

  -- payoutTotals: total released amount
  SELECT COALESCE(SUM(total_payouts_usd), 0) INTO v_payout_totals
  FROM market_settlements
  WHERE market_date BETWEEN p_start AND p_end;

  -- recentSettlements: [{date, status, orders, captured, payouts}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text,
    'status', t.status,
    'orders', t.orders,
    'captured', t.captured,
    'payouts', t.payouts
  ) ORDER BY t.d DESC), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT
      market_date AS d,
      status,
      total_orders AS orders,
      total_captured_usd AS captured,
      total_payouts_usd AS payouts
    FROM market_settlements
    WHERE market_date BETWEEN p_start AND p_end
    ORDER BY market_date DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'dailySummary', v_daily,
    'payoutTotals', v_payout_totals,
    'recentSettlements', v_recent
  );
END;
$$;

-- ============================================================
-- 7. metrics_search_logs
--    → LogSearchResult { entries: LogEntry[], totalCount }
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_search_logs(
  p_query TEXT DEFAULT '',
  p_event_type TEXT DEFAULT '',
  p_start DATE DEFAULT NULL,
  p_end DATE DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entries JSONB;
  v_total BIGINT;
  v_offset INTEGER;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Total count
  SELECT COUNT(*) INTO v_total
  FROM user_analytics ua
  JOIN profiles p ON p.id = ua.user_id
  LEFT JOIN communities co ON co.id = p.community_id
  LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
  LEFT JOIN cities ci ON ci.id = zc.city_id
  LEFT JOIN states st ON st.id = ci.state_id
  WHERE (p_query = '' OR ua.event_name ILIKE '%' || p_query || '%' OR ua.page_path ILIKE '%' || p_query || '%')
    AND (p_event_type = '' OR ua.event_type = p_event_type)
    AND (p_start IS NULL OR ua.created_at::date >= p_start)
    AND (p_end IS NULL OR ua.created_at::date <= p_end)
    AND (p_state IS NULL OR st.code = p_state)
    AND (p_city IS NULL OR ci.name ILIKE p_city)
    AND (p_zip IS NULL OR co.zip_code = p_zip);

  -- Paginated entries → matches LogEntry interface
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id::text,
    'timestamp', t.ts,
    'userId', t.user_id::text,
    'userIdShort', 'usr_' || SUBSTRING(md5(t.user_id::text), 1, 5),
    'userName', null,
    'eventType', t.event_type,
    'eventName', t.event_name,
    'pagePath', t.page_path,
    'sessionId', t.session_id,
    'txnId', t.txn_id,
    'elementId', t.element_id,
    'elementLabel', t.element_label,
    'stackTrace', t.stack_trace,
    'metadata', t.metadata
  )), '[]'::jsonb) INTO v_entries
  FROM (
    SELECT
      ua.id, ua.created_at AS ts, ua.user_id,
      ua.event_type, ua.event_name, ua.page_path,
      ua.session_id, ua.txn_id,
      ua.element_id, ua.element_label, ua.stack_trace,
      ua.metadata
    FROM user_analytics ua
    JOIN profiles p ON p.id = ua.user_id
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE (p_query = '' OR ua.event_name ILIKE '%' || p_query || '%' OR ua.page_path ILIKE '%' || p_query || '%')
      AND (p_event_type = '' OR ua.event_type = p_event_type)
      AND (p_start IS NULL OR ua.created_at::date >= p_start)
      AND (p_end IS NULL OR ua.created_at::date <= p_end)
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
    ORDER BY ua.created_at DESC
    LIMIT p_page_size OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'entries', v_entries,
    'totalCount', v_total
  );
END;
$$;

-- ============================================================
-- 8. metrics_session_timeline
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_session_timeline(
  p_session_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entries JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id::text,
    'timestamp', t.ts,
    'userId', t.user_id::text,
    'userIdShort', 'usr_' || SUBSTRING(md5(t.user_id::text), 1, 5),
    'userName', null,
    'eventType', t.event_type,
    'eventName', t.event_name,
    'pagePath', t.page_path,
    'sessionId', t.session_id,
    'txnId', t.txn_id,
    'elementId', t.element_id,
    'elementLabel', t.element_label,
    'stackTrace', t.stack_trace,
    'metadata', t.metadata
  ) ORDER BY t.ts), '[]'::jsonb) INTO v_entries
  FROM (
    SELECT
      ua.id, ua.created_at AS ts, ua.user_id,
      ua.event_type, ua.event_name, ua.page_path,
      ua.session_id, ua.txn_id,
      ua.element_id, ua.element_label, ua.stack_trace,
      ua.metadata
    FROM user_analytics ua
    WHERE ua.session_id = p_session_id
  ) t;

  RETURN v_entries;
END;
$$;

-- ============================================================
-- 9. metrics_reveal_user (PII on demand)
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_reveal_user(
  target_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile RECORD;
  v_masked_email TEXT;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = target_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Mask email: show first char + **** + @domain
  v_masked_email := SUBSTRING(v_profile.email, 1, 1)
    || '****@'
    || SPLIT_PART(v_profile.email, '@', 2);

  RETURN jsonb_build_object(
    'displayName', COALESCE(v_profile.full_name, 'User'),
    'email', v_masked_email
  );
END;
$$;

