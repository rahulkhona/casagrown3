-- Add version column for optimistic locking on order modifications
ALTER TABLE orders ADD COLUMN version integer NOT NULL DEFAULT 1;
