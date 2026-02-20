UPDATE profiles SET home_community_h3_index = '872834750ffffff' WHERE email = 'seller1@test.com';
INSERT INTO posts (author_id, type, reach, content, community_h3_index)
VALUES (
  (SELECT id FROM profiles WHERE email = 'seller1@test.com'),
    'want_to_buy',
      'community',
        '{"product_name": "Organic Tomatoes", "qty": 2, "description": "Looking for fresh tomatoes for salad"}',
          '872834750ffffff'
          );