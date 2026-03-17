-- ============================================================================
-- Metrics Dashboard RPCs
-- SECURITY DEFINER functions for staff-only analytics queries.
-- Each function checks is_staff(auth.uid()) and returns JSONB.
-- ============================================================================

-- ============================================================
-- 0. Add element tracking columns to user_analytics
-- ============================================================
ALTER TABLE user_analytics ADD COLUMN IF NOT EXISTS element_id TEXT;
ALTER TABLE user_analytics ADD COLUMN IF NOT EXISTS element_label TEXT;
ALTER TABLE user_analytics ADD COLUMN IF NOT EXISTS stack_trace TEXT;

CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON user_analytics(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON user_analytics(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_page ON user_analytics(page_path, created_at);

-- ============================================================
-- Helper: geo filter CTE builder
-- Resolves a user's geo from profiles → communities → zip → city → state → country
-- ============================================================

-- ============================================================
-- 1. metrics_user_growth
-- ============================================================
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
  v_result JSONB;
  v_total_users BIGINT;
  v_new_users BIGINT;
  v_active_7d BIGINT;
  v_active_30d BIGINT;
  v_series JSONB;
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
  SELECT COUNT(*) INTO v_total_users
  FROM profiles p
  LEFT JOIN communities co ON co.id = p.community_id
  LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
  LEFT JOIN cities ci ON ci.id = zc.city_id
  LEFT JOIN states st ON st.id = ci.state_id
  WHERE (p_state IS NULL OR st.code = p_state)
    AND (p_city IS NULL OR ci.name ILIKE p_city)
    AND (p_zip IS NULL OR co.zip_code = p_zip);

  -- New users in range
  SELECT COUNT(*) INTO v_new_users
  FROM profiles p
  LEFT JOIN communities co ON co.id = p.community_id
  LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
  LEFT JOIN cities ci ON ci.id = zc.city_id
  LEFT JOIN states st ON st.id = ci.state_id
  WHERE p.created_at::date BETWEEN p_start AND p_end
    AND (p_state IS NULL OR st.code = p_state)
    AND (p_city IS NULL OR ci.name ILIKE p_city)
    AND (p_zip IS NULL OR co.zip_code = p_zip);

  -- Active in last 7 days
  SELECT COUNT(DISTINCT ua.user_id) INTO v_active_7d
  FROM user_analytics ua
  JOIN profiles p ON p.id = ua.user_id
  LEFT JOIN communities co ON co.id = p.community_id
  LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
  LEFT JOIN cities ci ON ci.id = zc.city_id
  LEFT JOIN states st ON st.id = ci.state_id
  WHERE ua.created_at >= (now() - interval '7 days')
    AND (p_state IS NULL OR st.code = p_state)
    AND (p_city IS NULL OR ci.name ILIKE p_city)
    AND (p_zip IS NULL OR co.zip_code = p_zip);

  -- Active in last 30 days
  SELECT COUNT(DISTINCT ua.user_id) INTO v_active_30d
  FROM user_analytics ua
  JOIN profiles p ON p.id = ua.user_id
  LEFT JOIN communities co ON co.id = p.community_id
  LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
  LEFT JOIN cities ci ON ci.id = zc.city_id
  LEFT JOIN states st ON st.id = ci.state_id
  WHERE ua.created_at >= (now() - interval '30 days')
    AND (p_state IS NULL OR st.code = p_state)
    AND (p_city IS NULL OR ci.name ILIKE p_city)
    AND (p_zip IS NULL OR co.zip_code = p_zip);

  -- Time series: signups per period with running cumulative
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.d), '[]'::jsonb) INTO v_series
  FROM (
    SELECT
      date_trunc(v_date_trunc, p.created_at)::date AS d,
      COUNT(*) AS signups,
      SUM(COUNT(*)) OVER (ORDER BY date_trunc(v_date_trunc, p.created_at)::date) AS cumulative
    FROM profiles p
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE p.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
    GROUP BY date_trunc(v_date_trunc, p.created_at)::date
  ) t;

  RETURN jsonb_build_object(
    'totalUsers', v_total_users,
    'newUsers', v_new_users,
    'activeLast7d', v_active_7d,
    'activeLast30d', v_active_30d,
    'timeSeries', v_series
  );
END;
$$;

-- ============================================================
-- 2. metrics_sales_summary
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
  v_total_revenue NUMERIC;
  v_total_orders BIGINT;
  v_avg_order NUMERIC;
  v_revenue_trend JSONB;
  v_category_breakdown JSONB;
  v_fulfillment_split JSONB;
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
    COALESCE(AVG(o.total_usd), 0)
  INTO v_total_revenue, v_total_orders, v_avg_order
  FROM market_orders o
  JOIN profiles p ON p.id = o.buyer_id
  LEFT JOIN communities co ON co.id = p.community_id
  LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
  LEFT JOIN cities ci ON ci.id = zc.city_id
  LEFT JOIN states st ON st.id = ci.state_id
  WHERE o.status != 'cancelled'
    AND o.created_at::date BETWEEN p_start AND p_end
    AND (p_state IS NULL OR st.code = p_state)
    AND (p_city IS NULL OR ci.name ILIKE p_city)
    AND (p_zip IS NULL OR co.zip_code = p_zip);

  -- Revenue trend
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.d), '[]'::jsonb) INTO v_revenue_trend
  FROM (
    SELECT
      date_trunc(v_date_trunc, o.created_at)::date AS d,
      SUM(o.total_usd) AS revenue,
      COUNT(*) AS order_count
    FROM market_orders o
    JOIN profiles p ON p.id = o.buyer_id
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE o.status != 'cancelled'
      AND o.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
    GROUP BY date_trunc(v_date_trunc, o.created_at)::date
  ) t;

  -- Category breakdown
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_category_breakdown
  FROM (
    SELECT
      o.product_name AS category,
      SUM(o.total_usd) AS revenue,
      COUNT(*) AS order_count
    FROM market_orders o
    WHERE o.status != 'cancelled'
      AND o.created_at::date BETWEEN p_start AND p_end
    GROUP BY o.product_name
    ORDER BY SUM(o.total_usd) DESC
    LIMIT 10
  ) t;

  -- Fulfillment split
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_fulfillment_split
  FROM (
    SELECT
      o.fulfillment_type AS type,
      COUNT(*) AS count
    FROM market_orders o
    WHERE o.status != 'cancelled'
      AND o.created_at::date BETWEEN p_start AND p_end
    GROUP BY o.fulfillment_type
  ) t;

  RETURN jsonb_build_object(
    'totalRevenue', v_total_revenue,
    'totalOrders', v_total_orders,
    'avgOrderValue', ROUND(v_avg_order, 2),
    'revenueTrend', v_revenue_trend,
    'categoryBreakdown', v_category_breakdown,
    'fulfillmentSplit', v_fulfillment_split
  );
END;
$$;

-- ============================================================
-- 3. metrics_payout_trends
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

  -- Method totals: group by redemption_merchandize.type
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_method_totals
  FROM (
    SELECT
      CASE rm.type
        WHEN 'gift_card' THEN 'Gift Cards'
        WHEN 'donation' THEN 'Charity Donation'
        ELSE 'Cash Out ($)'
      END AS method,
      SUM(r.point_cost) AS amount,
      COUNT(*) AS count
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    JOIN profiles p ON p.id = r.user_id
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE r.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
    GROUP BY CASE rm.type
        WHEN 'gift_card' THEN 'Gift Cards'
        WHEN 'donation' THEN 'Charity Donation'
        ELSE 'Cash Out ($)'
      END
  ) t;

  -- Instrument totals: break down gift cards by provider (Reloadly / Tremendous)
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_instrument_totals
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
      SUM(r.point_cost) AS amount,
      COUNT(*) AS count
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    JOIN profiles p ON p.id = r.user_id
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE r.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
    GROUP BY 1, 2
  ) t;

  -- Method trends (daily)
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.d), '[]'::jsonb) INTO v_method_trends
  FROM (
    SELECT
      r.created_at::date AS d,
      COUNT(*) FILTER (WHERE rm.type = 'gift_card') AS giftcards,
      COUNT(*) FILTER (WHERE rm.type = 'donation') AS charity,
      COUNT(*) FILTER (WHERE rm.type NOT IN ('gift_card', 'donation')) AS cashout
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    WHERE r.created_at::date BETWEEN p_start AND p_end
    GROUP BY r.created_at::date
  ) t;

  -- Success rates by method
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_success_rates
  FROM (
    SELECT
      CASE rm.type
        WHEN 'gift_card' THEN 'Gift Cards'
        WHEN 'donation' THEN 'Charity Donation'
        ELSE 'Cash Out ($)'
      END AS method,
      ROUND(100.0 * COUNT(*) FILTER (WHERE r.status = 'completed') / GREATEST(COUNT(*), 1)) AS success,
      ROUND(100.0 * COUNT(*) FILTER (WHERE r.status = 'failed') / GREATEST(COUNT(*), 1)) AS failure
    FROM redemptions r
    JOIN redemption_merchandize rm ON rm.id = r.item_id
    WHERE r.created_at::date BETWEEN p_start AND p_end
    GROUP BY CASE rm.type
        WHEN 'gift_card' THEN 'Gift Cards'
        WHEN 'donation' THEN 'Charity Donation'
        ELSE 'Cash Out ($)'
      END
  ) t;

  RETURN jsonb_build_object(
    'methodTotals', v_method_totals,
    'instrumentTotals', v_instrument_totals,
    'methodTrends', v_method_trends,
    'successRates', v_success_rates
  );
END;
$$;

-- ============================================================
-- 4. metrics_page_analytics
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

  -- Per-route analytics
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_routes
  FROM (
    WITH page_sessions AS (
      SELECT
        ua.page_path,
        ua.session_id,
        COUNT(*) AS event_count
      FROM user_analytics ua
      JOIN profiles p ON p.id = ua.user_id
      LEFT JOIN communities co ON co.id = p.community_id
      LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
      LEFT JOIN cities ci ON ci.id = zc.city_id
      LEFT JOIN states st ON st.id = ci.state_id
      WHERE ua.created_at::date BETWEEN p_start AND p_end
        AND (p_state IS NULL OR st.code = p_state)
        AND (p_city IS NULL OR ci.name ILIKE p_city)
        AND (p_zip IS NULL OR co.zip_code = p_zip)
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
      SUM(ps.event_count) AS "pageLoads",
      COUNT(DISTINCT ps.session_id) AS "uniqueUsers",
      0 AS "avgDwellTime",
      ROUND(100.0 * COUNT(*) FILTER (WHERE ps.event_count = 1) / GREATEST(COUNT(*), 1)) AS "bounceRate",
      ROUND(100.0 * COUNT(*) FILTER (WHERE lp.last_path = ps.page_path) / GREATEST(COUNT(*), 1)) AS "dropOffRate",
      COALESCE((SELECT COUNT(*) FROM user_analytics ua2 WHERE ua2.page_path = ps.page_path AND ua2.event_type = 'error' AND ua2.created_at::date BETWEEN p_start AND p_end), 0) AS errors
    FROM page_sessions ps
    LEFT JOIN last_page lp ON lp.session_id = ps.session_id
    GROUP BY ps.page_path
    ORDER BY SUM(ps.event_count) DESC
    LIMIT 20
  ) t;

  -- Drop-off distribution (top routes where sessions end)
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_drop_off
  FROM (
    SELECT page_path AS route, COUNT(*) AS count
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

  -- Session duration distribution (bucketed)
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_session_durations
  FROM (
    SELECT bucket, COUNT(*) AS count FROM (
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

  -- Error hotspots
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_error_hotspots
  FROM (
    SELECT page_path AS route, event_name AS "errorName", COUNT(*) AS count
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
  v_total_orders BIGINT;
  v_completed_orders BIGINT;
  v_order_complete_rate NUMERIC;
  v_dispute_count BIGINT;
  v_dispute_rate NUMERIC;
  v_avg_seller_rating NUMERIC;
  v_active_booths BIGINT;
  v_flagged_posts BIGINT;
  v_top_categories JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Order stats
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'confirmed')
  INTO v_total_orders, v_completed_orders
  FROM market_orders
  WHERE created_at::date BETWEEN p_start AND p_end;

  v_order_complete_rate := CASE WHEN v_total_orders > 0
    THEN ROUND(100.0 * v_completed_orders / v_total_orders, 1) ELSE 0 END;

  -- Dispute rate (escalations vs orders)
  SELECT COUNT(*) INTO v_dispute_count
  FROM escalations WHERE created_at::date BETWEEN p_start AND p_end;

  v_dispute_rate := CASE WHEN v_total_orders > 0
    THEN ROUND(100.0 * v_dispute_count / v_total_orders, 1) ELSE 0 END;

  -- Average seller rating
  SELECT COALESCE(AVG(seller_rating::int), 0) INTO v_avg_seller_rating
  FROM orders
  WHERE seller_rating IS NOT NULL
    AND created_at::date BETWEEN p_start AND p_end;

  -- Active booths (exists check for market_booths)
  BEGIN
    SELECT COUNT(*) INTO v_active_booths
    FROM market_booths WHERE is_active = true;
  EXCEPTION WHEN undefined_table THEN
    v_active_booths := 0;
  END;

  -- Flagged posts
  SELECT COUNT(DISTINCT post_id) INTO v_flagged_posts
  FROM post_flags
  WHERE created_at::date BETWEEN p_start AND p_end;

  -- Top categories by revenue
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_top_categories
  FROM (
    SELECT product_name AS category, SUM(total_usd) AS revenue, COUNT(*) AS orders
    FROM market_orders
    WHERE status != 'cancelled'
      AND created_at::date BETWEEN p_start AND p_end
    GROUP BY product_name
    ORDER BY SUM(total_usd) DESC
    LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'orderCompleteRate', v_order_complete_rate,
    'disputeRate', v_dispute_rate,
    'avgSellerRating', ROUND(v_avg_seller_rating, 1),
    'activeBooths', v_active_booths,
    'flaggedPosts', v_flagged_posts,
    'totalOrders', v_total_orders,
    'disputeCount', v_dispute_count,
    'topCategories', v_top_categories
  );
END;
$$;

-- ============================================================
-- 6. metrics_settlement_summary
-- ============================================================
CREATE OR REPLACE FUNCTION metrics_settlement_summary(
  p_start DATE,
  p_end DATE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settlements JSONB;
  v_totals JSONB;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Settlement list
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.market_date DESC), '[]'::jsonb) INTO v_settlements
  FROM (
    SELECT
      id,
      market_date,
      status,
      total_orders AS "totalOrders",
      total_captured_usd AS "capturedUsd",
      total_payouts_usd AS "payoutsUsd",
      total_fees_usd AS "feesUsd",
      total_refunds_usd AS "refundsUsd",
      total_released_usd AS "releasedUsd"
    FROM market_settlements
    WHERE market_date BETWEEN p_start AND p_end
  ) t;

  -- Aggregate totals
  SELECT jsonb_build_object(
    'totalCaptured', COALESCE(SUM(total_captured_usd), 0),
    'totalPayouts', COALESCE(SUM(total_payouts_usd), 0),
    'totalFees', COALESCE(SUM(total_fees_usd), 0),
    'totalRefunds', COALESCE(SUM(total_refunds_usd), 0),
    'settlementCount', COUNT(*)
  ) INTO v_totals
  FROM market_settlements
  WHERE market_date BETWEEN p_start AND p_end;

  RETURN jsonb_build_object(
    'settlements', v_settlements,
    'totals', v_totals
  );
END;
$$;

-- ============================================================
-- 7. metrics_search_logs
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
  LEFT JOIN communities co ON co.id = p.community_id
  LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
  LEFT JOIN cities ci ON ci.id = zc.city_id
  LEFT JOIN states st ON st.id = ci.state_id
  WHERE (p_query = '' OR ua.event_name ILIKE '%' || p_query || '%' OR ua.page_path ILIKE '%' || p_query || '%')
    AND (p_event_type = '' OR ua.event_type = p_event_type)
    AND (p_start IS NULL OR ua.created_at::date >= p_start)
    AND (p_end IS NULL OR ua.created_at::date <= p_end)
    AND (p_state IS NULL OR st.code = p_state)
    AND (p_city IS NULL OR ci.name ILIKE p_city)
    AND (p_zip IS NULL OR co.zip_code = p_zip);

  -- Paginated entries
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_entries
  FROM (
    SELECT
      ua.id,
      ua.created_at AS timestamp,
      ua.user_id AS "userId",
      SUBSTRING(md5(ua.user_id::text), 1, 8) AS "userIdShort",
      ua.event_type AS "eventType",
      ua.event_name AS "eventName",
      ua.page_path AS "pagePath",
      ua.session_id AS "sessionId",
      ua.txn_id AS "txnId",
      ua.element_id AS "elementId",
      ua.element_label AS "elementLabel",
      ua.stack_trace AS "stackTrace",
      ua.metadata
    FROM user_analytics ua
    JOIN profiles p ON p.id = ua.user_id
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE (p_query = '' OR ua.event_name ILIKE '%' || p_query || '%' OR ua.page_path ILIKE '%' || p_query || '%')
      AND (p_event_type = '' OR ua.event_type = p_event_type)
      AND (p_start IS NULL OR ua.created_at::date >= p_start)
      AND (p_end IS NULL OR ua.created_at::date <= p_end)
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
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

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.timestamp), '[]'::jsonb) INTO v_entries
  FROM (
    SELECT
      ua.id,
      ua.created_at AS timestamp,
      ua.user_id AS "userId",
      SUBSTRING(md5(ua.user_id::text), 1, 8) AS "userIdShort",
      ua.event_type AS "eventType",
      ua.event_name AS "eventName",
      ua.page_path AS "pagePath",
      ua.session_id AS "sessionId",
      ua.txn_id AS "txnId",
      ua.element_id AS "elementId",
      ua.element_label AS "elementLabel",
      ua.stack_trace AS "stackTrace",
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
