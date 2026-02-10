-- Allow authenticated users to read category restrictions
-- This table is a reference/config table that all users need to read
-- to determine which produce categories are available in their area.

CREATE POLICY "Authenticated users can read category restrictions"
  ON public.sales_category_restrictions
  FOR SELECT
  TO authenticated
  USING (true);
