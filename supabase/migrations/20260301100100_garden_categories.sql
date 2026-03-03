-- ============================================================================
-- Migration: Garden Produce Catalog
-- Predetermined list of fruits, vegetables, flowers, and herbs.
-- Extends user_garden with category and is_custom columns.
-- ============================================================================

-- 1. Garden produce catalog (pre-seeded reference table)
CREATE TABLE IF NOT EXISTS garden_produce_catalog (
  name          TEXT PRIMARY KEY,
  category      TEXT NOT NULL CHECK (category IN ('fruits', 'vegetables', 'flowers', 'herbs')),
  emoji         TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS: everyone can read the catalog
ALTER TABLE garden_produce_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read garden catalog"
  ON garden_produce_catalog FOR SELECT
  TO authenticated USING (true);

-- 2. Extend user_garden with category tracking
ALTER TABLE user_garden
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'vegetables',
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false;

-- 3. Ensure unique produce per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_garden_unique
  ON user_garden (user_id, produce_name);

-- 4. Seed the catalog with common items
INSERT INTO garden_produce_catalog (name, category, emoji, display_order) VALUES
  -- Fruits
  ('Tomatoes',     'fruits', '🍅', 1),
  ('Lemons',       'fruits', '🍋', 2),
  ('Oranges',      'fruits', '🍊', 3),
  ('Avocados',     'fruits', '🥑', 4),
  ('Strawberries', 'fruits', '🍓', 5),
  ('Blueberries',  'fruits', '🫐', 6),
  ('Figs',         'fruits', '🫒', 7),
  ('Grapes',       'fruits', '🍇', 8),
  ('Peaches',      'fruits', '🍑', 9),
  ('Apples',       'fruits', '🍎', 10),
  ('Pomegranates', 'fruits', '🍎', 11),
  ('Guava',        'fruits', '🍈', 12),
  ('Passion Fruit','fruits', '🍈', 13),
  -- Vegetables
  ('Lettuce',      'vegetables', '🥬', 1),
  ('Peppers',      'vegetables', '🫑', 2),
  ('Cucumbers',    'vegetables', '🥒', 3),
  ('Zucchini',     'vegetables', '🥒', 4),
  ('Carrots',      'vegetables', '🥕', 5),
  ('Radishes',     'vegetables', '🥕', 6),
  ('Kale',         'vegetables', '🥬', 7),
  ('Spinach',      'vegetables', '🥬', 8),
  ('Green Beans',  'vegetables', '🫘', 9),
  ('Peas',         'vegetables', '🫛', 10),
  ('Corn',         'vegetables', '🌽', 11),
  ('Onions',       'vegetables', '🧅', 12),
  ('Garlic',       'vegetables', '🧄', 13),
  ('Squash',       'vegetables', '🎃', 14),
  ('Eggplant',     'vegetables', '🍆', 15),
  -- Flowers
  ('Sunflowers',   'flowers', '🌻', 1),
  ('Roses',        'flowers', '🌹', 2),
  ('Lavender',     'flowers', '💜', 3),
  ('Marigolds',    'flowers', '🌼', 4),
  ('Jasmine',      'flowers', '🌸', 5),
  ('Dahlia',       'flowers', '🌺', 6),
  ('Orchids',      'flowers', '🌷', 7),
  ('Hibiscus',     'flowers', '🌺', 8),
  -- Herbs
  ('Basil',        'herbs', '🌿', 1),
  ('Mint',         'herbs', '🌿', 2),
  ('Rosemary',     'herbs', '🌿', 3),
  ('Cilantro',     'herbs', '🌿', 4),
  ('Thyme',        'herbs', '🌿', 5),
  ('Oregano',      'herbs', '🌿', 6),
  ('Parsley',      'herbs', '🌿', 7),
  ('Sage',         'herbs', '🌿', 8),
  ('Dill',         'herbs', '🌿', 9),
  ('Chives',       'herbs', '🌿', 10),
  ('Lemongrass',   'herbs', '🌿', 11)
ON CONFLICT (name) DO NOTHING;
