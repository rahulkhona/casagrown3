-- ============================================================================
-- Redemption Architecture Refactoring
-- Separates UI Methods, backend Instruments, and internal Queuing statuses
-- ============================================================================

-- 1. Create Enums
CREATE TYPE redemption_method AS ENUM ('giftcards', 'charity', '529c', 'cashout');
CREATE TYPE redemption_instrument AS ENUM ('tremendous', 'reloadly', 'globalgiving', 'paypal', 'stripe');

-- 2. Methods Table (Controls UI Tabs)
CREATE TABLE available_redemption_methods (
    method redemption_method PRIMARY KEY,
    is_active boolean NOT NULL DEFAULT true,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE available_redemption_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view available redemption methods" ON available_redemption_methods FOR SELECT USING (true);
CREATE POLICY "Admins can update available redemption methods" ON available_redemption_methods FOR UPDATE USING (public.has_staff_role(auth.uid(), 'admin'));

-- 3. Instruments Table (Links Providers to Methods)
CREATE TABLE available_redemption_method_instruments (
    instrument redemption_instrument PRIMARY KEY,
    method redemption_method NOT NULL REFERENCES available_redemption_methods(method) ON DELETE CASCADE,
    is_active boolean NOT NULL DEFAULT true,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE available_redemption_method_instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view available redemption method instruments" ON available_redemption_method_instruments FOR SELECT USING (true);
CREATE POLICY "Admins can update available redemption method instruments" ON available_redemption_method_instruments FOR UPDATE USING (public.has_staff_role(auth.uid(), 'admin'));

-- 4. Queue Status Table (Strictly backend circuit breaker logic)
CREATE TABLE instrument_queuing_status (
    instrument redemption_instrument PRIMARY KEY REFERENCES available_redemption_method_instruments(instrument) ON DELETE CASCADE,
    is_queuing boolean NOT NULL DEFAULT false,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE instrument_queuing_status ENABLE ROW LEVEL SECURITY;
-- Keep this admin/service_role only so clients cannot see queue statuses
CREATE POLICY "Admins can view instrument queuing status" ON instrument_queuing_status FOR SELECT USING (public.has_staff_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update instrument queuing status" ON instrument_queuing_status FOR UPDATE USING (public.has_staff_role(auth.uid(), 'admin'));

-- 5. Seed Initial Rows
INSERT INTO available_redemption_methods (method, is_active) VALUES
  ('giftcards', true),
  ('charity', true),
  ('529c', true),
  ('cashout', true);

INSERT INTO available_redemption_method_instruments (method, instrument, is_active) VALUES
  ('giftcards', 'tremendous', true),
  ('giftcards', 'reloadly', true),
  ('charity', 'globalgiving', true),
  ('cashout', 'paypal', true);

INSERT INTO instrument_queuing_status (instrument, is_queuing) VALUES
  ('tremendous', false),
  ('reloadly', false),
  ('globalgiving', false),
  ('paypal', false);

-- 6. Migrate Old Data & Drop Old Table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'provider_queue_status') THEN
        -- Migrate tremendous
        UPDATE available_redemption_method_instruments
        SET is_active = p.is_active
        FROM provider_queue_status p
        WHERE p.provider = 'tremendous' AND instrument = 'tremendous';

        UPDATE instrument_queuing_status
        SET is_queuing = p.is_queuing
        FROM provider_queue_status p
        WHERE p.provider = 'tremendous' AND instrument = 'tremendous';
        
        -- Migrate reloadly
        UPDATE available_redemption_method_instruments
        SET is_active = p.is_active
        FROM provider_queue_status p
        WHERE p.provider = 'reloadly' AND instrument = 'reloadly';

        UPDATE instrument_queuing_status
        SET is_queuing = p.is_queuing
        FROM provider_queue_status p
        WHERE p.provider = 'reloadly' AND instrument = 'reloadly';

        -- Migrate globalgiving
        UPDATE available_redemption_method_instruments
        SET is_active = p.is_active
        FROM provider_queue_status p
        WHERE p.provider = 'globalgiving' AND instrument = 'globalgiving';

        UPDATE instrument_queuing_status
        SET is_queuing = p.is_queuing
        FROM provider_queue_status p
        WHERE p.provider = 'globalgiving' AND instrument = 'globalgiving';

        -- We will not drop the table here yet because some RPCs and Edge Functions might error during 'supabase db reset' if they still reference it.
        -- We will drop the table at the very end of our refactoring in a separate migration if needed, or we just drop it now.
        -- Better to drop it now to forcefully catch all edge functions that don't pass type checking!
        DROP TABLE provider_queue_status CASCADE;
    END IF;
END $$;

-- 7. Overwrite the Old RPC to return the new JSON tree (UI UI Payload only - NO Queuing)
DROP FUNCTION IF EXISTS public.get_active_redemption_providers();
CREATE OR REPLACE FUNCTION public.get_active_redemption_providers()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT jsonb_agg(
        jsonb_build_object(
            'method', m.method,
            'is_active', m.is_active,
            'instruments', COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'instrument', i.instrument,
                            'is_active', i.is_active
                        )
                    )
                    FROM available_redemption_method_instruments i
                    WHERE i.method = m.method
                ), 
                '[]'::jsonb
            )
        )
    )
    FROM available_redemption_methods m;
$$;
