CREATE OR REPLACE FUNCTION metrics_page_analytics(
  p_start DATE,
  p_end DATE,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL,
  p_utm_source TEXT DEFAULT NULL,
  p_utm_medium TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_utm_term TEXT DEFAULT NULL
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
        COUNT(*) AS event_count,
        SUM(CASE WHEN ua.event_type = 'page_view' THEN 1 ELSE 0 END) AS page_view_count
      FROM user_analytics ua
      LEFT JOIN profiles p ON p.id = ua.user_id
      LEFT JOIN crm_page_visits cv ON cv.session_id = ua.session_id
      WHERE ua.created_at::date BETWEEN p_start AND p_end
        AND (p_state IS NULL OR COALESCE(cv.region, p.state_code) = p_state)
        AND (p_city IS NULL OR COALESCE(cv.city, p.city) ILIKE p_city)
        AND (p_zip IS NULL OR COALESCE(cv.zip_code, p.zip_plus4) = p_zip)
        AND (p_utm_source IS NULL OR cv.utm_source = p_utm_source)
        AND (p_utm_medium IS NULL OR cv.utm_medium = p_utm_medium)
        AND (p_utm_campaign IS NULL OR cv.utm_campaign = p_utm_campaign)
        AND (p_utm_term IS NULL OR cv.utm_term = p_utm_term)
      GROUP BY ua.page_path, ua.session_id
    ),
    last_page AS (
      SELECT DISTINCT ON (ua.session_id) ua.session_id, ua.page_path AS last_path
      FROM user_analytics ua
      LEFT JOIN crm_page_visits cv ON cv.session_id = ua.session_id
      WHERE ua.created_at::date BETWEEN p_start AND p_end
        AND (p_utm_source IS NULL OR cv.utm_source = p_utm_source)
        AND (p_utm_medium IS NULL OR cv.utm_medium = p_utm_medium)
        AND (p_utm_campaign IS NULL OR cv.utm_campaign = p_utm_campaign)
        AND (p_utm_term IS NULL OR cv.utm_term = p_utm_term)
      ORDER BY ua.session_id, ua.created_at DESC
    )
    SELECT
      ps.page_path AS route,
      SUM(ps.page_view_count)::bigint AS page_loads,
      COUNT(DISTINCT ps.session_id)::bigint AS unique_users,
      ROUND(100.0 * COUNT(*) FILTER (WHERE ps.event_count = 1) / GREATEST(COUNT(*), 1))::int AS bounce_rate,
      ROUND(100.0 * COUNT(*) FILTER (WHERE lp.last_path = ps.page_path) / GREATEST(COUNT(*), 1))::int AS drop_off_rate,
      COALESCE((SELECT COUNT(*) FROM user_analytics ua2 
        LEFT JOIN crm_page_visits cv2 ON cv2.session_id = ua2.session_id
        WHERE ua2.page_path = ps.page_path AND ua2.event_type = 'error' AND ua2.created_at::date BETWEEN p_start AND p_end
        AND (p_utm_source IS NULL OR cv2.utm_source = p_utm_source)
        AND (p_utm_medium IS NULL OR cv2.utm_medium = p_utm_medium)
        AND (p_utm_campaign IS NULL OR cv2.utm_campaign = p_utm_campaign)
        AND (p_utm_term IS NULL OR cv2.utm_term = p_utm_term)
      ), 0)::bigint AS errors
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
      SELECT DISTINCT ON (ua.session_id) ua.session_id, ua.page_path
      FROM user_analytics ua
      LEFT JOIN crm_page_visits cv ON cv.session_id = ua.session_id
      WHERE ua.created_at::date BETWEEN p_start AND p_end
        AND (p_utm_source IS NULL OR cv.utm_source = p_utm_source)
        AND (p_utm_medium IS NULL OR cv.utm_medium = p_utm_medium)
        AND (p_utm_campaign IS NULL OR cv.utm_campaign = p_utm_campaign)
        AND (p_utm_term IS NULL OR cv.utm_term = p_utm_term)
      ORDER BY ua.session_id, ua.created_at DESC
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
        SELECT ua.session_id,
          EXTRACT(EPOCH FROM (MAX(ua.created_at) - MIN(ua.created_at))) AS dur
        FROM user_analytics ua
        LEFT JOIN crm_page_visits cv ON cv.session_id = ua.session_id
        WHERE ua.created_at::date BETWEEN p_start AND p_end
          AND (p_utm_source IS NULL OR cv.utm_source = p_utm_source)
          AND (p_utm_medium IS NULL OR cv.utm_medium = p_utm_medium)
          AND (p_utm_campaign IS NULL OR cv.utm_campaign = p_utm_campaign)
          AND (p_utm_term IS NULL OR cv.utm_term = p_utm_term)
        GROUP BY ua.session_id
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
    SELECT ua.page_path AS route, ua.event_name AS err_name, COUNT(*) AS cnt
    FROM user_analytics ua
    LEFT JOIN crm_page_visits cv ON cv.session_id = ua.session_id
    WHERE ua.event_type = 'error'
      AND ua.created_at::date BETWEEN p_start AND p_end
      AND (p_utm_source IS NULL OR cv.utm_source = p_utm_source)
      AND (p_utm_medium IS NULL OR cv.utm_medium = p_utm_medium)
      AND (p_utm_campaign IS NULL OR cv.utm_campaign = p_utm_campaign)
      AND (p_utm_term IS NULL OR cv.utm_term = p_utm_term)
    GROUP BY ua.page_path, ua.event_name
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
