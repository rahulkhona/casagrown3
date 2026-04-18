BEGIN;
SELECT plan(11);

SELECT has_index('market_conversations', 'idx_market_conversations_participant_a', 'market_conversations needs btree index on participant_a for RLS optimization');
SELECT has_index('market_conversations', 'idx_market_conversations_participant_b', 'market_conversations needs btree index on participant_b for RLS optimization');
SELECT has_index('market_chat_messages', 'idx_market_chat_msg_conv_created_desc', 'market_chat_messages needs btree index on conversation_id for RLS nested loop optimization');

-- Setup test users
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'dm1@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'dm2@test.com')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, email, full_name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'dm1@test.com', 'DM User 1'),
  ('22222222-2222-2222-2222-222222222222', 'dm2@test.com', 'DM User 2')
ON CONFLICT DO NOTHING;

-- 1. Conversation Init RLS Validate
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

SELECT lives_ok(
  $$ INSERT INTO market_conversations (id, participant_a, participant_b) VALUES ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') $$,
  'User 1 can create a direct message conversation'
);

SELECT lives_ok(
  $$ INSERT INTO market_chat_messages (conversation_id, sender_id, content) VALUES ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Hello neighbor!') $$,
  'User 1 can successfully send a message'
);

-- 2. Validate Trigger Synchronization Updates Unread Count B
SELECT set_config('role', 'postgres', true);
SELECT results_eq(
  $$ SELECT unread_count_b FROM market_conversations WHERE id = 'c1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES (1) $$,
  'Sending a message automatically increments unread count for the recipient'
);

-- 3. Execute Block RLS Validations
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);

SELECT lives_ok(
  $$ INSERT INTO market_blocks (blocker_id, blocked_id) VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111') $$,
  'User 2 explicitly blocks User 1 successfully'
);

SELECT set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

SELECT throws_ok(
  $$ INSERT INTO market_chat_messages (conversation_id, sender_id, content) VALUES ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Blocked message!') $$,
  'new row violates row-level security policy for table "market_chat_messages"',
  'Messages are actively blocked by RLS if the sender is currently blocked'
);

-- 4. Unblocks
SELECT results_eq(
  $$ SELECT COUNT(*)::int FROM market_chat_messages WHERE conversation_id = 'c1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES (1::int) $$,
  'User 1 can still read old messages despite being blocked moving forward'
);

-- 5. Creating New Conversation fails if blocked
SELECT throws_ok(
  $$ INSERT INTO market_conversations (participant_a, participant_b) VALUES ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') $$,
  'new row violates row-level security policy for table "market_conversations"',
  'User 1 cannot instantiate a new alternative conversation container if blocked'
);

-- 6. User 2 can unblock and receive messages
SELECT set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
SELECT lives_ok(
  $$ DELETE FROM market_blocks WHERE blocker_id = '22222222-2222-2222-2222-222222222222' $$,
  'User 2 can unblock'
);

SELECT set_config('role', 'postgres', true);
ROLLBACK;
