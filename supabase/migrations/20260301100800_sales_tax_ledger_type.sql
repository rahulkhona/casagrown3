-- Add 'sales_tax' to point_transaction_type enum
-- Used for recording tax collection as a separate ledger entry
ALTER TYPE point_transaction_type ADD VALUE IF NOT EXISTS 'sales_tax';
