-- RPC to fetch all wizards that have drop-off events in the period
CREATE OR REPLACE FUNCTION metrics_active_wizards(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS TABLE (
  wizard_slug TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT page_slug
  FROM crm_page_events
  WHERE event_type = 'wizard_step'
    AND occurred_at >= p_start
    AND occurred_at <= p_end;
END;
$$;
