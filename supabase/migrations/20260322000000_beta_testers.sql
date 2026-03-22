-- Beta Testers Sign-up Table
-- Records users interested in alpha/beta testing CasaGrown

CREATE TABLE IF NOT EXISTS beta_testers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  nearest_highschool TEXT NOT NULL,
  zip_code     TEXT NOT NULL,
  campaign_code TEXT,             -- from ?campaign= URL param
  referral_source TEXT,          -- utm_source, document.referrer, or manual entry
  referral_url TEXT,             -- full referrer URL
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'active', 'declined')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_beta_testers_email ON beta_testers (email);
CREATE INDEX IF NOT EXISTS idx_beta_testers_zip ON beta_testers (zip_code);
CREATE INDEX IF NOT EXISTS idx_beta_testers_status ON beta_testers (status);

-- Allow anonymous inserts (signup without auth) but restrict reads to service role
ALTER TABLE beta_testers ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (sign up)
DO $$
BEGIN
  CREATE POLICY beta_testers_insert ON beta_testers
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only service role can read/update/delete
DO $$
BEGIN
  CREATE POLICY beta_testers_read ON beta_testers
    FOR SELECT TO authenticated
    USING (false);  -- nobody can read via API; use service role or direct DB access
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
