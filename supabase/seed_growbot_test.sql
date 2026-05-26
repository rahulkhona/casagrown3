-- =============================================================================
-- GrowBot Test Seed Data
-- Enables manual testing of GrowBot auto-reply in DM, Messenger, and order
-- detail chats. Also seeds Facebook connection and auto-post data.
-- Run after main seed.sql: psql -f supabase/seed_growbot_test.sql
-- =============================================================================

-- ── 1. Ensure seller@test is Pro with active subscription ──
INSERT INTO seller_subscriptions (
  user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
  plan, status, current_period_start, current_period_end
)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'cus_test_growbot_seller',
  'sub_test_growbot_seller',
  'price_test_pro_monthly',
  'pro', 'active',
  now() - interval '15 days',
  now() + interval '15 days'
)
ON CONFLICT (user_id) DO UPDATE SET
  plan = 'pro',
  status = 'active',
  current_period_start = now() - interval '15 days',
  current_period_end = now() + interval '15 days';

UPDATE profiles SET is_pro = true WHERE id = 'a1111111-1111-1111-1111-111111111111';

-- ── 2. Enable GrowBot on seller's default booth ──
-- Use bot_reply_mode + bot_reply_delay_minutes (copilot, instant reply for testing)
UPDATE market_booths SET
  bot_reply_mode = 'copilot',
  bot_reply_delay_minutes = 0,
  bot_instructions = 'You are GrowBot for Willow Glen Farm Stand. We grow organic heirloom peppers, sweet corn, and fresh eggs. Local delivery within 5 miles. Pickup at Saturday farmers market 8 AM - 1 PM.'
WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' AND is_default = true;

-- ── 3. Create DM conversation between buyer and seller ──
INSERT INTO market_conversations (
  id, participant_a, participant_b, last_message_at
)
VALUES (
  'dd000000-0000-0000-0000-000000000001',
  'b2222222-2222-2222-2222-222222222222', -- buyer
  'a1111111-1111-1111-1111-111111111111', -- seller
  now() - interval '10 minutes'
)
ON CONFLICT (participant_a, participant_b) DO UPDATE SET
  last_message_at = now() - interval '10 minutes';

-- Seed some DM messages for conversation history
INSERT INTO market_chat_messages (conversation_id, sender_id, content, created_at) VALUES
  ('dd000000-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222',
   'Hi! Do you have any organic tomatoes available this week?',
   now() - interval '9 minutes'),
  ('dd000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111',
   '🤖 Yes! We have Heirloom Tomatoes in stock. You can order at our booth.',
   now() - interval '8 minutes'),
  ('dd000000-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222',
   'Do you deliver to 95125?',
   now() - interval '5 minutes'),
  ('dd000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111',
   '🤖 Yes, we deliver within 10 miles of Willow Glen! Visit our booth to place a delivery order.',
   now() - interval '4 minutes')
ON CONFLICT DO NOTHING;

-- ── 4. Create orders for order chat testing ──

-- Order in "delivered" status (buyer can confirm/dispute, seller sees bot suggestions)
DO $$
DECLARE
  v_booth_id UUID;
  v_product_id UUID;
BEGIN
  SELECT id INTO v_booth_id FROM market_booths
    WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1;
  SELECT id INTO v_product_id FROM market_products
    WHERE seller_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;

  IF v_booth_id IS NOT NULL AND v_product_id IS NOT NULL THEN
    -- Delivered order with order chat messages
    INSERT INTO market_orders (
      id, buyer_id, seller_id, booth_id, product_id, product_name,
      quantity, unit_price_usd, subtotal_usd, total_usd,
      fulfillment_type, status, platform_fee_pct, platform_fee_usd,
      tax_rate_pct, tax_amount_usd, delivered_at,
      auto_complete_at
    ) VALUES (
      '00000000-0000-0000-0000-0000000ff001',
      'b2222222-2222-2222-2222-222222222222',
      'a1111111-1111-1111-1111-111111111111',
      v_booth_id, v_product_id, 'GrowBot Test Tomatoes',
      3, 5.00, 15.00, 15.00,
      'delivery', 'delivered', 10, 1.50,
      0, 0, now() - interval '2 hours',
      now() + interval '22 hours'
    )
    ON CONFLICT (id) DO UPDATE SET status = 'delivered',
      delivered_at = now() - interval '2 hours',
      auto_complete_at = now() + interval '22 hours';

    -- Order chat messages
    INSERT INTO order_chat_messages (order_id, sender_id, content, created_at) VALUES
      ('00000000-0000-0000-0000-0000000ff001', 'b2222222-2222-2222-2222-222222222222',
       'Hi, I received my tomatoes but one looks bruised. Is that normal for heirloom variety?',
       now() - interval '1 hour')
    ON CONFLICT DO NOTHING;

    -- Disputed order for escalation testing
    INSERT INTO market_orders (
      id, buyer_id, seller_id, booth_id, product_id, product_name,
      quantity, unit_price_usd, subtotal_usd, total_usd,
      fulfillment_type, status, platform_fee_pct, platform_fee_usd,
      tax_rate_pct, tax_amount_usd, delivered_at
    ) VALUES (
      '00000000-0000-0000-0000-0000000ff002',
      'b2222222-2222-2222-2222-222222222222',
      'a1111111-1111-1111-1111-111111111111',
      v_booth_id, v_product_id, 'GrowBot Test Peppers',
      2, 8.00, 16.00, 16.00,
      'pickup', 'escalated', 10, 1.60,
      0, 0, now() - interval '3 days'
    )
    ON CONFLICT (id) DO UPDATE SET status = 'escalated';

    -- Create dispute for the escalated order
    INSERT INTO order_disputes (
      id, order_id, initiated_by, reason, dispute_type, status
    ) VALUES (
      'dd000000-0000-0000-0000-000000000099',
      '00000000-0000-0000-0000-0000000ff002',
      'b2222222-2222-2222-2222-222222222222',
      'Peppers were wilted and not fresh',
      'poor_quality', 'open'
    )
    ON CONFLICT (id) DO NOTHING;

    -- Dispute messages
    INSERT INTO order_dispute_messages (dispute_id, sender_id, body, created_at) VALUES
      ('dd000000-0000-0000-0000-000000000099', 'b2222222-2222-2222-2222-222222222222',
       'The peppers looked fine at pickup but when I got home they were wilted inside.',
       now() - interval '2 days')
    ON CONFLICT DO NOTHING;

    -- Order chat on the disputed order
    INSERT INTO order_chat_messages (order_id, sender_id, content, created_at) VALUES
      ('00000000-0000-0000-0000-0000000ff002', 'b2222222-2222-2222-2222-222222222222',
       'Can you help with a refund for these peppers?',
       now() - interval '2 days')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ── 5. Facebook Connection with Auto-Post Opt-In ──
INSERT INTO seller_fb_connections (
  id, user_id, fb_access_token, fb_token_expires_at,
  fb_page_id, fb_page_name, fb_page_access_token, status,
  auto_sync_enabled, auto_post_enabled, casagrown_post_enabled
) VALUES (
  'fb000000-0000-0000-0000-0000000c0f01',
  'a1111111-1111-1111-1111-111111111111',
  'mock_user_token_sam', now() + interval '60 days',
  'mock_page_id_sam', 'Willow Glen Farm Stand', 'mock_page_token_sam',
  'connected', true, true, true
) ON CONFLICT (user_id) DO UPDATE SET
  status = 'connected', auto_post_enabled = true, casagrown_post_enabled = true;

-- ── 6. Messenger Conversations ──
-- Messenger conversation from a Facebook user
INSERT INTO messenger_conversations (id, fb_sender_id, seller_id, last_message_at, message_count, matched_booth_id)
VALUES (
  'ee000000-0000-0000-0000-0000000e5001',
  'fb_user_12345',
  'a1111111-1111-1111-1111-111111111111',
  now() - interval '30 minutes',
  4,
  (SELECT id FROM market_booths WHERE owner_id = 'a1111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1)
) ON CONFLICT (id) DO NOTHING;

INSERT INTO messenger_messages (id, conversation_id, role, content, created_at) VALUES
  ('ef000000-0000-0000-0000-0000000e5101', 'ee000000-0000-0000-0000-0000000e5001',
   'user', 'Hi! I saw your farm stand on Facebook. Do you have sweet corn?',
   now() - interval '35 minutes'),
  ('ef000000-0000-0000-0000-0000000e5102', 'ee000000-0000-0000-0000-0000000e5001',
   'bot', '🤖 Welcome! Yes, we have sweet corn — $3/ear or $8 for 4 ears. Super fresh!',
   now() - interval '34 minutes'),
  ('ef000000-0000-0000-0000-0000000e5103', 'ee000000-0000-0000-0000-0000000e5001',
   'user', 'How do I order? Can I get 8 ears delivered?',
   now() - interval '30 minutes'),
  ('ef000000-0000-0000-0000-0000000e5104', 'ee000000-0000-0000-0000-0000000e5001',
   'bot', '🤖 You can order on our CasaGrown booth page. We deliver within 5 miles! 🌽',
   now() - interval '29 minutes')
ON CONFLICT (id) DO NOTHING;

-- Second messenger (unanswered)
INSERT INTO messenger_conversations (id, fb_sender_id, seller_id, last_message_at, message_count)
VALUES ('ee000000-0000-0000-0000-0000000e5002', 'fb_user_67890',
  'a1111111-1111-1111-1111-111111111111', now() - interval '3 minutes', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO messenger_messages (id, conversation_id, role, content, created_at) VALUES
  ('ef000000-0000-0000-0000-0000000e5105', 'ee000000-0000-0000-0000-0000000e5002',
   'user', 'Do you have organic tomatoes? Need some for dinner tonight.',
   now() - interval '3 minutes')
ON CONFLICT (id) DO NOTHING;

-- ── 7. Auto-Post Log entry (for testing) ──
INSERT INTO fb_auto_post_log (user_id, target, product_id, fb_post_id, message)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'seller_page',
  (SELECT id FROM market_products WHERE seller_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1),
  'mock_fb_post_123',
  '🌱 Fresh today! Heirloom Peppers — $4.50. Grown locally with love!'
) ON CONFLICT DO NOTHING;

-- ── 8. Summary ──
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════';
  RAISE NOTICE 'GrowBot Test Data Seeded!';
  RAISE NOTICE 'Login: seller@test.local / TestPassword123!';
  RAISE NOTICE '';
  RAISE NOTICE 'Channels ready for testing:';
  RAISE NOTICE '  📱 DM: /messages (conversation with Beth Buyer)';
  RAISE NOTICE '  📘 Messenger: /messages (2 FB conversations)';
  RAISE NOTICE '  🛒 Orders: /orders (delivered + escalated orders)';
  RAISE NOTICE '  📣 Auto-post: enabled on seller FB connection';
  RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;
