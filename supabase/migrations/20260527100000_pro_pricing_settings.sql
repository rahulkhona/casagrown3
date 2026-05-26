-- Add Pro pricing configuration to platform_settings
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS pro_monthly_price_usd NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS standard_platform_fee NUMERIC(5,4) NOT NULL DEFAULT 0.1000,
  ADD COLUMN IF NOT EXISTS pro_platform_fee NUMERIC(5,4) NOT NULL DEFAULT 0.0200,
  ADD COLUMN IF NOT EXISTS pro_stripe_fee_handling TEXT NOT NULL DEFAULT 'pass_through'
    CHECK (pro_stripe_fee_handling IN ('pass_through', 'absorb'));

COMMENT ON COLUMN public.platform_settings.pro_monthly_price_usd IS 'Monthly subscription price for Pro plan in USD';
COMMENT ON COLUMN public.platform_settings.standard_platform_fee IS 'Per-transaction platform fee for non-Pro sellers (e.g. 0.10 = 10%)';
COMMENT ON COLUMN public.platform_settings.pro_platform_fee IS 'Per-transaction platform fee for Pro sellers (e.g. 0.02 = 2%)';
COMMENT ON COLUMN public.platform_settings.pro_stripe_fee_handling IS 'How Stripe processing fee is handled for Pro sellers: pass_through (deducted from seller payout) or absorb (CasaGrown absorbs the cost). For non-Pro sellers, Stripe fee is always absorbed by CasaGrown.';

-- Update the existing row with defaults
UPDATE public.platform_settings
SET pro_monthly_price_usd = 10.00,
    standard_platform_fee = 0.1000,
    pro_platform_fee = 0.0200,
    pro_stripe_fee_handling = 'pass_through';
