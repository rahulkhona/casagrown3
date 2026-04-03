-- ===========================================================================
-- pgTAP test: Auto-Payout Eligible Users RPC
-- Tests the 3 trigger conditions: threshold, $500 AML cap, 90-day sweep
-- ===========================================================================
BEGIN;
SELECT plan(10);

-- ── Setup ──────────────────────────────────────────────────────────────
-- User 1: Auto-payout enabled, balance at threshold
INSERT INTO auth.users (id, email, instance_id, aud, role, created_at, updated_at)
VALUES
  ('ff000000-0000-0000-0000-000000000c01', 'threshold@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('ff000000-0000-0000-0000-000000000c02', 'amlcap@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('ff000000-0000-0000-0000-000000000c03', 'inactive@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('ff000000-0000-0000-0000-000000000c04', 'zero@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('ff000000-0000-0000-0000-000000000c05', 'charity@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, last_active_at, payout_handle, payout_handle_type, payout_verified)
VALUES
  ('ff000000-0000-0000-0000-000000000c01', 'threshold@test.local', 'Threshold User', now(), NULL, NULL, false),
  ('ff000000-0000-0000-0000-000000000c02', 'amlcap@test.local', 'AML Cap User', now(), NULL, NULL, false),
  ('ff000000-0000-0000-0000-000000000c03', 'inactive@test.local', 'Inactive User', now() - INTERVAL '100 days', NULL, NULL, false),
  ('ff000000-0000-0000-0000-000000000c04', 'zero@test.local', 'Zero Balance', now(), NULL, NULL, false),
  ('ff000000-0000-0000-0000-000000000c05', 'charity@test.local', 'Charity User', now(), NULL, NULL, false)
ON CONFLICT (id) DO UPDATE SET
  last_active_at = EXCLUDED.last_active_at,
  payout_handle = EXCLUDED.payout_handle;

-- Set up balances
INSERT INTO user_balances (user_id, available_usd, pending_usd)
VALUES
  ('ff000000-0000-0000-0000-000000000c01', 60.00, 0),   -- Above $50 threshold
  ('ff000000-0000-0000-0000-000000000c02', 550.00, 0),   -- Above $500 AML cap
  ('ff000000-0000-0000-0000-000000000c03', 25.00, 0),    -- Inactive 100 days, >$0
  ('ff000000-0000-0000-0000-000000000c04', 0.00, 0),     -- Zero balance
  ('ff000000-0000-0000-0000-000000000c05', 75.00, 0)     -- Charity auto-payout
ON CONFLICT (user_id) DO UPDATE SET
  available_usd = EXCLUDED.available_usd,
  pending_usd = EXCLUDED.pending_usd;

-- Auto-payout config: user 1 at $50 threshold (gift card)
INSERT INTO user_auto_redemption_config (user_id, enabled, method, threshold_usd, gift_card_brand)
VALUES
  ('ff000000-0000-0000-0000-000000000c01', true, 'giftcards', 50.00, 'Amazon'),
  ('ff000000-0000-0000-0000-000000000c05', true, 'charity', 50.00, NULL)
ON CONFLICT (user_id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  method = EXCLUDED.method,
  threshold_usd = EXCLUDED.threshold_usd,
  gift_card_brand = EXCLUDED.gift_card_brand;

-- Set charity for user 5
UPDATE user_auto_redemption_config
SET charity_project_id = '12345', charity_project_name = 'Test Charity Project'
WHERE user_id = 'ff000000-0000-0000-0000-000000000c05';

-- No config for user 2 (AML), user 3 (inactive), user 4 (zero)

-- ═══════════════════════════════════════════════════════════════════════
-- TESTS
-- ═══════════════════════════════════════════════════════════════════════

-- (1) Threshold user is eligible with trigger_reason='threshold'
SELECT ok(
  EXISTS(
    SELECT 1 FROM get_auto_payout_eligible_users()
    WHERE user_id = 'ff000000-0000-0000-0000-000000000c01'
      AND trigger_reason = 'threshold'
  ),
  '(1) User at threshold eligible with trigger_reason=threshold'
);

-- (2) AML cap user is eligible with trigger_reason='aml_cap'
SELECT ok(
  EXISTS(
    SELECT 1 FROM get_auto_payout_eligible_users()
    WHERE user_id = 'ff000000-0000-0000-0000-000000000c02'
      AND trigger_reason = 'aml_cap'
  ),
  '(2) User at $500+ eligible with trigger_reason=aml_cap'
);

-- (3) Inactive user is eligible with trigger_reason='inactivity_sweep'
SELECT ok(
  EXISTS(
    SELECT 1 FROM get_auto_payout_eligible_users()
    WHERE user_id = 'ff000000-0000-0000-0000-000000000c03'
      AND trigger_reason = 'inactivity_sweep'
  ),
  '(3) User inactive 100 days with balance eligible with trigger_reason=inactivity_sweep'
);

-- (4) Zero balance user is NOT eligible
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM get_auto_payout_eligible_users()
    WHERE user_id = 'ff000000-0000-0000-0000-000000000c04'
  ),
  '(4) Zero balance user is NOT eligible'
);

-- (5) AML cap defaults to giftcards method
SELECT ok(
  (SELECT payout_method FROM get_auto_payout_eligible_users()
   WHERE user_id = 'ff000000-0000-0000-0000-000000000c02') = 'giftcards',
  '(5) AML cap user defaults to giftcards method'
);

-- (6) Sweep user defaults to giftcards method
SELECT ok(
  (SELECT payout_method FROM get_auto_payout_eligible_users()
   WHERE user_id = 'ff000000-0000-0000-0000-000000000c03') = 'giftcards',
  '(6) Sweep user defaults to giftcards method'
);

-- (7) Threshold user NOT duplicated in AML results (balance < $500)
SELECT ok(
  (SELECT count(*) FROM get_auto_payout_eligible_users()
   WHERE user_id = 'ff000000-0000-0000-0000-000000000c01') = 1,
  '(7) Threshold user appears exactly once (not duplicated in AML/sweep)'
);

-- (8) Threshold user uses their configured gift card brand
SELECT ok(
  (SELECT gift_card_brand FROM get_auto_payout_eligible_users()
   WHERE user_id = 'ff000000-0000-0000-0000-000000000c01') = 'Amazon',
  '(8) Threshold user gets configured gift card brand (Amazon)'
);

-- (9) Charity auto-payout includes charity_project_id
SELECT ok(
  (SELECT charity_project_id FROM get_auto_payout_eligible_users()
   WHERE user_id = 'ff000000-0000-0000-0000-000000000c05') = '12345',
  '(9) Charity auto-payout includes charity_project_id'
);

-- (10) Charity auto-payout uses charity method
SELECT ok(
  (SELECT payout_method FROM get_auto_payout_eligible_users()
   WHERE user_id = 'ff000000-0000-0000-0000-000000000c05') = 'charity',
  '(10) Charity auto-payout uses charity method'
);

SELECT * FROM finish();
ROLLBACK;
