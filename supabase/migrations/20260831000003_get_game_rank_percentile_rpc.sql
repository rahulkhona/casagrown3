-- Migration: Dynamic Game Rank Percentiles (Global + Local ZIP Code)
-- Author: Antigravity AI
-- Description: Computes dynamic global and local ZIP code percentiles for daily games based on solve time.

SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION public.get_game_rank_percentile(
  p_game_id TEXT,
  p_game_date DATE,
  p_solve_time INTEGER,
  p_zip_code TEXT DEFAULT NULL
)
RETURNS TABLE (
  global_percentile INTEGER,
  local_percentile INTEGER,
  total_global_players INTEGER,
  total_local_players INTEGER
) AS $$
DECLARE
  v_global_total INT;
  v_global_faster INT;
  v_local_total INT;
  v_local_faster INT;
  v_global_pct INT;
  v_local_pct INT;
BEGIN
  -- 1. Global calculation
  SELECT COUNT(*) INTO v_global_total
  FROM public.user_game_completions
  WHERE game_id = p_game_id AND game_date = p_game_date;

  SELECT COUNT(*) INTO v_global_faster
  FROM public.user_game_completions
  WHERE game_id = p_game_id AND game_date = p_game_date AND solve_time_seconds < p_solve_time;

  IF v_global_total > 5 THEN
    v_global_pct := GREATEST(1, LEAST(99, ROUND((v_global_faster::numeric / v_global_total::numeric) * 100)));
  ELSE
    -- Heuristic fallback for low volume
    IF p_solve_time <= 25 THEN v_global_pct := 3;
    ELSIF p_solve_time <= 45 THEN v_global_pct := 8;
    ELSIF p_solve_time <= 75 THEN v_global_pct := 15;
    ELSE v_global_pct := 25;
    END IF;
  END IF;

  -- 2. Local ZIP calculation
  IF p_zip_code IS NOT NULL AND TRIM(p_zip_code) != '' THEN
    SELECT COUNT(*) INTO v_local_total
    FROM public.user_game_completions c
    LEFT JOIN public.push_subscriptions p ON (c.user_id = p.user_id OR c.guest_id = p.guest_id)
    WHERE c.game_id = p_game_id AND c.game_date = p_game_date AND p.zip_code = p_zip_code;

    SELECT COUNT(*) INTO v_local_faster
    FROM public.user_game_completions c
    LEFT JOIN public.push_subscriptions p ON (c.user_id = p.user_id OR c.guest_id = p.guest_id)
    WHERE c.game_id = p_game_id AND c.game_date = p_game_date AND p.zip_code = p_zip_code AND c.solve_time_seconds < p_solve_time;

    IF v_local_total > 2 THEN
      v_local_pct := GREATEST(1, LEAST(99, ROUND((v_local_faster::numeric / v_local_total::numeric) * 100)));
    ELSE
      -- Heuristic fallback for local
      IF p_solve_time <= 25 THEN v_local_pct := 2;
      ELSIF p_solve_time <= 45 THEN v_local_pct := 5;
      ELSIF p_solve_time <= 75 THEN v_local_pct := 12;
      ELSE v_local_pct := 20;
      END IF;
    END IF;
  ELSE
    -- Default fallback local percentile
    IF p_solve_time <= 25 THEN v_local_pct := 3;
    ELSIF p_solve_time <= 45 THEN v_local_pct := 8;
    ELSE v_local_pct := 15;
    END IF;
    v_local_total := 1;
  END IF;

  RETURN QUERY SELECT v_global_pct, v_local_pct, GREATEST(1, v_global_total), GREATEST(1, v_local_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_game_rank_percentile(TEXT, DATE, INTEGER, TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.get_game_rank_percentile IS 'Calculates global and local ZIP code percentile ranks for daily games based on solve time.';
