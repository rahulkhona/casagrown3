-- Fix metrics_wizard_field_analytics union query column count mismatch and missing occurred_at column
DROP FUNCTION IF EXISTS metrics_wizard_field_analytics(date, date, text, text, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION metrics_wizard_field_analytics(
  p_start DATE,
  p_end DATE,
  p_wizard TEXT,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL,
  p_utm_source TEXT DEFAULT NULL,
  p_utm_medium TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_utm_term TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  WITH filtered_events AS (
    SELECT e.session_id, e.event_type, e.event_data, e.page_slug, e.occurred_at
    FROM crm_page_events e
    JOIN crm_page_visits v ON v.session_id = e.session_id
    WHERE e.occurred_at::date >= p_start
      AND e.occurred_at::date <= p_end
      AND (p_state IS NULL OR v.region = p_state)
      AND (p_city IS NULL OR v.city = p_city)
      AND (p_zip IS NULL OR v.zip_code = p_zip)
      AND (p_utm_source IS NULL OR v.utm_source = p_utm_source)
      AND (p_utm_medium IS NULL OR v.utm_medium = p_utm_medium)
      AND (p_utm_campaign IS NULL OR v.utm_campaign = p_utm_campaign)
      AND (p_utm_term IS NULL OR v.utm_term = p_utm_term)
  ),
  raw_field_names AS (
    SELECT step, field_name
    FROM (
        VALUES
        -- /create-listing
        ('/create-listing', 1, 'title'), ('/create-listing', 1, 'category_id'), ('/create-listing', 1, 'next_button'),
        ('/create-listing', 2, 'fulfillment_type'), ('/create-listing', 2, 'delivery_radius'), ('/create-listing', 2, 'next_button'),
        ('/create-listing', 3, 'price'), ('/create-listing', 3, 'next_button'),
        ('/create-listing', 4, 'verify_details_button'),
        ('/create-listing', 5, 'publish_button'),
        
        -- /join
        ('/join', 1, 'name'), ('/join', 1, 'email'), ('/join', 1, 'password'), ('/join', 1, 'next_button'),
        ('/join', 3, 'phone_otp_code'), ('/join', 3, 'verify_phone_button'),
        
        -- /sell
        ('/sell', 2, 'zipcode'), ('/sell', 2, 'next_button'),
        ('/sell', 3, 'garden_size'), ('/sell', 3, 'next_button'),
        ('/sell', 4, 'selected_plants'), ('/sell', 4, 'next_button'),
        ('/sell', 5, 'selected_trees'), ('/sell', 5, 'next_button'),
        ('/sell', 7, 'name'), ('/sell', 7, 'email'), ('/sell', 7, 'phone'), ('/sell', 7, 'next_button'),
        
        -- /check-nutrition-loss
        ('/check-nutrition-loss', 2, 'selected_produce'), ('/check-nutrition-loss', 2, 'next_button'),
        ('/check-nutrition-loss', 4, 'name'), ('/check-nutrition-loss', 4, 'email'), ('/check-nutrition-loss', 4, 'phone'), ('/check-nutrition-loss', 4, 'next_button'),

        -- /p/[slug]
        ('/p/[slug]', 1, 'email'), ('/p/[slug]', 1, 'next_button'),
        ('/p/[slug]', 2, 'full_name'), ('/p/[slug]', 2, 'farm_name'), ('/p/[slug]', 2, 'street_address'), ('/p/[slug]', 2, 'city'), ('/p/[slug]', 2, 'state_code'), ('/p/[slug]', 2, 'zip_code'), ('/p/[slug]', 2, 'phone'), ('/p/[slug]', 2, 'sms_consent'), ('/p/[slug]', 2, 'next_button')
    ) AS f(page_slug, step, field_name)
    WHERE page_slug = p_wizard
    
    UNION
    
    SELECT (event_data->>'step')::INT AS step, event_data->>'field' AS field_name
    FROM filtered_events
    WHERE event_type = 'wizard_field_interact'
      AND (page_slug = p_wizard OR (p_wizard = '/p/[slug]' AND page_slug LIKE '/p/%'))
      AND (event_data->>'step') IS NOT NULL
  ),
  raw_field_events AS (
    SELECT
      (event_data->>'step')::INT AS step,
      event_data->>'field' AS field_name,
      (event_data->>'has_value')::BOOLEAN AS has_value,
      session_id,
      occurred_at
    FROM filtered_events
    WHERE event_type = 'wizard_field_interact'
      AND (page_slug = p_wizard OR (p_wizard = '/p/[slug]' AND page_slug LIKE '/p/%'))
  ),
  field_events AS (
    SELECT DISTINCT ON (session_id, step, field_name)
      step,
      field_name,
      has_value,
      session_id
    FROM raw_field_events
    ORDER BY session_id, step, field_name, occurred_at DESC
  ),
  field_stats AS (
    SELECT
      rfn.step,
      rfn.field_name,
      COALESCE(COUNT(DISTINCT fe.session_id), 0) AS interact_count,
      COALESCE(COUNT(DISTINCT fe.session_id) FILTER (WHERE fe.has_value = true), 0) AS filled_count,
      COALESCE(COUNT(DISTINCT fe.session_id) FILTER (WHERE fe.has_value = false), 0) AS empty_count
    FROM raw_field_names rfn
    LEFT JOIN field_events fe ON fe.step = rfn.step AND fe.field_name = rfn.field_name
    WHERE rfn.step IS NOT NULL AND rfn.field_name IS NOT NULL
    GROUP BY rfn.step, rfn.field_name
  ),
  validation_events AS (
    SELECT
      (event_data->>'step')::INT AS step,
      event_data->>'field' AS field_name,
      event_data->>'error' AS error_type,
      COUNT(*) AS error_count
    FROM filtered_events
    WHERE event_type = 'wizard_validation_error'
      AND (page_slug = p_wizard OR (p_wizard = '/p/[slug]' AND page_slug LIKE '/p/%'))
    GROUP BY step, field_name, error_type
  ),
  ai_events AS (
    SELECT
      event_data->>'button' AS button_name,
      event_data->>'action' AS action,
      COUNT(*) AS cnt
    FROM filtered_events
    WHERE event_type = 'wizard_ai_used'
      AND (page_slug = p_wizard OR (p_wizard = '/p/[slug]' AND page_slug LIKE '/p/%'))
    GROUP BY button_name, action
  ),
  ai_stats AS (
    SELECT
      button_name,
      SUM(cnt) FILTER (WHERE action = 'clicked') AS click_count,
      SUM(cnt) FILTER (WHERE action = 'applied') AS applied_count,
      SUM(cnt) FILTER (WHERE action = 'dismissed') AS dismissed_count,
      SUM(cnt) FILTER (WHERE action = 'abandon_wait') AS abandon_wait_count
    FROM ai_events
    GROUP BY button_name
  ),
  timing_events AS (
    SELECT
      (event_data->>'step')::INT AS step,
      event_data->>'step_name' AS step_name,
      (event_data->>'duration_secs')::NUMERIC AS duration_secs,
      session_id
    FROM filtered_events
    WHERE event_type = 'wizard_step_timing'
      AND (page_slug = p_wizard OR (p_wizard = '/p/[slug]' AND page_slug LIKE '/p/%'))
  ),
  timing_stats AS (
    SELECT
      step,
      step_name,
      COUNT(DISTINCT session_id) AS session_count,
      ROUND(AVG(duration_secs)::numeric, 1) AS avg_secs,
      ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_secs))::numeric, 1) AS median_secs
    FROM timing_events
    GROUP BY step, step_name
  ),
  abandon_events AS (
    SELECT
      (event_data->>'last_step')::INT AS last_step,
      event_data->>'last_step_name' AS last_step_name,
      (event_data->>'time_on_step_secs')::NUMERIC AS time_on_step_secs,
      session_id
    FROM filtered_events
    WHERE event_type = 'wizard_abandon'
      AND (page_slug = p_wizard OR (p_wizard = '/p/[slug]' AND page_slug LIKE '/p/%'))
  ),
  abandon_stats AS (
    SELECT
      last_step,
      last_step_name,
      COUNT(DISTINCT session_id) AS abandon_count,
      ROUND(AVG(time_on_step_secs)::numeric, 1) AS avg_time_on_step_secs
    FROM abandon_events
    GROUP BY last_step, last_step_name
  ),
  button_click_stats AS (
    SELECT
      (event_data->>'step')::INT AS step,
      event_data->>'button' AS button_name,
      COUNT(*) AS click_count
    FROM filtered_events
    WHERE event_type = 'button_click'
      AND (page_slug = p_wizard OR (p_wizard = '/p/[slug]' AND page_slug LIKE '/p/%'))
    GROUP BY step, button_name
  ),
  step_funnel AS (
    SELECT
      s.step,
      s.step_name,
      COALESCE(COUNT(DISTINCT fe.session_id), 0) AS unique_sessions
    FROM (
      SELECT DISTINCT ON (step)
        step,
        step_name
      FROM (
        SELECT 1 AS step, 'basics' AS step_name WHERE p_wizard = '/create-listing'
        UNION ALL
        SELECT 2 AS step, 'fulfillment' AS step_name WHERE p_wizard = '/create-listing'
        UNION ALL
        SELECT 3 AS step, 'pricing' AS step_name WHERE p_wizard = '/create-listing'
        UNION ALL
        SELECT 4 AS step, 'verify' AS step_name WHERE p_wizard = '/create-listing'
        UNION ALL
        SELECT 5 AS step, 'publish' AS step_name WHERE p_wizard = '/create-listing'
        UNION ALL
        SELECT 1 AS step, 'profile' AS step_name WHERE p_wizard = '/join'
        UNION ALL
        SELECT 2 AS step, 'otp' AS step_name WHERE p_wizard = '/join'
        UNION ALL
        SELECT 3 AS step, 'phone-verify' AS step_name WHERE p_wizard = '/join'
        UNION ALL
        SELECT 4 AS step, 'welcome' AS step_name WHERE p_wizard = '/join'
        UNION ALL
        SELECT 1 AS step, 'basics' AS step_name WHERE p_wizard = '/sell'
        UNION ALL
        SELECT 2 AS step, 'verification' AS step_name WHERE p_wizard = '/sell'
        UNION ALL
        SELECT 3 AS step, 'welcome' AS step_name WHERE p_wizard = '/sell'
        UNION ALL
        SELECT 1 AS step, 'produce-details' AS step_name WHERE p_wizard = '/check-nutrition-loss'
        UNION ALL
        SELECT 2 AS step, 'storage-conditions' AS step_name WHERE p_wizard = '/check-nutrition-loss'
        UNION ALL
        SELECT 3 AS step, 'results' AS step_name WHERE p_wizard = '/check-nutrition-loss'
        UNION ALL
        SELECT 1 AS step, 'initial' AS step_name WHERE p_wizard = '/p/[slug]'
        UNION ALL
        SELECT 2 AS step, 'profile' AS step_name WHERE p_wizard = '/p/[slug]'
        UNION ALL
        SELECT 3 AS step, 'otp' AS step_name WHERE p_wizard = '/p/[slug]'
        UNION ALL
        SELECT 4 AS step, 'payment' AS step_name WHERE p_wizard = '/p/[slug]'
        UNION ALL
        SELECT 5 AS step, 'success' AS step_name WHERE p_wizard = '/p/[slug]'
        UNION ALL
        SELECT 
          (event_data->>'step_index')::INT AS step,
          event_data->>'step_name' AS step_name
        FROM filtered_events
        WHERE event_type = 'wizard_step'
          AND (page_slug = p_wizard OR (p_wizard = '/p/[slug]' AND page_slug LIKE '/p/%'))
      ) raw_steps
      ORDER BY step, step_name
    ) s
    LEFT JOIN filtered_events fe ON (fe.event_data->>'step_index')::INT = s.step AND fe.event_type = 'wizard_step' AND (fe.page_slug = p_wizard OR (p_wizard = '/p/[slug]' AND fe.page_slug LIKE '/p/%'))
    GROUP BY s.step, s.step_name
  )
  SELECT json_build_object(
    'stepFunnel', COALESCE((SELECT json_agg(row_to_json(sf) ORDER BY sf.step) FROM step_funnel sf), '[]'::json),
    'fieldInteractions', COALESCE((SELECT json_agg(row_to_json(fs) ORDER BY fs.step, fs.field_name) FROM field_stats fs), '[]'::json),
    'validationErrors', COALESCE((SELECT json_agg(row_to_json(ve) ORDER BY ve.step, ve.field_name) FROM validation_events ve), '[]'::json),
    'aiUsage', COALESCE((SELECT json_agg(row_to_json(ai)) FROM ai_stats ai), '[]'::json),
    'stepTiming', COALESCE((SELECT json_agg(row_to_json(ts) ORDER BY ts.step) FROM timing_stats ts), '[]'::json),
    'abandonPoints', COALESCE((SELECT json_agg(row_to_json(ab) ORDER BY ab.abandon_count DESC) FROM abandon_stats ab), '[]'::json),
    'buttonClicks', COALESCE((SELECT json_agg(row_to_json(bc) ORDER BY bc.step, bc.button_name) FROM button_click_stats bc), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;
