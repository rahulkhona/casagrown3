-- Allow authenticated users to upsert community data during the profile wizard
-- The wizard allows users to select a geographic community and join it.
-- This requires them to INSERT or UPDATE the communities table locally before saving their profile.

CREATE POLICY "Authenticated users can insert communities" 
  ON public.communities 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update communities" 
  ON public.communities 
  FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);
