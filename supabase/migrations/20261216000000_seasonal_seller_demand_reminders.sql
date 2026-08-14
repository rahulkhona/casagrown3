-- Migration: produce_seasonal_harvest_windows & get_seasonal_seller_demand_reminders RPC
-- Defines harvest calendar, seeds initial data, and provides RPC for seasonal reminders with 15-day cooldown.

CREATE TABLE IF NOT EXISTS produce_seasonal_harvest_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produce_name TEXT NOT NULL,
  state_code TEXT NOT NULL DEFAULT 'US_DEFAULT',
  harvest_start_month INT NOT NULL CHECK (harvest_start_month BETWEEN 1 AND 12),
  harvest_end_month INT NOT NULL CHECK (harvest_end_month BETWEEN 1 AND 12),
  pre_season_month INT NOT NULL CHECK (pre_season_month BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (produce_name, state_code)
);

COMMENT ON TABLE produce_seasonal_harvest_windows IS 'Reference calendar mapping produce items and US states to harvest and pre-season notification windows.';
COMMENT ON COLUMN produce_seasonal_harvest_windows.produce_name IS 'Canonical produce item name (lowercased)';
COMMENT ON COLUMN produce_seasonal_harvest_windows.state_code IS '2-letter US State code (CA, TX, FL, NY, WA, GA, etc.) or US_DEFAULT';
COMMENT ON COLUMN produce_seasonal_harvest_windows.harvest_start_month IS '1-12 integer for harvest start month';
COMMENT ON COLUMN produce_seasonal_harvest_windows.harvest_end_month IS '1-12 integer for harvest end month';
COMMENT ON COLUMN produce_seasonal_harvest_windows.pre_season_month IS '1-12 integer for pre-season notification month (1 month before harvest start)';

ALTER TABLE produce_seasonal_harvest_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on harvest windows" ON produce_seasonal_harvest_windows FOR SELECT USING (true);
CREATE POLICY "Allow service role write on harvest windows" ON produce_seasonal_harvest_windows FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Pre-seed harvest windows across US_DEFAULT and major states
INSERT INTO produce_seasonal_harvest_windows (produce_name, state_code, harvest_start_month, harvest_end_month, pre_season_month)
VALUES
  -- Citrus
  ('lemons', 'US_DEFAULT', 11, 4, 10),
  ('lemons', 'CA', 11, 4, 10),
  ('lemons', 'FL', 10, 3, 9),
  ('meyer lemons', 'US_DEFAULT', 11, 4, 10),
  ('meyer lemons', 'CA', 11, 4, 10),
  ('oranges', 'US_DEFAULT', 12, 5, 11),
  ('oranges', 'CA', 12, 5, 11),
  ('oranges', 'FL', 11, 4, 10),
  ('valencia oranges', 'US_DEFAULT', 3, 7, 2),
  ('valencia oranges', 'CA', 3, 7, 2),
  ('limes', 'US_DEFAULT', 5, 10, 4),
  ('limes', 'CA', 5, 10, 4),
  ('persian limes', 'US_DEFAULT', 5, 10, 4),
  ('grapefruit', 'US_DEFAULT', 11, 5, 10),
  ('grapefruit', 'CA', 1, 6, 12),
  ('grapefruit', 'FL', 10, 4, 9),
  ('mandarins', 'US_DEFAULT', 11, 3, 10),
  ('mandarins', 'CA', 11, 3, 10),

  -- Stone Fruit & Orchard Fruit
  ('peaches', 'US_DEFAULT', 6, 9, 5),
  ('peaches', 'CA', 5, 9, 4),
  ('peaches', 'GA', 5, 8, 4),
  ('peaches & nectarines', 'US_DEFAULT', 6, 9, 5),
  ('peaches & nectarines', 'CA', 5, 9, 4),
  ('nectarines', 'US_DEFAULT', 6, 9, 5),
  ('nectarines', 'CA', 5, 9, 4),
  ('plums', 'US_DEFAULT', 6, 9, 5),
  ('plums', 'CA', 5, 9, 4),
  ('cherries', 'US_DEFAULT', 6, 8, 5),
  ('cherries', 'CA', 4, 6, 3),
  ('cherries', 'WA', 6, 8, 5),
  ('apples', 'US_DEFAULT', 8, 11, 7),
  ('apples', 'CA', 8, 11, 7),
  ('apples', 'WA', 8, 11, 7),
  ('apples', 'NY', 8, 11, 7),
  ('pears', 'US_DEFAULT', 8, 11, 7),
  ('pears', 'CA', 7, 10, 6),
  ('pears', 'WA', 8, 11, 7),
  ('figs', 'US_DEFAULT', 6, 10, 5),
  ('figs', 'CA', 6, 10, 5),
  ('persimmons', 'US_DEFAULT', 9, 12, 8),
  ('persimmons', 'CA', 9, 12, 8),
  ('pomegranates', 'US_DEFAULT', 9, 12, 8),
  ('pomegranates', 'CA', 9, 12, 8),
  ('avocados', 'US_DEFAULT', 3, 8, 2),
  ('avocados', 'CA', 1, 9, 12),
  ('hass avocados', 'US_DEFAULT', 3, 8, 2),
  ('hass avocados', 'CA', 1, 9, 12),

  -- Warm Season Vegetables & Herbs
  ('tomatoes', 'US_DEFAULT', 7, 10, 6),
  ('tomatoes', 'CA', 6, 10, 5),
  ('tomatoes', 'NY', 7, 10, 6),
  ('heirloom tomatoes', 'US_DEFAULT', 7, 10, 6),
  ('heirloom tomatoes', 'CA', 6, 10, 5),
  ('cherry tomatoes', 'US_DEFAULT', 7, 10, 6),
  ('cherry tomatoes', 'CA', 6, 10, 5),
  ('peppers', 'US_DEFAULT', 7, 10, 6),
  ('peppers', 'CA', 6, 10, 5),
  ('sweet peppers', 'US_DEFAULT', 7, 10, 6),
  ('hot peppers', 'US_DEFAULT', 7, 10, 6),
  ('cucumbers', 'US_DEFAULT', 6, 9, 5),
  ('cucumbers', 'CA', 5, 9, 4),
  ('squash', 'US_DEFAULT', 6, 10, 5),
  ('squash / zucchini', 'US_DEFAULT', 6, 10, 5),
  ('zucchini', 'US_DEFAULT', 6, 9, 5),
  ('zucchini', 'CA', 5, 9, 4),
  ('yellow squash', 'US_DEFAULT', 6, 9, 5),
  ('eggplant', 'US_DEFAULT', 7, 10, 6),
  ('eggplant', 'CA', 6, 10, 5),
  ('green beans', 'US_DEFAULT', 6, 9, 5),
  ('sweet corn', 'US_DEFAULT', 7, 9, 6),
  ('corn', 'US_DEFAULT', 7, 9, 6),
  ('pumpkins', 'US_DEFAULT', 9, 11, 8),
  ('winter squash', 'US_DEFAULT', 9, 11, 8),
  ('basil', 'US_DEFAULT', 6, 9, 5),
  ('basil', 'CA', 4, 10, 3),
  ('fresh sweet basil', 'US_DEFAULT', 6, 9, 5),
  ('fresh sweet basil', 'CA', 4, 10, 3),
  ('strawberries', 'US_DEFAULT', 5, 7, 4),
  ('strawberries', 'CA', 3, 10, 2),
  ('strawberries & berries', 'US_DEFAULT', 5, 7, 4),
  ('strawberries & berries', 'CA', 3, 10, 2),
  ('watermelon', 'US_DEFAULT', 7, 9, 6),
  ('cantaloupe', 'US_DEFAULT', 7, 9, 6),

  -- Year-Round & Cool Season
  ('herbs', 'US_DEFAULT', 4, 10, 3),
  ('herbs', 'CA', 3, 11, 2),
  ('parsley', 'US_DEFAULT', 4, 10, 3),
  ('cilantro', 'US_DEFAULT', 4, 10, 3),
  ('dill', 'US_DEFAULT', 4, 10, 3),
  ('mint', 'US_DEFAULT', 4, 10, 3),
  ('rosemary', 'US_DEFAULT', 1, 12, 12),
  ('leafy greens', 'US_DEFAULT', 4, 10, 3),
  ('kale', 'US_DEFAULT', 4, 11, 3),
  ('lettuce', 'US_DEFAULT', 4, 10, 3),
  ('spinach', 'US_DEFAULT', 4, 10, 3),
  ('carrots', 'US_DEFAULT', 5, 10, 4),
  ('radishes', 'US_DEFAULT', 4, 10, 3),
  ('onions', 'US_DEFAULT', 6, 10, 5),
  ('garlic', 'US_DEFAULT', 6, 8, 5),
  ('root veggies', 'US_DEFAULT', 5, 10, 4),
  ('honey', 'US_DEFAULT', 4, 10, 3),
  ('raw honey', 'US_DEFAULT', 4, 10, 3),
  ('eggs', 'US_DEFAULT', 1, 12, 12)
ON CONFLICT (produce_name, state_code) DO NOTHING;

-- RPC: get_seasonal_seller_demand_reminders
-- Returns sellers eligible for seasonal demand notification (Pre-season or In-season, buyers waiting, no active product, 15-day cooldown)
CREATE OR REPLACE FUNCTION get_seasonal_seller_demand_reminders()
RETURNS TABLE (
  seller_email TEXT,
  seller_name TEXT,
  seller_user_id UUID,
  seller_lead_id UUID,
  produce_name TEXT,
  zipcode TEXT,
  state_code TEXT,
  is_pre_season BOOLEAN,
  season_start_month INT,
  season_end_month INT,
  local_buyers_count BIGINT,
  other_in_demand_produce JSONB
) AS $$
DECLARE
  v_cur_month INT := EXTRACT(MONTH FROM now())::INT;
BEGIN
  RETURN QUERY
  WITH seller_interests AS (
    -- Collect active seller interests with seller info and resolved state
    SELECT 
      cpi.id AS interest_id,
      LOWER(TRIM(cpi.produce_name)) AS p_name,
      cpi.user_id,
      cpi.lead_id,
      COALESCE(p.email, l.email) AS email,
      COALESCE(p.full_name, l.name, 'Local Grower') AS name,
      COALESCE(z.zip, p.zip_code, l.zipcode) AS zip,
      COALESCE(p.state_code, 'CA') AS st_code
    FROM crm_produce_interests cpi
    LEFT JOIN profiles p ON p.id = cpi.user_id
    LEFT JOIN crm_leads l ON l.id = cpi.lead_id
    LEFT JOIN LATERAL unnest(cpi.zipcodes) AS z(zip) ON true
    WHERE cpi.interest_type = 'sell'
      AND cpi.status = 'active'
      AND COALESCE(p.email, l.email) IS NOT NULL
  ),
  active_listings AS (
    -- Active listings in market_products to exclude sellers who already have active inventory
    SELECT DISTINCT
      mp.seller_id,
      LOWER(TRIM(mp.name)) AS p_name
    FROM market_products mp
    WHERE mp.is_active = true
  ),
  recent_sends AS (
    -- 15-day cooldown: sellers emailed in last 15 days for seasonal reminder
    SELECT DISTINCT cs.email
    FROM crm_campaign_sends cs
    JOIN crm_campaigns c ON c.id = cs.campaign_id
    WHERE c.system_alias = 'seasonal_demand_reminders'
      AND cs.sent_at >= now() - INTERVAL '15 days'
  ),
  season_matched AS (
    -- Match seller's crop to harvest window (state-specific > US_DEFAULT)
    SELECT 
      si.*,
      COALESCE(w_st.harvest_start_month, w_def.harvest_start_month, 1) AS start_m,
      COALESCE(w_st.harvest_end_month, w_def.harvest_end_month, 12) AS end_m,
      COALESCE(w_st.pre_season_month, w_def.pre_season_month, 12) AS pre_m,
      -- Check if currently in pre-season
      (v_cur_month = COALESCE(w_st.pre_season_month, w_def.pre_season_month, 12)) AS is_pre,
      -- Check if currently in active harvest
      CASE 
        WHEN COALESCE(w_st.harvest_start_month, w_def.harvest_start_month, 1) <= COALESCE(w_st.harvest_end_month, w_def.harvest_end_month, 12) THEN
          (v_cur_month BETWEEN COALESCE(w_st.harvest_start_month, w_def.harvest_start_month, 1) AND COALESCE(w_st.harvest_end_month, w_def.harvest_end_month, 12))
        ELSE
          -- Wrapping over new year (e.g. Nov to Apr: 11..12 or 1..4)
          (v_cur_month >= COALESCE(w_st.harvest_start_month, w_def.harvest_start_month, 1) OR v_cur_month <= COALESCE(w_st.harvest_end_month, w_def.harvest_end_month, 12))
      END AS is_harvest
    FROM seller_interests si
    LEFT JOIN produce_seasonal_harvest_windows w_st 
      ON w_st.produce_name = si.p_name AND w_st.state_code = si.st_code
    LEFT JOIN produce_seasonal_harvest_windows w_def 
      ON w_def.produce_name = si.p_name AND w_def.state_code = 'US_DEFAULT'
    WHERE si.email NOT IN (SELECT recent_sends.email FROM recent_sends)
      AND NOT EXISTS (
        SELECT 1 FROM active_listings al 
        WHERE al.seller_id = si.user_id AND al.p_name = si.p_name
      )
  ),
  eligible_sellers AS (
    -- Keep only sellers currently in pre-season OR active harvest
    SELECT *
    FROM season_matched sm
    WHERE sm.is_pre = true OR sm.is_harvest = true
  ),
  buyer_counts AS (
    -- Count distinct buyers in the same ZIP code for this crop
    SELECT 
      LOWER(TRIM(bpi.produce_name)) AS p_name,
      z.zip,
      COUNT(DISTINCT COALESCE(bpi.user_id, bpi.lead_id)) AS b_count
    FROM crm_produce_interests bpi
    LEFT JOIN LATERAL unnest(bpi.zipcodes) AS z(zip) ON true
    WHERE bpi.interest_type = 'buy' AND bpi.status = 'active'
    GROUP BY LOWER(TRIM(bpi.produce_name)), z.zip
  ),
  other_local_demands AS (
    -- Other top in-demand crops in that ZIP for cross-sell section
    SELECT 
      bc.zip,
      jsonb_agg(jsonb_build_object('produce_name', bc.p_name, 'buyers_count', bc.b_count) ORDER BY bc.b_count DESC) AS other_demands
    FROM buyer_counts bc
    WHERE bc.b_count > 0
    GROUP BY bc.zip
  )
  SELECT 
    es.email,
    es.name,
    es.user_id,
    es.lead_id,
    INITCAP(es.p_name) AS produce_name,
    es.zip AS zipcode,
    es.st_code AS state_code,
    es.is_pre AS is_pre_season,
    es.start_m AS season_start_month,
    es.end_m AS season_end_month,
    COALESCE(bc.b_count, 0) AS local_buyers_count,
    COALESCE(old.other_demands, '[]'::jsonb) AS other_in_demand_produce
  FROM eligible_sellers es
  JOIN buyer_counts bc ON bc.p_name = es.p_name AND bc.zip = es.zip
  LEFT JOIN other_local_demands old ON old.zip = es.zip
  WHERE bc.b_count > 0
  ORDER BY bc.b_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_seasonal_seller_demand_reminders IS 'Evaluates sellers with unmet local buyer demand whose crops are in pre-season or in-season, enforcing a 15-day cooldown.';

-- ─── 4. pg_cron Scheduled Jobs ─────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('send-seasonal-demand-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'send-seasonal-demand-reminders',
  '0 * * * *',
  $$ SELECT net.http_post(
    url := get_edge_fn_base_url() || '/send-seasonal-demand-reminders',
    headers := edge_fn_headers(),
    body := '{}'::jsonb
  ) $$
);

-- ─── 5. Proactive Async Trigger for New Custom Interests & Listings ───
CREATE OR REPLACE FUNCTION trigger_sync_new_produce_seasonality()
RETURNS TRIGGER AS $$
DECLARE
  v_produce TEXT;
  v_exists BOOLEAN;
BEGIN
  v_produce := LOWER(TRIM(COALESCE(
    CASE WHEN TG_TABLE_NAME = 'crm_produce_interests' THEN NEW.produce_name ELSE NEW.name END,
    ''
  )));
  
  IF v_produce <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM produce_seasonal_harvest_windows
      WHERE LOWER(TRIM(produce_name)) = v_produce
    ) INTO v_exists;

    IF NOT v_exists THEN
      PERFORM net.http_post(
        url := get_edge_fn_base_url() || '/sync-produce-seasonality',
        headers := edge_fn_headers(),
        body := jsonb_build_object('produce_names', jsonb_build_array(v_produce))
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- Non-blocking safety net
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION trigger_sync_new_produce_seasonality IS 'Asynchronously triggers Gemini seasonality discovery when a new uncataloged produce item is added to interests or listings.';

DROP TRIGGER IF EXISTS trg_sync_new_interest_seasonality ON crm_produce_interests;
CREATE TRIGGER trg_sync_new_interest_seasonality
AFTER INSERT ON crm_produce_interests
FOR EACH ROW
EXECUTE FUNCTION trigger_sync_new_produce_seasonality();

DROP TRIGGER IF EXISTS trg_sync_new_product_seasonality ON market_products;
CREATE TRIGGER trg_sync_new_product_seasonality
AFTER INSERT ON market_products
FOR EACH ROW
EXECUTE FUNCTION trigger_sync_new_produce_seasonality();

