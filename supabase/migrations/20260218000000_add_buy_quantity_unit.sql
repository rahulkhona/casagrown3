-- Add optional desired quantity and unit to buy posts
-- Reuses the existing unit_of_measure enum (piece, dozen, box, bag)

ALTER TABLE want_to_buy_details
  ADD COLUMN desired_quantity numeric,
  ADD COLUMN desired_unit unit_of_measure;
