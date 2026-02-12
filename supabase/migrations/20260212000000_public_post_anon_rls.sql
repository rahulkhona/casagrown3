-- Anonymous read policies for public post pages
-- Allows unauthenticated users to view individual posts and their related data
-- This enables the /post/[id] shareable link feature

-- posts: anonymous can read
CREATE POLICY "Posts are readable by anonymous users"
  ON posts FOR SELECT TO anon USING (true);

-- profiles: anonymous can read (for author name/avatar display)
-- Note: a public profiles read policy may already exist; use IF NOT EXISTS via DO block
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Anonymous can view profiles'
  ) THEN
    EXECUTE 'CREATE POLICY "Anonymous can view profiles" ON profiles FOR SELECT TO anon USING (true)';
  END IF;
END $$;

-- communities: anonymous can read (for community name)
-- Note: anonymous communities policy may already exist from 20260210050000
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'communities' AND policyname = 'Anonymous users can read communities'
  ) THEN
    EXECUTE 'CREATE POLICY "Anonymous users can read communities" ON communities FOR SELECT TO anon USING (true)';
  END IF;
END $$;

-- post_likes: anonymous can read (for like counts)
CREATE POLICY "Post likes are readable by anonymous users"
  ON post_likes FOR SELECT TO anon USING (true);

-- post_comments: anonymous can read (for comment display)
CREATE POLICY "Post comments are readable by anonymous users"
  ON post_comments FOR SELECT TO anon USING (true);

-- post_flags: anonymous can read (for flag status — returns empty for anon anyway)
CREATE POLICY "Post flags are readable by anonymous users"
  ON post_flags FOR SELECT TO anon USING (true);

-- post_media: anonymous can read (for media display)
CREATE POLICY "Post media is readable by anonymous users"
  ON post_media FOR SELECT TO anon USING (true);

-- media_assets: anonymous can read (for resolving media storage paths)
CREATE POLICY "Media assets are readable by anonymous users"
  ON media_assets FOR SELECT TO anon USING (true);

-- want_to_sell_details: anonymous can read
CREATE POLICY "Sell details are viewable by anonymous users"
  ON want_to_sell_details FOR SELECT TO anon USING (true);

-- want_to_buy_details: anonymous can read
CREATE POLICY "Buy details are viewable by anonymous users"
  ON want_to_buy_details FOR SELECT TO anon USING (true);
