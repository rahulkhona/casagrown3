-- RLS Policies for Shared/Transactional Tables
-- Principle: Two-party data is readable/writable only by the involved parties.
-- Followers and notifications have their own specific access patterns.

-- ============================================================
-- CONVERSATIONS (buyer + seller)
-- ============================================================
alter table conversations enable row level security;

create policy "Conversation parties can read"
  on conversations for select to authenticated
  using (buyer_id = auth.uid() OR seller_id = auth.uid());

create policy "Buyers can initiate conversations"
  on conversations for insert to authenticated
  with check (buyer_id = auth.uid());

-- No update/delete — conversations are immutable once created

-- ============================================================
-- CHAT MESSAGES (via conversation membership)
-- ============================================================
alter table chat_messages enable row level security;

create policy "Conversation parties can read messages"
  on chat_messages for select to authenticated
  using (
    conversation_id in (
      select id from conversations
      where buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

create policy "Conversation parties can send messages"
  on chat_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    AND conversation_id in (
      select id from conversations
      where buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

-- No update — messages are immutable once sent
-- No delete — messages cannot be deleted (audit trail)

-- ============================================================
-- OFFERS (via conversation membership)
-- ============================================================
alter table offers enable row level security;

create policy "Conversation parties can read offers"
  on offers for select to authenticated
  using (
    conversation_id in (
      select id from conversations
      where buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

create policy "Conversation parties can create offers"
  on offers for insert to authenticated
  with check (
    created_by = auth.uid()
    AND conversation_id in (
      select id from conversations
      where buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

create policy "Conversation parties can update offer status"
  on offers for update to authenticated
  using (
    conversation_id in (
      select id from conversations
      where buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

-- ============================================================
-- ORDERS (buyer + seller)
-- ============================================================
alter table orders enable row level security;

create policy "Order parties can read their orders"
  on orders for select to authenticated
  using (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Orders are created from accepted offers (either party)
create policy "Order parties can create orders"
  on orders for insert to authenticated
  with check (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Both parties can update (buyer rates seller, seller updates delivery, etc.)
create policy "Order parties can update their orders"
  on orders for update to authenticated
  using (buyer_id = auth.uid() OR seller_id = auth.uid());

-- ============================================================
-- ESCALATIONS (via order parties)
-- ============================================================
alter table escalations enable row level security;

create policy "Order parties can read escalations"
  on escalations for select to authenticated
  using (
    order_id in (
      select id from orders
      where buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

create policy "Order parties can create escalations"
  on escalations for insert to authenticated
  with check (
    initiator_id = auth.uid()
    AND order_id in (
      select id from orders
      where buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

create policy "Order parties can update escalations"
  on escalations for update to authenticated
  using (
    order_id in (
      select id from orders
      where buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

-- ============================================================
-- REFUND OFFERS (via escalation → order parties)
-- ============================================================
alter table refund_offers enable row level security;

create policy "Order parties can read refund offers"
  on refund_offers for select to authenticated
  using (
    escalation_id in (
      select e.id from escalations e
      join orders o on e.order_id = o.id
      where o.buyer_id = auth.uid() OR o.seller_id = auth.uid()
    )
  );

create policy "Order parties can create refund offers"
  on refund_offers for insert to authenticated
  with check (
    escalation_id in (
      select e.id from escalations e
      join orders o on e.order_id = o.id
      where o.buyer_id = auth.uid() OR o.seller_id = auth.uid()
    )
  );

create policy "Order parties can update refund offer status"
  on refund_offers for update to authenticated
  using (
    escalation_id in (
      select e.id from escalations e
      join orders o on e.order_id = o.id
      where o.buyer_id = auth.uid() OR o.seller_id = auth.uid()
    )
  );

-- ============================================================
-- DELEGATIONS (delegator + delegatee)
-- ============================================================
alter table delegations enable row level security;

create policy "Delegation parties can read"
  on delegations for select to authenticated
  using (delegator_id = auth.uid() OR delegatee_id = auth.uid());

create policy "Delegators can create delegations"
  on delegations for insert to authenticated
  with check (delegator_id = auth.uid());

-- Either party can update status (delegatee accepts/rejects, delegator revokes)
create policy "Delegation parties can update status"
  on delegations for update to authenticated
  using (delegator_id = auth.uid() OR delegatee_id = auth.uid());

-- Only delegator can revoke/delete
create policy "Delegators can delete delegations"
  on delegations for delete to authenticated
  using (delegator_id = auth.uid());

-- ============================================================
-- FOLLOWERS (public reads, follower-controlled writes)
-- ============================================================
alter table followers enable row level security;

create policy "Follow relationships are publicly readable"
  on followers for select to authenticated
  using (true);

create policy "Users can follow others"
  on followers for insert to authenticated
  with check (follower_id = auth.uid());

create policy "Users can unfollow"
  on followers for delete to authenticated
  using (follower_id = auth.uid());

-- ============================================================
-- NOTIFICATIONS (private to recipient)
-- ============================================================
alter table notifications enable row level security;

create policy "Users can read their own notifications"
  on notifications for select to authenticated
  using (user_id = auth.uid());

-- Notifications are created by the system (service role), not by users.
-- Users can only update (mark as read).
create policy "Users can mark their notifications as read"
  on notifications for update to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- MEDIA ASSETS (owner-controlled)
-- ============================================================
alter table media_assets enable row level security;

-- Media is readable by anyone authenticated (referenced by posts, messages, etc.)
create policy "Media assets are publicly readable"
  on media_assets for select to authenticated
  using (true);

create policy "Owners can upload media"
  on media_assets for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Owners can delete their media"
  on media_assets for delete to authenticated
  using (owner_id = auth.uid());
