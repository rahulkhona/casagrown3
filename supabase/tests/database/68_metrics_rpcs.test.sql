-- ============================================================================
-- pgTAP Tests: Metrics RPCs
-- Verifies that metrics_user_growth, metrics_sales_summary, and
-- metrics_marketplace_health run successfully without schema or casting crashes.
-- ============================================================================
BEGIN;
SELECT plan(14);

-- 1. Verify functions exist
SELECT has_function('public', 'metrics_user_growth', 'metrics_user_growth function exists');
SELECT has_function('public', 'metrics_sales_summary', 'metrics_sales_summary function exists');
SELECT has_function('public', 'metrics_marketplace_health', 'metrics_marketplace_health function exists');
SELECT has_function('public', 'metrics_page_analytics', 'metrics_page_analytics function exists');
SELECT has_function('public', 'metrics_wizard_dropoffs', 'metrics_wizard_dropoffs function exists');
SELECT has_function('public', 'metrics_active_wizards', 'metrics_active_wizards function exists');
SELECT has_function('public', 'purge_expired_crm_events', 'purge_expired_crm_events function exists');

-- 2. Setup a staff member to bypass auth check
INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('aa000001-0001-0001-0001-000000000999', 'metrics-staff@test.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now())
ON CONFLICT DO NOTHING;

INSERT INTO profiles (id, full_name, email, last_active_at)
VALUES
  ('aa000001-0001-0001-0001-000000000999', 'Metrics Staff', 'metrics-staff@test.com', now())
ON CONFLICT DO NOTHING;

INSERT INTO staff_members (user_id, email, granted_by)
VALUES ('aa000001-0001-0001-0001-000000000999', 'metrics-staff@test.com', 'aa000001-0001-0001-0001-000000000999')
ON CONFLICT DO NOTHING;

-- 3. Set auth context to the staff user
SET LOCAL request.jwt.claims = '{"sub":"aa000001-0001-0001-0001-000000000999","role":"authenticated","email":"metrics-staff@test.com"}';

-- 4. Call metrics_user_growth
SELECT lives_ok(
  $$SELECT metrics_user_growth(now()::date - 14, now()::date, 'daily', NULL, NULL, NULL)$$,
  'metrics_user_growth executes successfully'
);

-- 5. Call metrics_sales_summary
SELECT lives_ok(
  $$SELECT metrics_sales_summary(now()::date - 14, now()::date, 'daily', NULL, NULL, NULL)$$,
  'metrics_sales_summary executes successfully'
);

-- 6. Call metrics_marketplace_health
SELECT lives_ok(
  $$SELECT metrics_marketplace_health(now()::date - 14, now()::date, NULL, NULL, NULL)$$,
  'metrics_marketplace_health executes successfully'
);

-- 7. Call metrics_page_analytics
SELECT lives_ok(
  $$SELECT metrics_page_analytics(now()::date - 14, now()::date)$$,
  'metrics_page_analytics executes successfully'
);

-- 8. Call metrics_wizard_dropoffs
SELECT lives_ok(
  $$SELECT metrics_wizard_dropoffs(now()::date - 14, now()::date, '/create-listing'::text)$$,
  'metrics_wizard_dropoffs executes successfully'
);

-- 9. Call metrics_active_wizards
SELECT lives_ok(
  $$SELECT metrics_active_wizards(now()::date - 14, now()::date)$$,
  'metrics_active_wizards executes successfully'
);

-- 10. Call purge_expired_crm_events retention function
SELECT lives_ok(
  $$SELECT purge_expired_crm_events()$$,
  'purge_expired_crm_events retention purge function executes successfully'
);

SELECT * FROM finish();
ROLLBACK;
