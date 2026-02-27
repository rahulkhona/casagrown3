-- Add paypal_payout_id to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS paypal_payout_id text;

COMMENT ON COLUMN public.profiles.paypal_payout_id IS 'PayPal email or Venmo phone number for Cashout redemptions';
