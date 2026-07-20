-- Security migration: Add public read access for countries, cities and zip_codes tables
-- This ensures that checkout/tax lookup queries (which join these tables) succeed for anon/authenticated roles.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'countries' AND policyname = 'Anyone can read countries'
  ) THEN
    CREATE POLICY "Anyone can read countries" ON public.countries FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cities' AND policyname = 'Anyone can read cities'
  ) THEN
    CREATE POLICY "Anyone can read cities" ON public.cities FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'zip_codes' AND policyname = 'Anyone can read zip_codes'
  ) THEN
    CREATE POLICY "Anyone can read zip_codes" ON public.zip_codes FOR SELECT USING (true);
  END IF;
END $$;
