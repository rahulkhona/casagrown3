-- Fix bot_reply_drafts channel CHECK constraint to include instagram and whatsapp
-- The original constraint only allowed 'dm', 'order', 'messenger'
-- but the multi-tier feature adds instagram and whatsapp auto-reply channels.

ALTER TABLE bot_reply_drafts DROP CONSTRAINT IF EXISTS bot_reply_drafts_channel_check;
ALTER TABLE bot_reply_drafts ADD CONSTRAINT bot_reply_drafts_channel_check
  CHECK (channel = ANY (ARRAY['dm', 'order', 'messenger', 'instagram', 'whatsapp']));

-- Change trigger_message_id from uuid to text.
-- WhatsApp and Instagram message IDs from Meta are strings (e.g. "wamid_HBg...")
-- not UUIDs, so this column must accept arbitrary text.
ALTER TABLE bot_reply_drafts ALTER COLUMN trigger_message_id TYPE text;
