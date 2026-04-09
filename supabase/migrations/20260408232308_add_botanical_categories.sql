-- Add botanical categories: plants and seedlings
INSERT INTO sales_categories (name, display_order) VALUES
  ('plants',    15),
  ('seedlings', 16)
ON CONFLICT (name) DO NOTHING;
