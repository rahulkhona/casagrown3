-- Pro Testers — email override table for Facebook app review
-- When NEXT_PUBLIC_ENABLE_PRO=false globally, users whose email appears in
-- this table still see Pro features. Managed via SQL by the team.
--
-- Usage:
--   INSERT INTO pro_testers (email) VALUES ('reviewer@facebook.com');
--   DELETE FROM pro_testers WHERE email = 'reviewer@facebook.com';

CREATE TABLE IF NOT EXISTS pro_testers (
  email   text PRIMARY KEY,
  notes   text,                              -- e.g. "Facebook app reviewer account"
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: service_role can manage; authenticated users can check their own email
ALTER TABLE pro_testers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON pro_testers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can check own email"
  ON pro_testers FOR SELECT
  TO authenticated
  USING (email = auth.jwt() ->> 'email');

COMMENT ON TABLE pro_testers IS
  'Narrow-scope override: emails listed here see Pro features even when the global ENABLE_PRO flag is off. Used for Facebook/Apple app review submissions.';
