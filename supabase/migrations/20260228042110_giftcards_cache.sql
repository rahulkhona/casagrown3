CREATE TYPE giftcard_provider AS ENUM ('unified', 'tremendous', 'reloadly');

CREATE TABLE IF NOT EXISTS giftcards_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider giftcard_provider UNIQUE NOT NULL, 
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Note: We will also delete the old cached key from platform_config
DELETE FROM platform_config WHERE key = 'gift_card_catalog_v4';
