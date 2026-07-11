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

  DROP TABLE IF EXISTS _filtered_visits;
  CREATE TEMP TABLE _filtered_visits AS
  SELECT cv.*
  FROM crm_page_visits cv
  LEFT JOIN profiles p ON p.id = cv.user_id
  WHERE cv.visited_at::date BETWEEN p_start AND p_end
    AND (p_state IS NULL OR COALESCE(cv.region, p.state_code) = p_state)
    AND (p_city IS NULL OR COALESCE(cv.city, p.city) ILIKE p_city)
    AND (p_zip IS NULL OR COALESCE(cv.zip_code, p.zip_plus4) = p_zip)
    AND (p_utm_source IS NULL OR cv.utm_source = p_utm_source)
    AND (p_utm_medium IS NULL OR cv.utm_medium = p_utm_medium)
    AND (p_utm_campaign IS NULL OR cv.utm_campaign = p_utm_campaign)
    AND (p_utm_term IS NULL OR cv.utm_term = p_utm_term);

  WITH visit_events AS (
    SELECT 
      fv.session_id,
      fv.page_slug,
      COUNT(e.id) AS event_count
    FROM _filtered_visits fv
    LEFT JOIN crm_page_events e ON e.session_id = fv.session_id AND e.page_slug = fv.page_slug
    GROUP BY fv.session_id, fv.page_slug
  ),
  page_stats AS (
    SELECT
      fv.page_slug AS route,
      COUNT(fv.id)::bigint AS page_loads,
      COUNT(DISTINCT fv.session_id)::bigint AS unique_users,
      ROUND(100.0 * COUNT(*) FILTER (WHERE ve.event_count = 0) / GREATEST(COUNT(*), 1))::int AS bounce_rate
    FROM _filtered_visits fv
    LEFT JOIN visit_events ve ON ve.session_id = fv.session_id AND ve.page_slug = fv.page_slug
    GROUP BY fv.page_slug
  ),
  last_page AS (
    SELECT DISTINCT ON (session_id) session_id, page_slug AS last_path
    FROM _filtered_visits
    ORDER BY session_id, visited_at DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'route', ps.route,
    'pageLoads', ps.page_loads,
    'uniqueUsers', ps.unique_users,
    'avgDwellTime', 0,
    'bounceRate', ps.bounce_rate,
    'dropOffRate', ROUND(100.0 * (SELECT COUNT(*) FROM last_page lp WHERE lp.last_path = ps.route) / GREATEST(ps.page_loads, 1))::int,
    'errors', COALESCE((SELECT COUNT(*) FROM crm_page_events e JOIN _filtered_visits fv ON fv.session_id = e.session_id WHERE e.page_slug = ps.route AND e.event_type = 'error'), 0)
  ) ORDER BY ps.page_loads DESC), '[]'::jsonb) INTO v_routes
  FROM page_stats ps
  LIMIT 20;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'route', t.route, 'count', t.cnt
  )), '[]'::jsonb) INTO v_drop_off
  FROM (
    SELECT 
      COALESCE(
        lp.page_slug || ' (' || (
          SELECT e.event_data->>'step_name'
          FROM crm_page_events e
          WHERE e.session_id = lp.session_id
            AND e.page_slug = lp.page_slug
            AND e.event_type = 'wizard_step'
          ORDER BY e.occurred_at DESC
          LIMIT 1
        ) || ')', 
        lp.page_slug
      ) AS route, 
      COUNT(*) AS cnt
    FROM (
      SELECT DISTINCT ON (session_id) session_id, page_slug
      FROM _filtered_visits
      ORDER BY session_id, visited_at DESC
    ) lp
    GROUP BY route
    ORDER BY COUNT(*) DESC
    LIMIT 8
  ) t;

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
          EXTRACT(EPOCH FROM (MAX(visited_at) - MIN(visited_at))) AS dur
        FROM _filtered_visits
        GROUP BY session_id
      ) s
    ) b
    GROUP BY bucket
    ORDER BY MIN(CASE bucket
      WHEN '0-30s' THEN 1 WHEN '30-60s' THEN 2
      WHEN '1-3m' THEN 3 WHEN '3-10m' THEN 4 ELSE 5 END)
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'route', t.route, 'errorName', t.err_name, 'count', t.cnt
  )), '[]'::jsonb) INTO v_error_hotspots
  FROM (
    SELECT e.page_slug AS route, e.target_element AS err_name, COUNT(*) AS cnt
    FROM crm_page_events e
    JOIN _filtered_visits fv ON fv.session_id = e.session_id
    WHERE e.event_type = 'error'
    GROUP BY e.page_slug, e.target_element
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
