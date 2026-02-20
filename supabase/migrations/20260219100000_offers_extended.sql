-- ============================================================================
-- Offers Extended — Schema changes for buy-post offer lifecycle
-- ============================================================================

-- 1. Extend offers table with new columns
-- (withdrawn enum value added in 20260219099000_offer_status_withdrawn.sql)
-- NOTE: delivery_address intentionally NOT on offers — it belongs to the order,
-- provided by the buyer at acceptance time.
alter table offers
  add column if not exists post_id uuid references posts(id) on delete cascade,
  add column if not exists category text,
  add column if not exists product text,
  add column if not exists unit text,
  add column if not exists delivery_date date,
  add column if not exists message text,
  add column if not exists seller_post_id uuid references posts(id),
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists media jsonb default '[]'::jsonb;

-- 3. RLS update policy for offers (needed for modify/accept/reject/withdraw RPCs)
DO $$ BEGIN
  CREATE POLICY "Conversation parties can update offers"
    ON offers FOR UPDATE TO authenticated
    USING (
      conversation_id IN (
        SELECT id FROM conversations
        WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Add offers to realtime publication
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE offers;
  END IF;
END $$;
