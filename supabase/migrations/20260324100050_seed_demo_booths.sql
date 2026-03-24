-- ============================================================================
-- Seed: Demo Booth Templates (50 diverse sellers)
-- Realistic names, booth names, descriptions
-- ============================================================================

SET search_path TO public, extensions;

INSERT INTO demo_booth_templates (seller_name, booth_name, description, decorative_theme, delivery_radius_miles)
VALUES
  -- Hispanic/Latino names
  ('Maria Garcia', 'Garcia Family Garden', 'Fresh seasonal vegetables and herbs from our family garden.', 'garden', 5),
  ('Carlos Rodriguez', 'Rodriguez Backyard Harvest', 'Homegrown tomatoes, peppers, and citrus from sunny California.', 'rustic', 4),
  ('Isabel Hernandez', 'Hernandez Herb Haven', 'Aromatic herbs and leafy greens, grown with love.', 'garden', 5),
  ('Diego Morales', 'Morales Organic Patch', 'Chemical-free seasonal produce from our organic garden.', 'minimal', 6),
  ('Ana Flores', 'Flores Flower Farm', 'Beautiful fresh-cut flowers and arrangements for every occasion.', 'floral', 4),
  ('Luis Sanchez', 'Sanchez Citrus Grove', 'Sweet citrus fruits from our backyard grove.', 'rustic', 5),
  ('Rosa Martinez', 'Martinez Family Produce', 'Farm-fresh vegetables picked at peak ripeness.', 'garden', 3),
  ('Miguel Torres', 'Torres Garden Supply', 'Quality soil, pots, and garden supplies for your home garden.', 'minimal', 5),
  -- Asian names
  ('David Nguyen', 'Nguyen Garden Fresh', 'Vietnamese herbs and seasonal vegetables from our garden.', 'garden', 4),
  ('Mei Chen', 'Chen Blossom Garden', 'Fresh flowers and herbs grown in our backyard greenhouse.', 'floral', 5),
  ('Kenji Tanaka', 'Tanaka Green Thumb', 'Japanese vegetables and herbs, organically grown.', 'minimal', 6),
  ('Priya Patel', 'Patel Spice Garden', 'Fresh herbs, peppers, and specialty produce.', 'garden', 4),
  ('Soo-Jin Kim', 'Kim Family Farm Stand', 'Korean vegetables and seasonal greens from our garden.', 'rustic', 5),
  ('Anh Tran', 'Tran Harvest Table', 'Freshly harvested vegetables and herbs, ready for your kitchen.', 'garden', 4),
  ('Wei Zhang', 'Zhang Urban Garden', 'Urban-grown vegetables and fresh-cut flowers.', 'minimal', 3),
  ('Ravi Sharma', 'Sharma Herb & Spice', 'Fresh herbs and specialty greens for your cooking.', 'garden', 5),
  -- African/African-American names
  ('Amara Okafor', 'Okafor Green Acres', 'Organic vegetables and fresh eggs from our backyard farm.', 'rustic', 5),
  ('James Washington', 'Washington Home Harvest', 'Seasonal produce and honey from our urban homestead.', 'garden', 4),
  ('Fatima Diallo', 'Diallo Garden Treasures', 'Fresh herbs, greens, and beautiful flower arrangements.', 'floral', 5),
  ('Marcus Johnson', 'Johnson Backyard Bounty', 'Fresh vegetables and herbs grown in raised beds.', 'garden', 6),
  ('Zara Adeyemi', 'Adeyemi Sunshine Garden', 'Sun-ripened tomatoes, peppers, and seasonal produce.', 'garden', 4),
  -- European names
  ('Sarah Thompson', 'Thompson Family Farm', 'Heirloom vegetables and garden-fresh herbs.', 'rustic', 5),
  ('Michael O''Brien', 'O''Brien Green Garden', 'Irish heritage vegetables and herbs from our plot.', 'garden', 4),
  ('Elena Russo', 'Russo Italian Garden', 'Fresh basil, tomatoes, and herbs for Italian cooking.', 'garden', 5),
  ('Hans Mueller', 'Mueller Garden Works', 'Quality plants, soil, and garden equipment.', 'minimal', 6),
  ('Sophie Laurent', 'Laurent Flower Studio', 'French-inspired flower arrangements and fresh herbs.', 'floral', 4),
  ('Anna Kowalski', 'Kowalski Kitchen Garden', 'Traditional vegetables and herbs from our backyard.', 'garden', 5),
  ('Liam Murphy', 'Murphy Meadow Farm', 'Free-range eggs and seasonal produce.', 'rustic', 5),
  -- Middle Eastern names
  ('Yasmin Al-Hassan', 'Al-Hassan Herb Garden', 'Fresh Mediterranean herbs and specialty greens.', 'garden', 4),
  ('Omar Khalil', 'Khalil Olive Garden', 'Herbs, vegetables, and handmade flower pots.', 'rustic', 5),
  -- More diverse names
  ('Nina Petrov', 'Petrov Sunshine Produce', 'Bright and beautiful vegetables from our sunny garden.', 'garden', 5),
  ('Tom Bradley', 'Bradley Backyard Bees', 'Local raw honey and beeswax products.', 'rustic', 4),
  ('Lisa Chang', 'Chang Fresh Picks', 'Hand-picked seasonal produce and fresh-cut flowers.', 'floral', 5),
  ('Robert Williams', 'Williams Urban Harvest', 'Container-grown vegetables and herbs.', 'minimal', 3),
  ('Maria Popov', 'Popov Garden Delights', 'Eastern European heritage vegetables and herbs.', 'garden', 5),
  ('Juan Reyes', 'Reyes Tropical Garden', 'Tropical fruits and herbs from our warm garden.', 'garden', 6),
  ('Grace Wanjiku', 'Wanjiku Green Living', 'Sustainable vegetables and garden supplies.', 'minimal', 5),
  ('Chris Anderson', 'Anderson Homestead', 'Fresh eggs, honey, and seasonal vegetables.', 'rustic', 4),
  ('Yuki Sato', 'Sato Zen Garden', 'Japanese herbs, flowers, and decorative pots.', 'minimal', 5),
  ('Deepa Iyer', 'Iyer Kitchen Garden', 'Fresh curry leaves, herbs, and specialty vegetables.', 'garden', 4),
  ('Patrick O''Connor', 'O''Connor Farm Fresh', 'Heritage potatoes, greens, and farm-fresh eggs.', 'rustic', 5),
  ('Linda Nakamura', 'Nakamura Bloom & Grow', 'Beautiful flowers and potted plants.', 'floral', 4),
  ('Ahmed Hassan', 'Hassan Mediterranean Garden', 'Fresh mint, parsley, and Mediterranean produce.', 'garden', 5),
  ('Jennifer Lee', 'Lee Garden Oasis', 'Organic greens, herbs, and edible flowers.', 'floral', 5),
  ('Samuel Owusu', 'Owusu Sunshine Patch', 'Warm-weather vegetables and fresh peppers.', 'garden', 4),
  ('Claire Dubois', 'Dubois Potager', 'French kitchen garden vegetables and fine herbs.', 'garden', 5),
  ('Ray Takahashi', 'Takahashi Garden Center', 'Plants, soil, seeds, and garden equipment.', 'minimal', 6),
  ('Fatou Ndiaye', 'Ndiaye Family Greens', 'Leafy greens and seasonal vegetables.', 'garden', 4),
  ('Daniel Rivera', 'Rivera Seed & Soil', 'Premium seeds, potting soil, and garden tools.', 'minimal', 5),
  ('Karen Johansson', 'Johansson Wildflower', 'Wild and cultivated flowers for arrangements.', 'floral', 5);
