-- ============================================================================
-- Migration: Produce Interests & Conversion Funnel Analytics RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_interest_analytics(
  p_start_date TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
  p_end_date TIMESTAMPTZ DEFAULT NOW(),
  p_state_code TEXT DEFAULT NULL,
  p_zip_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_total_submissions INT := 0;
  v_want_to_buy INT := 0;
  v_have_to_sell INT := 0;
  v_listings_created INT := 0;
  v_chats_initiated INT := 0;
  v_orders_completed INT := 0;
  v_gmv_from_interests NUMERIC(10,2) := 0.00;
  v_top_items JSONB := '[]'::jsonb;
  v_time_series JSONB := '[]'::jsonb;
  v_top_zips JSONB := '[]'::jsonb;
BEGIN
  -- 1. Total Submissions & Intent Breakdown
  SELECT 
    COUNT(DISTINCT cpi.id),
    COUNT(DISTINCT CASE WHEN cpi.intent = 'want_to_buy' THEN cpi.id END),
    COUNT(DISTINCT CASE WHEN cpi.intent = 'have_to_sell' THEN cpi.id END)
  INTO v_total_submissions, v_want_to_buy, v_have_to_sell
  FROM public.crm_produce_interests cpi
  JOIN public.crm_leads cl ON cpi.lead_id = cl.id
  WHERE cpi.created_at BETWEEN p_start_date AND p_end_date
    AND (p_zip_code IS NULL OR p_zip_code = ANY(cpi.zipcodes))
    AND (p_state_code IS NULL OR cl.state_code = p_state_code);

  -- 2. Seller Listings Created from Interest Notifications (within 14 days of match notification)
  SELECT COUNT(DISTINCT mp.id)
  INTO v_listings_created
  FROM public.market_products mp
  JOIN public.crm_interest_matches cim ON LOWER(mp.name) = LOWER(cim.produce_name)
  WHERE mp.created_at BETWEEN p_start_date AND p_end_date
    AND cim.created_at <= mp.created_at
    AND cim.created_at >= mp.created_at - INTERVAL '14 days';

  -- 3. Buyer Conversations (Chats Initiated) from Interest Match Notifications
  SELECT COUNT(DISTINCT mc.id)
  INTO v_chats_initiated
  FROM public.market_chats mc
  JOIN public.crm_interest_matches cim ON mc.buyer_id = cim.buyer_user_id
  WHERE mc.created_at BETWEEN p_start_date AND p_end_date
    AND cim.created_at <= mc.created_at
    AND cim.created_at >= mc.created_at - INTERVAL '14 days';

  -- 4. Buyer Purchases (Orders Placed) & GMV from Interest Match Notifications
  SELECT 
    COUNT(DISTINCT mo.id),
    COALESCE(SUM(mo.total_usd), 0.00)
  INTO v_orders_completed, v_gmv_from_interests
  FROM public.market_orders mo
  JOIN public.crm_interest_matches cim ON mo.buyer_id = cim.buyer_user_id
  WHERE mo.status NOT IN ('cancelled', 'refunded')
    AND mo.created_at BETWEEN p_start_date AND p_end_date
    AND cim.created_at <= mo.created_at
    AND cim.created_at >= mo.created_at - INTERVAL '14 days';

  -- 5. Top Produce Items in Demand
  SELECT jsonb_agg(
    jsonb_build_object(
      'produce_name', item_summary.produce_name,
      'total_count', item_summary.cnt,
      'want_to_buy', item_summary.wtb,
      'have_to_sell', item_summary.hts
    )
  ) INTO v_top_items
  FROM (
    SELECT 
      cpi.produce_name,
      COUNT(cpi.id) as cnt,
      COUNT(CASE WHEN cpi.intent = 'want_to_buy' THEN 1 END) as wtb,
      COUNT(CASE WHEN cpi.intent = 'have_to_sell' THEN 1 END) as hts
    FROM public.crm_produce_interests cpi
    WHERE cpi.created_at BETWEEN p_start_date AND p_end_date
    GROUP BY cpi.produce_name
    ORDER BY cnt DESC
    LIMIT 10
  ) item_summary;

  -- 6. Top Zipcodes with Interest
  SELECT jsonb_agg(
    jsonb_build_object(
      'zip_code', zip_summary.zcode,
      'count', zip_summary.cnt
    )
  ) INTO v_top_zips
  FROM (
    SELECT 
      UNNEST(cpi.zipcodes) as zcode,
      COUNT(cpi.id) as cnt
    FROM public.crm_produce_interests cpi
    WHERE cpi.created_at BETWEEN p_start_date AND p_end_date
    GROUP BY zcode
    ORDER BY cnt DESC
    LIMIT 10
  ) zip_summary;

  -- 7. Daily Time Series
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', ts.day_str,
      'submissions', COALESCE(ts.submissions, 0),
      'listings_created', COALESCE(ts.listings, 0),
      'chats_started', COALESCE(ts.chats, 0),
      'orders_placed', COALESCE(ts.orders, 0),
      'gmv', COALESCE(ts.gmv, 0.00)
    )
  ) INTO v_time_series
  FROM (
    SELECT 
      TO_CHAR(d.day, 'YYYY-MM-DD') AS day_str,
      (
        SELECT COUNT(id) FROM public.crm_produce_interests 
        WHERE created_at::date = d.day::date
      ) AS submissions,
      (
        SELECT COUNT(DISTINCT mp.id) FROM public.market_products mp
        JOIN public.crm_interest_matches cim ON LOWER(mp.name) = LOWER(cim.produce_name)
        WHERE mp.created_at::date = d.day::date
      ) AS listings,
      (
        SELECT COUNT(DISTINCT mc.id) FROM public.market_chats mc
        JOIN public.crm_interest_matches cim ON mc.buyer_id = cim.buyer_user_id
        WHERE mc.created_at::date = d.day::date
      ) AS chats,
      (
        SELECT COUNT(DISTINCT mo.id) FROM public.market_orders mo
        JOIN public.crm_interest_matches cim ON mo.buyer_id = cim.buyer_user_id
        WHERE mo.status NOT IN ('cancelled', 'refunded')
          AND mo.created_at::date = d.day::date
      ) AS orders,
      (
        SELECT COALESCE(SUM(mo.total_usd), 0.00) FROM public.market_orders mo
        JOIN public.crm_interest_matches cim ON mo.buyer_id = cim.buyer_user_id
        WHERE mo.status NOT IN ('cancelled', 'refunded')
          AND mo.created_at::date = d.day::date
      ) AS gmv
    FROM generate_series(p_start_date::date, p_end_date::date, '1 day'::interval) AS d(day)
    ORDER BY d.day ASC
  ) ts;

  v_result := jsonb_build_object(
    'total_submissions', COALESCE(v_total_submissions, 0),
    'want_to_buy_count', COALESCE(v_want_to_buy, 0),
    'have_to_sell_count', COALESCE(v_have_to_sell, 0),
    'seller_listings_created', COALESCE(v_listings_created, 0),
    'buyer_chats_initiated', COALESCE(v_chats_initiated, 0),
    'buyer_orders_completed', COALESCE(v_orders_completed, 0),
    'gmv_from_interests', COALESCE(v_gmv_from_interests, 0.00),
    'top_produce_items', COALESCE(v_top_items, '[]'::jsonb),
    'top_zipcodes', COALESCE(v_top_zips, '[]'::jsonb),
    'time_series', COALESCE(v_time_series, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_interest_analytics IS '@audience:no Aggregates produce interest analytics, seller listing creation conversions, buyer conversation conversions, and GMV generated from interest alerts.';
