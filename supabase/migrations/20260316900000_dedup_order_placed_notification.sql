-- ============================================================================
-- Migration: Deduplicate Order Placed Notifications
-- The create-order edge function already inserts in-app notification
-- (with buyer name) AND sends push. The SQL trigger also fires
-- notify_market_event() on INSERT, causing the seller to receive
-- duplicate in-app + push notifications. Remove the SQL trigger.
-- ============================================================================

-- Drop the duplicate trigger
DROP TRIGGER IF EXISTS trg_market_order_placed_notification ON market_orders;

-- Drop the function too (no longer needed)
DROP FUNCTION IF EXISTS trg_market_order_placed_notify();
