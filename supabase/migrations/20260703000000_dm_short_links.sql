-- ============================================================
-- Short Links — Permanent seller DM + booth deep links
--
-- Sellers get: casagrown.com/dm/{code}?ref={channel}
-- Booths get:  casagrown.com/b/{code}?ref={channel}
--
-- These are permanent infrastructure — NOT part of CRM.
-- Product listings do NOT get short URLs (they're ephemeral).
-- ============================================================

-- ─── 1. Add dm_short_code to profiles ────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dm_short_code TEXT UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_dm_short_code
  ON profiles (dm_short_code) WHERE dm_short_code IS NOT NULL;

-- ─── 2. Add short_code to market_booths ──────────────────────────────
ALTER TABLE market_booths
  ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_booths_short_code
  ON market_booths (short_code) WHERE short_code IS NOT NULL;

-- ─── 3. Code generation helper ──────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_generate_short_code(p_length INT DEFAULT 8)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN substr(replace(gen_random_uuid()::text, '-', ''), 1, p_length);
END;
$$;

-- ─── 4. Auto-generate dm_short_code for profiles ─────────────────────
CREATE OR REPLACE FUNCTION fn_generate_dm_short_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_code TEXT;
  v_attempts INT := 0;
BEGIN
  IF NEW.dm_short_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    v_code := fn_generate_short_code(8);
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE dm_short_code = v_code) THEN
      NEW.dm_short_code := v_code;
      RETURN NEW;
    END IF;
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      NEW.dm_short_code := fn_generate_short_code(12);
      RETURN NEW;
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_dm_short_code ON profiles;
CREATE TRIGGER trg_profiles_dm_short_code
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION fn_generate_dm_short_code();

-- ─── 5. Auto-generate short_code for booths ──────────────────────────
CREATE OR REPLACE FUNCTION fn_generate_booth_short_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_code TEXT;
  v_attempts INT := 0;
BEGIN
  IF NEW.short_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    v_code := fn_generate_short_code(8);
    IF NOT EXISTS (SELECT 1 FROM market_booths WHERE short_code = v_code) THEN
      NEW.short_code := v_code;
      RETURN NEW;
    END IF;
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      NEW.short_code := fn_generate_short_code(12);
      RETURN NEW;
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_booths_short_code ON market_booths;
CREATE TRIGGER trg_market_booths_short_code
  BEFORE INSERT ON market_booths
  FOR EACH ROW
  EXECUTE FUNCTION fn_generate_booth_short_code();

-- ─── 6. Backfill existing profiles ──────────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_code TEXT;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE dm_short_code IS NULL LOOP
    LOOP
      v_code := fn_generate_short_code(8);
      BEGIN
        UPDATE profiles SET dm_short_code = v_code WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;
      END;
    END LOOP;
  END LOOP;
END;
$$;

-- ─── 7. Backfill existing booths ────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_code TEXT;
BEGIN
  FOR r IN SELECT id FROM market_booths WHERE short_code IS NULL LOOP
    LOOP
      v_code := fn_generate_short_code(8);
      BEGIN
        UPDATE market_booths SET short_code = v_code WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;
      END;
    END LOOP;
  END LOOP;
END;
$$;

-- ─── 8. Unified Short Link Click Tracking ───────────────────────────
-- Covers both DM and booth clicks. NOT part of CRM. Never purged.
CREATE TABLE IF NOT EXISTS short_link_clicks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_type   TEXT NOT NULL CHECK (link_type IN ('dm', 'booth')),
  short_code  TEXT NOT NULL,              -- the code clicked
  target_id   UUID NOT NULL,              -- seller_id for dm, booth_id for booth
  channel     TEXT,                       -- 'facebook', 'instagram', 'google', 'whatsapp', 'direct'
  referrer    TEXT,                       -- HTTP referer header
  clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_short_link_clicks_type_code ON short_link_clicks (link_type, short_code);
CREATE INDEX IF NOT EXISTS idx_short_link_clicks_target ON short_link_clicks (target_id);
CREATE INDEX IF NOT EXISTS idx_short_link_clicks_channel ON short_link_clicks (channel);
CREATE INDEX IF NOT EXISTS idx_short_link_clicks_clicked_at ON short_link_clicks (clicked_at);

ALTER TABLE short_link_clicks ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (redirect routes use service role anyway)
DO $$ BEGIN
  CREATE POLICY short_link_clicks_insert ON short_link_clicks
    FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Staff can read all for analytics
DO $$ BEGIN
  CREATE POLICY short_link_clicks_staff_select ON short_link_clicks
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sellers can see clicks on their own links
DO $$ BEGIN
  CREATE POLICY short_link_clicks_owner_select ON short_link_clicks
    FOR SELECT TO authenticated
    USING (target_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT INSERT ON public.short_link_clicks TO anon, authenticated;
GRANT SELECT ON public.short_link_clicks TO authenticated;
