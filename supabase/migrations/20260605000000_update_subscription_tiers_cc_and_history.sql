-- 1. Add stripe_fee_handling column to subscription_tiers
ALTER TABLE public.subscription_tiers ADD COLUMN IF NOT EXISTS stripe_fee_handling TEXT NOT NULL DEFAULT 'pass_through' CHECK (stripe_fee_handling IN ('pass_through', 'absorb'));

-- 2. Create pricing change history table
CREATE TABLE IF NOT EXISTS public.subscription_tier_price_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name          TEXT NOT NULL,
  old_price          NUMERIC(10,2),
  new_price          NUMERIC(10,2) NOT NULL,
  old_platform_fee   NUMERIC(5,2),
  new_platform_fee   NUMERIC(5,2) NOT NULL,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS and select permissions
ALTER TABLE public.subscription_tier_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Everyone can read price history" ON public.subscription_tier_price_history;
CREATE POLICY "Everyone can read price history" ON public.subscription_tier_price_history FOR SELECT TO public USING (true);
GRANT SELECT ON public.subscription_tier_price_history TO anon, authenticated;
GRANT ALL ON public.subscription_tier_price_history TO service_role;

-- 3. Create the log trigger function and trigger
CREATE OR REPLACE FUNCTION public.log_subscription_tier_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.subscription_tier_price_history (
      tier_name,
      old_price,
      new_price,
      old_platform_fee,
      new_platform_fee,
      changed_at
    ) VALUES (
      NEW.tier_name,
      NULL,
      NEW.subscription_price,
      NULL,
      NEW.platform_fee_pct,
      now()
    );
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.subscription_price IS DISTINCT FROM NEW.subscription_price) OR 
       (OLD.platform_fee_pct IS DISTINCT FROM NEW.platform_fee_pct) THEN
      INSERT INTO public.subscription_tier_price_history (
        tier_name,
        old_price,
        new_price,
        old_platform_fee,
        new_platform_fee,
        changed_at
      ) VALUES (
        NEW.tier_name,
        OLD.subscription_price,
        NEW.subscription_price,
        OLD.platform_fee_pct,
        NEW.platform_fee_pct,
        now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS subscription_tier_price_change_trigger ON public.subscription_tiers;
CREATE TRIGGER subscription_tier_price_change_trigger
AFTER INSERT OR UPDATE ON public.subscription_tiers
FOR EACH ROW
EXECUTE FUNCTION public.log_subscription_tier_price_change();

-- 4. Create trigger to enforce that at most one tier can have a blank/empty display name
CREATE OR REPLACE FUNCTION public.check_display_name_blank_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_blank_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_blank_count
  FROM public.subscription_tiers
  WHERE (display_name IS NULL OR TRIM(display_name) = '')
    AND tier_name != NEW.tier_name;
    
  IF (NEW.display_name IS NULL OR TRIM(NEW.display_name) = '') AND v_blank_count >= 1 THEN
    RAISE EXCEPTION 'Only one subscription tier can have a blank display name.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_display_name_blank_limit_trigger ON public.subscription_tiers;
CREATE TRIGGER check_display_name_blank_limit_trigger
BEFORE INSERT OR UPDATE ON public.subscription_tiers
FOR EACH ROW
EXECUTE FUNCTION public.check_display_name_blank_limit();
