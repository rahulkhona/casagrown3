-- Add missing statuses to the order_status enum.
-- Orders should start as 'pending' until the seller accepts.
-- Also add 'cancelled' and 'delivered' for future order lifecycle.

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending' BEFORE 'accepted';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'cancelled' AFTER 'disputed';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'delivered' AFTER 'accepted';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'escalated' AFTER 'disputed';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'completed' AFTER 'delivered';

-- Add escrow and refund types to point_transaction_type enum
-- escrow = buyer's points held until seller accepts
-- refund = points returned to buyer if order is cancelled
ALTER TYPE point_transaction_type ADD VALUE IF NOT EXISTS 'escrow';
ALTER TYPE point_transaction_type ADD VALUE IF NOT EXISTS 'refund';
