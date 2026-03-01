-- Deprecate the old specific finalized RPC since we now use universal finalize_redemption
DROP FUNCTION IF EXISTS public.finalize_gift_card_redemption(UUID, TEXT, TEXT, TEXT, TEXT, INT);
