-- Migration: Interest Digest Cron

SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION get_recipient_timezone(p_state_code TEXT, p_zipcode TEXT)
RETURNS TEXT AS $$
DECLARE
  v_tz TEXT;
BEGIN
  IF p_state_code IS NULL AND p_zipcode IS NOT NULL THEN
    SELECT s.code INTO p_state_code
    FROM zip_codes z
    JOIN cities c ON c.id = z.city_id
    JOIN states s ON s.id = c.state_id
    WHERE z.zip_code = p_zipcode
    LIMIT 1;
  END IF;

  IF p_state_code IS NOT NULL THEN
    v_tz := CASE UPPER(p_state_code)
      WHEN 'AL' THEN 'America/Chicago'
      WHEN 'AK' THEN 'America/Anchorage'
      WHEN 'AZ' THEN 'America/Phoenix'
      WHEN 'AR' THEN 'America/Chicago'
      WHEN 'CA' THEN 'America/Los_Angeles'
      WHEN 'CO' THEN 'America/Denver'
      WHEN 'CT' THEN 'America/New_York'
      WHEN 'DE' THEN 'America/New_York'
      WHEN 'FL' THEN 'America/New_York'
      WHEN 'GA' THEN 'America/New_York'
      WHEN 'HI' THEN 'Pacific/Honolulu'
      WHEN 'ID' THEN 'America/Boise'
      WHEN 'IL' THEN 'America/Chicago'
      WHEN 'IN' THEN 'America/Indiana/Indianapolis'
      WHEN 'IA' THEN 'America/Chicago'
      WHEN 'KS' THEN 'America/Chicago'
      WHEN 'KY' THEN 'America/New_York'
      WHEN 'LA' THEN 'America/Chicago'
      WHEN 'ME' THEN 'America/New_York'
      WHEN 'MD' THEN 'America/New_York'
      WHEN 'MA' THEN 'America/New_York'
      WHEN 'MI' THEN 'America/Detroit'
      WHEN 'MN' THEN 'America/Chicago'
      WHEN 'MS' THEN 'America/Chicago'
      WHEN 'MO' THEN 'America/Chicago'
      WHEN 'MT' THEN 'America/Denver'
      WHEN 'NE' THEN 'America/Chicago'
      WHEN 'NV' THEN 'America/Los_Angeles'
      WHEN 'NH' THEN 'America/New_York'
      WHEN 'NJ' THEN 'America/New_York'
      WHEN 'NM' THEN 'America/Denver'
      WHEN 'NY' THEN 'America/New_York'
      WHEN 'NC' THEN 'America/New_York'
      WHEN 'ND' THEN 'America/Chicago'
      WHEN 'OH' THEN 'America/New_York'
      WHEN 'OK' THEN 'America/Chicago'
      WHEN 'OR' THEN 'America/Los_Angeles'
      WHEN 'PA' THEN 'America/New_York'
      WHEN 'RI' THEN 'America/New_York'
      WHEN 'SC' THEN 'America/New_York'
      WHEN 'SD' THEN 'America/Chicago'
      WHEN 'TN' THEN 'America/Chicago'
      WHEN 'TX' THEN 'America/Chicago'
      WHEN 'UT' THEN 'America/Denver'
      WHEN 'VT' THEN 'America/New_York'
      WHEN 'VA' THEN 'America/New_York'
      WHEN 'WA' THEN 'America/Los_Angeles'
      WHEN 'WV' THEN 'America/New_York'
      WHEN 'WI' THEN 'America/Chicago'
      WHEN 'WY' THEN 'America/Denver'
      WHEN 'DC' THEN 'America/New_York'
      WHEN 'PR' THEN 'America/Puerto_Rico'
      WHEN 'VI' THEN 'America/Virgin'
      WHEN 'GU' THEN 'Pacific/Guam'
      ELSE NULL
    END;
    IF v_tz IS NOT NULL THEN
      RETURN v_tz;
    END IF;
  END IF;

  RETURN 'America/Los_Angeles';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_recipient_timezone IS 'Resolves timezone from state code for interest match digests.';

CREATE OR REPLACE FUNCTION get_unnotified_interest_matches()
RETURNS TABLE (
  recipient_email TEXT,
  recipient_name TEXT,
  is_user BOOLEAN,
  user_id UUID,
  lead_id UUID,
  match_type TEXT,
  matches JSON
)
AS $$
DECLARE
  v_slots JSONB;
BEGIN
  -- Read admin-configured email send windows (singleton row)
  SELECT email_slots INTO v_slots
  FROM crm_send_slot_defaults
  LIMIT 1;

  -- If no slots configured, fall back to every-day 9-11 AM
  IF v_slots IS NULL OR jsonb_array_length(v_slots) = 0 THEN
    v_slots := '[{"day":"mon","start":"09:00","end":"11:00"},{"day":"tue","start":"09:00","end":"11:00"},{"day":"wed","start":"09:00","end":"11:00"},{"day":"thu","start":"09:00","end":"11:00"},{"day":"fri","start":"09:00","end":"11:00"},{"day":"sat","start":"09:00","end":"11:00"},{"day":"sun","start":"09:00","end":"11:00"}]'::jsonb;
  END IF;

  RETURN QUERY
  WITH raw_matches AS (
    SELECT 
      m.seller_email AS email,
      COALESCE(su.full_name, sl.name) AS name,
      (m.seller_user_id IS NOT NULL) AS is_usr,
      m.seller_user_id AS u_id,
      m.seller_lead_id AS l_id,
      'seller'::TEXT AS m_type,
      NULL::TEXT AS state_code,
      COALESCE(sl.zipcode, spi.zipcodes[1]) AS zip,
      m.id AS match_id,
      m.produce_name
    FROM crm_interest_matches m
    JOIN crm_produce_interests spi ON spi.id = m.seller_interest_id
    LEFT JOIN profiles su ON su.id = m.seller_user_id
    LEFT JOIN crm_leads sl ON sl.id = m.seller_lead_id
    WHERE m.notified_seller_at IS NULL

    UNION ALL

    SELECT 
      m.buyer_email AS email,
      COALESCE(bu.full_name, bl.name) AS name,
      (m.buyer_user_id IS NOT NULL) AS is_usr,
      m.buyer_user_id AS u_id,
      m.buyer_lead_id AS l_id,
      'buyer'::TEXT AS m_type,
      NULL::TEXT AS state_code,
      COALESCE(bl.zipcode, bpi.zipcodes[1]) AS zip,
      m.id AS match_id,
      m.produce_name
    FROM crm_interest_matches m
    JOIN crm_produce_interests bpi ON bpi.id = m.buyer_interest_id
    LEFT JOIN profiles bu ON bu.id = m.buyer_user_id
    LEFT JOIN crm_leads bl ON bl.id = m.buyer_lead_id
    WHERE m.notified_buyer_at IS NULL
      AND m.created_listing_id IS NOT NULL
  ),
  with_tz AS (
    SELECT 
      rm.*,
      get_recipient_timezone(rm.state_code, rm.zip) AS tz
    FROM raw_matches rm
  ),
  -- Map PostgreSQL day-of-week (0=Sun..6=Sat) to slot day codes
  filtered AS (
    SELECT wt.*
    FROM with_tz wt
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_slots) slot
      WHERE
        -- Match day of week: convert PG dow to 3-letter code
        (slot->>'day') = (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[
          EXTRACT(DOW FROM timezone(wt.tz, now()))::INT + 1
        ]
        -- Match time window: current local time is between start and end
        AND (timezone(wt.tz, now()))::TIME >= (slot->>'start')::TIME
        AND (timezone(wt.tz, now()))::TIME < (slot->>'end')::TIME
    )
  )
  SELECT 
    f.email,
    f.name,
    f.is_usr,
    f.u_id,
    f.l_id,
    f.m_type,
    json_agg(
      json_build_object(
        'match_id', f.match_id,
        'produce_name', f.produce_name
      )
    ) AS matches
  FROM filtered f
  WHERE f.email IS NOT NULL
  GROUP BY f.email, f.name, f.is_usr, f.u_id, f.l_id, f.m_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_unnotified_interest_matches IS 'Returns batched seller and buyer interest matches filtered by admin-configured email send windows (crm_send_slot_defaults) in the recipient local timezone.';

DO $$
BEGIN
  PERFORM cron.unschedule('process-interest-digests');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'process-interest-digests',
  '0 * * * *',
  $$ SELECT net.http_post(
    url := get_edge_fn_base_url() || '/process-interest-digests',
    headers := edge_fn_headers(),
    body := '{"action": "send_digests"}'::jsonb
  ) $$
);
