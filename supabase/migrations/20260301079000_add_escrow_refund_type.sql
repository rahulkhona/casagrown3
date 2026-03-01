-- Add 'escrow_refund' to point_transaction_type enum
-- This must be in its own migration because ALTER TYPE ADD VALUE
-- cannot run inside a transaction block.
ALTER TYPE point_transaction_type ADD VALUE IF NOT EXISTS 'escrow_refund';
