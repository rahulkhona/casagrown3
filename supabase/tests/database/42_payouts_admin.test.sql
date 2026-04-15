BEGIN;
SELECT plan(7);

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

-- 3. Anon can call the function without crashing
SET ROLE anon;
SELECT lives_ok(
  'SELECT * FROM get_pending_payouts_admin(10, 0)',
  'Anon execution of RPC does not crash.'
);

-- 4. Authenticated non-admin can call without crashing
RESET ROLE;
-- Mock a non-admin user with payout_handle
INSERT INTO auth.users (id, email) VALUES ('99999999-9999-9999-9999-999999999999', 'testuser999@example.com') ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, full_name, email, payout_handle, payout_handle_type)
VALUES ('99999999-9999-9999-9999-999999999999', 'Test User', 'testuser999@example.com', 'testpayout@paypal.com', 'paypal')
ON CONFLICT (id) DO UPDATE SET payout_handle = 'testpayout@paypal.com', payout_handle_type = 'paypal';

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "99999999-9999-9999-9999-999999999999"}', true);

SELECT lives_ok(
  'SELECT * FROM get_pending_payouts_admin(10, 0)',
  'Authenticated non-admin execution of RPC does not crash'
);

-- 5. Verify the result type includes the new v2 columns (payout_handle, payout_handle_type, item_id)
RESET ROLE;
SELECT has_type(
  'public',
  'pending_payout_admin_result',
  'Result type pending_payout_admin_result exists.'
);

-- 6. Verify column names in the composite type
SELECT is(
  (SELECT count(*)::integer FROM information_schema.attributes
   WHERE udt_name = 'pending_payout_admin_result'
   AND attribute_name IN ('payout_handle', 'payout_handle_type', 'item_id')),
  3,
  'pending_payout_admin_result has payout_handle, payout_handle_type, and item_id columns'
);

-- 7. Verify the query with new columns executes without error
SELECT lives_ok(
  'SELECT payout_handle, payout_handle_type, item_id FROM get_pending_payouts_admin(10, 0)',
  'Selecting new v2 columns from RPC does not error'
);

SELECT * FROM finish();
ROLLBACK;

