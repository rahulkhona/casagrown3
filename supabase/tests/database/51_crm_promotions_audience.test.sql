BEGIN;

SELECT plan(10);

-- Clean up ONLY test data if it already exists from a previous run
DELETE FROM auth.users WHERE email IN ('valid_user@gmail.com', 'test@example.com');
DELETE FROM profiles WHERE email IN ('valid_user@gmail.com', 'test@example.com');
DELETE FROM crm_leads WHERE email IN ('valid_lead@yahoo.com', 'valid_user@gmail.com', 'user@test.com');

-- Setup test data
-- 1. Valid user
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000001', 'valid_user@gmail.com');
UPDATE profiles SET email = 'valid_user@gmail.com', full_name = 'Valid User' WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- 2. Valid lead with DIFFERENT email
INSERT INTO crm_leads (name, email, status) VALUES ('Valid Lead', 'valid_lead@yahoo.com', 'new');

-- 3. Lead with SAME email as user (should be deduped out)
INSERT INTO crm_leads (name, email, status) VALUES ('Dup Lead', 'valid_user@gmail.com', 'new');

-- 4. User with @example.com
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000002', 'test@example.com');
UPDATE profiles SET email = 'test@example.com', full_name = 'Example User' WHERE id = 'a0000000-0000-0000-0000-000000000002';

-- 5. Lead with @test.com
INSERT INTO crm_leads (name, email, status) VALUES ('Test Lead', 'user@test.com', 'new');

-- 6. Dummy Promotion and Landing Page for RLS testing
INSERT INTO crm_landing_pages (id, slug, title, is_active)
VALUES ('e0000000-0000-0000-0000-000000000001', 'test-slug', 'Test Page', true);

INSERT INTO crm_promotions (id, name, enrollment_deadline, max_enrollees, landing_page_id) 
VALUES ('c0000000-0000-0000-0000-000000000001', 'Test Promo', now() + interval '1 day', 100, 'e0000000-0000-0000-0000-000000000001');

INSERT INTO crm_campaigns (id, name, channel, status, promotion_id)
VALUES ('d0000000-0000-0000-0000-000000000001', 'Test Campaign', 'email', 'draft', 'c0000000-0000-0000-0000-000000000001');


-- Run tests
SELECT results_eq(
    $$ SELECT count(*)::INT FROM crm_audience_valid_leads_and_users() WHERE email IN ('valid_user@gmail.com', 'valid_lead@yahoo.com', 'test@example.com', 'user@test.com') $$,
    ARRAY[2::INT],
    'Audience should return exactly 2 rows (1 user, 1 distinct lead)'
);

SELECT results_eq(
    $$ SELECT recipient_type FROM crm_audience_valid_leads_and_users() WHERE email = 'valid_user@gmail.com' $$,
    ARRAY['user'::TEXT],
    'Deduped email must resolve to the user record'
);

SELECT results_eq(
    $$ SELECT count(*)::INT FROM crm_audience_valid_leads_and_users() WHERE email = 'valid_user@gmail.com' $$,
    ARRAY[1::INT],
    'Deduped email must only appear once'
);

SELECT results_eq(
    $$ SELECT recipient_type FROM crm_audience_valid_leads_and_users() WHERE email = 'valid_lead@yahoo.com' $$,
    ARRAY['lead'::TEXT],
    'Distinct lead should resolve to the lead record'
);

SELECT results_eq(
    $$ SELECT count(*)::INT FROM crm_audience_valid_leads_and_users() WHERE email LIKE '%@example.com' $$,
    ARRAY[0::INT],
    'Example domains should be filtered out'
);

SELECT results_eq(
    $$ SELECT count(*)::INT FROM crm_audience_valid_leads_and_users() WHERE email LIKE '%@test.com' $$,
    ARRAY[0::INT],
    'Test domains should be filtered out'
);

SELECT results_eq(
    $$ SELECT count(*)::INT FROM crm_audience_valid_leads_and_users() WHERE email IS NULL $$,
    ARRAY[0::INT],
    'Null emails should be filtered out'
);

-- ==========================================
-- Security & RLS Tests
-- ==========================================

-- Switch to anon role to test public access
SET LOCAL ROLE anon;

SELECT results_eq(
    $$ SELECT count(*)::INT FROM crm_campaigns $$,
    ARRAY[0::INT],
    'Anon must be completely blocked by RLS from reading sensitive crm_campaigns'
);

SELECT lives_ok(
    $$ SELECT crm_get_landing_page_promotion('test-slug') $$,
    'Anon can securely execute the RPC to get public promo data without RLS blocking'
);

SELECT results_eq(
    $$ SELECT (crm_get_landing_page_promotion('test-slug'))->>'name' $$,
    ARRAY['Test Promo'::TEXT],
    'RPC should expose the promotion name correctly to anon'
);

-- Reset role
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
