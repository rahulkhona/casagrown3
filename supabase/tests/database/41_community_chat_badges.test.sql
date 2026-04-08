BEGIN;

-- Plan the tests
SELECT plan(4);

-- 1. Test update_profile_last_seen
SELECT has_function('public', 'update_profile_last_seen', 'update_profile_last_seen function exists');

-- Test calling it updates the profile (assuming we are signed in, but pgTAP runs as postgres)
-- We will mock an auth context
SET local role authenticated;
SET local request.jwt.claims = '{"sub": "a1111111-1111-1111-1111-111111111111"}';

-- Call the function
SELECT results_eq(
    'SELECT update_profile_last_seen()',
    ARRAY[true],
    'update_profile_last_seen returns true on success'
);

-- Test unread count logic
SELECT has_function('public', 'get_my_community_unread_count', 'get_my_community_unread_count function exists');

-- The unread count should return a valid bigint. 
-- Since we just updated last_seen to NOW() above, the count of messages strictly greater than LAST_SEEN should be 0.
SELECT results_eq(
    'SELECT get_my_community_unread_count()',
    ARRAY[0::bigint],
    'get_my_community_unread_count returns 0 immediately after last_seen is updated'
);

SELECT * FROM finish();
ROLLBACK;
