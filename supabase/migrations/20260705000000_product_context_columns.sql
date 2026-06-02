-- Migration: Add last_product_id to conversation tables
-- This tracks which product a buyer was looking at when they initiated a conversation,
-- enabling the bot to answer product-specific questions intelligently.

-- ig_conversations: add last_product_id
ALTER TABLE ig_conversations
  ADD COLUMN IF NOT EXISTS last_product_id UUID REFERENCES market_products(id) ON DELETE SET NULL;

-- wa_conversations: add last_product_id
ALTER TABLE wa_conversations
  ADD COLUMN IF NOT EXISTS last_product_id UUID REFERENCES market_products(id) ON DELETE SET NULL;

-- messenger_conversations already has last_product_id from migration 20260525000000
-- but verify it exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messenger_conversations' AND column_name = 'last_product_id'
  ) THEN
    ALTER TABLE messenger_conversations
      ADD COLUMN last_product_id UUID REFERENCES market_products(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN messenger_conversations.last_product_id IS 'Product the buyer was viewing when they initiated this conversation (from referral data)';
COMMENT ON COLUMN ig_conversations.last_product_id IS 'Product the buyer was viewing when they initiated this conversation (from referral data)';
COMMENT ON COLUMN wa_conversations.last_product_id IS 'Product the buyer was viewing when they initiated this conversation (from referral data)';
