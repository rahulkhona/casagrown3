-- ============================================================================
-- Migration: Ensure redemption methods and instruments exist
-- Safety net — re-inserts default rows if they were accidentally deleted.
-- ============================================================================

INSERT INTO available_redemption_methods (method, is_active) VALUES
  ('giftcards', true),
  ('charity', true),
  ('529c', true),
  ('cashout', true)
ON CONFLICT (method) DO NOTHING;

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
