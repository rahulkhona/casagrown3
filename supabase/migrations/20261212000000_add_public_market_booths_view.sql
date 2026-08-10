-- Create public_market_booths view
--
-- Context: A production migration locked down RLS on market_booths so only
-- the row owner can SELECT their own booth. This view exposes a safe,
-- non-PII subset of booth columns for cross-user reads (buyers viewing seller
-- booth pages, order history, community cards, following page, etc.)
--
-- Raw PII excluded: pickup_address, pickup_street, pickup_city, pickup_state,
-- pickup_zip, pickup_location (seller's private home pickup address).
-- pickup_display_address (anonymized, e.g. "San Jose, CA 95125") is safe.
--
-- This view was applied directly to production without a migration file.
-- Adding it here so local `supabase db reset` creates it correctly.

CREATE OR REPLACE VIEW public.public_market_booths
WITH (security_invoker = true)
AS
  SELECT
    id,
    owner_id,
    name,
    description,
    decorative_theme,
    about_html,
    invite_code,
    helper_passcode,
    short_code,
    offers_delivery,
    delivery_radius_miles,
    delivery_zipcodes,
    offers_pickup,
    pickup_display_address,       -- anonymized: "San Jose, CA 95125" (safe)
    -- pickup_address excluded    -- raw home address (PII)
    -- pickup_street excluded     -- PII
    -- pickup_city excluded       -- PII
    -- pickup_state excluded      -- PII
    -- pickup_zip excluded        -- PII
    -- pickup_location excluded   -- raw GPS point (PII)
    market_day_of_week,
    header_image_url,
    delivery_windows,
    pickup_windows,
    weekly_delivery_windows,
    weekly_pickup_windows,
    payment_method,
    venmo_handle,
    charity_name,
    status,
    is_open,
    is_default,
    marked_for_archival,
    booth_address,                -- public market location (safe, not home address)
    booth_location,               -- public market GPS point (safe)
    booth_street,
    booth_city,
    booth_state,
    booth_zip,
    bot_reply_mode,
    created_at,
    updated_at
  FROM public.market_booths;

GRANT SELECT ON public.public_market_booths TO anon, authenticated;

COMMENT ON VIEW public.public_market_booths IS
  '@audience:no Safe public view of market_booths for cross-user reads. Excludes raw pickup address PII (pickup_address, pickup_street, pickup_city, pickup_state, pickup_zip, pickup_location). Use this for buyer-reads-seller-booth scenarios.';
