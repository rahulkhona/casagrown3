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

-- Try to execute as anon - should fail or return empty due to missing auth.uid()
SET ROLE anon;
PREPARE exec_anon AS SELECT * FROM get_pending_payouts_admin(10, 0);
SELECT throws_ok(
  'exec_anon',
  NULL,
  NULL,
  'Anon execution of RPC should result in empty results or exception.'
);

-- Prepare test data
RESET ROLE;
-- Mock a user
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000042', 'testuser@example.com');
INSERT INTO profiles (id, full_name, email) VALUES ('00000000-0000-0000-0000-000000000042', 'Test User', 'testuser@example.com');

-- Try to execute as authenticated non-admin
SET ROLE authenticated;
-- Mock auth.uid() session
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000042"}', true);

SELECT is_empty(
  'SELECT * FROM get_pending_payouts_admin(10, 0)',
  'RPC blocks execution and returns empty list for non-admin users'
);

SELECT * FROM finish();
ROLLBACK;
