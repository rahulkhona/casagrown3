-- ============================================================================
-- Migration: National Produce Suggestions (Zone-Based)
-- Replaces per-zip-code produce seeding with USDA hardiness zone groups.
-- garden_produce_catalog is kept as a backup reference table (not used in app).
-- ============================================================================

-- 1. Create usda_zone_produce — maps zone groups to produce items
CREATE TABLE IF NOT EXISTS usda_zone_produce (
  zone_group    TEXT NOT NULL,
  produce_name  TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('fruits','vegetables','flowers','herbs')),
  emoji         TEXT,
  season        TEXT CHECK (season IN ('spring','summer','fall','winter','year_round')),
  rank          INTEGER DEFAULT 0,
  PRIMARY KEY (zone_group, produce_name)
);

ALTER TABLE usda_zone_produce ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read zone produce" ON usda_zone_produce FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can read zone produce"   ON usda_zone_produce FOR SELECT TO anon USING (true);

-- 2. Create zip_prefix_to_zone — maps 3-digit zip prefixes to zone groups
--    The first 3 digits of a US zip code correspond to SCF regions.
CREATE TABLE IF NOT EXISTS zip_prefix_to_zone (
  zip_prefix  TEXT NOT NULL PRIMARY KEY,  -- 3-digit prefix, e.g. '100'
  zone_group  TEXT NOT NULL               -- references zone groups in usda_zone_produce
);

ALTER TABLE zip_prefix_to_zone ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read zip zones" ON zip_prefix_to_zone FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can read zip zones"   ON zip_prefix_to_zone FOR SELECT TO anon USING (true);

-- 3. Drop old per-zip table (replaced by zone-based lookup)
DROP TABLE IF EXISTS zipcode_popular_produce CASCADE;

-- 4. Drop category column from user_garden (infer via join at query time)
ALTER TABLE user_garden DROP COLUMN IF EXISTS category;

-- ============================================================================
-- 5. Seed zone produce data for all major US climate zones
-- ============================================================================

-- ── COLD (Zones 3a–4b): MN, MT, ND, WI interior, northern ME ──
INSERT INTO usda_zone_produce (zone_group, produce_name, category, emoji, season, rank) VALUES
  ('cold', 'Potatoes',      'vegetables', '🥔', 'summer',     1),
  ('cold', 'Carrots',       'vegetables', '🥕', 'spring',     2),
  ('cold', 'Kale',          'vegetables', '🥬', 'spring',     3),
  ('cold', 'Peas',          'vegetables', '🫛', 'spring',     4),
  ('cold', 'Lettuce',       'vegetables', '🥬', 'spring',     5),
  ('cold', 'Radishes',      'vegetables', '🥕', 'spring',     6),
  ('cold', 'Beets',         'vegetables', '🟣', 'spring',     7),
  ('cold', 'Onions',        'vegetables', '🧅', 'spring',     8),
  ('cold', 'Garlic',        'vegetables', '🧄', 'fall',       9),
  ('cold', 'Spinach',       'vegetables', '🥬', 'spring',     10),
  ('cold', 'Strawberries',  'fruits',     '🍓', 'summer',     1),
  ('cold', 'Blueberries',   'fruits',     '🫐', 'summer',     2),
  ('cold', 'Raspberries',   'fruits',     '🫐', 'summer',     3),
  ('cold', 'Apples',        'fruits',     '🍎', 'fall',       4),
  ('cold', 'Rhubarb',       'fruits',     '🌿', 'spring',     5),
  ('cold', 'Sunflowers',    'flowers',    '🌻', 'summer',     1),
  ('cold', 'Marigolds',     'flowers',    '🌼', 'summer',     2),
  ('cold', 'Zinnias',       'flowers',    '🌺', 'summer',     3),
  ('cold', 'Black-Eyed Susans','flowers', '🌻', 'summer',     4),
  ('cold', 'Pansies',       'flowers',    '🌸', 'spring',     5),
  ('cold', 'Dill',          'herbs',      '🌿', 'summer',     1),
  ('cold', 'Chives',        'herbs',      '🌿', 'spring',     2),
  ('cold', 'Parsley',       'herbs',      '🌿', 'spring',     3),
  ('cold', 'Cilantro',      'herbs',      '🌿', 'spring',     4),
  ('cold', 'Mint',          'herbs',      '🌿', 'summer',     5)
ON CONFLICT (zone_group, produce_name) DO NOTHING;

-- ── COOL (Zones 5a–5b): Upper Midwest, N. NY, inland New England ──
INSERT INTO usda_zone_produce (zone_group, produce_name, category, emoji, season, rank) VALUES
  ('cool', 'Tomatoes',      'vegetables', '🍅', 'summer',     1),
  ('cool', 'Peppers',       'vegetables', '🫑', 'summer',     2),
  ('cool', 'Cucumbers',     'vegetables', '🥒', 'summer',     3),
  ('cool', 'Zucchini',      'vegetables', '🥒', 'summer',     4),
  ('cool', 'Green Beans',   'vegetables', '🫘', 'summer',     5),
  ('cool', 'Lettuce',       'vegetables', '🥬', 'spring',     6),
  ('cool', 'Carrots',       'vegetables', '🥕', 'spring',     7),
  ('cool', 'Potatoes',      'vegetables', '🥔', 'summer',     8),
  ('cool', 'Corn',          'vegetables', '🌽', 'summer',     9),
  ('cool', 'Peas',          'vegetables', '🫛', 'spring',     10),
  ('cool', 'Strawberries',  'fruits',     '🍓', 'summer',     1),
  ('cool', 'Blueberries',   'fruits',     '🫐', 'summer',     2),
  ('cool', 'Apples',        'fruits',     '🍎', 'fall',       3),
  ('cool', 'Raspberries',   'fruits',     '🫐', 'summer',     4),
  ('cool', 'Grapes',        'fruits',     '🍇', 'fall',       5),
  ('cool', 'Watermelon',    'fruits',     '🍉', 'summer',     6),
  ('cool', 'Sunflowers',    'flowers',    '🌻', 'summer',     1),
  ('cool', 'Roses',         'flowers',    '🌹', 'summer',     2),
  ('cool', 'Lavender',      'flowers',    '💜', 'summer',     3),
  ('cool', 'Marigolds',     'flowers',    '🌼', 'summer',     4),
  ('cool', 'Dahlia',        'flowers',    '🌺', 'summer',     5),
  ('cool', 'Basil',         'herbs',      '🌿', 'summer',     1),
  ('cool', 'Dill',          'herbs',      '🌿', 'summer',     2),
  ('cool', 'Chives',        'herbs',      '🌿', 'spring',     3),
  ('cool', 'Parsley',       'herbs',      '🌿', 'spring',     4),
  ('cool', 'Cilantro',      'herbs',      '🌿', 'spring',     5),
  ('cool', 'Thyme',         'herbs',      '🌿', 'summer',     6),
  ('cool', 'Mint',          'herbs',      '🌿', 'summer',     7)
ON CONFLICT (zone_group, produce_name) DO NOTHING;

-- ── MODERATE_COOL (Zones 6a–6b): Midwest, Mid-Atlantic interior, CO ──
INSERT INTO usda_zone_produce (zone_group, produce_name, category, emoji, season, rank) VALUES
  ('moderate_cool', 'Tomatoes',      'fruits',     '🍅', 'summer',     1),
  ('moderate_cool', 'Peppers',       'vegetables', '🫑', 'summer',     2),
  ('moderate_cool', 'Cucumbers',     'vegetables', '🥒', 'summer',     3),
  ('moderate_cool', 'Zucchini',      'vegetables', '🥒', 'summer',     4),
  ('moderate_cool', 'Green Beans',   'vegetables', '🫘', 'summer',     5),
  ('moderate_cool', 'Lettuce',       'vegetables', '🥬', 'spring',     6),
  ('moderate_cool', 'Squash',        'vegetables', '🎃', 'fall',       7),
  ('moderate_cool', 'Corn',          'vegetables', '🌽', 'summer',     8),
  ('moderate_cool', 'Eggplant',      'vegetables', '🍆', 'summer',     9),
  ('moderate_cool', 'Onions',        'vegetables', '🧅', 'spring',     10),
  ('moderate_cool', 'Strawberries',  'fruits',     '🍓', 'spring',     2),
  ('moderate_cool', 'Blueberries',   'fruits',     '🫐', 'summer',     3),
  ('moderate_cool', 'Peaches',       'fruits',     '🍑', 'summer',     4),
  ('moderate_cool', 'Apples',        'fruits',     '🍎', 'fall',       5),
  ('moderate_cool', 'Grapes',        'fruits',     '🍇', 'fall',       6),
  ('moderate_cool', 'Watermelon',    'fruits',     '🍉', 'summer',     7),
  ('moderate_cool', 'Sunflowers',    'flowers',    '🌻', 'summer',     1),
  ('moderate_cool', 'Roses',         'flowers',    '🌹', 'spring',     2),
  ('moderate_cool', 'Lavender',      'flowers',    '💜', 'summer',     3),
  ('moderate_cool', 'Marigolds',     'flowers',    '🌼', 'summer',     4),
  ('moderate_cool', 'Dahlia',        'flowers',    '🌺', 'summer',     5),
  ('moderate_cool', 'Zinnias',       'flowers',    '🌺', 'summer',     6),
  ('moderate_cool', 'Basil',         'herbs',      '🌿', 'summer',     1),
  ('moderate_cool', 'Cilantro',      'herbs',      '🌿', 'spring',     2),
  ('moderate_cool', 'Parsley',       'herbs',      '🌿', 'spring',     3),
  ('moderate_cool', 'Thyme',         'herbs',      '🌿', 'year_round', 4),
  ('moderate_cool', 'Oregano',       'herbs',      '🌿', 'summer',     5),
  ('moderate_cool', 'Mint',          'herbs',      '🌿', 'summer',     6)
ON CONFLICT (zone_group, produce_name) DO NOTHING;

-- ── MODERATE (Zones 7a–7b): Pacific NW, Mid-Atlantic, Upper South ──
INSERT INTO usda_zone_produce (zone_group, produce_name, category, emoji, season, rank) VALUES
  ('moderate', 'Tomatoes',      'fruits',     '🍅', 'summer',     1),
  ('moderate', 'Peppers',       'vegetables', '🫑', 'summer',     2),
  ('moderate', 'Cucumbers',     'vegetables', '🥒', 'summer',     3),
  ('moderate', 'Zucchini',      'vegetables', '🥒', 'summer',     4),
  ('moderate', 'Green Beans',   'vegetables', '🫘', 'summer',     5),
  ('moderate', 'Lettuce',       'vegetables', '🥬', 'spring',     6),
  ('moderate', 'Kale',          'vegetables', '🥬', 'fall',       7),
  ('moderate', 'Squash',        'vegetables', '🎃', 'fall',       8),
  ('moderate', 'Corn',          'vegetables', '🌽', 'summer',     9),
  ('moderate', 'Eggplant',      'vegetables', '🍆', 'summer',     10),
  ('moderate', 'Strawberries',  'fruits',     '🍓', 'spring',     2),
  ('moderate', 'Blueberries',   'fruits',     '🫐', 'summer',     3),
  ('moderate', 'Peaches',       'fruits',     '🍑', 'summer',     4),
  ('moderate', 'Figs',          'fruits',     '🫒', 'summer',     5),
  ('moderate', 'Grapes',        'fruits',     '🍇', 'summer',     6),
  ('moderate', 'Apples',        'fruits',     '🍎', 'fall',       7),
  ('moderate', 'Sunflowers',    'flowers',    '🌻', 'summer',     1),
  ('moderate', 'Roses',         'flowers',    '🌹', 'spring',     2),
  ('moderate', 'Lavender',      'flowers',    '💜', 'summer',     3),
  ('moderate', 'Jasmine',       'flowers',    '🌸', 'spring',     4),
  ('moderate', 'Marigolds',     'flowers',    '🌼', 'summer',     5),
  ('moderate', 'Dahlia',        'flowers',    '🌺', 'summer',     6),
  ('moderate', 'Basil',         'herbs',      '🌿', 'summer',     1),
  ('moderate', 'Rosemary',      'herbs',      '🌿', 'year_round', 2),
  ('moderate', 'Cilantro',      'herbs',      '🌿', 'spring',     3),
  ('moderate', 'Thyme',         'herbs',      '🌿', 'year_round', 4),
  ('moderate', 'Oregano',       'herbs',      '🌿', 'year_round', 5),
  ('moderate', 'Sage',          'herbs',      '🌿', 'year_round', 6),
  ('moderate', 'Mint',          'herbs',      '🌿', 'year_round', 7)
ON CONFLICT (zone_group, produce_name) DO NOTHING;

-- ── WARM_MODERATE (Zones 8a–8b): Southeast, Texas, coastal Carolinas ──
INSERT INTO usda_zone_produce (zone_group, produce_name, category, emoji, season, rank) VALUES
  ('warm_moderate', 'Tomatoes',      'fruits',     '🍅', 'spring',     1),
  ('warm_moderate', 'Peppers',       'vegetables', '🫑', 'summer',     2),
  ('warm_moderate', 'Cucumbers',     'vegetables', '🥒', 'summer',     3),
  ('warm_moderate', 'Okra',          'vegetables', '🌿', 'summer',     4),
  ('warm_moderate', 'Sweet Potatoes','vegetables', '🍠', 'summer',     5),
  ('warm_moderate', 'Squash',        'vegetables', '🎃', 'fall',       6),
  ('warm_moderate', 'Corn',          'vegetables', '🌽', 'summer',     7),
  ('warm_moderate', 'Eggplant',      'vegetables', '🍆', 'summer',     8),
  ('warm_moderate', 'Green Beans',   'vegetables', '🫘', 'spring',     9),
  ('warm_moderate', 'Collard Greens','vegetables', '🥬', 'fall',       10),
  ('warm_moderate', 'Strawberries',  'fruits',     '🍓', 'spring',     2),
  ('warm_moderate', 'Peaches',       'fruits',     '🍑', 'summer',     3),
  ('warm_moderate', 'Blueberries',   'fruits',     '🫐', 'summer',     4),
  ('warm_moderate', 'Figs',          'fruits',     '🫒', 'summer',     5),
  ('warm_moderate', 'Grapes',        'fruits',     '🍇', 'summer',     6),
  ('warm_moderate', 'Watermelon',    'fruits',     '🍉', 'summer',     7),
  ('warm_moderate', 'Blackberries',  'fruits',     '🫐', 'summer',     8),
  ('warm_moderate', 'Sunflowers',    'flowers',    '🌻', 'summer',     1),
  ('warm_moderate', 'Roses',         'flowers',    '🌹', 'spring',     2),
  ('warm_moderate', 'Hibiscus',      'flowers',    '🌺', 'summer',     3),
  ('warm_moderate', 'Jasmine',       'flowers',    '🌸', 'spring',     4),
  ('warm_moderate', 'Marigolds',     'flowers',    '🌼', 'summer',     5),
  ('warm_moderate', 'Gardenias',     'flowers',    '🤍', 'spring',     6),
  ('warm_moderate', 'Basil',         'herbs',      '🌿', 'summer',     1),
  ('warm_moderate', 'Rosemary',      'herbs',      '🌿', 'year_round', 2),
  ('warm_moderate', 'Cilantro',      'herbs',      '🌿', 'fall',       3),
  ('warm_moderate', 'Oregano',       'herbs',      '🌿', 'year_round', 4),
  ('warm_moderate', 'Thyme',         'herbs',      '🌿', 'year_round', 5),
  ('warm_moderate', 'Lemongrass',    'herbs',      '🌿', 'summer',     6),
  ('warm_moderate', 'Mint',          'herbs',      '🌿', 'year_round', 7)
ON CONFLICT (zone_group, produce_name) DO NOTHING;

-- ── WARM (Zones 9a–9b): Coastal CA, inland FL, Gulf Coast, AZ lowlands ──
INSERT INTO usda_zone_produce (zone_group, produce_name, category, emoji, season, rank) VALUES
  ('warm', 'Tomatoes',      'fruits',     '🍅', 'summer',     1),
  ('warm', 'Lemons',        'fruits',     '🍋', 'year_round', 2),
  ('warm', 'Oranges',       'fruits',     '🍊', 'winter',     3),
  ('warm', 'Avocados',      'fruits',     '🥑', 'year_round', 4),
  ('warm', 'Strawberries',  'fruits',     '🍓', 'spring',     5),
  ('warm', 'Figs',          'fruits',     '🫒', 'summer',     6),
  ('warm', 'Grapes',        'fruits',     '🍇', 'summer',     7),
  ('warm', 'Peaches',       'fruits',     '🍑', 'summer',     8),
  ('warm', 'Pomegranates',  'fruits',     '🍎', 'fall',       9),
  ('warm', 'Guava',         'fruits',     '🍈', 'fall',       10),
  ('warm', 'Peppers',       'vegetables', '🫑', 'summer',     1),
  ('warm', 'Lettuce',       'vegetables', '🥬', 'spring',     2),
  ('warm', 'Cucumbers',     'vegetables', '🥒', 'summer',     3),
  ('warm', 'Zucchini',      'vegetables', '🥒', 'summer',     4),
  ('warm', 'Kale',          'vegetables', '🥬', 'fall',       5),
  ('warm', 'Spinach',       'vegetables', '🥬', 'spring',     6),
  ('warm', 'Green Beans',   'vegetables', '🫘', 'summer',     7),
  ('warm', 'Eggplant',      'vegetables', '🍆', 'summer',     8),
  ('warm', 'Squash',        'vegetables', '🎃', 'fall',       9),
  ('warm', 'Corn',          'vegetables', '🌽', 'summer',     10),
  ('warm', 'Sunflowers',    'flowers',    '🌻', 'summer',     1),
  ('warm', 'Roses',         'flowers',    '🌹', 'spring',     2),
  ('warm', 'Lavender',      'flowers',    '💜', 'summer',     3),
  ('warm', 'Jasmine',       'flowers',    '🌸', 'spring',     4),
  ('warm', 'Marigolds',     'flowers',    '🌼', 'summer',     5),
  ('warm', 'Dahlia',        'flowers',    '🌺', 'summer',     6),
  ('warm', 'Hibiscus',      'flowers',    '🌺', 'year_round', 7),
  ('warm', 'Orchids',       'flowers',    '🌷', 'year_round', 8),
  ('warm', 'Basil',         'herbs',      '🌿', 'summer',     1),
  ('warm', 'Mint',          'herbs',      '🌿', 'year_round', 2),
  ('warm', 'Rosemary',      'herbs',      '🌿', 'year_round', 3),
  ('warm', 'Cilantro',      'herbs',      '🌿', 'spring',     4),
  ('warm', 'Thyme',         'herbs',      '🌿', 'year_round', 5),
  ('warm', 'Oregano',       'herbs',      '🌿', 'year_round', 6),
  ('warm', 'Parsley',       'herbs',      '🌿', 'spring',     7),
  ('warm', 'Sage',          'herbs',      '🌿', 'year_round', 8),
  ('warm', 'Lemongrass',    'herbs',      '🌿', 'summer',     9),
  ('warm', 'Chives',        'herbs',      '🌿', 'spring',     10)
ON CONFLICT (zone_group, produce_name) DO NOTHING;

-- ── HOT (Zones 10a–10b): South FL, SoCal coast, Phoenix ──
INSERT INTO usda_zone_produce (zone_group, produce_name, category, emoji, season, rank) VALUES
  ('hot', 'Mangoes',        'fruits',     '🥭', 'summer',     1),
  ('hot', 'Avocados',       'fruits',     '🥑', 'year_round', 2),
  ('hot', 'Lemons',         'fruits',     '🍋', 'year_round', 3),
  ('hot', 'Oranges',        'fruits',     '🍊', 'winter',     4),
  ('hot', 'Papayas',        'fruits',     '🍈', 'year_round', 5),
  ('hot', 'Passion Fruit',  'fruits',     '🍈', 'summer',     6),
  ('hot', 'Guava',          'fruits',     '🍈', 'fall',       7),
  ('hot', 'Tomatoes',       'fruits',     '🍅', 'winter',     8),
  ('hot', 'Strawberries',   'fruits',     '🍓', 'winter',     9),
  ('hot', 'Bananas',        'fruits',     '🍌', 'year_round', 10),
  ('hot', 'Peppers',        'vegetables', '🫑', 'year_round', 1),
  ('hot', 'Sweet Potatoes', 'vegetables', '🍠', 'summer',     2),
  ('hot', 'Okra',           'vegetables', '🌿', 'summer',     3),
  ('hot', 'Eggplant',       'vegetables', '🍆', 'spring',     4),
  ('hot', 'Cucumbers',      'vegetables', '🥒', 'spring',     5),
  ('hot', 'Lettuce',        'vegetables', '🥬', 'winter',     6),
  ('hot', 'Spinach',        'vegetables', '🥬', 'winter',     7),
  ('hot', 'Green Beans',    'vegetables', '🫘', 'spring',     8),
  ('hot', 'Hibiscus',       'flowers',    '🌺', 'year_round', 1),
  ('hot', 'Plumeria',       'flowers',    '🌸', 'summer',     2),
  ('hot', 'Orchids',        'flowers',    '🌷', 'year_round', 3),
  ('hot', 'Jasmine',        'flowers',    '🌸', 'year_round', 4),
  ('hot', 'Bougainvillea',  'flowers',    '🌺', 'year_round', 5),
  ('hot', 'Bird of Paradise','flowers',   '🌺', 'year_round', 6),
  ('hot', 'Basil',          'herbs',      '🌿', 'year_round', 1),
  ('hot', 'Mint',           'herbs',      '🌿', 'year_round', 2),
  ('hot', 'Lemongrass',     'herbs',      '🌿', 'year_round', 3),
  ('hot', 'Rosemary',       'herbs',      '🌿', 'year_round', 4),
  ('hot', 'Cilantro',       'herbs',      '🌿', 'winter',     5),
  ('hot', 'Thai Basil',     'herbs',      '🌿', 'year_round', 6)
ON CONFLICT (zone_group, produce_name) DO NOTHING;

-- ── TROPICAL (Zones 11a–13b): Hawaii, PR, US territories ──
INSERT INTO usda_zone_produce (zone_group, produce_name, category, emoji, season, rank) VALUES
  ('tropical', 'Mangoes',        'fruits',     '🥭', 'summer',     1),
  ('tropical', 'Papayas',        'fruits',     '🍈', 'year_round', 2),
  ('tropical', 'Bananas',        'fruits',     '🍌', 'year_round', 3),
  ('tropical', 'Pineapple',      'fruits',     '🍍', 'year_round', 4),
  ('tropical', 'Coconut',        'fruits',     '🥥', 'year_round', 5),
  ('tropical', 'Passion Fruit',  'fruits',     '🍈', 'year_round', 6),
  ('tropical', 'Guava',          'fruits',     '🍈', 'year_round', 7),
  ('tropical', 'Avocados',       'fruits',     '🥑', 'year_round', 8),
  ('tropical', 'Starfruit',      'fruits',     '⭐', 'year_round', 9),
  ('tropical', 'Dragon Fruit',   'fruits',     '🐉', 'summer',     10),
  ('tropical', 'Taro',           'vegetables', '🟤', 'year_round', 1),
  ('tropical', 'Sweet Potatoes', 'vegetables', '🍠', 'year_round', 2),
  ('tropical', 'Peppers',        'vegetables', '🫑', 'year_round', 3),
  ('tropical', 'Eggplant',       'vegetables', '🍆', 'year_round', 4),
  ('tropical', 'Okra',           'vegetables', '🌿', 'year_round', 5),
  ('tropical', 'Cucumbers',      'vegetables', '🥒', 'year_round', 6),
  ('tropical', 'Orchids',        'flowers',    '🌷', 'year_round', 1),
  ('tropical', 'Plumeria',       'flowers',    '🌸', 'year_round', 2),
  ('tropical', 'Hibiscus',       'flowers',    '🌺', 'year_round', 3),
  ('tropical', 'Bird of Paradise','flowers',   '🌺', 'year_round', 4),
  ('tropical', 'Bougainvillea',  'flowers',    '🌺', 'year_round', 5),
  ('tropical', 'Anthurium',      'flowers',    '❤️', 'year_round', 6),
  ('tropical', 'Basil',          'herbs',      '🌿', 'year_round', 1),
  ('tropical', 'Lemongrass',     'herbs',      '🌿', 'year_round', 2),
  ('tropical', 'Thai Basil',     'herbs',      '🌿', 'year_round', 3),
  ('tropical', 'Turmeric',       'herbs',      '🟡', 'year_round', 4),
  ('tropical', 'Ginger',         'herbs',      '🫚', 'year_round', 5),
  ('tropical', 'Mint',           'herbs',      '🌿', 'year_round', 6)
ON CONFLICT (zone_group, produce_name) DO NOTHING;

-- ── DEFAULT fallback — nationwide basics for any unmapped zip ──
INSERT INTO usda_zone_produce (zone_group, produce_name, category, emoji, season, rank) VALUES
  ('DEFAULT', 'Tomatoes',     'fruits',     '🍅', 'summer',     1),
  ('DEFAULT', 'Strawberries', 'fruits',     '🍓', 'spring',     2),
  ('DEFAULT', 'Blueberries',  'fruits',     '🫐', 'summer',     3),
  ('DEFAULT', 'Apples',       'fruits',     '🍎', 'fall',       4),
  ('DEFAULT', 'Lemons',       'fruits',     '🍋', 'year_round', 5),
  ('DEFAULT', 'Grapes',       'fruits',     '🍇', 'summer',     6),
  ('DEFAULT', 'Peaches',      'fruits',     '🍑', 'summer',     7),
  ('DEFAULT', 'Watermelon',   'fruits',     '🍉', 'summer',     8),
  ('DEFAULT', 'Lettuce',      'vegetables', '🥬', 'spring',     1),
  ('DEFAULT', 'Peppers',      'vegetables', '🫑', 'summer',     2),
  ('DEFAULT', 'Cucumbers',    'vegetables', '🥒', 'summer',     3),
  ('DEFAULT', 'Carrots',      'vegetables', '🥕', 'spring',     4),
  ('DEFAULT', 'Zucchini',     'vegetables', '🥒', 'summer',     5),
  ('DEFAULT', 'Green Beans',  'vegetables', '🫘', 'summer',     6),
  ('DEFAULT', 'Onions',       'vegetables', '🧅', 'spring',     7),
  ('DEFAULT', 'Corn',         'vegetables', '🌽', 'summer',     8),
  ('DEFAULT', 'Sunflowers',   'flowers',    '🌻', 'summer',     1),
  ('DEFAULT', 'Roses',        'flowers',    '🌹', 'spring',     2),
  ('DEFAULT', 'Marigolds',    'flowers',    '🌼', 'summer',     3),
  ('DEFAULT', 'Lavender',     'flowers',    '💜', 'summer',     4),
  ('DEFAULT', 'Dahlia',       'flowers',    '🌺', 'summer',     5),
  ('DEFAULT', 'Hibiscus',     'flowers',    '🌺', 'year_round', 6),
  ('DEFAULT', 'Basil',        'herbs',      '🌿', 'summer',     1),
  ('DEFAULT', 'Mint',         'herbs',      '🌿', 'year_round', 2),
  ('DEFAULT', 'Rosemary',     'herbs',      '🌿', 'year_round', 3),
  ('DEFAULT', 'Cilantro',     'herbs',      '🌿', 'spring',     4),
  ('DEFAULT', 'Parsley',      'herbs',      '🌿', 'spring',     5),
  ('DEFAULT', 'Thyme',        'herbs',      '🌿', 'year_round', 6),
  ('DEFAULT', 'Dill',         'herbs',      '🌿', 'summer',     7),
  ('DEFAULT', 'Chives',       'herbs',      '🌿', 'spring',     8)
ON CONFLICT (zone_group, produce_name) DO NOTHING;

-- ============================================================================
-- 6. Seed zip_prefix_to_zone — covers ALL US 3-digit zip prefixes
--    Mapping based on USDA Plant Hardiness Zone Map
-- ============================================================================

-- Helper function for bulk insert
CREATE OR REPLACE FUNCTION seed_zip_prefixes(prefixes TEXT[], p_zone TEXT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY prefixes LOOP
    INSERT INTO zip_prefix_to_zone (zip_prefix, zone_group)
    VALUES (p, p_zone)
    ON CONFLICT (zip_prefix) DO NOTHING;
  END LOOP;
END;
$$;

DO $$
BEGIN
  -- COLD (3a-4b): Alaska interior, N. Minnesota, N. Wisconsin, Montana, N. Dakota
  PERFORM seed_zip_prefixes(ARRAY[
    '995','996','997','998','999',   -- AK (interior/north)
    '556','557','558','559','560',   -- MN (northern)
    '567','580','581','582','583',   -- ND
    '584','585','586','587','588',   -- ND/SD border
    '590','591','592','593','594',   -- MT
    '595','596','597','598','599',   -- MT
    '534','535','544','545','546',   -- WI (north)
    '547','548','549',               -- WI (far north)
    '043','044','045','046','047',   -- ME (interior/north)
    '048','049',                     -- ME (far north)
    '057','058','059',               -- VT (north)
    '836','837','838'                -- ID (north)
  ], 'cold');

  -- COOL (5a-5b): Upper Midwest, N. New York, inland New England, Wyoming
  PERFORM seed_zip_prefixes(ARRAY[
    '500','501','502','503','504',   -- IA
    '505','506','507','508','509',   -- IA
    '510','511','512','513','514',   -- IA (western)
    '515','516','520','521','522',   -- IA
    '523','524','525','526','527',   -- IA
    '528',                           -- IA
    '530','531','532','533',         -- WI (south)
    '536','537','538','539',         -- WI (central)
    '540','541','542','543',         -- WI
    '550','551','553','554','555',   -- MN (Twin Cities / south)
    '561','562','563','564','565',   -- MN (central)
    '566',                           -- MN
    '570','571','572','573','574',   -- SD
    '575','576','577',               -- SD
    '600','601','602','603','604',   -- IL (Chicago area)
    '605','606','607','608','609',   -- IL
    '610','611','612','613','614',   -- IL
    '615','616','617','618','619',   -- IL
    '680','681','683','684','685',   -- NE
    '686','687','688','689','690',   -- NE
    '691','692','693',               -- NE
    '820','821','822','823','824',   -- WY
    '825','826','827','828','829',   -- WY (828 also NC, handled below)
    '830','831',                     -- WY
    '832','833','834',               -- ID (south)
    '010','011','012','013',         -- MA (western)
    '120','121','122','123','124',   -- NY (upstate)
    '125','126','127','128','129',   -- NY
    '130','131','132','133','134',   -- NY (central/north)
    '135','136','137','138','139',   -- NY
    '140','141','142','143','144',   -- NY (Buffalo)
    '145','146','147','148','149',   -- NY
    '030','031','032','033','034',   -- NH
    '035','036','037','038',         -- NH
    '050','051','052','053','054',   -- VT
    '055','056',                     -- VT
    '040','041','042',               -- ME (south)
    '480','481','482','483','484',   -- MI
    '485','486','487','488','489',   -- MI
    '490','491','492','493','494',   -- MI
    '495','496','497','498','499'    -- MI (UP)
  ], 'cool');

  -- MODERATE_COOL (6a-6b): Midwest, Mid-Atlantic interior, Colorado, Kansas
  PERFORM seed_zip_prefixes(ARRAY[
    '430','431','432','433','434',   -- OH
    '435','436','437','438','439',   -- OH
    '440','441','442','443','444',   -- OH
    '445','446','447','448','449',   -- OH
    '450','451','452','453','454',   -- OH
    '455','456','457','458','459',   -- OH
    '460','461','462','463','464',   -- IN
    '465','466','467','468','469',   -- IN
    '470','471','472','473','474',   -- IN
    '475','476','477','478','479',   -- IN
    '620','621','622','623','624',   -- MO (incl IL south)
    '625','626','627','628','629',   -- MO
    '630','631','633','634','635',   -- MO
    '636','637','638','639',         -- MO
    '640','641','644','645','646',   -- MO (KC area)
    '647','648','649','650','651',   -- MO
    '652','653','654','655','656',   -- MO
    '657','658',                     -- MO
    '660','661','662','664','665',   -- KS
    '666','667','668','669','670',   -- KS
    '671','672','673','674','675',   -- KS
    '676','677','678','679',         -- KS
    '800','801','802','803','804',   -- CO
    '805','806','807','808','809',   -- CO
    '810','811','812','813','814',   -- CO
    '815','816',                     -- CO
    '150','151','152','153','154',   -- PA (western)
    '155','156','157','158','159',   -- PA
    '160','161','162','163','164',   -- PA
    '165','166','167','168','169',   -- PA
    '170','171','172','173','174',   -- PA (central)
    '175','176','177','178','179',   -- PA
    '180','181','182','183','184',   -- PA (eastern)
    '185','186','187','188','189',   -- PA
    '190','191',                     -- PA (Philly area)
    '060','061','062','063','064',   -- CT
    '065','066','067','068','069',   -- CT
    '014','015','016','017','018',   -- MA (eastern)
    '019','020','021','022','023',   -- MA
    '024','025','026','027',         -- MA
    '028','029',                     -- RI
    '100','101','102','103','104',   -- NY (NYC area)
    '105','106','107','108','109',   -- NY
    '110','111','112','113','114',   -- NY (Long Island)
    '115','116','117','118','119',   -- NY
    '070','071','072','073','074',   -- NJ
    '075','076','077','078','079',   -- NJ
    '080','081','082','083','084',   -- NJ
    '085','086','087','088','089',   -- NJ
    '197','198','199',               -- DE
    '006','007','008','009',         -- PR (cool highland areas)
    '840','841','842','843','844',   -- UT
    '845','846','847'                -- UT
  ], 'moderate_cool');

  -- MODERATE (7a-7b): Pacific NW, Mid-Atlantic, Upper South, NM
  PERFORM seed_zip_prefixes(ARRAY[
    '970','971','972','973','974',   -- OR
    '975','976','977','978','979',   -- OR
    '980','981','982','983','984',   -- WA
    '985','986',                     -- WA (western)
    '988','989','990','991','992',   -- WA (eastern)
    '993','994',                     -- WA
    '200','201','202','203','204',   -- DC / MD
    '205','206','207','208','209',   -- MD
    '210','211','212',               -- MD (Baltimore)
    '214','215','216','217','218',   -- MD
    '219',                           -- MD
    '220','221','222','223','224',   -- VA (northern)
    '225','226','227',               -- VA
    '228','229','230','231','232',   -- VA
    '233','234','235','236','237',   -- VA
    '238','239','240','241','242',   -- VA
    '243','244','245','246',         -- VA
    '247','248','249','250','251',   -- WV
    '252','253','254','255','256',   -- WV
    '257','258','259','260','261',   -- WV
    '262','263','264','265','266',   -- WV
    '267','268',                     -- WV
    '270','271','272','273','274',   -- NC (piedmont)
    '275','276','277','278','279',   -- NC
    '280','281','282','283','284',   -- NC (Charlotte area)
    '285','286','287','288','289',   -- NC
    '370','371','372','373','374',   -- TN
    '375','376','377','378','379',   -- TN
    '380','381','382','383','384',   -- TN (western)
    '385',                           -- TN
    '400','401','402','403','404',   -- KY
    '405','406','407','408','409',   -- KY
    '410','411','412','413','414',   -- KY
    '415','416','417','418',         -- KY
    '870','871','872','873','874',   -- NM
    '875','876','877','878','879',   -- NM
    '880','881','882','883','884',   -- NM
    '192','193','194','195','196'    -- PA (southeast, warmer)
  ], 'moderate');

  -- WARM_MODERATE (8a-8b): Southeast, TX, coastal Carolinas, AR, N. GA
  PERFORM seed_zip_prefixes(ARRAY[
    '290','291','292','293','294',   -- SC
    '295','296','297','298','299',   -- SC
    '300','301','302','303','304',   -- GA (Atlanta / north)
    '305','306','307','308','309',   -- GA
    '310','311','312','313','314',   -- GA
    '315','316','317','318','319',   -- GA
    '350','351','352','353','354',   -- AL
    '355','356','357','358','359',   -- AL
    '360','361','362','363','364',   -- AL
    '365','366','367','368','369',   -- AL
    '386','387','388','389',         -- MS
    '390','391','392','393','394',   -- MS
    '395','396','397',               -- MS
    '700','701','703','704','705',   -- LA
    '706','707','708','710','711',   -- LA
    '712','713','714',               -- LA
    '716','717','718','719','720',   -- AR
    '721','722','723','724','725',   -- AR
    '726','727','728','729',         -- AR
    '730','731','733','734','735',   -- OK
    '736','737','738','739','740',   -- OK
    '741','743','744','745','746',   -- OK
    '747','748','749',               -- OK
    '750','751','752','753','754',   -- TX (Dallas)
    '755','756','757','758','759',   -- TX
    '760','761','762','763','764',   -- TX (Fort Worth)
    '765','766','767','768','769',   -- TX
    '770','771','772','773','774',   -- TX (Houston)
    '775','776','777','778','779',   -- TX
    '780','781','782','783','784',   -- TX (San Antonio)
    '785','786','787','788','789',   -- TX
    '790','791','792','793','794',   -- TX (panhandle)
    '795','796','797','798','799',   -- TX (El Paso area)
    '850','851','852','853',         -- AZ (north/central)
    '855','856','857',               -- AZ
    '893',                           -- NV (Las Vegas area)
    '889','890','891',               -- NV
    '860','863','864','865',         -- AZ (higher elevation)
    '987'                            -- WA (SE, warmer)
  ], 'warm_moderate');

  -- WARM (9a-9b): Coastal CA, inland FL, Gulf Coast, AZ lowlands
  PERFORM seed_zip_prefixes(ARRAY[
    '900','901','902','903','904',   -- CA (LA area)
    '905','906','907','908','910',   -- CA
    '911','912','913','914','915',   -- CA
    '916','917','918','919','920',   -- CA
    '921','922','923','924','925',   -- CA (San Diego)
    '926','927','928',               -- CA (Orange County)
    '930','931','932','933','934',   -- CA (Central Coast)
    '935','936','937','938','939',   -- CA (Central Valley)
    '940','941','943','944','945',   -- CA (Bay Area)
    '946','947','948','949',         -- CA
    '950','951','952','953','954',   -- CA (San Jose area)
    '955','956','957','958','959',   -- CA (Sacramento area)
    '960','961',                     -- CA (far north)
    '320','321','322','323','324',   -- FL (north/central)
    '325','326','327','328','329',   -- FL
    '336','337','338','339',         -- FL (Tampa area)
    '340','341','342','344','346',   -- FL
    '347','349',                     -- FL
    '394','395','396','397',         -- MS (coast, but overlap handled)
    '854','858','859',               -- AZ (Tucson/Phoenix lowlands)
    '934','935',                     -- CA (inland)
    '967','968',                     -- HI (cooler areas)
    '965','966',                     -- CA (Redding area)
    '885','886','887','888'          -- TX (El Paso, warmer parts) / NV
  ], 'warm');

  -- HOT (10a-10b): South FL, SoCal coast, HI lowlands
  PERFORM seed_zip_prefixes(ARRAY[
    '330','331','332','333','334',   -- FL (Miami / South)
    '335',                           -- FL (Tampa, warmer coast)
    '338','339',                     -- FL (overlap, coastal)
    '340','341',                     -- FL (coastal)
    '342','344','346','347','349',   -- FL
    '907','908',                     -- CA (SoCal coast, overlap)
    '962','963','964',               -- CA / military APO
    '969',                           -- GU (Guam)
    '854','858','859',               -- AZ (Phoenix proper, overlap)
    '005'                            -- NY (military APO)
  ], 'hot');

  -- TROPICAL (11a-13b): Hawaii, PR, US territories
  PERFORM seed_zip_prefixes(ARRAY[
    '967','968',                     -- HI
    '006','007','008','009',         -- PR (lowland coastal, overlap)
    '969',                           -- GU (Guam)
    '008','009',                     -- VI (Virgin Islands)
    '962','963','964','966'          -- AP/military Pacific
  ], 'tropical');
END;
$$;

-- Clean up helper
DROP FUNCTION IF EXISTS seed_zip_prefixes;

-- ============================================================================
-- 7. RPC: get_popular_produce_for_zip(p_zip TEXT)
--    Looks up zone from prefix, returns produce list. Falls back to DEFAULT.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_popular_produce_for_zip(p_zip TEXT)
RETURNS TABLE (
  produce_name TEXT,
  category     TEXT,
  emoji        TEXT,
  season       TEXT,
  rank         INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_zone   TEXT;
BEGIN
  -- Extract 3-digit prefix
  v_prefix := LEFT(COALESCE(p_zip, ''), 3);

  -- Look up zone group from prefix
  SELECT zp.zone_group INTO v_zone
  FROM zip_prefix_to_zone zp
  WHERE zp.zip_prefix = v_prefix;

  -- Fall back to DEFAULT if no mapping found
  IF v_zone IS NULL THEN
    v_zone := 'DEFAULT';
  END IF;

  RETURN QUERY
    SELECT z.produce_name, z.category, z.emoji, z.season, z.rank
    FROM usda_zone_produce z
    WHERE z.zone_group = v_zone
    ORDER BY z.category, z.rank;
END;
$$;
