-- Change the default order status to 'pending' (must be separate transaction
-- from the ALTER TYPE that added the 'pending' value).
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';
