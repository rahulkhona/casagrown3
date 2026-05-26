-- =============================================================================
-- Migration: Add RLS Policies for Messenger conversations and messages
-- Allows authenticated sellers to view/update their own Messenger threads and messages.
-- =============================================================================

-- 1. Policies for messenger_conversations
CREATE POLICY "Sellers can view their own messenger conversations" 
  ON messenger_conversations
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can update their own messenger conversations" 
  ON messenger_conversations
  FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = seller_id);

-- 2. Policies for messenger_messages
CREATE POLICY "Sellers can view messages in their messenger conversations" 
  ON messenger_messages
  FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM messenger_conversations c
      WHERE c.id = messenger_messages.conversation_id AND c.seller_id = auth.uid()
    )
  );

CREATE POLICY "Sellers can insert messages in their messenger conversations" 
  ON messenger_messages
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM messenger_conversations c
      WHERE c.id = messenger_messages.conversation_id AND c.seller_id = auth.uid()
    )
  );
