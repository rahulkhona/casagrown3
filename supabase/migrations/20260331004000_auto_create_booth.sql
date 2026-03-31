-- Auto-create a market booth when a profile is created
-- Ensures every user has a booth with a helper_passcode ready to go

CREATE OR REPLACE FUNCTION public.auto_create_booth_on_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only create if no booth exists yet for this user
  INSERT INTO public.market_booths (owner_id, name, helper_passcode)
  VALUES (
    NEW.id,
    COALESCE(NEW.full_name, 'My Booth') || '''s Booth',
    upper(substr(md5(random()::text), 1, 6))
  )
  ON CONFLICT (owner_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't block profile creation if booth creation fails
  RAISE WARNING 'Auto booth creation failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_booth ON public.profiles;
CREATE TRIGGER trg_auto_create_booth
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_booth_on_profile();

-- Backfill: create booths for any existing profiles that don't have one
INSERT INTO public.market_booths (owner_id, name, helper_passcode)
SELECT
  p.id,
  COALESCE(p.full_name, 'My Booth') || '''s Booth',
  upper(substr(md5(random()::text), 1, 6))
FROM public.profiles p
LEFT JOIN public.market_booths mb ON mb.owner_id = p.id
WHERE mb.id IS NULL;
