-- Migration: Add twilio_blocked to profiles

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS twilio_blocked BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.profiles.twilio_blocked IS 'Shadow state flagging if user sent STOP to the Twilio number.';
