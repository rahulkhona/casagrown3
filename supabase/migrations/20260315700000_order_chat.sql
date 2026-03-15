-- Order Chat: messages between buyer and seller on an order
-- Uses Supabase Realtime for live updates, presence, and typing indicators

CREATE TABLE order_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES market_orders(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_order_chat_order ON order_chat_messages(order_id, created_at);

ALTER TABLE order_chat_messages ENABLE ROW LEVEL SECURITY;

-- Only buyer or seller on the order can read messages
CREATE POLICY "Order participants can read chat"
  ON order_chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM market_orders
      WHERE id = order_chat_messages.order_id
        AND (buyer_id = auth.uid() OR seller_id = auth.uid())
    )
  );

-- Only buyer or seller on the order can send messages
CREATE POLICY "Order participants can send chat"
  ON order_chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM market_orders
      WHERE id = order_chat_messages.order_id
        AND (buyer_id = auth.uid() OR seller_id = auth.uid())
    )
  );

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE order_chat_messages;
