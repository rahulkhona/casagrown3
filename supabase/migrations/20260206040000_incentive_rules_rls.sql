-- Add RLS policy for incentive_rules to allow all users to read active reward rules
-- This is needed for the invite modal to display reward points

-- Allow all authenticated users to read incentive rules
CREATE POLICY "Anyone can view incentive rules"
ON public.incentive_rules
FOR SELECT
USING (true);

-- Also allow anonymous users to read (for pre-login display)
CREATE POLICY "Anonymous can view incentive rules"
ON public.incentive_rules
FOR SELECT
TO anon
USING (true);
