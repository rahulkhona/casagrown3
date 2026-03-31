-- Sync booth pickup_location from profile when profile home_location is updated
-- This ensures booths are findable in proximity search even if created before
-- the profile had a location set.

CREATE OR REPLACE FUNCTION public.sync_booth_location_from_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.home_location IS NOT NULL AND 
     (OLD.home_location IS NULL OR OLD.home_location::text != NEW.home_location::text) THEN
    UPDATE market_booths 
    SET pickup_location = NEW.home_location
    WHERE owner_id = NEW.id 
    AND pickup_location IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_booth_location ON public.profiles;
CREATE TRIGGER trg_sync_booth_location
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_booth_location_from_profile();
