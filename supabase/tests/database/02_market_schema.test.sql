-- ============================================================================
-- pgTAP Tests for Market Schema
-- Run: docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
--        -c "CREATE EXTENSION IF NOT EXISTS pgtap;" && \
--      docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
--        < supabase/tests/database/02_market_schema.test.sql
-- ============================================================================
BEGIN;
SELECT plan(17);

-- ============================================================================
-- 1. Tables Exist
-- ============================================================================
SELECT has_table('market_booths',   'market_booths table should exist');
SELECT has_table('market_products', 'market_products table should exist');

-- ============================================================================
-- 2. Columns Exist — market_booths
-- ============================================================================
SELECT has_column('market_booths', 'id',                  'booths: id');
SELECT has_column('market_booths', 'owner_id',            'booths: owner_id');
SELECT has_column('market_booths', 'name',                'booths: name');
SELECT has_column('market_booths', 'decorative_theme',    'booths: decorative_theme');
SELECT has_column('market_booths', 'invite_code',         'booths: invite_code');
SELECT has_column('market_booths', 'offers_delivery',     'booths: offers_delivery');
SELECT has_column('market_booths', 'offers_pickup',       'booths: offers_pickup');
SELECT has_column('market_booths', 'market_day_of_week',  'booths: market_day_of_week');

-- ============================================================================
-- 3. Columns Exist — market_products
-- ============================================================================
SELECT has_column('market_products', 'id',            'products: id');
SELECT has_column('market_products', 'seller_id',    'products: seller_id');
SELECT has_column('market_products', 'market_date',   'products: market_date');
SELECT has_column('market_products', 'name',          'products: name');
SELECT has_column('market_products', 'price_usd',     'products: price_usd');
SELECT has_column('market_products', 'inventory',     'products: inventory');
SELECT has_column('market_products', 'harvested_at',  'products: harvested_at');

SELECT * FROM finish();
ROLLBACK;
