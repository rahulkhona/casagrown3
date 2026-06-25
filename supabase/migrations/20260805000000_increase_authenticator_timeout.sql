-- ============================================================
-- Increase authenticator role statement_timeout for schema introspection
-- ============================================================
-- PostgREST uses the `authenticator` role to introspect the database schema
-- (tables, views, functions) and build its API cache. With ~680 functions and
-- ~180 tables, the introspection query exceeds the default 8s timeout.
--
-- This ONLY affects schema cache reloads — actual API requests switch to
-- `anon` (3s) or `authenticated` (8s) after role switching, so user-facing
-- query timeouts remain unchanged.
-- ============================================================

ALTER ROLE authenticator SET statement_timeout = '30s';
