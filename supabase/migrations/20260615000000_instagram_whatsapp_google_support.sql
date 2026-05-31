-- ============================================================================
-- Migration: Instagram, WhatsApp Business & Google Business Profile Integration
-- ============================================================================

SET search_path TO public, extensions;

-- 1. Extend subscription_tiers Features for Elite
-- ============================================================================
UPDATE public.subscription_tiers
SET features = features || '{"instagram_sync": true, "instagram_posting": true, "instagram_messaging": true, "whatsapp_messaging": true, "video_posts": true, "google_posting": true}'::jsonb
WHERE tier_name = 'elite';

-- 2. Extend seller_fb_connections with Instagram, WhatsApp, and Twilio fields
-- ============================================================================
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS ig_business_account_id TEXT;
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS ig_username TEXT;
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS ig_access_token TEXT;
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS wa_business_account_id TEXT;
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS wa_phone_number_id TEXT;
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS wa_display_phone TEXT;
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS ig_auto_post_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS ig_messenger_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS wa_auto_reply_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS wa_number_source TEXT CHECK (wa_number_source IN ('twilio_provisioned', 'seller_provided')) DEFAULT 'twilio_provisioned';
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS twilio_sub_account_sid TEXT;
ALTER TABLE public.seller_fb_connections ADD COLUMN IF NOT EXISTS twilio_wa_phone_sid TEXT;

-- 3. seller_google_connections
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.seller_google_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_refresh_token TEXT NOT NULL,
  google_location_id TEXT,
  google_location_name TEXT,
  auto_sync_catalog BOOLEAN NOT NULL DEFAULT false,
  auto_post_specials BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT seller_google_connections_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.seller_google_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own Google connection" ON public.seller_google_connections;
CREATE POLICY "Users can view own Google connection"
  ON public.seller_google_connections FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own Google connection" ON public.seller_google_connections;
CREATE POLICY "Users can insert own Google connection"
  ON public.seller_google_connections FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own Google connection" ON public.seller_google_connections;
CREATE POLICY "Users can update own Google connection"
  ON public.seller_google_connections FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access on seller_google_connections" ON public.seller_google_connections;
CREATE POLICY "Service role full access on seller_google_connections"
  ON public.seller_google_connections FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_google_connections TO anon, authenticated;
GRANT ALL ON public.seller_google_connections TO service_role;
GRANT ALL ON public.seller_google_connections TO postgres;

-- 4. ig_conversations & ig_messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ig_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_sender_id TEXT NOT NULL,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0,
  matched_booth_id UUID REFERENCES public.market_booths(id) ON DELETE SET NULL,
  buyer_zip TEXT,
  buyer_fulfillment_pref TEXT,
  bot_conversation_mode_until TIMESTAMPTZ,
  seller_last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ig_conversations_seller_sender_key UNIQUE (seller_id, ig_sender_id)
);

ALTER TABLE public.ig_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own IG conversations" ON public.ig_conversations;
CREATE POLICY "Users can view own IG conversations"
  ON public.ig_conversations FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access on ig_conversations" ON public.ig_conversations;
CREATE POLICY "Service role full access on ig_conversations"
  ON public.ig_conversations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_conversations TO anon, authenticated;
GRANT ALL ON public.ig_conversations TO service_role;
GRANT ALL ON public.ig_conversations TO postgres;

CREATE TABLE IF NOT EXISTS public.ig_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ig_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'bot', 'seller')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ig_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own IG messages" ON public.ig_messages;
CREATE POLICY "Users can view own IG messages"
  ON public.ig_messages FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ig_conversations c
    WHERE c.id = conversation_id AND c.seller_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Service role full access on ig_messages" ON public.ig_messages;
CREATE POLICY "Service role full access on ig_messages"
  ON public.ig_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_messages TO anon, authenticated;
GRANT ALL ON public.ig_messages TO service_role;
GRANT ALL ON public.ig_messages TO postgres;

-- 5. wa_conversations & wa_messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_sender_phone TEXT NOT NULL,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0,
  matched_booth_id UUID REFERENCES public.market_booths(id) ON DELETE SET NULL,
  buyer_zip TEXT,
  buyer_fulfillment_pref TEXT,
  bot_conversation_mode_until TIMESTAMPTZ,
  seller_last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wa_conversations_seller_sender_key UNIQUE (seller_id, wa_sender_phone)
);

ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own WA conversations" ON public.wa_conversations;
CREATE POLICY "Users can view own WA conversations"
  ON public.wa_conversations FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access on wa_conversations" ON public.wa_conversations;
CREATE POLICY "Service role full access on wa_conversations"
  ON public.wa_conversations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_conversations TO anon, authenticated;
GRANT ALL ON public.wa_conversations TO service_role;
GRANT ALL ON public.wa_conversations TO postgres;

CREATE TABLE IF NOT EXISTS public.wa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'bot', 'seller')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own WA messages" ON public.wa_messages;
CREATE POLICY "Users can view own WA messages"
  ON public.wa_messages FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.wa_conversations c
    WHERE c.id = conversation_id AND c.seller_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Service role full access on wa_messages" ON public.wa_messages;
CREATE POLICY "Service role full access on wa_messages"
  ON public.wa_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_messages TO anon, authenticated;
GRANT ALL ON public.wa_messages TO service_role;
GRANT ALL ON public.wa_messages TO postgres;

-- 6. Indices for quick lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ig_conversations_lookup ON public.ig_conversations(ig_sender_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_lookup ON public.wa_conversations(wa_sender_phone, seller_id);
CREATE INDEX IF NOT EXISTS idx_ig_messages_conversation ON public.ig_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation ON public.wa_messages(conversation_id);
