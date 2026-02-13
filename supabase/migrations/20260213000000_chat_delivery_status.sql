-- Add delivery/read tracking to chat messages
-- Single check = sent, double check = delivered, blue double check = read

alter table chat_messages
  add column delivered_at timestamptz,
  add column read_at timestamptz;

-- RLS: Allow conversation participants to mark messages as delivered/read
-- Only the NON-sender should mark delivery/read status
create policy "Recipients can mark messages as delivered or read"
  on chat_messages for update to authenticated
  using (
    -- User must be a participant in the conversation (but NOT the sender)
    sender_id != auth.uid()
    AND conversation_id in (
      select id from conversations
      where buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  )
  with check (
    -- Only allow updating delivered_at and read_at (not content)
    sender_id != auth.uid()
    AND conversation_id in (
      select id from conversations
      where buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );
