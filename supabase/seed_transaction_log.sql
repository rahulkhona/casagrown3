-- Seed Transaction Data for Transaction Log testing
-- Uses existing seed users from seed_market_browse.sql:
--   s1=Maria, s2=Raj, s3=Wei, s4=Sofia, s5=James
--
-- Creates all transaction types: purchases, sales, CC captures,
-- platform fees, settlement credits, funds cleared, refunds,
-- redemptions (gift card, charity, cashout)

DO $$
DECLARE
  s1 UUID := '11111111-1111-1111-1111-111111111111';
  s2 UUID := '22222222-2222-2222-2222-222222222222';
  s3 UUID := '33333333-3333-3333-3333-333333333333';
  s4 UUID := '44444444-4444-4444-4444-444444444444';
  s5 UUID := '55555555-5555-5555-5555-555555555555';
  b1 UUID;
  b2 UUID;
  b4 UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
  o1 UUID; o2 UUID; o3 UUID; o4 UUID; o5 UUID; o6 UUID; o7 UUID; o8 UUID;
  stl UUID;
  h1 UUID;
BEGIN
  -- Get booth IDs
  SELECT id INTO b1 FROM market_booths WHERE owner_id = s1 LIMIT 1;
  SELECT id INTO b2 FROM market_booths WHERE owner_id = s2 LIMIT 1;
  SELECT id INTO b4 FROM market_booths WHERE owner_id = s4 LIMIT 1;

  -- Get product IDs
  SELECT id INTO p1 FROM market_products WHERE seller_id = s1 AND name = 'Heritage Tomatoes' LIMIT 1;
  SELECT id INTO p2 FROM market_products WHERE seller_id = s2 AND name = 'Meyer Lemons' LIMIT 1;
  SELECT id INTO p3 FROM market_products WHERE seller_id = s4 AND name = 'Sourdough Loaf' LIMIT 1;
  SELECT id INTO p4 FROM market_products WHERE seller_id = s1 AND name = 'Fresh Basil Bunch' LIMIT 1;

  -- ═══════════════════════════════════════════════
  -- 1. SETTLEMENT (must exist before orders reference it)
  -- ═══════════════════════════════════════════════
  stl := gen_random_uuid();
  INSERT INTO market_settlements (id, market_date, status, total_orders, total_captured_usd, total_released_usd, total_payouts_usd, total_fees_usd, total_refunds_usd, created_at)
  VALUES (stl, (now() - interval '3 days')::date, 'cleared', 5, 85.78, 17.53, 70.65, 7.85, 8.74, now() - interval '2 days');

  -- ═══════════════════════════════════════════════
  -- 2. COMPLETED MARKET ORDERS (tagged with settlement_id)
  -- ═══════════════════════════════════════════════

  -- Maria (s1) buys from Raj (s2) — Meyer Lemons
  o1 := gen_random_uuid();
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd, platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, settlement_id, created_at)
  VALUES (o1, s1, s2, b2, p2, 'Meyer Lemons', 3, 3.50, 10.50, 9.25, 0.97, 10, 1.05, 11.47, 'delivery', 'completed', stl, now() - interval '5 days');

  -- Raj (s2) buys from Maria (s1) — Heritage Tomatoes
  o2 := gen_random_uuid();
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd, platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, settlement_id, created_at)
  VALUES (o2, s2, s1, b1, p1, 'Heritage Tomatoes', 2, 5.00, 10.00, 9.25, 0.93, 10, 1.00, 10.93, 'pickup', 'completed', stl, now() - interval '5 days');

  -- Wei (s3) buys from Sofia (s4) — Sourdough Loaf
  o3 := gen_random_uuid();
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd, platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, settlement_id, created_at)
  VALUES (o3, s3, s4, b4, p3, 'Sourdough Loaf', 1, 8.00, 8.00, 9.25, 0.74, 10, 0.80, 8.74, 'delivery', 'delivered', stl, now() - interval '4 days');

  -- Sofia (s4) buys from Maria (s1) — Fresh Basil
  o4 := gen_random_uuid();
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd, platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, settlement_id, created_at)
  VALUES (o4, s4, s1, b1, p4, 'Fresh Basil Bunch', 5, 3.00, 15.00, 9.25, 1.39, 10, 1.50, 16.39, 'pickup', 'completed', stl, now() - interval '3 days');

  -- James (s5) buys from Raj (s2) — Meyer Lemons (large order)
  o5 := gen_random_uuid();
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd, platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, settlement_id, created_at)
  VALUES (o5, s5, s2, b2, p2, 'Meyer Lemons', 10, 3.50, 35.00, 9.25, 3.24, 10, 3.50, 38.24, 'delivery', 'completed', stl, now() - interval '2 days');

  -- ═══════════════════════════════════════════════
  -- 3. PENDING ORDERS (no settlement_id — show in Pending tab)
  -- ═══════════════════════════════════════════════
  o6 := gen_random_uuid();
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd, platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
  VALUES (o6, s1, s4, b4, p3, 'Sourdough Loaf', 2, 8.00, 16.00, 9.25, 1.48, 10, 1.60, 17.48, 'pickup', 'confirmed', now() - interval '6 hours');

  o7 := gen_random_uuid();
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd, platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
  VALUES (o7, s3, s1, b1, p1, 'Heritage Tomatoes', 4, 5.00, 20.00, 9.25, 1.85, 10, 2.00, 21.85, 'delivery', 'pending', now() - interval '2 hours');

  o8 := gen_random_uuid();
  INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd, platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
  VALUES (o8, s2, s4, b4, p3, 'Sourdough Loaf', 1, 8.00, 8.00, 9.25, 0.74, 10, 0.80, 8.74, 'delivery', 'confirmed', now() - interval '1 hour');

  -- ═══════════════════════════════════════════════
  -- 4. HOLDS + CAPTURES (CC charges for netting)
  -- ═══════════════════════════════════════════════
  h1 := gen_random_uuid();
  INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status, created_at)
  VALUES (h1, s1, 'pi_seed_maria_001', 'pi_seed_maria_001_secret', 2900, 1147, 'captured', now() - interval '5 days');

  INSERT INTO settlement_captures (id, settlement_id, hold_id, buyer_id, stripe_payment_intent_id, hold_amount_usd, capture_amount_usd, release_amount_usd, capture_status, created_at)
  VALUES (gen_random_uuid(), stl, h1, s1, 'pi_seed_maria_001', 29.00, 11.47, 17.53, 'captured', now() - interval '2 days');

  -- ═══════════════════════════════════════════════
  -- 5. MARKET LEDGER entries
  -- ═══════════════════════════════════════════════

  -- Platform fees (for sellers)
  INSERT INTO market_ledger (settlement_id, user_id, event_type, amount_usd, direction, balance_after, metadata, created_at) VALUES
    (stl, s1, 'fee_charged', 2.50, 'debit', 22.50, '{"description": "10% platform fee on $25.00 in sales"}'::jsonb, now() - interval '2 days'),
    (stl, s2, 'fee_charged', 4.55, 'debit', 40.95, '{"description": "10% platform fee on $45.50 in sales"}'::jsonb, now() - interval '2 days'),
    (stl, s4, 'fee_charged', 0.80, 'debit', 7.20, '{"description": "10% platform fee on $8.00 in sales"}'::jsonb, now() - interval '2 days');

  -- Settlement credits (earnings credited to sellers)
  INSERT INTO market_ledger (settlement_id, user_id, event_type, amount_usd, direction, balance_after, metadata, created_at) VALUES
    (stl, s1, 'settlement_credit', 22.50, 'credit', 22.50, '{"description": "Net earnings from settlement", "orders": 2}'::jsonb, now() - interval '2 days'),
    (stl, s2, 'settlement_credit', 40.95, 'credit', 40.95, '{"description": "Net earnings from settlement", "orders": 2}'::jsonb, now() - interval '2 days'),
    (stl, s4, 'settlement_credit', 7.20, 'credit', 7.20, '{"description": "Net earnings from settlement", "orders": 1}'::jsonb, now() - interval '2 days');

  -- Funds cleared (pending → available)
  INSERT INTO market_ledger (settlement_id, user_id, event_type, amount_usd, direction, balance_after, metadata, created_at) VALUES
    (stl, s1, 'funds_cleared', 22.50, 'credit', 22.50, '{"description": "Settlement funds available for withdrawal"}'::jsonb, now() - interval '1 day'),
    (stl, s2, 'funds_cleared', 40.95, 'credit', 40.95, '{"description": "Settlement funds available for withdrawal"}'::jsonb, now() - interval '1 day');

  -- Refund example
  INSERT INTO market_ledger (settlement_id, user_id, event_type, amount_usd, direction, balance_after, metadata, created_at) VALUES
    (stl, s3, 'refund_issued', 8.74, 'credit', 8.74, jsonb_build_object('description', 'Refund for damaged Sourdough Loaf', 'original_order_id', o3::text), now() - interval '1 day');

  -- ═══════════════════════════════════════════════
  -- 6. USER BALANCES
  -- ═══════════════════════════════════════════════
  INSERT INTO user_balances (user_id, available_usd, pending_usd, total_earned_usd, total_spent_usd, total_withdrawn_usd) VALUES
    (s1, 22.50, 17.48, 22.50, 11.47, 0),
    (s2, 40.95, 8.74, 40.95, 10.93, 0),
    (s3, 8.74, 0, 8.74, 8.74, 0),
    (s4, 7.20, 0, 7.20, 16.39, 0),
    (s5, 0, 0, 0, 38.24, 0)
  ON CONFLICT (user_id) DO UPDATE SET
    available_usd = EXCLUDED.available_usd,
    pending_usd = EXCLUDED.pending_usd,
    total_earned_usd = EXCLUDED.total_earned_usd,
    total_spent_usd = EXCLUDED.total_spent_usd;

  -- ═══════════════════════════════════════════════
  -- 7. REDEMPTIONS (gift card, charity, cashout)
  -- ═══════════════════════════════════════════════
  -- Gift card — Maria converted $10 to Amazon gift card
  INSERT INTO redemption_merchandize (id, type, name, description, point_cost, is_active)
  VALUES ('d0000000-0000-0000-0000-000000000001', 'gift_card', 'Amazon $10 Gift Card', 'Electronic gift card', 1000, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO redemptions (id, user_id, item_id, point_cost, status, metadata, created_at)
  VALUES (gen_random_uuid(), s1, 'd0000000-0000-0000-0000-000000000001', 1000, 'completed',
    '{"gift_card_url": "https://www.amazon.com/gc/redeem?code=SEED-ABCD-1234", "card_code": "SEED-ABCD-1234", "brand": "Amazon"}'::jsonb,
    now() - interval '1 day');

  -- Charity — Raj donated to GlobalGiving
  INSERT INTO redemption_merchandize (id, type, name, description, point_cost, is_active)
  VALUES ('d0000000-0000-0000-0000-000000000002', 'donation', 'Clean Water for Rural Schools', 'GlobalGiving project', 2000, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO redemptions (id, user_id, item_id, point_cost, status, metadata, created_at)
  VALUES (gen_random_uuid(), s2, 'd0000000-0000-0000-0000-000000000002', 2000, 'completed',
    '{"charity_receipt_url": "https://www.globalgiving.org/receipts/123456", "receipt_number": "GG-2026-123456", "organization": "WaterAid"}'::jsonb,
    now() - interval '12 hours');

  -- Cashout — Maria cashed out $5 via PayPal
  INSERT INTO redemption_merchandize (id, type, name, description, point_cost, is_active)
  VALUES ('d0000000-0000-0000-0000-000000000003', 'merchandize', 'PayPal Cashout', 'Cash out via PayPal', 500, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO redemptions (id, user_id, item_id, point_cost, status, metadata, created_at)
  VALUES (gen_random_uuid(), s1, 'd0000000-0000-0000-0000-000000000003', 500, 'completed',
    '{"cashout_txn_id": "PPY-2026-SEED-001", "payout_method": "PayPal", "payout_id": "maria@test.local"}'::jsonb,
    now() - interval '6 hours');

  RAISE NOTICE 'Seeded: 8 orders (5 settled, 3 pending), 1 settlement, 1 capture, 10 ledger entries, 3 redemptions, 5 balances';
END $$;
