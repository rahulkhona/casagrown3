-- ============================================================================
-- Product Q&A: Public comments on product pages
--
-- 0. Fix followers RLS — allow public follower counts
-- 1. product_comments — single-level threading (parent_id)
-- 2. comment_flags — community moderation with auto-hide at ≥3
-- 3. RLS policies
-- ============================================================================

-- ============================================================
-- 0. Fix followers RLS: allow public read for follower counts
-- (existing policy only lets participants see their own rows)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own follows" ON followers;
CREATE POLICY "Anyone can view follow relationships"
  ON followers FOR SELECT
  USING (true);

-- ============================================================
-- 1. product_comments
-- ============================================================
CREATE TABLE product_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES market_products(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES product_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_product_comments_product ON product_comments(product_id);
CREATE INDEX idx_product_comments_parent ON product_comments(parent_id);

-- ============================================================
-- 2. comment_flags
-- ============================================================
CREATE TABLE comment_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES product_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('offensive', 'spam', 'misleading', 'other')),
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, user_id)  -- one flag per user per comment
);

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE product_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_flags ENABLE ROW LEVEL SECURITY;

-- Comments: public read (non-hidden), authenticated insert, author+seller can delete
CREATE POLICY "Anyone can read visible comments"
  ON product_comments FOR SELECT
  USING (NOT is_hidden);

CREATE POLICY "Authenticated users can post comments"
  ON product_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Author can delete own comments"
  ON product_comments FOR DELETE
  USING (auth.uid() = author_id);

-- Seller can also delete comments on their products
CREATE POLICY "Seller can delete comments on own products"
  ON product_comments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM market_products
      WHERE id = product_comments.product_id
        AND seller_id = auth.uid()
    )
  );

-- Flags: authenticated insert (as self), user can see own
CREATE POLICY "Users can flag comments"
  ON comment_flags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can see own flags"
  ON comment_flags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can remove own flags"
  ON comment_flags FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 3b. comment_likes (upvote)
-- ============================================================
CREATE TABLE comment_likes (
  comment_id UUID NOT NULL REFERENCES product_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can see likes"
  ON comment_likes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can like"
  ON comment_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike"
  ON comment_likes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 4. Auto-hide trigger at ≥3 flags
-- ============================================================
CREATE OR REPLACE FUNCTION check_comment_flag_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_flag_count INTEGER;
  v_comment RECORD;
BEGIN
  SELECT COUNT(*) INTO v_flag_count
  FROM comment_flags WHERE comment_id = NEW.comment_id;

  IF v_flag_count >= 3 THEN
    SELECT c.id, c.author_id, c.body, c.is_hidden, p.seller_id, p.name as product_name
    INTO v_comment
    FROM product_comments c
    JOIN market_products p ON p.id = c.product_id
    WHERE c.id = NEW.comment_id;

    IF NOT v_comment.is_hidden THEN
      UPDATE product_comments
      SET is_hidden = true
      WHERE id = NEW.comment_id;

      -- Notify comment author
      INSERT INTO notifications (user_id, content, link_url)
      VALUES (
        v_comment.author_id,
        'Your comment on "' || v_comment.product_name || '" has been hidden due to community reports.',
        '/market'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_comment_flag_threshold
  AFTER INSERT ON comment_flags
  FOR EACH ROW
  EXECUTE FUNCTION check_comment_flag_threshold();
