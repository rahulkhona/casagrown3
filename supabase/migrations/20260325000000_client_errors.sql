-- Create client_errors table for tracking frontend crashes

CREATE TABLE IF NOT EXISTS client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  page_url text NOT NULL,
  error_message text NOT NULL,
  stack_trace text DEFAULT '',
  component_stack text DEFAULT '',
  browser_info text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Allow authenticated users to insert their own errors
CREATE POLICY "Users can report their own errors"
  ON client_errors FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow anonymous error reporting too (crashes before login)
CREATE POLICY "Anonymous can report errors"
  ON client_errors FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- Staff can read all errors
CREATE POLICY "Staff can read all errors"
  ON client_errors FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_members
      WHERE staff_members.user_id = auth.uid()
        AND 'admin' = ANY(staff_members.roles)
    )
  );

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

-- Index for recent errors lookup
CREATE INDEX idx_client_errors_created ON client_errors (created_at DESC);
