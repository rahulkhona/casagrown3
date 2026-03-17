-- ==========================================================================
-- Test: Core table schemas (market_orders, market_products, profiles, booths)
-- ==========================================================================
BEGIN;
SELECT plan(12);

-- market_orders
SELECT has_table('public', 'market_orders', 'market_orders table exists');
SELECT has_column('public', 'market_orders', 'status', 'orders has status');
SELECT has_column('public', 'market_orders', 'total_usd', 'orders has total_usd');

-- market_products
SELECT has_table('public', 'market_products', 'market_products table exists');
SELECT has_column('public', 'market_products', 'price_usd', 'products has price_usd');
SELECT col_type_is('public', 'market_products', 'inventory', 'integer', 'inventory is integer');

-- profiles
SELECT has_table('public', 'profiles', 'profiles table exists');
SELECT has_column('public', 'profiles', 'full_name', 'profiles has full_name');
SELECT has_column('public', 'profiles', 'is_banned', 'profiles has is_banned');

-- market_booths
SELECT has_table('public', 'market_booths', 'market_booths table exists');
SELECT has_column('public', 'market_booths', 'owner_id', 'booths has owner_id');
SELECT has_column('public', 'market_booths', 'name', 'booths has name');

SELECT * FROM finish();
ROLLBACK;
