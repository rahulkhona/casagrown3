CREATE OR REPLACE FUNCTION metrics_user_growth(
  p_start DATE,
  p_end DATE,
  p_granularity TEXT DEFAULT 'daily',
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total BIGINT;
  v_new_in_period BIGINT;
  v_time_series JSONB;
  v_cumulative JSONB;
  v_by_geo JSONB;
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

  -- Total users (with geo filter)
  SELECT COUNT(*) INTO v_total
  FROM profiles p
  -- communities join removed: use profiles geo columns directly
  -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
  -- cities join removed
  -- states join removed
  WHERE (p_state IS NULL OR p.state_code = p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_zip IS NULL OR p.zip_plus4 = p_zip);

  -- New users in range
  SELECT COUNT(*) INTO v_new_in_period
  FROM profiles p
  -- communities join removed: use profiles geo columns directly
  -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
  -- cities join removed
  -- states join removed
  WHERE p.created_at::date BETWEEN p_start AND p_end
    AND (p_state IS NULL OR p.state_code = p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_zip IS NULL OR p.zip_plus4 = p_zip);

  -- timeSeries: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text,
    'value', t.cnt
  ) ORDER BY t.d), '[]'::jsonb) INTO v_time_series
  FROM (
    SELECT
      date_trunc(v_date_trunc, p.created_at)::date AS d,
      COUNT(*) AS cnt
    FROM profiles p
    -- communities join removed: use profiles geo columns directly
    -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
    -- cities join removed
    -- states join removed
    WHERE p.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR p.state_code = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
    GROUP BY date_trunc(v_date_trunc, p.created_at)::date
  ) t;

  -- cumulative: [{date, value}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text,
    'value', t.running
  ) ORDER BY t.d), '[]'::jsonb) INTO v_cumulative
  FROM (
    SELECT
      d,
      SUM(cnt) OVER (ORDER BY d) AS running
    FROM (
      SELECT
        date_trunc(v_date_trunc, p.created_at)::date AS d,
        COUNT(*) AS cnt
      FROM profiles p
      -- communities join removed: use profiles geo columns directly
      -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
      -- cities join removed
      -- states join removed
      WHERE p.created_at::date BETWEEN p_start AND p_end
        AND (p_state IS NULL OR p.state_code = p_state)
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
      GROUP BY date_trunc(v_date_trunc, p.created_at)::date
    ) sub
  ) t;

  -- byGeo: [{region, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'region', t.region,
    'count', t.cnt
  ) ORDER BY t.cnt DESC), '[]'::jsonb) INTO v_by_geo
  FROM (
    SELECT
      COALESCE(p.state_code, 'Unknown') AS region,
      COUNT(*) AS cnt
    FROM profiles p
    -- communities join removed: use profiles geo columns directly
    -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
    -- cities join removed
    -- states join removed
    WHERE p.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR p.state_code = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
    GROUP BY COALESCE(p.state_code, 'Unknown')
  ) t;

  RETURN jsonb_build_object(
    'timeSeries', v_time_series,
    'cumulative', v_cumulative,
    'byGeo', v_by_geo,
    'total', v_total,
    'newInPeriod', v_new_in_period
  );
END;
$$;

-- ============================================================
-- 2. metrics_sales_summary
--    → SalesSummaryData { gmvTimeSeries, orderCountTimeSeries, avgOrderValue,
--      totalGMV, totalOrders, totalTax, totalFees, fulfillmentSplit,
--      topProducts, topSellers }
-- ============================================================
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
    COALESCE(SUM(o.tax_usd), 0),
    COALESCE(SUM(o.platform_fee_usd), 0)
  INTO v_total_gmv, v_total_orders, v_avg_order, v_total_tax, v_total_fees
  FROM market_orders o
  JOIN profiles p ON p.id = o.buyer_id
  -- communities join removed: use profiles geo columns directly
  -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
  -- cities join removed
  -- states join removed
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
    -- communities join removed: use profiles geo columns directly
    -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
    -- cities join removed
    -- states join removed
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
    -- communities join removed: use profiles geo columns directly
    -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
    -- cities join removed
    -- states join removed
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

-- ============================================================
-- 3. metrics_payout_trends
--    → PayoutData { methodTrends, methodTotals, instrumentTotals, successRates }
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_payout_trends(
  p_start DATE,
  p_end DATE,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_method_totals JSONB;
  v_instrument_totals JSONB;
  v_method_trends JSONB;
  v_success_rates JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- methodTotals: [{method, amount, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', t.method, 'amount', t.amt, 'count', t.cnt
  )), '[]'::jsonb) INTO v_method_totals
  FROM (
    SELECT
      CASE rm.type
        WHEN 'gift_card' THEN 'Gift Cards'
        WHEN 'donation' THEN 'Charity Donation'
        ELSE 'Cash Out ($)'
      END AS method,
      SUM(r.point_cost) AS amt,
      COUNT(*) AS cnt
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    JOIN profiles p ON p.id = r.user_id
    -- communities join removed: use profiles geo columns directly
    -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
    -- cities join removed
    -- states join removed
    WHERE r.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR p.state_code = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
    GROUP BY 1
  ) t;

  -- instrumentTotals: [{method, instrument, amount, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', t.method, 'instrument', t.instrument, 'amount', t.amt, 'count', t.cnt
  )), '[]'::jsonb) INTO v_instrument_totals
  FROM (
    SELECT
      CASE rm.type
        WHEN 'gift_card' THEN 'Gift Cards'
        WHEN 'donation' THEN 'Charity Donation'
        ELSE 'Cash Out ($)'
      END AS method,
      COALESCE(rm.metadata->>'provider',
        CASE rm.type
          WHEN 'gift_card' THEN 'Gift Card Provider'
          WHEN 'donation' THEN 'Direct'
          ELSE 'Stripe Payout'
        END
      ) AS instrument,
      SUM(r.point_cost) AS amt,
      COUNT(*) AS cnt
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    JOIN profiles p ON p.id = r.user_id
    -- communities join removed: use profiles geo columns directly
    -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
    -- cities join removed
    -- states join removed
    WHERE r.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR p.state_code = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
    GROUP BY 1, 2
  ) t;

  -- methodTrends: [{date, giftcards, charity, cashout}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text, 'giftcards', t.gc, 'charity', t.ch, 'cashout', t.co
  ) ORDER BY t.d), '[]'::jsonb) INTO v_method_trends
  FROM (
    SELECT
      r.created_at::date AS d,
      COUNT(*) FILTER (WHERE rm.type = 'gift_card') AS gc,
      COUNT(*) FILTER (WHERE rm.type = 'donation') AS ch,
      COUNT(*) FILTER (WHERE rm.type NOT IN ('gift_card', 'donation')) AS co
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    WHERE r.created_at::date BETWEEN p_start AND p_end
    GROUP BY r.created_at::date
  ) t;

  -- successRates: [{method, success, failure}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', t.method, 'success', t.succ, 'failure', t.fail
  )), '[]'::jsonb) INTO v_success_rates
  FROM (
    SELECT
      CASE rm.type
        WHEN 'gift_card' THEN 'Gift Cards'
        WHEN 'donation' THEN 'Charity Donation'
        ELSE 'Cash Out ($)'
      END AS method,
      ROUND(100.0 * COUNT(*) FILTER (WHERE r.status = 'completed') / GREATEST(COUNT(*), 1)) AS succ,
      ROUND(100.0 * COUNT(*) FILTER (WHERE r.status = 'failed') / GREATEST(COUNT(*), 1)) AS fail
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    WHERE r.created_at::date BETWEEN p_start AND p_end
    GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'methodTrends', v_method_trends,
    'methodTotals', v_method_totals,
    'instrumentTotals', v_instrument_totals,
    'successRates', v_success_rates
  );
END;
$$;

-- ============================================================
-- 4. metrics_page_analytics
--    → PageAnalyticsData { routes, dropOffDistribution, errorHotspots, sessionDurations }
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_page_analytics(
  p_start DATE,
  p_end DATE,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_routes JSONB;
  v_drop_off JSONB;
  v_session_durations JSONB;
  v_error_hotspots JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- routes: [{route, pageLoads, uniqueUsers, avgDwellTime, bounceRate, dropOffRate, errors}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'route', t.route,
    'pageLoads', t.page_loads,
    'uniqueUsers', t.unique_users,
    'avgDwellTime', 0,
    'bounceRate', t.bounce_rate,
    'dropOffRate', t.drop_off_rate,
    'errors', t.errors
  )), '[]'::jsonb) INTO v_routes
  FROM (
    WITH page_sessions AS (
      SELECT
        ua.page_path,
        ua.session_id,
        COUNT(*) AS event_count
      FROM user_analytics ua
      JOIN profiles p ON p.id = ua.user_id
      -- communities join removed: use profiles geo columns directly
      -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
      -- cities join removed
      -- states join removed
      WHERE ua.created_at::date BETWEEN p_start AND p_end
        AND (p_state IS NULL OR p.state_code = p_state)
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
      GROUP BY ua.page_path, ua.session_id
    ),
    last_page AS (
      SELECT DISTINCT ON (session_id) session_id, page_path AS last_path
      FROM user_analytics
      WHERE created_at::date BETWEEN p_start AND p_end
      ORDER BY session_id, created_at DESC
    )
    SELECT
      ps.page_path AS route,
      SUM(ps.event_count)::bigint AS page_loads,
      COUNT(DISTINCT ps.session_id)::bigint AS unique_users,
      ROUND(100.0 * COUNT(*) FILTER (WHERE ps.event_count = 1) / GREATEST(COUNT(*), 1))::int AS bounce_rate,
      ROUND(100.0 * COUNT(*) FILTER (WHERE lp.last_path = ps.page_path) / GREATEST(COUNT(*), 1))::int AS drop_off_rate,
      COALESCE((SELECT COUNT(*) FROM user_analytics ua2 WHERE ua2.page_path = ps.page_path AND ua2.event_type = 'error' AND ua2.created_at::date BETWEEN p_start AND p_end), 0)::bigint AS errors
    FROM page_sessions ps
    LEFT JOIN last_page lp ON lp.session_id = ps.session_id
    GROUP BY ps.page_path
    ORDER BY SUM(ps.event_count) DESC
    LIMIT 20
  ) t;

  -- dropOffDistribution: [{route, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'route', t.route, 'count', t.cnt
  )), '[]'::jsonb) INTO v_drop_off
  FROM (
    SELECT page_path AS route, COUNT(*) AS cnt
    FROM (
      SELECT DISTINCT ON (session_id) session_id, page_path
      FROM user_analytics
      WHERE created_at::date BETWEEN p_start AND p_end
      ORDER BY session_id, created_at DESC
    ) last_pages
    GROUP BY page_path
    ORDER BY COUNT(*) DESC
    LIMIT 8
  ) t;

  -- sessionDurations: [{bucket, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'bucket', t.bucket, 'count', t.cnt
  )), '[]'::jsonb) INTO v_session_durations
  FROM (
    SELECT bucket, COUNT(*) AS cnt FROM (
      SELECT
        CASE
          WHEN dur < 30 THEN '0-30s'
          WHEN dur < 60 THEN '30-60s'
          WHEN dur < 180 THEN '1-3m'
          WHEN dur < 600 THEN '3-10m'
          ELSE '10m+'
        END AS bucket
      FROM (
        SELECT session_id,
          EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) AS dur
        FROM user_analytics
        WHERE created_at::date BETWEEN p_start AND p_end
        GROUP BY session_id
      ) s
    ) b
    GROUP BY bucket
    ORDER BY MIN(CASE bucket
      WHEN '0-30s' THEN 1 WHEN '30-60s' THEN 2
      WHEN '1-3m' THEN 3 WHEN '3-10m' THEN 4 ELSE 5 END)
  ) t;

  -- errorHotspots: [{route, errorName, count}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'route', t.route, 'errorName', t.err_name, 'count', t.cnt
  )), '[]'::jsonb) INTO v_error_hotspots
  FROM (
    SELECT page_path AS route, event_name AS err_name, COUNT(*) AS cnt
    FROM user_analytics
    WHERE event_type = 'error'
      AND created_at::date BETWEEN p_start AND p_end
    GROUP BY page_path, event_name
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'routes', v_routes,
    'dropOffDistribution', v_drop_off,
    'sessionDurations', v_session_durations,
    'errorHotspots', v_error_hotspots
  );
END;
$$;

-- ============================================================
-- 5. metrics_marketplace_health
--    → MarketplaceHealthData { activeSellers, activeBuyers, newBooths,
--      productListings, flagActivity, avgSellerRating }
-- ============================================================
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

  -- avgSellerRating
  SELECT COALESCE(AVG(seller_rating::int), 0) INTO v_avg_seller_rating
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

-- ============================================================
-- 6. metrics_settlement_summary
--    → SettlementData { dailySummary, payoutTotals, recentSettlements }
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_settlement_summary(
  p_start DATE,
  p_end DATE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_daily JSONB;
  v_payout_totals NUMERIC;
  v_recent JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- dailySummary: [{date, captured, released, refunded}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text,
    'captured', t.captured,
    'released', t.released,
    'refunded', t.refunded
  ) ORDER BY t.d), '[]'::jsonb) INTO v_daily
  FROM (
    SELECT
      market_date AS d,
      total_captured_usd AS captured,
      total_released_usd AS released,
      total_refunds_usd AS refunded
    FROM market_settlements
    WHERE market_date BETWEEN p_start AND p_end
  ) t;

  -- payoutTotals: total released amount
  SELECT COALESCE(SUM(total_payouts_usd), 0) INTO v_payout_totals
  FROM market_settlements
  WHERE market_date BETWEEN p_start AND p_end;

  -- recentSettlements: [{date, status, orders, captured, payouts}]
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text,
    'status', t.status,
    'orders', t.orders,
    'captured', t.captured,
    'payouts', t.payouts
  ) ORDER BY t.d DESC), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT
      market_date AS d,
      status,
      total_orders AS orders,
      total_captured_usd AS captured,
      total_payouts_usd AS payouts
    FROM market_settlements
    WHERE market_date BETWEEN p_start AND p_end
    ORDER BY market_date DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'dailySummary', v_daily,
    'payoutTotals', v_payout_totals,
    'recentSettlements', v_recent
  );
END;
$$;

-- ============================================================
-- 7. metrics_search_logs
--    → LogSearchResult { entries: LogEntry[], totalCount }
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_search_logs(
  p_query TEXT DEFAULT '',
  p_event_type TEXT DEFAULT '',
  p_start DATE DEFAULT NULL,
  p_end DATE DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entries JSONB;
  v_total BIGINT;
  v_offset INTEGER;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Total count
  SELECT COUNT(*) INTO v_total
  FROM user_analytics ua
  JOIN profiles p ON p.id = ua.user_id
  -- communities join removed: use profiles geo columns directly
  -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
  -- cities join removed
  -- states join removed
  WHERE (p_query = '' OR ua.event_name ILIKE '%' || p_query || '%' OR ua.page_path ILIKE '%' || p_query || '%')
    AND (p_event_type = '' OR ua.event_type = p_event_type)
    AND (p_start IS NULL OR ua.created_at::date >= p_start)
    AND (p_end IS NULL OR ua.created_at::date <= p_end)
    AND (p_state IS NULL OR p.state_code = p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_zip IS NULL OR p.zip_plus4 = p_zip);

  -- Paginated entries → matches LogEntry interface
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id::text,
    'timestamp', t.ts,
    'userId', t.user_id::text,
    'userIdShort', 'usr_' || SUBSTRING(md5(t.user_id::text), 1, 5),
    'userName', null,
    'eventType', t.event_type,
    'eventName', t.event_name,
    'pagePath', t.page_path,
    'sessionId', t.session_id,
    'txnId', t.txn_id,
    'elementId', t.element_id,
    'elementLabel', t.element_label,
    'stackTrace', t.stack_trace,
    'metadata', t.metadata
  )), '[]'::jsonb) INTO v_entries
  FROM (
    SELECT
      ua.id, ua.created_at AS ts, ua.user_id,
      ua.event_type, ua.event_name, ua.page_path,
      ua.session_id, ua.txn_id,
      ua.element_id, ua.element_label, ua.stack_trace,
      ua.metadata
    FROM user_analytics ua
    JOIN profiles p ON p.id = ua.user_id
    -- communities join removed: use profiles geo columns directly
    -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
    -- cities join removed
    -- states join removed
    WHERE (p_query = '' OR ua.event_name ILIKE '%' || p_query || '%' OR ua.page_path ILIKE '%' || p_query || '%')
      AND (p_event_type = '' OR ua.event_type = p_event_type)
      AND (p_start IS NULL OR ua.created_at::date >= p_start)
      AND (p_end IS NULL OR ua.created_at::date <= p_end)
      AND (p_state IS NULL OR p.state_code = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
    ORDER BY ua.created_at DESC
    LIMIT p_page_size OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'entries', v_entries,
    'totalCount', v_total
  );
END;
$$;

-- ============================================================
-- 8. metrics_session_timeline
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_session_timeline(
  p_session_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entries JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id::text,
    'timestamp', t.ts,
    'userId', t.user_id::text,
    'userIdShort', 'usr_' || SUBSTRING(md5(t.user_id::text), 1, 5),
    'userName', null,
    'eventType', t.event_type,
    'eventName', t.event_name,
    'pagePath', t.page_path,
    'sessionId', t.session_id,
    'txnId', t.txn_id,
    'elementId', t.element_id,
    'elementLabel', t.element_label,
    'stackTrace', t.stack_trace,
    'metadata', t.metadata
  ) ORDER BY t.ts), '[]'::jsonb) INTO v_entries
  FROM (
    SELECT
      ua.id, ua.created_at AS ts, ua.user_id,
      ua.event_type, ua.event_name, ua.page_path,
      ua.session_id, ua.txn_id,
      ua.element_id, ua.element_label, ua.stack_trace,
      ua.metadata
    FROM user_analytics ua
    WHERE ua.session_id = p_session_id
  ) t;

  RETURN v_entries;
END;
$$;

-- ============================================================
-- 9. metrics_reveal_user (PII on demand)
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_reveal_user(
  target_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile RECORD;
  v_masked_email TEXT;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = target_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Mask email: show first char + **** + @domain
  v_masked_email := SUBSTRING(v_profile.email, 1, 1)
    || '****@'
    || SPLIT_PART(v_profile.email, '@', 2);

  RETURN jsonb_build_object(
    'displayName', COALESCE(v_profile.full_name, 'User'),
    'email', v_masked_email
  );
END;
$$;

-- ============================================================================
-- Community Chat Metrics Dashboard RPCs
-- SECURITY DEFINER functions for staff-only analytics queries.
-- ============================================================================

CREATE OR REPLACE FUNCTION metrics_community_chat(
  p_start DATE,
  p_end DATE,
  p_granularity TEXT DEFAULT 'daily',
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dau_series JSONB;
  v_growth_series JSONB;
  v_total_messages BIGINT;
  v_avg_dau NUMERIC;
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

  -- 1. Daily Active Users (DAU) Time Series
  -- Active users = users who sent a message or reacted
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text,
    'value', t.cnt
  ) ORDER BY t.d), '[]'::jsonb) INTO v_dau_series
  FROM (
    SELECT date_trunc(v_date_trunc, m.created_at)::date AS d, COUNT(DISTINCT m.author_id) AS cnt
    FROM community_chat_messages m
    JOIN profiles p ON p.id = m.author_id
    -- communities join removed: use profiles geo columns directly
    -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
    -- cities join removed
    -- states join removed
    WHERE m.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR p.state_code = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
    GROUP BY 1
  ) t;

  -- 2. New Chat Users Growth (Cumulative unique authors over time)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', t.d::text,
    'value', t.running
  ) ORDER BY t.d), '[]'::jsonb) INTO v_growth_series
  FROM (
    SELECT
      d,
      SUM(cnt) OVER (ORDER BY d) AS running
    FROM (
      -- Get the FIRST time a user ever posted a message (their "join" date to chat)
      SELECT
        date_trunc(v_date_trunc, first_post.first_at)::date AS d,
        COUNT(*) AS cnt
      FROM (
        SELECT m.author_id, MIN(m.created_at) AS first_at
        FROM community_chat_messages m
        JOIN profiles p ON p.id = m.author_id
        -- communities join removed: use profiles geo columns directly
        -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
        -- cities join removed
        -- states join removed
        WHERE (p_state IS NULL OR p.state_code = p_state)
          AND (p_city IS NULL OR p.city ILIKE p_city)
          AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
        GROUP BY m.author_id
      ) first_post
      WHERE first_post.first_at::date BETWEEN p_start AND p_end
      GROUP BY 1
    ) sub
  ) t;

  -- 3. High-level KPIs
  SELECT COUNT(*) INTO v_total_messages
  FROM community_chat_messages m
  JOIN profiles p ON p.id = m.author_id
  -- communities join removed: use profiles geo columns directly
  -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
  -- cities join removed
  -- states join removed
  WHERE m.created_at::date BETWEEN p_start AND p_end
    AND (p_state IS NULL OR p.state_code = p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_zip IS NULL OR p.zip_plus4 = p_zip);

  SELECT COALESCE(AVG(cnt), 0) INTO v_avg_dau
  FROM (
    SELECT COUNT(DISTINCT m.author_id) AS cnt
    FROM community_chat_messages m
    JOIN profiles p ON p.id = m.author_id
    -- communities join removed: use profiles geo columns directly
    -- zip_codes join removed: use p.state_code, p.city, p.zip_plus4 directly
    -- cities join removed
    -- states join removed
    WHERE m.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR p.state_code = p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_zip IS NULL OR p.zip_plus4 = p_zip)
    GROUP BY m.created_at::date
  ) daily_counts;

  RETURN jsonb_build_object(
    'dailyActiveUsers', v_dau_series,
    'userGrowth', v_growth_series,
    'totalMessages', v_total_messages,
    'avgDailyActiveUsers', ROUND(v_avg_dau, 1)
  );
END;
$$;

CREATE OR REPLACE FUNCTION metrics_platform_usage(
  p_start DATE,
  p_end DATE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'os', t.os,
    'pwa_users', t.pwa_users,
    'browser_users', t.browser_users,
    'pwa_sessions', t.pwa_sessions,
    'browser_sessions', t.browser_sessions
  )), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      COALESCE(ua.metadata->>'os', 'Unknown') AS os,
      COUNT(DISTINCT ua.user_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean = true) AS pwa_users,
      COUNT(DISTINCT ua.user_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean IS DISTINCT FROM true) AS browser_users,
      COUNT(DISTINCT ua.session_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean = true) AS pwa_sessions,
      COUNT(DISTINCT ua.session_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean IS DISTINCT FROM true) AS browser_sessions
    FROM user_analytics ua
    WHERE ua.created_at::date BETWEEN p_start AND p_end
      AND ua.metadata->>'os' IS NOT NULL
    GROUP BY COALESCE(ua.metadata->>'os', 'Unknown')
    ORDER BY (COUNT(DISTINCT ua.user_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean = true) +
              COUNT(DISTINCT ua.user_id) FILTER (WHERE (ua.metadata->>'is_pwa')::boolean IS DISTINCT FROM true)) DESC
  ) t;

  RETURN jsonb_build_object('platformUsage', v_result);
END;
$$;
