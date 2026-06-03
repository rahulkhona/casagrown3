-- Marketing Seed Data for Play Store Screenshots
-- Completely safe, fake, and high-quality profiles and products.

-- Clean up previous marketing test data
DELETE FROM public.market_schedule_policies;

-- Delete user analytics referencing profiles by email or UUID
DELETE FROM public.user_analytics WHERE user_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR user_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333', 'f4444444-4444-4444-4444-444444444444');

-- Delete orders referencing profiles by email or UUID
DELETE FROM public.orders WHERE buyer_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR seller_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR buyer_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333') OR seller_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333');

-- Delete offers referencing profiles by email or UUID
DELETE FROM public.offers WHERE created_by IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR created_by IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333');

-- Delete chat messages referencing profiles by email or UUID
DELETE FROM public.chat_messages WHERE sender_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR sender_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333', 'f4444444-4444-4444-4444-444444444444');

-- Delete conversations referencing profiles by email or UUID
DELETE FROM public.conversations WHERE buyer_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR seller_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR buyer_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333') OR seller_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333');

-- Delete ledger entries referencing profiles by email or UUID
DELETE FROM public.market_ledger WHERE user_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR user_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333', 'f4444444-4444-4444-4444-444444444444');

-- Delete user balances referencing profiles by email or UUID
DELETE FROM public.user_balances WHERE user_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR user_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333', 'f4444444-4444-4444-4444-444444444444');

-- Delete market orders referencing profiles by email or UUID
DELETE FROM public.market_orders WHERE buyer_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR seller_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR buyer_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333') OR seller_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333');

-- Delete market chat messages referencing profiles by email or UUID
DELETE FROM public.market_chat_messages WHERE sender_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR sender_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333');

-- Delete market conversations referencing profiles by email or UUID
DELETE FROM public.market_conversations WHERE participant_a IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR participant_b IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR participant_a IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333') OR participant_b IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333');

-- Delete post comments referencing profiles by email or UUID
DELETE FROM public.post_comments WHERE user_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR user_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333');

-- Delete posts referencing profiles by email or UUID
DELETE FROM public.posts WHERE author_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR author_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333', 'f4444444-4444-4444-4444-444444444444');

-- Delete market products referencing profiles by email or UUID
DELETE FROM market_products WHERE seller_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR seller_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333');

-- Delete market booths referencing profiles by email or UUID
DELETE FROM market_booths WHERE owner_id IN (
  SELECT id FROM public.profiles WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR owner_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333');

-- Delete profiles
DELETE FROM public.profiles WHERE id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333', 'f4444444-4444-4444-4444-444444444444') OR email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local');

-- Delete from auth.identities
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local')
) OR user_id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333', 'f4444444-4444-4444-4444-444444444444');

-- Delete from auth.users
DELETE FROM auth.users WHERE id IN ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333', 'f4444444-4444-4444-4444-444444444444') OR email IN ('sarah.m@marketing.local', 'david.c@marketing.local', 'elena.r@marketing.local', 'michael.w@marketing.local');

-- 1. Create Auth Users
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES 
('f1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sarah.m@marketing.local', '$2a$06$FbG0qaw0v4J3GOm/y5tduulnL0cYxDpju9ZoHH9mNJW.GgeaC.xve', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Sarah Jenkins"}', now(), now(), '', '', '', ''),
('f2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'david.c@marketing.local', '$2a$06$FbG0qaw0v4J3GOm/y5tduulnL0cYxDpju9ZoHH9mNJW.GgeaC.xve', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"David Chen"}', now(), now(), '', '', '', ''),
('f3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'elena.r@marketing.local', '$2a$06$FbG0qaw0v4J3GOm/y5tduulnL0cYxDpju9ZoHH9mNJW.GgeaC.xve', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Elena Rodriguez"}', now(), now(), '', '', '', ''),
('f4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'michael.w@marketing.local', '$2a$06$FbG0qaw0v4J3GOm/y5tduulnL0cYxDpju9ZoHH9mNJW.GgeaC.xve', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Michael Wong"}', now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- 2. Create Profiles
INSERT INTO public.profiles (id, email, full_name, home_community_h3_index, referral_code, phone_verified, tos_accepted_at, profile_completed_at, buzz_welcomed_at, zip_code, street_address, city, state_code, phone_number, home_location) VALUES
('f1111111-1111-1111-1111-111111111111', 'sarah.m@marketing.local', 'Sarah Jenkins', '89283470c2fffff', 'SARAHMKT', true, NOW(), NOW(), NOW(), '95125', '1000 Willow Ave', 'San Jose', 'CA', '+14085559001', ST_SetSRID(ST_MakePoint(-121.8906, 37.3362), 4326)),
('f2222222-2222-2222-2222-222222222222', 'david.c@marketing.local', 'David Chen', '89283470c2fffff', 'DAVIDMKT', true, NOW(), NOW(), NOW(), '95125', '1001 Willow Ave', 'San Jose', 'CA', '+14085559002', ST_SetSRID(ST_MakePoint(-121.8905, 37.3363), 4326)),
('f3333333-3333-3333-3333-333333333333', 'elena.r@marketing.local', 'Elena Rodriguez', '89283470c2fffff', 'ELENAMKT', true, NOW(), NOW(), NOW(), '95125', '1002 Willow Ave', 'San Jose', 'CA', '+14085559003', ST_SetSRID(ST_MakePoint(-121.8904, 37.3364), 4326)),
('f4444444-4444-4444-4444-444444444444', 'michael.w@marketing.local', 'Michael Wong', '89283470c2fffff', 'MIKEMKT', true, NOW(), NOW(), NOW(), '95125', '1003 Willow Ave', 'San Jose', 'CA', '+14085559004', ST_SetSRID(ST_MakePoint(-121.8903, 37.3365), 4326))
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  home_community_h3_index = EXCLUDED.home_community_h3_index,
  referral_code = EXCLUDED.referral_code,
  phone_verified = EXCLUDED.phone_verified,
  tos_accepted_at = EXCLUDED.tos_accepted_at,
  profile_completed_at = EXCLUDED.profile_completed_at,
  buzz_welcomed_at = EXCLUDED.buzz_welcomed_at,
  zip_code = EXCLUDED.zip_code,
  street_address = EXCLUDED.street_address,
  city = EXCLUDED.city,
  state_code = EXCLUDED.state_code,
  phone_number = EXCLUDED.phone_number,
  home_location = EXCLUDED.home_location;

-- 3. Create Booths
INSERT INTO market_booths (owner_id, name, description, decorative_theme, offers_delivery, offers_pickup, delivery_radius_miles, pickup_address, delivery_windows, pickup_windows, payment_method, pickup_location) VALUES
('f1111111-1111-1111-1111-111111111111', 'The Heritage Harvest', 'Organically grown heirloom varieties from our family garden to your table.', 'harvest', true, true, 15, '1000 Willow Ave, San Jose, CA 95125', '[{"id":"8-12","start":"08:00","end":"12:00"}]'::jsonb, '[{"id":"9-17","start":"09:00","end":"17:00"}]'::jsonb, 'automatic', ST_SetSRID(ST_MakePoint(-121.8906, 37.3362), 4326)),
('f2222222-2222-2222-2222-222222222222', 'David''s Urban Apiary', 'Local, raw wildflower honey and natural beeswax products from happy backyard bees.', 'floral', true, true, 10, '1001 Willow Ave, San Jose, CA 95125', '[{"id":"10-14","start":"10:00","end":"14:00"}]'::jsonb, '[{"id":"12-18","start":"12:00","end":"18:00"}]'::jsonb, 'automatic', ST_SetSRID(ST_MakePoint(-121.8905, 37.3363), 4326)),
('f3333333-3333-3333-3333-333333333333', 'Green Thumb Greens', 'Crisp, pesticide-free salad greens and culinary herbs harvested fresh daily.', 'modern', true, true, 5, '1002 Willow Ave, San Jose, CA 95125', '[{"id":"7-10","start":"07:00","end":"10:00"}]'::jsonb, '[{"id":"8-12","start":"08:00","end":"12:00"}]'::jsonb, 'automatic', ST_SetSRID(ST_MakePoint(-121.8904, 37.3364), 4326));

-- 4. Create High-Quality Products
INSERT INTO market_products (seller_id, market_date, name, description, category, price_usd, unit, inventory, photos, harvested_at, moderation_status, window_dates, product_delivery_windows, product_pickup_windows) VALUES
-- Sarah's Products
('f1111111-1111-1111-1111-111111111111', CURRENT_DATE, 'Cherokee Purple Tomatoes', 'Rich, complex flavor with a beautiful dark color. Perfect for slicing and summer salads.', 'produce', 6.50, 'box', 12, '{"https://images.unsplash.com/photo-1592924357228-91a4daadcfea?q=80&w=600&auto=format&fit=crop"}', now(), 'approved', jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD')), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb)),
('f1111111-1111-1111-1111-111111111111', CURRENT_DATE, 'Meyer Lemons', 'Sweet and fragrant lemons, completely pesticide free. Great for baking and lemonade.', 'produce', 4.00, 'bag', 20, '{"https://images.unsplash.com/photo-1590502593747-42a996133562?q=80&w=600&auto=format&fit=crop"}', now(), 'approved', jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD')), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb)),
('f1111111-1111-1111-1111-111111111111', CURRENT_DATE, 'Heritage Garlic Bulbs', 'Large, pungent hardneck garlic cured to perfection. Beautiful purple stripes.', 'produce', 8.50, 'bag', 5, '{"https://images.unsplash.com/photo-1615485290382-441e4d049cb5?q=80&w=600&auto=format&fit=crop"}', now(), 'approved', jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD')), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb)),

-- David's Products
('f2222222-2222-2222-2222-222222222222', CURRENT_DATE, 'Raw Wildflower Honey', 'Unfiltered, raw honey gathered from local spring wildflowers. Deep floral notes.', 'honey', 12.00, 'piece', 15, '{"https://images.unsplash.com/photo-1587049352846-4a222e784d38?q=80&w=600&auto=format&fit=crop"}', now(), 'approved', jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD')), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb)),
('f2222222-2222-2222-2222-222222222222', CURRENT_DATE, 'Fresh Honeycomb', 'Gourmet honeycomb straight from the hive. Incredible paired with cheeses.', 'honey', 15.00, 'box', 4, '{"https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?q=80&w=600&auto=format&fit=crop"}', now(), 'approved', jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD')), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb)),

-- Elena's Products
('f3333333-3333-3333-3333-333333333333', CURRENT_DATE, 'Organic Baby Arugula', 'Spicy, tender arugula leaves. Harvested this morning, triple-washed.', 'produce', 5.00, 'bag', 10, '{"https://images.unsplash.com/photo-1540420773420-3366772f4999?q=80&w=600&auto=format&fit=crop"}', now(), 'approved', jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD')), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb)),
('f3333333-3333-3333-3333-333333333333', CURRENT_DATE, 'Fresh Basil Bunches', 'Huge bunches of sweet Genovese basil. Pesto ready!', 'produce', 3.50, 'bag', 25, '{"https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?q=80&w=600&auto=format&fit=crop"}', now(), 'approved', jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD')), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb), jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[]'::jsonb));

-- 6. Create MARKET Conversations & Orders (David buys from Sarah)

-- 6. Create MARKET Conversations & Orders (David buys from Sarah)
INSERT INTO public.market_conversations (id, participant_a, participant_b, updated_at) VALUES 
('f6666666-6666-6666-6666-666666666666', 'f2222222-2222-2222-2222-222222222222', 'f1111111-1111-1111-1111-111111111111', now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.market_chat_messages (id, conversation_id, sender_id, content, created_at) VALUES 
(gen_random_uuid(), 'f6666666-6666-6666-6666-666666666666', 'f2222222-2222-2222-2222-222222222222', 'Hi Sarah! I''m so excited for the garlic. Can I pick it up tomorrow morning?', now() - interval '23 hours'),
(gen_random_uuid(), 'f6666666-6666-6666-6666-666666666666', 'f1111111-1111-1111-1111-111111111111', 'Absolutely! See you then! 😊', now() - interval '22 hours');

INSERT INTO public.market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, total_usd, fulfillment_type, status, buyer_rating, seller_rating, created_at) VALUES 
('f8888888-8888-8888-8888-888888888888', 'f2222222-2222-2222-2222-222222222222', 'f1111111-1111-1111-1111-111111111111', 
  (SELECT id FROM market_booths WHERE owner_id = 'f1111111-1111-1111-1111-111111111111' LIMIT 1), 
  (SELECT id FROM market_products WHERE name = 'Heritage Garlic Bulbs' LIMIT 1),
  'Heritage Garlic Bulbs', 2, 8.50, 17.00, 17.00, 'pickup', 'completed', 5, 5, now() - interval '22 hours')
ON CONFLICT (id) DO NOTHING;

-- 7. Sarah buys from David (To populate Sarah's Orders tab)

INSERT INTO public.market_conversations (id, participant_a, participant_b, updated_at) VALUES 
('fbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', now() - interval '5 hours')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.market_chat_messages (id, conversation_id, sender_id, content, created_at) VALUES 
(gen_random_uuid(), 'fbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f1111111-1111-1111-1111-111111111111', 'Hi David! Do you have any honey left? I would love to grab a jar.', now() - interval '4 hours'),
(gen_random_uuid(), 'fbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f2222222-2222-2222-2222-222222222222', 'Yes I do! I can have it ready for you today.', now() - interval '3 hours');

INSERT INTO public.market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, total_usd, fulfillment_type, status, buyer_rating, seller_rating, created_at) VALUES 
('fddddddd-dddd-dddd-dddd-dddddddddddd', 'f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 
  (SELECT id FROM market_booths WHERE owner_id = 'f2222222-2222-2222-2222-222222222222' LIMIT 1), 
  (SELECT id FROM market_products WHERE name = 'Raw Wildflower Honey' LIMIT 1),
  'Raw Wildflower Honey', 1, 12.00, 12.00, 12.00, 'pickup', 'completed', 5, 5, now() - interval '3 hours')
ON CONFLICT (id) DO NOTHING;

-- 9. Add ledger entries to give Sarah Earnings
INSERT INTO public.market_ledger (created_at, event_type, user_id, order_id, settlement_id, amount_usd, direction, balance_after, metadata) VALUES
(now() - interval '2 days', 'order_completed', 'f1111111-1111-1111-1111-111111111111', 'f8888888-8888-8888-8888-888888888888', null, 17.00, 'credit', 17.00, '{}'),
(now() - interval '1 day', 'order_completed', 'f1111111-1111-1111-1111-111111111111', null, null, 24.50, 'credit', 41.50, '{}'),
(now() - interval '12 hours', 'order_completed', 'f1111111-1111-1111-1111-111111111111', null, null, 12.00, 'credit', 53.50, '{}');

-- 10. Add Community Chat Messages
INSERT INTO public.community_chat_messages (id, community_h3_index, author_id, content, created_at) VALUES
('c1111111-1111-1111-1111-111111111111', '89283470c2fffff', 'f2222222-2222-2222-2222-222222222222', 'Hey neighbors! Has anyone successfully grown heirloom tomatoes in this soil?', now() - interval '4 hours'),
('c2222222-2222-2222-2222-222222222222', '89283470c2fffff', 'f3333333-3333-3333-3333-333333333333', 'Yes! You definitely need to add some compost first. The clay is too heavy otherwise.', now() - interval '3 hours'),
('c3333333-3333-3333-3333-333333333333', '89283470c2fffff', 'f1111111-1111-1111-1111-111111111111', 'I have some extra compost if you need it, David. Come by my stand tomorrow!', now() - interval '2 hours'),
('c4444444-4444-4444-4444-444444444444', '89283470c2fffff', 'f4444444-4444-4444-4444-444444444444', 'Hey Sarah, do you still have those Meyer Lemons available?', now() - interval '1 hour'),
('c5555555-5555-5555-5555-555555555555', '89283470c2fffff', 'f1111111-1111-1111-1111-111111111111', 'I do Michael! I just listed another batch.', now() - interval '30 minutes')
ON CONFLICT (id) DO NOTHING;

-- 11. Add User Balances
INSERT INTO public.user_balances (user_id, available_usd, pending_usd, held_balance_usd, total_earned_usd) VALUES
('f1111111-1111-1111-1111-111111111111', 53.50, 0, 0, 53.50)
ON CONFLICT (user_id) DO UPDATE SET available_usd = 53.50, total_earned_usd = 53.50;

-- 12. Shift auto-generated product announcements into the past
UPDATE public.community_chat_messages 
SET created_at = created_at - interval '1 day',
    bumped_at = COALESCE(bumped_at, created_at) - interval '1 day'
WHERE product_listing_id IS NOT NULL;
