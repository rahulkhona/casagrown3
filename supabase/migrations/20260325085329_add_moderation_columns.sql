-- Deploy missing moderation tracking columns to market_products

-- Add moderation status ('pending', 'approved', 'flagged')
ALTER TABLE public.market_products 
ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'pending',
-- Add JSONB column for detailed violation flags from AI or users
ADD COLUMN IF NOT EXISTS moderation_flags jsonb,
-- Add tracked hash to prevent identical payloads burning AI credits
ADD COLUMN IF NOT EXISTS moderation_content_hash text,
-- Add timestamp for the exact moment the payload was evaluated
ADD COLUMN IF NOT EXISTS moderation_checked_at timestamp with time zone;

-- Force constraint check on status enum for data integrity
ALTER TABLE public.market_products
ADD CONSTRAINT market_products_moderation_status_check 
CHECK (moderation_status IN ('pending', 'approved', 'flagged'));

-- Auto-approve all pre-existing products (market is always-on, no moderation workflow yet)
UPDATE public.market_products SET moderation_status = 'approved' WHERE moderation_status = 'pending';
