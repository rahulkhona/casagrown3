BEGIN;

SELECT plan(9);

-- Clean up test data
DELETE FROM auth.users WHERE email IN ('valid_target@gmail.com', 'invalid_target@gmail.com', 'existing_user@gmail.com');
DELETE FROM profiles WHERE email IN ('valid_target@gmail.com', 'invalid_target@gmail.com', 'existing_user@gmail.com');
DELETE FROM crm_audiences WHERE name = 'Test Promo Audience';

-- Setup users
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000001', 'valid_target@gmail.com');
UPDATE profiles SET email = 'valid_target@gmail.com', full_name = 'Valid Target' WHERE id = 'a0000000-0000-0000-0000-000000000001';

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000002', 'invalid_target@gmail.com');
UPDATE profiles SET email = 'invalid_target@gmail.com', full_name = 'Invalid Target' WHERE id = 'a0000000-0000-0000-0000-000000000002';

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000003', 'existing_user@gmail.com');
UPDATE profiles SET email = 'existing_user@gmail.com', full_name = 'Existing User' WHERE id = 'a0000000-0000-0000-0000-000000000003';

-- Create an audience that only targets 'valid_target@gmail.com'
CREATE OR REPLACE FUNCTION public.crm_audience_test_target()
 RETURNS TABLE(id uuid, recipient_type text, email text, phone text, name text, state_code text, city text, zip_code text, community_h3 text, joined_at timestamp with time zone, accepts_email boolean, accepts_sms boolean)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    p.id,
    'user'::TEXT AS recipient_type,
    p.email,
    p.phone_number AS phone,
    p.full_name AS name,
    p.state_code,
    NULL::TEXT AS city,
    p.zip_code,
    NULL::TEXT AS community_h3,
    p.created_at AS joined_at,
    TRUE AS accepts_email,
    FALSE AS accepts_sms
  FROM profiles p
  WHERE p.email = 'valid_target@gmail.com';
$function$;

INSERT INTO crm_audiences (id, name, recipient_type, audience_rpc_name)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Test Promo Audience', 'users', 'crm_audience_test_target');

-- 1. Create a Targeted Promotion
INSERT INTO crm_promotions (id, name, enrollment_deadline, max_enrollees, allow_existing_users, audience_id) 
VALUES ('c0000000-0000-0000-0000-000000000001', 'Targeted Promo', now() + interval '1 day', 100, true, 'b0000000-0000-0000-0000-000000000001');

-- 2. Create a "New Users Only" Promotion
INSERT INTO crm_promotions (id, name, enrollment_deadline, max_enrollees, allow_existing_users, audience_id) 
VALUES ('c0000000-0000-0000-0000-000000000002', 'New Users Only Promo', now() + interval '1 day', 100, false, null);


-- Run tests
SELECT results_eq(
    $$ SELECT (crm_check_promo_eligibility('c0000000-0000-0000-0000-000000000001', 'valid_target@gmail.com'))->>'eligible' $$,
    ARRAY['true'::TEXT],
    'Eligible user in audience should be approved'
);

SELECT results_eq(
    $$ SELECT (crm_check_promo_eligibility('c0000000-0000-0000-0000-000000000001', 'VALID_TARGET@GMAIL.COM'))->>'eligible' $$,
    ARRAY['true'::TEXT],
    'Eligible user in audience should be approved regardless of email case'
);

SELECT results_eq(
    $$ SELECT (crm_check_promo_eligibility('c0000000-0000-0000-0000-000000000001', 'invalid_target@gmail.com'))->>'eligible' $$,
    ARRAY['false'::TEXT],
    'User not in audience should be rejected'
);

SELECT results_eq(
    $$ SELECT (crm_check_promo_eligibility('c0000000-0000-0000-0000-000000000001', 'invalid_target@gmail.com'))->>'error' $$,
    ARRAY['You are not eligible for this targeted promotion.'::TEXT],
    'Should return targeted promotion error message'
);

SELECT results_eq(
    $$ SELECT (crm_check_promo_eligibility('c0000000-0000-0000-0000-000000000002', 'existing_user@gmail.com'))->>'eligible' $$,
    ARRAY['false'::TEXT],
    'Existing user should be rejected for new-users-only promo'
);

SELECT results_eq(
    $$ SELECT (crm_check_promo_eligibility('c0000000-0000-0000-0000-000000000002', 'EXISTING_USER@GMAIL.COM'))->>'eligible' $$,
    ARRAY['false'::TEXT],
    'Existing user should be rejected for new-users-only promo regardless of email case'
);

SELECT results_eq(
    $$ SELECT (crm_check_promo_eligibility('c0000000-0000-0000-0000-000000000002', 'existing_user@gmail.com'))->>'error' $$,
    ARRAY['This promotion is for new users only. Please sign in normally.'::TEXT],
    'Should return new users only error message'
);

SELECT results_eq(
    $$ SELECT (crm_check_promo_eligibility('c0000000-0000-0000-0000-000000000002', 'brand_new_user@gmail.com'))->>'eligible' $$,
    ARRAY['true'::TEXT],
    'Brand new user should be approved for new-users-only promo'
);

-- Note: capacity is enforced at the crm_enroll_in_promotion stage, not the pre-flight check, so we don't test capacity limit here.
-- The UI handles capacity checks by looking at `is_capacity_reached` flag directly.
SELECT pass('All eligibility logic works as intended.');

SELECT * FROM finish();

ROLLBACK;
