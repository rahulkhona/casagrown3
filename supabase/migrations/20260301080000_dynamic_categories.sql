-- ============================================================================
-- Migration: Dynamic Categories & Blocked Products — Schema
-- Replaces sales_category enum with sales_categories table.
-- Creates category_restrictions, blocked_products tables.
-- Adds is_archived to posts for ban cascade.
-- ============================================================================

-- 1. Create sales_categories table
CREATE TABLE IF NOT EXISTS sales_categories (
  name          TEXT PRIMARY KEY,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

INSERT INTO sales_categories (name, display_order) VALUES
  ('fruits',              1),
  ('vegetables',          2),
  ('herbs',               3),
  ('flowers',             4),
  ('flower_arrangements', 5),
  ('garden_equipment',    6),
  ('pots',                7),
  ('soil',                8)
ON CONFLICT (name) DO NOTHING;

-- 2. Add is_archived to posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_posts_is_archived ON posts(is_archived) WHERE is_archived = false;

-- 3. Convert category columns from enum to TEXT
ALTER TABLE want_to_sell_details ALTER COLUMN category TYPE TEXT USING category::TEXT;
ALTER TABLE want_to_buy_details ALTER COLUMN category TYPE TEXT USING category::TEXT;
ALTER TABLE orders ALTER COLUMN category TYPE TEXT USING category::TEXT;

-- 4. Add FK constraints
ALTER TABLE want_to_sell_details ADD CONSTRAINT fk_sell_category FOREIGN KEY (category) REFERENCES sales_categories(name);
ALTER TABLE want_to_buy_details ADD CONSTRAINT fk_buy_category FOREIGN KEY (category) REFERENCES sales_categories(name);
ALTER TABLE orders ADD CONSTRAINT fk_order_category FOREIGN KEY (category) REFERENCES sales_categories(name);

-- 5. Create category_restrictions table
CREATE TABLE IF NOT EXISTS category_restrictions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name       TEXT NOT NULL REFERENCES sales_categories(name) ON DELETE CASCADE,
  community_h3_index  TEXT REFERENCES communities(h3_index),
  reason              TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_name, community_h3_index)
);

-- 6. Migrate data from old table
INSERT INTO category_restrictions (category_name, community_h3_index, created_at)
SELECT category::TEXT, community_h3_index, created_at
FROM sales_category_restrictions
WHERE is_allowed = false
ON CONFLICT (category_name, community_h3_index) DO NOTHING;

-- 7. Drop old table
DROP TABLE IF EXISTS sales_category_restrictions;

-- 8. Create blocked_products table
CREATE TABLE IF NOT EXISTS blocked_products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name        TEXT NOT NULL,
  community_h3_index  TEXT REFERENCES communities(h3_index),
  reason              TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_name, community_h3_index)
);

-- 9. Drop the sales_category enum
DROP TYPE IF EXISTS sales_category;

-- 10. RLS Policies
ALTER TABLE sales_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read categories" ON sales_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can read categories" ON sales_categories FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can manage categories" ON sales_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

ALTER TABLE category_restrictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read category restrictions" ON category_restrictions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage category restrictions" ON category_restrictions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

ALTER TABLE blocked_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read blocked products" ON blocked_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage blocked products" ON blocked_products FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
