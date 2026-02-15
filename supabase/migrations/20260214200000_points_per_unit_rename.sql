-- Rename price_per_unit to points_per_unit and change type to integer
-- across all three tables that use this column.
-- This clarifies that the CasaGrown economy runs on points, not USD.

-- want_to_sell_details
ALTER TABLE want_to_sell_details
  ALTER COLUMN price_per_unit TYPE integer USING price_per_unit::integer;
ALTER TABLE want_to_sell_details
  RENAME COLUMN price_per_unit TO points_per_unit;

-- offers
ALTER TABLE offers
  ALTER COLUMN price_per_unit TYPE integer USING price_per_unit::integer;
ALTER TABLE offers
  RENAME COLUMN price_per_unit TO points_per_unit;

-- orders
ALTER TABLE orders
  ALTER COLUMN price_per_unit TYPE integer USING price_per_unit::integer;
ALTER TABLE orders
  RENAME COLUMN price_per_unit TO points_per_unit;
