-- Increase community chat content limit from 2000 → 5000 characters
-- to allow CasaBot Gemini responses (recipes, gardening advice) to post fully
-- without hitting the CHECK constraint and silently failing.

ALTER TABLE public.community_chat_messages
  DROP CONSTRAINT IF EXISTS community_chat_messages_content_check;

ALTER TABLE public.community_chat_messages
  ADD CONSTRAINT community_chat_messages_content_check
  CHECK (char_length(content) >= 1 AND char_length(content) <= 5000);
