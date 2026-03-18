-- ============================================================================
-- Migration: Consolidate Sales Categories for Launch
-- Replaces granular produce categories (fruits, vegetables, herbs) with 
-- a single "produce" category. Adds "seeds". Removes unused categories
-- (baked, preserved, dairy). Sets is_produce flag on produce.
-- ============================================================================

-- 1. Add new categories first
INSERT INTO sales_categories (name, display_order, is_produce) VALUES
  ('produce', 1, true),
  ('seeds',   8, false)
ON CONFLICT (name) DO NOTHING;

-- 2. Migrate any existing references from granular categories to "produce"
--    (want_to_sell_details, want_to_buy_details, orders, market_products)
UPDATE want_to_sell_details SET category = 'produce' WHERE category IN ('fruits', 'vegetables', 'herbs');
UPDATE want_to_buy_details  SET category = 'produce' WHERE category IN ('fruits', 'vegetables', 'herbs');
UPDATE orders               SET category = 'produce' WHERE category IN ('fruits', 'vegetables', 'herbs');
UPDATE market_products      SET category = 'produce' WHERE category IN ('fruits', 'vegetables', 'herbs');

-- 3. Remove any tax rules referencing old categories
--    (New produce rules will be seeded in a subsequent migration)
DELETE FROM category_tax_rules WHERE category_name IN ('fruits', 'vegetables', 'herbs');

-- 4. Remove any category restrictions referencing old categories
DELETE FROM category_restrictions WHERE category_name IN ('fruits', 'vegetables', 'herbs');

-- 5. Migrate references from categories being removed
UPDATE want_to_sell_details SET category = 'produce' WHERE category IN ('baked', 'preserved', 'dairy');
UPDATE want_to_buy_details  SET category = 'produce' WHERE category IN ('baked', 'preserved', 'dairy');
UPDATE orders               SET category = 'produce' WHERE category IN ('baked', 'preserved', 'dairy');
UPDATE market_products      SET category = 'produce' WHERE category IN ('baked', 'preserved', 'dairy');
DELETE FROM category_tax_rules WHERE category_name IN ('baked', 'preserved', 'dairy');
DELETE FROM category_restrictions WHERE category_name IN ('baked', 'preserved', 'dairy');

-- 6. Now safe to delete old categories (all FK references migrated)
DELETE FROM sales_categories WHERE name IN ('fruits', 'vegetables', 'herbs', 'baked', 'preserved', 'dairy');

-- 7. Reset display_order for clean ordering
UPDATE sales_categories SET display_order = 1 WHERE name = 'produce';
UPDATE sales_categories SET display_order = 2 WHERE name = 'flowers';
UPDATE sales_categories SET display_order = 3 WHERE name = 'flower_arrangements';
UPDATE sales_categories SET display_order = 4 WHERE name = 'garden_equipment';
UPDATE sales_categories SET display_order = 5 WHERE name = 'pots';
UPDATE sales_categories SET display_order = 6 WHERE name = 'soil';
UPDATE sales_categories SET display_order = 7 WHERE name = 'seeds';
UPDATE sales_categories SET display_order = 8 WHERE name = 'eggs';
UPDATE sales_categories SET display_order = 9 WHERE name = 'honey';
