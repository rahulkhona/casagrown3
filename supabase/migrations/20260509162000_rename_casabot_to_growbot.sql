-- Migration: Rename CasaBot to GrowBot in historical messages
-- This updates both the content mentions and the author name for the bot.

-- Update mention tags in existing user messages
UPDATE community_chat_messages 
SET content = REPLACE(content, '@CasaBot', '@GrowBot') 
WHERE content LIKE '%@CasaBot%';

-- Update the profile name for the bot identity
UPDATE profiles 
SET full_name = 'GrowBot', avatar_url = '/growbot-avatar-v3.png'
WHERE id = 'a0000000-0000-0000-0000-00000ca5ab07';
