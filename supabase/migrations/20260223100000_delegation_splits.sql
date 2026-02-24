-- Migration: Add delegate_pct column to delegations table
-- delegate_pct = what percentage of proceeds (after platform fee) goes to the delegate
-- delegator gets (100 - delegate_pct)%
-- The delegator proposes this when creating the delegation link; the delegate accepts or rejects.

-- New ledger type for delegation profit sharing
ALTER TYPE point_transaction_type ADD VALUE IF NOT EXISTS 'delegation_split';

-- Single split column: delegate's percentage of after-fee proceeds
ALTER TABLE delegations
  ADD COLUMN IF NOT EXISTS delegate_pct SMALLINT DEFAULT 50
    CHECK (delegate_pct BETWEEN 0 AND 100);

COMMENT ON COLUMN delegations.delegate_pct IS 'Percentage of after-fee proceeds that goes to the delegate. Delegator gets (100 - delegate_pct)%.';
