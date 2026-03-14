-- ============================================================================
-- Migration: Market Schema
-- Creates market-specific tables for booths and products.
-- Does NOT modify any community tables.
--
-- Design Notes:
-- - Products are per-market-day (not recurring catalog items)
-- - Delivery/pickup options are set at the booth level, not per product
-- - No coupons table (deferred)
-- - One market day per week (1-day marketplace)
-- ============================================================================

-- 1. Booths — one per seller, FK to profiles
-- Delivery/pickup settings live here (booth-level, not per-product)
CREATE TABLE market_booths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  decorative_theme TEXT DEFAULT 'floral',
  about_html TEXT,
  invite_code TEXT UNIQUE,
  offers_delivery BOOLEAN DEFAULT true,
  delivery_radius_miles INTEGER DEFAULT 5,
  offers_pickup BOOLEAN DEFAULT true,
  pickup_address TEXT,
  market_day_of_week INTEGER DEFAULT 6 CHECK (market_day_of_week BETWEEN 0 AND 6),
  -- 0=Sun, 6=Sat (default Saturday)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_id)  -- one booth per user
);

CREATE INDEX idx_market_booths_owner ON market_booths(owner_id);

-- 2. Products — per-market-day items listed by a seller
-- These are ephemeral — created for a specific market date, not a recurring catalog
-- Products are tied to the seller (user) directly, not to a booth
CREATE TABLE market_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  market_date DATE NOT NULL,
  -- The specific market day this product is listed for
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'produce',
  price_usd NUMERIC(10,2) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'each',
  inventory INTEGER NOT NULL DEFAULT 0,
  photos TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  harvested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_market_products_seller ON market_products(seller_id);
CREATE INDEX idx_market_products_date ON market_products(market_date);
CREATE INDEX idx_market_products_seller_date ON market_products(seller_id, market_date);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE market_booths ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_products ENABLE ROW LEVEL SECURITY;

-- Booths: public read, owner write
CREATE POLICY "Anyone can read booths"
  ON market_booths FOR SELECT USING (true);
CREATE POLICY "Owner can insert booth"
  ON market_booths FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner can update booth"
  ON market_booths FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owner can delete booth"
  ON market_booths FOR DELETE USING (auth.uid() = owner_id);

-- Products: public read, seller write
CREATE POLICY "Anyone can read products"
  ON market_products FOR SELECT USING (true);
CREATE POLICY "Seller can insert products"
  ON market_products FOR INSERT
  WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Seller can update products"
  ON market_products FOR UPDATE
  USING (auth.uid() = seller_id);
CREATE POLICY "Seller can delete products"
  ON market_products FOR DELETE
  USING (auth.uid() = seller_id);
