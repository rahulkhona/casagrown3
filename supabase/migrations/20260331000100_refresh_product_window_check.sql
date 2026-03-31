-- Update refresh_product_data to also return expires_at for window availability checking
DROP FUNCTION IF EXISTS refresh_product_data(UUID[]);

CREATE OR REPLACE FUNCTION refresh_product_data(product_ids UUID[])
RETURNS TABLE(id UUID, price_usd NUMERIC, inventory INTEGER, is_active BOOLEAN,
              product_delivery_windows JSONB, product_pickup_windows JSONB, 
              window_dates JSONB, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_never_expire BOOLEAN;
BEGIN
  SELECT COALESCE(ms.products_never_expire, false) INTO v_never_expire
  FROM market_settings ms WHERE ms.id = true;

  RETURN QUERY
  SELECT mp.id, mp.price_usd, mp.inventory,
    (mp.is_active
      AND NOT mp.is_draft
      AND (v_never_expire OR mp.expires_at IS NULL OR mp.expires_at > now())
    ) AS is_active,
    mp.product_delivery_windows,
    mp.product_pickup_windows,
    mp.window_dates,
    mp.expires_at
  FROM market_products mp
  WHERE mp.id = ANY(product_ids);
END;
$$;
