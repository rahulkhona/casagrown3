-- Repair: ensure beta_testers table exists and reload PostgREST schema cache
-- The original 20260322000000 migration was recorded but the table may not have been created

CREATE TABLE IF NOT EXISTS beta_testers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  nearest_highschool TEXT NOT NULL,
  zip_code     TEXT NOT NULL,
  campaign_code TEXT,
  referral_source TEXT,
  referral_url TEXT,
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'active', 'declined')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_testers_email ON beta_testers (email);
CREATE INDEX IF NOT EXISTS idx_beta_testers_zip ON beta_testers (zip_code);
CREATE INDEX IF NOT EXISTS idx_beta_testers_status ON beta_testers (status);

ALTER TABLE beta_testers ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (sign up without auth)
DO $$ BEGIN
  CREATE POLICY beta_testers_insert ON beta_testers
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only service role can read/update/delete
DO $$ BEGIN
  CREATE POLICY beta_testers_read ON beta_testers
    FOR SELECT TO authenticated
    USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
