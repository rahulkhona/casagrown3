-- Fix bugs in metrics RPC functions:
-- 1. In metrics_sales_summary, use tax_amount_usd instead of tax_usd
-- 2. In metrics_marketplace_health, use seller_rating::text::int instead of seller_rating::int

CREATE OR REPLACE FUNCTION metrics_sales_summary(
  p_start DATE,
  p_end DATE,
  p_granularity TEXT DEFAULT 'daily',
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_gmv NUMERIC;
  v_total_orders BIGINT;
  v_avg_order NUMERIC;
  v_total_tax NUMERIC;
  v_total_fees NUMERIC;
  v_gmv_series JSONB;
  v_order_series JSONB;
  v_fulfillment JSONB;
  v_top_products JSONB;
  v_top_sellers JSONB;
  v_date_trunc TEXT;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_date_trunc := CASE p_granularity
    WHEN 'weekly' THEN 'week'
    WHEN 'monthly' THEN 'month'
    ELSE 'day'
  END;

  -- KPIs
  SELECT
    COALESCE(SUM(o.total_usd), 0),
    COUNT(*),
    COALESCE(AVG(o.total_usd), 0),
    COALESCE(SUM(o.tax_amount_usd), 0),
    COALESCE(SUM(o.platform_fee_usd), 0)
  INTO v_total_gmv, v_total_orders, v_avg_order, v_total_tax, v_total_fees
  FROM market_orders o
  JOIN profiles p ON p.id = o.buyer_id
  WHERE o.status != 'cancelled'
    AND o.created_at::date BETWEEN p_start AND p_end
    AND (p_state IS NULL OR p.state_code = p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_zip IS NULL OR p.zip_plus4 = p_zip);

  -- gmvTimeSeries: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'value', t.rev
  ) ORDER BY t.d), '[]'::jsonb) INTO v_gmv_series
  FROM (
    SELECT date_trunc(v_date_trunc, o.created_at)::date AS d, SUM(o.total_usd) AS rev
    FROM market_orders o
    JOIN profiles p ON p.id = o.buyer_id
    WHERE o.status != 'cancelled' AND o.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR p.state_code = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
    GROUP BY 1
  ) t;

  -- orderCountTimeSeries: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'value', t.cnt
  ) ORDER BY t.d), '[]'::jsonb) INTO v_order_series
  FROM (
    SELECT date_trunc(v_date_trunc, o.created_at)::date AS d, COUNT(*) AS cnt
    FROM market_orders o
    JOIN profiles p ON p.id = o.buyer_id
    WHERE o.status != 'cancelled' AND o.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR p.state_code = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
    GROUP BY 1
  ) t;

  -- fulfillmentSplit: [{type, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', t.ft, 'count', t.cnt
  )), '[]'::jsonb) INTO v_fulfillment
  FROM (
    SELECT o.fulfillment_type AS ft, COUNT(*) AS cnt
    FROM market_orders o
    WHERE o.status != 'cancelled' AND o.created_at::date BETWEEN p_start AND p_end
    GROUP BY o.fulfillment_type
  ) t;

  -- topProducts: [{name, revenue, orders}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', t.pname, 'revenue', t.rev, 'orders', t.cnt
  )), '[]'::jsonb) INTO v_top_products
  FROM (
    SELECT o.product_name AS pname, SUM(o.total_usd) AS rev, COUNT(*) AS cnt
    FROM market_orders o
    WHERE o.status != 'cancelled' AND o.created_at::date BETWEEN p_start AND p_end
    GROUP BY o.product_name ORDER BY SUM(o.total_usd) DESC LIMIT 5
  ) t;

  -- topSellers: [{name, revenue, orders}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', t.sname, 'revenue', t.rev, 'orders', t.cnt
  )), '[]'::jsonb) INTO v_top_sellers
  FROM (
    SELECT sp.full_name AS sname, SUM(o.total_usd) AS rev, COUNT(*) AS cnt
    FROM market_orders o
    JOIN profiles sp ON sp.id = o.seller_id
    WHERE o.status != 'cancelled' AND o.created_at::date BETWEEN p_start AND p_end
    GROUP BY sp.full_name ORDER BY SUM(o.total_usd) DESC LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'gmvTimeSeries', v_gmv_series,
    'orderCountTimeSeries', v_order_series,
    'avgOrderValue', ROUND(v_avg_order, 2),
    'totalGMV', v_total_gmv,
    'totalOrders', v_total_orders,
    'totalTax', v_total_tax,
    'totalFees', v_total_fees,
    'fulfillmentSplit', v_fulfillment,
    'topProducts', v_top_products,
    'topSellers', v_top_sellers
  );
END;
$$;


CREATE OR REPLACE FUNCTION metrics_marketplace_health(
  p_start DATE,
  p_end DATE,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active_sellers JSONB;
  v_active_buyers JSONB;
  v_new_booths JSONB;
  v_product_active BIGINT;
  v_product_inactive BIGINT;
  v_flag_activity JSONB;
  v_avg_seller_rating NUMERIC;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- activeSellers: [{date, value}] — sellers who had an order each day
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'value', t.cnt
  ) ORDER BY t.d), '[]'::jsonb) INTO v_active_sellers
  FROM (
    SELECT o.created_at::date AS d, COUNT(DISTINCT o.seller_id) AS cnt
    FROM market_orders o
    WHERE o.created_at::date BETWEEN p_start AND p_end
    GROUP BY o.created_at::date
  ) t;

  -- activeBuyers: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'value', t.cnt
  ) ORDER BY t.d), '[]'::jsonb) INTO v_active_buyers
  FROM (
    SELECT o.created_at::date AS d, COUNT(DISTINCT o.buyer_id) AS cnt
    FROM market_orders o
    WHERE o.created_at::date BETWEEN p_start AND p_end
    GROUP BY o.created_at::date
  ) t;

  -- newBooths: [{date, value}]
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', t.d::text, 'value', t.cnt
    ) ORDER BY t.d), '[]'::jsonb) INTO v_new_booths
    FROM (
      SELECT created_at::date AS d, COUNT(*) AS cnt
      FROM market_booths
      WHERE created_at::date BETWEEN p_start AND p_end
      GROUP BY created_at::date
    ) t;
  EXCEPTION WHEN undefined_table THEN
    v_new_booths := '[]'::jsonb;
  END;

  -- productListings: {active, inactive}
  BEGIN
    SELECT COUNT(*) FILTER (WHERE is_active), COUNT(*) FILTER (WHERE NOT is_active)
    INTO v_product_active, v_product_inactive
    FROM market_products;
  EXCEPTION WHEN undefined_table THEN
    v_product_active := 0;
    v_product_inactive := 0;
  END;

  -- flagActivity: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'value', t.cnt
  ) ORDER BY t.d), '[]'::jsonb) INTO v_flag_activity
  FROM (
    SELECT created_at::date AS d, COUNT(*) AS cnt
    FROM post_flags
    WHERE created_at::date BETWEEN p_start AND p_end
    GROUP BY created_at::date
  ) t;

  -- avgSellerRating (cast enum type to text then to int)
  SELECT COALESCE(AVG(seller_rating::text::int), 0) INTO v_avg_seller_rating
  FROM orders
  WHERE seller_rating IS NOT NULL
    AND created_at::date BETWEEN p_start AND p_end;

  RETURN jsonb_build_object(
    'activeSellers', v_active_sellers,
    'activeBuyers', v_active_buyers,
    'newBooths', v_new_booths,
    'productListings', jsonb_build_object('active', v_product_active, 'inactive', v_product_inactive),
    'flagActivity', v_flag_activity,
    'avgSellerRating', ROUND(v_avg_seller_rating, 1)
  );
END;
$$;
