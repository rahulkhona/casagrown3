-- ============================================================================
-- Migration: Sales Tax Rules
-- Category-level tax rules and product-level overrides.
-- Two rule types: 'fixed' (rate_pct = 0 for exempt) and 'evaluate' (runtime).
-- ============================================================================

-- 1. Rule type enum
CREATE TYPE tax_rule_type AS ENUM (
  'fixed',      -- rate_pct known (0 = exempt, 8.25 = 8.25%, etc.)
  'evaluate'    -- must compute at runtime (address-based lookup)
);

-- 2. Category-level tax rules: one row per (state, category)
CREATE TABLE IF NOT EXISTS category_tax_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code      TEXT NOT NULL,
  category_name   TEXT NOT NULL REFERENCES sales_categories(name) ON DELETE CASCADE,
  rule_type       tax_rule_type NOT NULL DEFAULT 'evaluate',
  rate_pct        NUMERIC(5,3) DEFAULT 0 CHECK (rate_pct >= 0 AND rate_pct <= 100),
  notes           TEXT,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  -- fixed_rate requires a rate
  CONSTRAINT chk_fixed_has_rate CHECK (
    rule_type != 'fixed' OR rate_pct IS NOT NULL
  )
);

-- One active rule per (state, category)
CREATE UNIQUE INDEX IF NOT EXISTS idx_category_tax_unique
  ON category_tax_rules (state_code, category_name)
  WHERE effective_until IS NULL;

-- Lookup index
CREATE INDEX IF NOT EXISTS idx_category_tax_state
  ON category_tax_rules (state_code);

-- 3. Product-level overrides — ONLY when product differs from its category rule
-- Product name matching is case-insensitive via LOWER() in the unique index
CREATE TABLE IF NOT EXISTS product_tax_overrides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_rule_id  UUID NOT NULL REFERENCES category_tax_rules(id) ON DELETE CASCADE,
  product_name      TEXT NOT NULL,
  rule_type         tax_rule_type NOT NULL,
  rate_pct          NUMERIC(5,3) DEFAULT 0 CHECK (rate_pct >= 0 AND rate_pct <= 100),
  notes             TEXT,
  effective_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until   DATE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT chk_override_fixed_has_rate CHECK (
    rule_type != 'fixed' OR rate_pct IS NOT NULL
  )
);

-- One active override per product per category rule (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_tax_override_unique
  ON product_tax_overrides (category_rule_id, LOWER(product_name))
  WHERE effective_until IS NULL;
