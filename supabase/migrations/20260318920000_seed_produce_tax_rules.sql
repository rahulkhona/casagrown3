-- ============================================================================
-- Migration: Seed Produce Tax Rules for All 50 States + DC
-- Based on 2025-2026 grocery/produce tax laws.
-- 
-- Rule types:
--   'fixed' rate_pct=0     → Produce is tax-exempt
--   'fixed' rate_pct=X     → Produce taxed at a known reduced/full rate
--
-- Most states exempt groceries/produce from sales tax.
-- States that DO tax groceries are noted with their rates.
-- ============================================================================

-- States with NO sales tax at all (produce is inherently untaxed)
INSERT INTO category_tax_rules (state_code, category_name, rule_type, rate_pct, notes, effective_from) VALUES
  ('AK', 'produce', 'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('DE', 'produce', 'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('MT', 'produce', 'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('NH', 'produce', 'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('OR', 'produce', 'fixed', 0, 'No state sales tax', '2026-01-01')
ON CONFLICT DO NOTHING;

-- States that EXEMPT groceries/produce from sales tax
INSERT INTO category_tax_rules (state_code, category_name, rule_type, rate_pct, notes, effective_from) VALUES
  ('AZ', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('CA', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('CO', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('CT', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('FL', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('GA', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('IA', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('IN', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('KS', 'produce', 'fixed', 0, 'Grocery tax eliminated Jan 2025', '2026-01-01'),
  ('KY', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('LA', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('MA', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('MD', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('ME', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('MI', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('MN', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('NE', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('NJ', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('NM', 'produce', 'fixed', 0, 'Groceries exempt (certified retail food stores)', '2026-01-01'),
  ('NV', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('NY', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('NC', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('ND', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('OH', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('OK', 'produce', 'fixed', 0, 'Grocery tax repealed Aug 2024', '2026-01-01'),
  ('PA', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('RI', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('SC', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('TX', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('VT', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('WA', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('WV', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('WI', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('WY', 'produce', 'fixed', 0, 'Groceries exempt from state sales tax', '2026-01-01'),
  ('DC', 'produce', 'fixed', 0, 'Groceries exempt from sales tax', '2026-01-01'),
  ('AR', 'produce', 'fixed', 0, 'State grocery tax eliminated Jan 2026; local taxes may apply', '2026-01-01'),
  ('IL', 'produce', 'fixed', 0, 'State grocery tax eliminated Jan 2026; local taxes may apply', '2026-01-01')
ON CONFLICT DO NOTHING;

-- States that TAX groceries/produce at REDUCED rates
INSERT INTO category_tax_rules (state_code, category_name, rule_type, rate_pct, notes, effective_from) VALUES
  ('AL', 'produce', 'fixed', 2.000, 'Reduced state rate (down from 4%); local taxes may add more', '2026-01-01'),
  ('HI', 'produce', 'fixed', 4.000, 'General excise tax applies to groceries; credit available', '2026-01-01'),
  ('ID', 'produce', 'fixed', 6.000, 'Full rate applies to groceries; grocery credit available ($155/person)', '2026-01-01'),
  ('MO', 'produce', 'fixed', 1.225, 'Reduced state rate on groceries; local taxes may apply', '2026-01-01'),
  ('MS', 'produce', 'fixed', 5.000, 'Reduced from 7% to 5% as of Jul 2025', '2026-01-01'),
  ('SD', 'produce', 'fixed', 4.200, 'Temporary reduction from 4.5%; reverts Jul 2027', '2026-01-01'),
  ('TN', 'produce', 'fixed', 4.000, 'Reduced state rate on groceries', '2026-01-01'),
  ('UT', 'produce', 'fixed', 3.000, 'Combined rate (1.75% state + local); varies by location', '2026-01-01'),
  ('VA', 'produce', 'fixed', 1.000, 'Reduced state rate on groceries (2.5% local may apply)', '2026-01-01')
ON CONFLICT DO NOTHING;
