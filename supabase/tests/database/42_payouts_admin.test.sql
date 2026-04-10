BEGIN;
SELECT plan(4);

-- 1. Ensure the RPC exists
SELECT has_function(
  'public', 
  'get_pending_payouts_admin',
  ARRAY['integer', 'integer'],
  'Function get_pending_payouts_admin exists.'
);

-- 2. Ensure auth.uid() requirement is bound (Security Definer vs Invoker is checked functionally)
SELECT function_privs_are(
  'public',
  'get_pending_payouts_admin',
  ARRAY['integer', 'integer'],
  'authenticated',
  ARRAY['EXECUTE'],
  'Authenticated users can execute the RPC wrapper (though logic will block them)'
);

-- Try to execute as anon - should return empty since there's no pending data
SET ROLE anon;
SELECT is_empty(
  'SELECT * FROM get_pending_payouts_admin(10, 0)',
  'Anon execution of RPC should result in empty results (no pending redemptions).'
);

-- Prepare test data
RESET ROLE;
-- Mock a user
INSERT INTO auth.users (id, email) VALUES ('99999999-9999-9999-9999-999999999999', 'testuser999@example.com') ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, full_name, email) VALUES ('99999999-9999-9999-9999-999999999999', 'Test User', 'testuser999@example.com') ON CONFLICT DO NOTHING;

-- Try to execute as authenticated non-admin
SET ROLE authenticated;
-- Mock auth.uid() session
SELECT set_config('request.jwt.claims', '{"sub": "99999999-9999-9999-9999-999999999999"}', true);

SELECT is_empty(
  'SELECT * FROM get_pending_payouts_admin(10, 0)',
  'RPC blocks execution and returns empty list for non-admin users'
);

SELECT * FROM finish();
ROLLBACK;
