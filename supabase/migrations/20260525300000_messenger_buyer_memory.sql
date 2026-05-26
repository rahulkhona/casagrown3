-- Messenger buyer preference memory + PSID-to-profile linking

-- 1. Add buyer preference columns to messenger_conversations
ALTER TABLE public.messenger_conversations
  ADD COLUMN IF NOT EXISTS buyer_zip TEXT,
  ADD COLUMN IF NOT EXISTS buyer_fulfillment_pref TEXT,  -- 'pickup' | 'delivery' | null
  ADD COLUMN IF NOT EXISTS matched_booth_id UUID REFERENCES public.market_booths(id) ON DELETE SET NULL;

-- 2. Add PSID column to profiles for cross-seller memory
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fb_psids JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.fb_psids IS 'Array of {psid, page_id} objects linking Facebook PSIDs to this CasaGrown account for cross-seller bot memory';

-- 3. Function to link a PSID to a profile (called when buyer places order after Messenger)
CREATE OR REPLACE FUNCTION public.link_psid_to_profile(
  p_user_id UUID,
  p_psid TEXT,
  p_page_id TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing JSONB;
  new_entry JSONB;
BEGIN
  SELECT COALESCE(fb_psids, '[]'::jsonb) INTO existing FROM profiles WHERE id = p_user_id;
  
  new_entry := jsonb_build_object('psid', p_psid, 'page_id', p_page_id);
  
  -- Only add if not already present
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(existing) elem
    WHERE elem->>'psid' = p_psid AND elem->>'page_id' = p_page_id
  ) THEN
    UPDATE profiles SET fb_psids = existing || jsonb_build_array(new_entry)
    WHERE id = p_user_id;
  END IF;
END;
$$;

-- 4. Function to find a profile by PSID (for cross-seller bot memory)
CREATE OR REPLACE FUNCTION public.find_profile_by_psid(
  p_psid TEXT
) RETURNS TABLE(user_id UUID, zip_code TEXT, city TEXT, state_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.zip_code, p.city, p.state_code
  FROM profiles p
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p.fb_psids, '[]'::jsonb)) elem
    WHERE elem->>'psid' = p_psid
  )
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_psid_to_profile TO service_role;
GRANT EXECUTE ON FUNCTION public.find_profile_by_psid TO service_role;
