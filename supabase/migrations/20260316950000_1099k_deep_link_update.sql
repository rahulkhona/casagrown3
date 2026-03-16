-- ============================================================================
-- Migration: Update 1099-K notification deep links
-- Change from /profile to /earnings/tax-info for tax compliance
-- notifications so users land on the dedicated tax info page.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_1099k_threshold(p_seller_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ytd_total NUMERIC;
  v_threshold NUMERIC := 600.00;       -- Federal 1099-K threshold
  v_warn_pct  NUMERIC := 0.70;         -- Warn at 70% (within 30%)
  v_warn_at   NUMERIC;
  v_already_warned BOOLEAN;
BEGIN
  v_warn_at := v_threshold * v_warn_pct;

  -- Calculate YTD total from cleared settlements
  SELECT COALESCE(SUM(us.net_payout_usd), 0) INTO v_ytd_total
  FROM user_settlements us
  JOIN market_settlements ms ON ms.id = us.settlement_id
  WHERE us.user_id = p_seller_id
    AND ms.status = 'cleared'
    AND EXTRACT(YEAR FROM ms.market_date) = EXTRACT(YEAR FROM CURRENT_DATE);

  -- Only warn if at or above 70% threshold
  IF v_ytd_total < v_warn_at THEN RETURN; END IF;

  -- Check if we already warned this year
  SELECT EXISTS(
    SELECT 1 FROM notifications
    WHERE user_id = p_seller_id
      AND content LIKE '%1099-K%'
      AND created_at >= date_trunc('year', CURRENT_DATE)
  ) INTO v_already_warned;

  IF v_already_warned THEN RETURN; END IF;

  -- Send warning — deep link to /earnings/tax-info
  IF v_ytd_total >= v_threshold THEN
    PERFORM notify_market_event(
      p_seller_id,
      '📋 Your year-to-date earnings have reached $' || v_ytd_total ||
        ', exceeding the $' || v_threshold || ' federal 1099-K reporting threshold. ' ||
        'Please ensure your tax information is up to date.',
      '/earnings/tax-info'
    );
  ELSE
    PERFORM notify_market_event(
      p_seller_id,
      '📋 Heads up! Your YTD earnings are $' || v_ytd_total ||
        ' — you''re approaching the $' || v_threshold ||
        ' federal 1099-K threshold. Consider updating your tax info.',
      '/earnings/tax-info'
    );
  END IF;
END;
$$;
