-- Add unique constraint on post_id for want_to_buy_details
-- Each post should have exactly one detail entry, and this is needed
-- for ON CONFLICT (post_id) in seed data.
CREATE UNIQUE INDEX IF NOT EXISTS want_to_buy_details_post_id_key
  ON public.want_to_buy_details (post_id);
