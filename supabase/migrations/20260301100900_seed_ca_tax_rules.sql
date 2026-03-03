-- Seed: California food category tax rules
-- In CA, most unprocessed food (fruits, vegetables, herbs) is exempt from sales tax.
-- Flowers, equipment, pots, soil are taxable at the general rate (evaluate via ZipTax).

INSERT INTO category_tax_rules (state_code, category_name, rule_type, rate_pct, notes) VALUES
  ('CA', 'fruits',              'fixed', 0, 'CA exempts most unprocessed food'),
  ('CA', 'vegetables',          'fixed', 0, 'CA exempts most unprocessed food'),
  ('CA', 'herbs',               'fixed', 0, 'CA exempts most unprocessed food'),
  ('CA', 'flowers',             'evaluate', NULL, 'Taxable — rate varies by jurisdiction'),
  ('CA', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction'),
  ('CA', 'garden_equipment',    'evaluate', NULL, 'Taxable — rate varies by jurisdiction'),
  ('CA', 'pots',                'evaluate', NULL, 'Taxable — rate varies by jurisdiction'),
  ('CA', 'soil',                'evaluate', NULL, 'Taxable — rate varies by jurisdiction')
ON CONFLICT DO NOTHING;
