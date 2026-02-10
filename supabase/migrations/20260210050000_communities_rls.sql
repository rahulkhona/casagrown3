-- Allow authenticated users to read community data
-- Communities are reference/geographic data that all users need to read.

CREATE POLICY "Authenticated users can read communities"
  ON public.communities
  FOR SELECT
  TO authenticated
  USING (true);

-- Also allow anonymous users to read communities (needed for landing pages, etc.)
CREATE POLICY "Anonymous users can read communities"
  ON public.communities
  FOR SELECT
  TO anon
  USING (true);
