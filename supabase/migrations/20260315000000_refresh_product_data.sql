-- ============================================================================
-- Lightweight product data refresh RPC
-- Used for periodic polling (30s interval) to keep prices/inventory fresh
-- on browse, booth, and product detail pages.
-- 
-- Design: Primary key ANY() lookup — ~2ms for 50 products.
-- This avoids re-running the expensive spatial nearby_booths query on every poll.
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_product_data(product_ids UUID[])
RETURNS TABLE(id UUID, price_usd NUMERIC, inventory INT, is_active BOOLEAN)
LANGUAGE sql STABLE
AS $$
  SELECT mp.id, mp.price_usd, mp.inventory, mp.is_active
  FROM market_products mp
  WHERE mp.id = ANY(product_ids);
$$;
