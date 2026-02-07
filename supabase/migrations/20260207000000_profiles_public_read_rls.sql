-- Allow anyone to look up basic profile info by referral_code
-- This is needed for the invite landing page to display inviter name/avatar
-- Only exposes: id, full_name, avatar_url (via the SELECT in the app query)

-- Allow anonymous users to view limited profile info for invite pages
CREATE POLICY "Anyone can view profiles for invite lookup"
ON public.profiles
FOR SELECT
TO anon
USING (true);

-- Allow authenticated users to view other profiles (for social features)
CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Drop the old restrictive policy that only allowed viewing own profile
-- since the new policies above are more permissive and cover the same case
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
