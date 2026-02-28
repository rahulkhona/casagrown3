-- Add 'venmo' to manual_refund_fulfillment_type enum if it doesn't already exist
ALTER TYPE manual_refund_fulfillment_type ADD VALUE IF NOT EXISTS 'venmo';
