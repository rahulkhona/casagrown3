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
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE m.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
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
        LEFT JOIN communities co ON co.id = p.community_id
        LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
        LEFT JOIN cities ci ON ci.id = zc.city_id
        LEFT JOIN states st ON st.id = ci.state_id
        WHERE (p_state IS NULL OR st.code = p_state)
          AND (p_city IS NULL OR ci.name ILIKE p_city)
          AND (p_zip IS NULL OR co.zip_code = p_zip)
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
  LEFT JOIN communities co ON co.id = p.community_id
  LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
  LEFT JOIN cities ci ON ci.id = zc.city_id
  LEFT JOIN states st ON st.id = ci.state_id
  WHERE m.created_at::date BETWEEN p_start AND p_end
    AND (p_state IS NULL OR st.code = p_state)
    AND (p_city IS NULL OR ci.name ILIKE p_city)
    AND (p_zip IS NULL OR co.zip_code = p_zip);

  SELECT COALESCE(AVG(cnt), 0) INTO v_avg_dau
  FROM (
    SELECT COUNT(DISTINCT m.author_id) AS cnt
    FROM community_chat_messages m
    JOIN profiles p ON p.id = m.author_id
    LEFT JOIN communities co ON co.id = p.community_id
    LEFT JOIN zip_codes zc ON zc.zip_code = co.zip_code AND zc.country_iso_3 = co.country_iso_3
    LEFT JOIN cities ci ON ci.id = zc.city_id
    LEFT JOIN states st ON st.id = ci.state_id
    WHERE m.created_at::date BETWEEN p_start AND p_end
      AND (p_state IS NULL OR st.code = p_state)
      AND (p_city IS NULL OR ci.name ILIKE p_city)
      AND (p_zip IS NULL OR co.zip_code = p_zip)
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
