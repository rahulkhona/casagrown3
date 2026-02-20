-- Add 'withdrawn' to offer_status enum
-- (Must be in its own migration because ALTER TYPE ADD VALUE cannot run
--  inside a transaction block with other statements in Supabase)
alter type offer_status add value if not exists 'withdrawn';
