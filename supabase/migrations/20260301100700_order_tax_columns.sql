-- ============================================================================
-- Migration: Add tax columns to orders table
-- Stores the tax rate and amount applied at order creation time.
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_rate_pct NUMERIC(7,4) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount INTEGER DEFAULT 0;
