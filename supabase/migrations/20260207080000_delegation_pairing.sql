-- Add pairing code support for in-person delegate linking
-- Allows delegators to generate a 6-digit code that delegatees can enter
-- to instantly establish the delegation relationship.

alter table delegations 
  add column pairing_code text,
  add column pairing_expires_at timestamptz;

-- Unique index on non-null pairing codes (expiry enforced at query time)
create unique index idx_delegation_pairing_code 
  on delegations(pairing_code) 
  where pairing_code is not null;
