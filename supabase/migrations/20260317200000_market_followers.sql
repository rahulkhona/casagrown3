-- ============================================================================
-- Migration: Market Followers (separate from community followers)
--
-- Market follows are booth-based (follower → booth), not user-to-user.
-- This keeps the market follow system isolated from the community app.
-- ============================================================================

-- 1. Create market_followers table
CREATE TABLE IF NOT EXISTS market_followers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booth_id UUID NOT NULL REFERENCES market_booths(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, booth_id)
);

CREATE INDEX idx_market_followers_booth ON market_followers (booth_id);
CREATE INDEX idx_market_followers_user ON market_followers (follower_id);

-- 2. RLS
ALTER TABLE market_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view follows" ON market_followers
  FOR SELECT USING (true);

CREATE POLICY "Users can follow booths" ON market_followers
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow booths" ON market_followers
  FOR DELETE USING (auth.uid() = follower_id);

-- 3. Migrate existing follows
--    Map user-to-user follows to user-to-booth follows
INSERT INTO market_followers (follower_id, booth_id, created_at)
SELECT f.follower_id, b.id, f.created_at
FROM followers f
JOIN market_booths b ON b.owner_id = f.followed_id
ON CONFLICT DO NOTHING;

-- 4. Update the new-product notification trigger to use market_followers
CREATE OR REPLACE FUNCTION notify_followers_new_product()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_booth market_booths%ROWTYPE;
  r RECORD;
BEGIN
  -- Get the booth for this seller
  SELECT * INTO v_booth
  FROM market_booths
  WHERE owner_id = NEW.seller_id
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Notify all followers of this booth
  FOR r IN
    SELECT follower_id
    FROM market_followers
    WHERE booth_id = v_booth.id
      AND follower_id != NEW.seller_id
  LOOP
    PERFORM notify_market_event(
      r.follower_id,
      '🌱 ' || v_booth.name || ' just listed "' || NEW.name || '"! Check it out.',
      '/market/booth/' || v_booth.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- 5. Ensure trigger is on market_products
DROP TRIGGER IF EXISTS trg_notify_followers_new_product ON market_products;
CREATE TRIGGER trg_notify_followers_new_product
  AFTER INSERT ON market_products
  FOR EACH ROW
  EXECUTE FUNCTION notify_followers_new_product();
