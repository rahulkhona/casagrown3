-- Add need_by_date column to want_to_sell_details
-- This mirrors the same column in want_to_buy_details and stores
-- the latest date by which the seller needs the drop-off to happen.

alter table want_to_sell_details
  add column need_by_date date;
