-- ============================================================================
-- Migration: SMS Rate Limits + Phone Verification Hardening
-- Adds rate limiting table for SMS OTP and lockout fields to profiles.
-- ============================================================================

-- 1. Rate limiting table for SMS OTP delivery
CREATE TABLE IF NOT EXISTS sms_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient rate-limit lookups
CREATE INDEX IF NOT EXISTS idx_sms_rate_phone
  ON sms_rate_limits(phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_rate_ip
  ON sms_rate_limits(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_rate_user
  ON sms_rate_limits(user_id, created_at DESC);

-- RLS: only the owning user can see their own rate-limit rows
ALTER TABLE sms_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sms_rate_limits"
  ON sms_rate_limits FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (edge functions use service key)
CREATE POLICY "Service role full access on sms_rate_limits"
  ON sms_rate_limits FOR ALL
  USING (auth.role() = 'service_role');

-- 2. Cleanup cron: delete rows older than 24 hours (runs every hour)
SELECT cron.schedule(
  'cleanup-sms-rate-limits',
  '0 * * * *',
  $$DELETE FROM public.sms_rate_limits WHERE created_at < now() - interval '24 hours'$$
);

-- 3. Add lockout fields to profiles for brute-force protection
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone_verification_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phone_verification_locked_until TIMESTAMPTZ;

-- 4. Harden verify_phone() RPC with attempt counting + lockout
CREATE OR REPLACE FUNCTION verify_phone(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected TEXT;
  v_expires TIMESTAMPTZ;
  v_attempts INT;
  v_locked_until TIMESTAMPTZ;
BEGIN
  SELECT phone_verification_code, phone_verification_expires_at,
         phone_verification_attempts, phone_verification_locked_until
    INTO v_expected, v_expires, v_attempts, v_locked_until
    FROM profiles
    WHERE id = auth.uid();

  -- Check lockout
  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RAISE EXCEPTION 'Too many failed attempts. Try again after %',
      to_char(v_locked_until, 'HH24:MI');
  END IF;

  -- No pending code
  IF v_expected IS NULL THEN
    RETURN false;
  END IF;

  -- Expired
  IF v_expires < now() THEN
    UPDATE profiles
      SET phone_verification_code = NULL,
          phone_verification_expires_at = NULL
      WHERE id = auth.uid();
    RETURN false;
  END IF;

  -- Wrong code
  IF v_expected != p_code THEN
    UPDATE profiles
      SET phone_verification_attempts = COALESCE(phone_verification_attempts, 0) + 1,
          phone_verification_locked_until = CASE
            WHEN COALESCE(phone_verification_attempts, 0) + 1 >= 5
            THEN now() + interval '30 minutes'
            ELSE NULL
          END
      WHERE id = auth.uid();
    RETURN false;
  END IF;

  -- Correct code — verify and reset counters
  UPDATE profiles
    SET phone_verified = true,
        phone_verified_at = now(),
        phone_verification_code = NULL,
        phone_verification_expires_at = NULL,
        phone_verification_attempts = 0,
        phone_verification_locked_until = NULL
    WHERE id = auth.uid();

  RETURN true;
END;
$$;
