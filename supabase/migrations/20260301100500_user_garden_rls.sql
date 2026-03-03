-- Add RLS policies for user_garden table
-- Users can read, insert, update, and delete their own garden items

CREATE POLICY "Users can view own garden items"
  ON user_garden FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own garden items"
  ON user_garden FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own garden items"
  ON user_garden FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own garden items"
  ON user_garden FOR DELETE
  USING (auth.uid() = user_id);
