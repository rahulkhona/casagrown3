-- Grant INSERT permission to anon and authenticated roles for beta_testers signup
GRANT INSERT ON beta_testers TO anon, authenticated;

-- Also grant SELECT to service_role for admin reads
GRANT ALL ON beta_testers TO service_role;

-- Force PostgREST to pick up the permission change
NOTIFY pgrst, 'reload schema';
