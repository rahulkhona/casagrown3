-- Migration: auto_create_seller_interests
-- Automatically creates seller produce interests in produce_interests and crm_produce_interests
-- whenever a product listing is saved as a draft (is_draft = true) or published (is_draft = false).

SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION auto_create_seller_produce_interest()
RETURNS TRIGGER AS $$
DECLARE
  v_produce_name TEXT;
  v_category     TEXT;
BEGIN
  -- Execute when seller_id and name are present
  IF NEW.seller_id IS NOT NULL AND NEW.name IS NOT NULL AND TRIM(NEW.name) <> '' THEN
    v_produce_name := TRIM(NEW.name);
    v_category     := COALESCE(NEW.category, 'produce');

    -- 1. Create in produce_interests if seller doesn't have an interest for this produce yet
    INSERT INTO public.produce_interests (user_id, produce_name, is_custom)
    VALUES (NEW.seller_id, v_produce_name, false)
    ON CONFLICT (user_id, produce_name) DO NOTHING;

    -- 2. Create in crm_produce_interests if seller doesn't have an active sell interest for this produce yet
    IF NOT EXISTS (
      SELECT 1 FROM public.crm_produce_interests
      WHERE user_id = NEW.seller_id
        AND interest_type = 'sell'
        AND lower(produce_name) = lower(v_produce_name)
    ) THEN
      INSERT INTO public.crm_produce_interests (
        user_id,
        interest_type,
        produce_name,
        produce_category,
        status
      )
      VALUES (
        NEW.seller_id,
        'sell',
        v_produce_name,
        v_category,
        'active'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_create_seller_produce_interest() IS 'Trigger function — automatically creates seller produce interests when a product listing is saved as a draft or published.';

DROP TRIGGER IF EXISTS trg_auto_create_seller_produce_interest ON public.market_products;
CREATE TRIGGER trg_auto_create_seller_produce_interest
AFTER INSERT OR UPDATE ON public.market_products
FOR EACH ROW
EXECUTE FUNCTION auto_create_seller_produce_interest();

COMMENT ON TRIGGER trg_auto_create_seller_produce_interest ON public.market_products IS 'Fires after insert or update of market_products to auto-create seller produce interests.';

GRANT EXECUTE ON FUNCTION auto_create_seller_produce_interest() TO authenticated, service_role;
