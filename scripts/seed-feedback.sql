-- Seed Community Voice test data
DO $$
DECLARE
  v_user1 uuid;
  v_user2 uuid;
  v_user3 uuid;
  v_fb1 uuid;
  v_fb2 uuid;
  v_fb3 uuid;
  v_fb4 uuid;
  v_fb5 uuid;
  v_fb6 uuid;
  v_fb7 uuid;
  v_fb8 uuid;
BEGIN
  SELECT id INTO v_user1 FROM profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user2 FROM profiles ORDER BY created_at LIMIT 1 OFFSET 1;
  SELECT id INTO v_user3 FROM profiles ORDER BY created_at LIMIT 1 OFFSET 2;

  IF v_user1 IS NULL THEN
    RAISE EXCEPTION 'No users found in profiles table';
  END IF;

  v_user2 := COALESCE(v_user2, v_user1);
  v_user3 := COALESCE(v_user3, v_user1);

  -- Make user1 a staff admin (look up their email)
  INSERT INTO staff_members (email, user_id, roles, granted_at)
  SELECT au.email, v_user1, '{admin,support}', now()
  FROM auth.users au WHERE au.id = v_user1
  ON CONFLICT (email) DO NOTHING;

  -- Bootstrap admin (always present for development)
  INSERT INTO staff_members (email, roles, granted_at)
  VALUES ('admin@casagrown.com', '{admin}', now())
  ON CONFLICT (email) DO NOTHING;

  -- Public feedback tickets
  INSERT INTO user_feedback (id, author_id, type, title, description, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user2, 'feature_request', 'Allow uploading videos in chat', 'It would be great to share short videos of produce condition directly in the chat.', 'planned', 'public', now() - interval '2 days')
  RETURNING id INTO v_fb1;

  INSERT INTO user_feedback (id, author_id, type, title, description, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user3, 'bug_report', 'App crashes when opening profile on Android', 'Every time I try to edit my bio, the app force closes. Samsung Galaxy S21.', 'in_progress', 'public', now() - interval '1 day')
  RETURNING id INTO v_fb2;

  INSERT INTO user_feedback (id, author_id, type, title, description, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user2, 'feature_request', 'Dark mode support', 'My eyes hurt at night! Please add dark mode to the app.', 'open', 'public', now() - interval '5 days')
  RETURNING id INTO v_fb3;

  INSERT INTO user_feedback (id, author_id, type, title, description, status, visibility, created_at, resolved_at)
  VALUES (gen_random_uuid(), v_user3, 'bug_report', 'Notification badge not clearing', 'I have read all messages but the red dot persists.', 'completed', 'public', now() - interval '3 days', now() - interval '1 day')
  RETURNING id INTO v_fb4;

  INSERT INTO user_feedback (id, author_id, type, title, description, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user2, 'feature_request', 'Points transaction history export', 'I want to export my points history as a CSV file for tax purposes.', 'open', 'public', now() - interval '7 days')
  RETURNING id INTO v_fb5;

  INSERT INTO user_feedback (id, author_id, type, title, description, status, visibility, created_at, resolved_at)
  VALUES (gen_random_uuid(), v_user3, 'bug_report', 'Map not loading on slower connections', 'When on 3G, the map takes forever and sometimes shows blank.', 'completed', 'public', now() - interval '10 days', now() - interval '4 days')
  RETURNING id INTO v_fb6;

  -- Private support tickets
  INSERT INTO user_feedback (id, author_id, type, title, description, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user2, 'support_request', 'Where did my points go?', 'I had 500 points yesterday but now I only see 200.', 'open', 'private', now() - interval '1 day')
  RETURNING id INTO v_fb7;

  INSERT INTO user_feedback (id, author_id, type, title, description, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user3, 'support_request', 'Transaction failed but points deducted', 'I tried to buy tomatoes but the transaction shows failed. My points were still deducted.', 'under_review', 'private', now() - interval '6 hours')
  RETURNING id INTO v_fb8;

  -- Votes
  INSERT INTO feedback_votes (feedback_id, user_id) VALUES
    (v_fb1, v_user1), (v_fb1, v_user2), (v_fb1, v_user3),
    (v_fb2, v_user1), (v_fb2, v_user2),
    (v_fb3, v_user1), (v_fb3, v_user2), (v_fb3, v_user3),
    (v_fb4, v_user1),
    (v_fb5, v_user2), (v_fb5, v_user3),
    (v_fb6, v_user1), (v_fb6, v_user3)
  ON CONFLICT DO NOTHING;

  -- Comments
  INSERT INTO feedback_comments (feedback_id, author_id, content, is_official_response, created_at) VALUES
    (v_fb1, v_user3, 'Totally agree, this would help a lot!', false, now() - interval '1 day'),
    (v_fb1, v_user1, 'Great suggestion! Added to our Q2 roadmap.', true, now() - interval '12 hours'),
    (v_fb1, v_user2, 'Awesome! Can''t wait.', false, now() - interval '2 hours'),
    (v_fb2, v_user1, 'Investigating. Can you share your Android version?', true, now() - interval '20 hours'),
    (v_fb3, v_user3, '+1 for dark mode!', false, now() - interval '4 days'),
    (v_fb3, v_user1, 'Being considered for next major release.', true, now() - interval '3 days'),
    (v_fb7, v_user1, 'Looking into your account now.', true, now() - interval '12 hours');

  RAISE NOTICE 'Seeded 8 feedback tickets with votes and comments';
END $$;
