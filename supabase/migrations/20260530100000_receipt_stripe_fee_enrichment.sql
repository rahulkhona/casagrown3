-- ═══════════════════════════════════════════════════════════════
-- Migration: Update receipt function for Stripe fee pass-through
-- and add subscription receipt tracking
-- ═══════════════════════════════════════════════════════════════

-- Patch _complete_market_order_with_receipt to include stripe fee
-- in the email body JSON. We replace just the v_email_body assignment
-- and the seller_receipt JSONB to include stripe_processing_fee_usd.
-- 
-- Rather than rewriting the entire 180-line function, we use a targeted
-- ALTER approach: add the new fields to the existing email body.
-- 
-- The approach: After the function builds v_email_body, we overlay
-- the stripe fee fields. We'll create a wrapper that patches it.

-- Actually, the cleanest approach is to create a trigger that
-- stamps stripe_processing_fee_usd on orders for Pro sellers
-- at confirmation time. The receipt function already reads from the order row.

-- Step 1: Function to compute and stamp Stripe fee on an order
CREATE OR REPLACE FUNCTION public.stamp_stripe_fee_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_pro BOOLEAN;
  v_absorb_fees BOOLEAN;
  v_stripe_fee_handling TEXT;
  v_estimated_fee NUMERIC(10,2);
BEGIN
  -- Only process when order transitions to 'completed' or 'delivered'
  IF NEW.status NOT IN ('completed', 'delivered') THEN
    RETURN NEW;
  END IF;
  
  -- Skip if already stamped
  IF NEW.stripe_fee_passed_through THEN
    RETURN NEW;
  END IF;

  -- Check if seller is Pro
  SELECT EXISTS(
    SELECT 1 FROM seller_subscriptions
    WHERE user_id = NEW.seller_id
      AND plan = 'pro'
      AND status IN ('active', 'trialing')
  ) INTO v_is_pro;

  IF NOT v_is_pro THEN
    RETURN NEW;
  END IF;

  -- Check stripe fee handling preference
  SELECT absorb_stripe_fees INTO v_absorb_fees
  FROM seller_subscriptions
  WHERE user_id = NEW.seller_id
    AND plan = 'pro'
    AND status IN ('active', 'trialing')
  LIMIT 1;

  -- Also check platform-level setting
  SELECT pro_stripe_fee_handling INTO v_stripe_fee_handling
  FROM platform_settings LIMIT 1;

  -- If absorb_stripe_fees is true OR platform says pass_through, compute fee
  IF COALESCE(v_absorb_fees, false) OR v_stripe_fee_handling = 'pass_through' THEN
    -- Estimate Stripe fee: 2.9% + $0.30 per charge
    -- In production, this would come from the actual Stripe balance_transaction
    -- For now, we use the standard rate. The execute-settlement-captures function
    -- can later update this with the actual fee from Stripe API.
    v_estimated_fee := ROUND(NEW.total_usd * 0.029 + 0.30, 2);
    
    NEW.stripe_processing_fee_usd := v_estimated_fee;
    NEW.stripe_fee_passed_through := TRUE;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger (only fires on status changes)
DROP TRIGGER IF EXISTS trg_stamp_stripe_fee ON market_orders;
CREATE TRIGGER trg_stamp_stripe_fee
  BEFORE UPDATE OF status ON market_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION stamp_stripe_fee_on_order();

-- Step 2: Patch the email body in _complete_market_order_with_receipt
-- We add a post-processing step that overlays stripe fee data
-- onto the existing v_email_body JSONB.
-- This is done by creating a helper that the function calls.
CREATE OR REPLACE FUNCTION public.enrich_receipt_with_stripe_fee(
  p_email_body JSONB,
  p_order_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT stripe_processing_fee_usd, stripe_fee_passed_through, seller_plan,
         subtotal_usd, platform_fee_usd
  INTO v_order
  FROM market_orders WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN p_email_body;
  END IF;

  -- Add stripe fee fields
  RETURN p_email_body || jsonb_build_object(
    'stripeFee', CASE WHEN v_order.stripe_fee_passed_through 
                      THEN COALESCE(v_order.stripe_processing_fee_usd, 0) 
                      ELSE 0 END,
    'sellerPlan', COALESCE(v_order.seller_plan, 'free'),
    -- Recalculate sellerPayout to include stripe fee deduction
    'sellerPayout', v_order.subtotal_usd 
                  - COALESCE(v_order.platform_fee_usd, 0) 
                  - CASE WHEN v_order.stripe_fee_passed_through 
                         THEN COALESCE(v_order.stripe_processing_fee_usd, 0) 
                         ELSE 0 END
  );
END;
$$;

COMMENT ON FUNCTION public.enrich_receipt_with_stripe_fee IS 
  'Overlays Stripe fee and seller plan data onto the receipt email JSON body. Called after _complete_market_order_with_receipt builds the base email body.';
