-- Adds safe soft-delete functionality for market products
-- Prevents foreign key violations when sellers "Remove" products that have historic orders attached to them

ALTER TABLE public.market_products
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- Create an index to quickly filter out deleted products during storefront render
CREATE INDEX IF NOT EXISTS idx_market_products_not_deleted 
ON public.market_products(seller_id) 
WHERE is_deleted = false;

-- Add comment explaining architecture
COMMENT ON COLUMN public.market_products.is_deleted IS 'Soft delete flag ensuring historic market_orders retain their foreign key constraints while hiding the product from the Seller Dashboard.';
