-- ============================================================================
-- Migration: Ensure redemption methods and instruments exist
-- Safety net — re-inserts default rows if they were accidentally deleted.
-- ============================================================================

INSERT INTO available_redemption_methods (method, is_active) VALUES
  ('giftcards', true),
  ('charity', false),
  ('529c', false),
  ('cashout', true)
ON CONFLICT (method) DO NOTHING;

-- Disable unsupported methods (in case they were already inserted as active)
UPDATE available_redemption_methods SET is_active = false WHERE method IN ('529c', 'charity');

INSERT INTO available_redemption_method_instruments (method, instrument, is_active) VALUES
  ('giftcards', 'tremendous', true),
  ('giftcards', 'reloadly', true),
  ('charity', 'globalgiving', true),
  ('cashout', 'paypal', true)
ON CONFLICT (instrument) DO NOTHING;

INSERT INTO instrument_queuing_status (instrument, is_queuing) VALUES
  ('tremendous', false),
  ('reloadly', false),
  ('globalgiving', false),
  ('paypal', false)
ON CONFLICT (instrument) DO NOTHING;
