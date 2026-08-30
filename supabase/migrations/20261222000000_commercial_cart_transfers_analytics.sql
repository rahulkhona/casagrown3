-- Migration: Commercial Cart Transfers Analytics & Metrics
-- Description: Records commercial cart transfer leads to partners (Kroger, Instacart) with itemized dollar values, providing RPC for aggregate reporting.

CREATE TABLE IF NOT EXISTS public.commercial_cart_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  partner TEXT NOT NULL CHECK (partner IN ('kroger', 'instacart')),
  banner TEXT,
  zip_code TEXT,
  total_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  item_count INTEGER NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for analytics querying
CREATE INDEX IF NOT EXISTS idx_commercial_transfers_created_partner ON public.commercial_cart_transfers (created_at DESC, partner);
CREATE INDEX IF NOT EXISTS idx_commercial_transfers_session ON public.commercial_cart_transfers (session_id);

-- Workspace rule compliant comments
COMMENT ON TABLE public.commercial_cart_transfers IS 'Commercial grocery cart transfer leads to partners (Kroger, Instacart) with itemized dollar values';
COMMENT ON COLUMN public.commercial_cart_transfers.id IS 'Primary key UUID for the transfer event';
COMMENT ON COLUMN public.commercial_cart_transfers.user_id IS 'Authenticated user UUID who initiated the transfer, if logged in';
COMMENT ON COLUMN public.commercial_cart_transfers.session_id IS 'Browser/device session identifier for the transfer lead';
COMMENT ON COLUMN public.commercial_cart_transfers.partner IS 'Commercial partner identifier (kroger or instacart)';
COMMENT ON COLUMN public.commercial_cart_transfers.banner IS 'Regional supermarket banner name (e.g. Ralphs, Fred Meyer, Sprouts)';
COMMENT ON COLUMN public.commercial_cart_transfers.zip_code IS 'Target delivery or pickup ZIP code';
COMMENT ON COLUMN public.commercial_cart_transfers.total_usd IS 'Total estimated dollar GMV value of items transferred';
COMMENT ON COLUMN public.commercial_cart_transfers.item_count IS 'Total quantity of items transferred in the basket';
COMMENT ON COLUMN public.commercial_cart_transfers.items IS 'JSONB array of itemized products transferred. Structure: [{ name: string, quantity: number, unit: string, price_usd: number, total_usd: number }]. Query examples: items->0->>''name'', jsonb_array_length(items)';
COMMENT ON COLUMN public.commercial_cart_transfers.created_at IS 'Timestamp when the cart transfer occurred';

-- Enable Row Level Security
ALTER TABLE public.commercial_cart_transfers ENABLE ROW LEVEL SECURITY;

-- Allow anyone (anon & authenticated) to log their cart transfer events
CREATE POLICY "Allow public insert for cart transfers"
  ON public.commercial_cart_transfers
  FOR INSERT
  WITH CHECK (true);

-- Allow authenticated users to view their own transfers
CREATE POLICY "Allow users to read own transfers"
  ON public.commercial_cart_transfers
  FOR SELECT
  USING (auth.uid() = user_id);

-- Analytics RPC for querying transfer metrics
CREATE OR REPLACE FUNCTION public.get_commercial_transfer_metrics(
  p_start_date TIMESTAMPTZ DEFAULT (now() - interval '30 days'),
  p_end_date TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_partner_stats JSONB;
  v_top_crops JSONB;
  v_total_leads INT;
  v_total_gmv NUMERIC(12,2);
BEGIN
  -- Aggregate per partner
  SELECT jsonb_agg(
    jsonb_build_object(
      'partner', partner,
      'lead_count', count(*),
      'total_gmv_usd', coalesce(sum(total_usd), 0),
      'avg_basket_usd', round(coalesce(avg(total_usd), 0), 2),
      'total_items_count', coalesce(sum(item_count), 0),
      'unique_sessions', count(distinct session_id)
    )
  )
  INTO v_partner_stats
  FROM public.commercial_cart_transfers
  WHERE created_at >= coalesce(p_start_date, now() - interval '30 days')
    AND created_at <= coalesce(p_end_date, now())
  GROUP BY partner;

  -- Overall totals
  SELECT 
    count(*),
    coalesce(sum(total_usd), 0)
  INTO v_total_leads, v_total_gmv
  FROM public.commercial_cart_transfers
  WHERE created_at >= coalesce(p_start_date, now() - interval '30 days')
    AND created_at <= coalesce(p_end_date, now());

  -- Top transferred produce items
  WITH expanded_items AS (
    SELECT 
      t.partner,
      item->>'name' AS item_name,
      coalesce((item->>'quantity')::numeric, 1) AS item_qty,
      coalesce((item->>'total_usd')::numeric, 0) AS item_total_usd
    FROM public.commercial_cart_transfers t,
    LATERAL jsonb_array_elements(t.items) AS item
    WHERE t.created_at >= coalesce(p_start_date, now() - interval '30 days')
      AND t.created_at <= coalesce(p_end_date, now())
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', item_name,
      'transfer_count', count(*),
      'total_quantity', sum(item_qty),
      'total_gmv_usd', round(sum(item_total_usd), 2)
    )
  )
  INTO v_top_crops
  FROM (
    SELECT item_name, count(*), sum(item_qty) as item_qty, sum(item_total_usd) as item_total_usd
    FROM expanded_items
    WHERE item_name IS NOT NULL AND item_name != ''
    GROUP BY item_name
    ORDER BY count(*) DESC
    LIMIT 10
  ) top_sub;

  v_result := jsonb_build_object(
    'success', true,
    'start_date', coalesce(p_start_date, now() - interval '30 days'),
    'end_date', coalesce(p_end_date, now()),
    'total_leads', coalesce(v_total_leads, 0),
    'total_gmv_usd', coalesce(v_total_gmv, 0),
    'partners', coalesce(v_partner_stats, '[]'::jsonb),
    'top_items', coalesce(v_top_crops, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_commercial_transfer_metrics IS 'Returns aggregated commercial transfer lead counts, total dollar GMV, and top transferred crops for reporting.';

GRANT EXECUTE ON FUNCTION public.get_commercial_transfer_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;
