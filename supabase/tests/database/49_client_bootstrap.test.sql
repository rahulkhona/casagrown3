-- =============================================================================
-- pgTAP: get_client_bootstrap RPC
-- Tests: guest mode, authenticated mode, badge counts, last_active stamp
-- =============================================================================
BEGIN;
SELECT plan(8);

-- ── 1. Guest mode (NULL user) returns market config only ──
SELECT lives_ok(
  $$SELECT public.get_client_bootstrap(NULL)$$,
  'bootstrap with NULL user does not error'
);

SELECT is(
  (public.get_client_bootstrap(NULL))->>'profile',
  NULL,
  'guest bootstrap returns NULL profile'
);

SELECT is(
  (public.get_client_bootstrap(NULL))->'market_config' IS NOT NULL,
  true,
  'guest bootstrap includes market_config'
);

SELECT is(
  (public.get_client_bootstrap(NULL))->>'badges',
  NULL,
  'guest bootstrap returns NULL badges'
);

-- ── 2. Authenticated mode ──
-- Create a test user
INSERT INTO auth.users (id, email, role, instance_id)
VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'bootstrap-test@test.com', 'authenticated', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, avatar_url, is_banned, tos_accepted_at, profile_completed_at)
VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'bootstrap-test@test.com', 'Bootstrap Tester', 'https://img.test/av.jpg', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = 'Bootstrap Tester', avatar_url = 'https://img.test/av.jpg';

SELECT is(
  (public.get_client_bootstrap('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'))->'profile'->>'full_name',
  'Bootstrap Tester',
  'authenticated bootstrap returns profile full_name'
);

SELECT is(
  ((public.get_client_bootstrap('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'))->'profile'->>'is_banned')::boolean,
  false,
  'authenticated bootstrap returns is_banned = false'
);

-- ── 3. Badges are present ──
SELECT is(
  (public.get_client_bootstrap('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'))->'badges' IS NOT NULL,
  true,
  'authenticated bootstrap includes badges object'
);

-- ── 4. last_active_at side effect ──
-- Clear it first
UPDATE public.profiles SET last_active_at = NULL WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

SELECT public.get_client_bootstrap('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

SELECT is(
  (SELECT last_active_at IS NOT NULL FROM public.profiles WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  true,
  'bootstrap stamps last_active_at'
);

-- Cleanup
DELETE FROM public.profiles WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
DELETE FROM auth.users WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

SELECT * FROM finish();
ROLLBACK;
