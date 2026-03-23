-- ============================================================================
-- Fix: refresh_product_data must also use expires_at instead of market_date
-- The 30s lightweight refresh was calling this RPC and marking products
-- inactive (market_date = yesterday), causing booths to show without products.
-- ============================================================================

SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION refresh_product_data(product_ids UUID[])
RETURNS TABLE(id UUID, price_usd NUMERIC, inventory INTEGER, is_active BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_never_expire BOOLEAN;
BEGIN
  SELECT COALESCE(ms.products_never_expire, false) INTO v_never_expire
  FROM market_settings ms WHERE ms.id = true;

  RETURN QUERY
  SELECT mp.id, mp.price_usd, mp.inventory,
    (mp.is_active
      AND (v_never_expire OR mp.expires_at IS NULL OR mp.expires_at > now())
    ) AS is_active
  FROM market_products mp
  WHERE mp.id = ANY(product_ids);
END;
$$;
