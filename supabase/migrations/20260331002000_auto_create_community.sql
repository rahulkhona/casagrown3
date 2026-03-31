-- Auto-create community when a profile's home_community_h3_index is set
-- This ensures the FK constraint never fails due to missing community record

CREATE OR REPLACE FUNCTION public.ensure_community_exists()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only run when home_community_h3_index is being set or changed
  IF NEW.home_community_h3_index IS NOT NULL AND 
     (OLD.home_community_h3_index IS NULL OR OLD.home_community_h3_index != NEW.home_community_h3_index) THEN
    
    -- Create community if it doesn't exist
    INSERT INTO public.communities (h3_index, name)
    VALUES (
      NEW.home_community_h3_index,
      COALESCE(NEW.city, 'Local') || ', ' || COALESCE(NEW.state_code, '')
    )
    ON CONFLICT (h3_index) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_community ON public.profiles;
CREATE TRIGGER trg_ensure_community
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_community_exists();
