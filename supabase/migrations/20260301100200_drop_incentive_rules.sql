-- ============================================================================
-- Migration: Drop Legacy Incentive Rules
-- Replaced by incentive_campaigns + campaign_rewards system.
-- ============================================================================

-- Drop the incentive_rules table and its dependent types
DROP TABLE IF EXISTS incentive_rules CASCADE;

-- Drop the enum types that were only used by incentive_rules
-- (incentive_action and incentive_scope)
DO $$ BEGIN
  DROP TYPE IF EXISTS incentive_scope;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS incentive_action;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Also drop the legacy sales_category_restrictions table and restriction_scope enum
-- These were replaced by category_restrictions + blocked_products in 20260301080000
DROP TABLE IF EXISTS sales_category_restrictions CASCADE;

DO $$ BEGIN
  DROP TYPE IF EXISTS restriction_scope;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
