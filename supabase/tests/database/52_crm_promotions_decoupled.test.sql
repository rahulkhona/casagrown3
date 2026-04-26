BEGIN;
SELECT plan(4);

-- 1. Insert a landing page and promotion
INSERT INTO crm_landing_pages (id, title, slug, is_active)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Canonical LP', 'test-canonical', true);

INSERT INTO crm_promotions (id, name, landing_page_id, max_enrollees, current_enrollees, enrollment_deadline, allow_existing_users)
VALUES ('22222222-2222-2222-2222-222222222222', 'Test Promo', '11111111-1111-1111-1111-111111111111', 100, 0, now() + interval '1 month', true);

-- 2. Test RPC falls back correctly
SELECT results_eq(
  $$ SELECT (crm_get_landing_page_promotion('test-canonical'))->>'id' $$,
  $$ VALUES ('22222222-2222-2222-2222-222222222222'::text) $$,
  'RPC returns the most recent promotion for a slug when no ID provided'
);

-- 3. Test RPC targets correctly
SELECT results_eq(
  $$ SELECT (crm_get_landing_page_promotion('test-canonical', '22222222-2222-2222-2222-222222222222'))->>'id' $$,
  $$ VALUES ('22222222-2222-2222-2222-222222222222'::text) $$,
  'RPC returns specific promotion when ID is provided'
);

-- 4. Test Deletion Orphaning (ON DELETE SET NULL)
DELETE FROM crm_landing_pages WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT landing_page_id FROM crm_promotions WHERE id = '22222222-2222-2222-2222-222222222222'),
  NULL,
  'Deleting landing page sets promotion landing_page_id to NULL (Orphaned safely)'
);

SELECT is(
  (SELECT count(*)::int FROM crm_promotions WHERE id = '22222222-2222-2222-2222-222222222222'),
  1,
  'Promotion record is preserved after landing page deletion'
);

SELECT * FROM finish();
ROLLBACK;
