-- Add RLS policies for redemptions table (was missing, blocking all operations)
CREATE POLICY "Users can insert own redemptions" ON redemptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own redemptions" ON redemptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own redemptions" ON redemptions FOR UPDATE USING (auth.uid() = user_id);

-- Make item_id nullable for API-based redemptions (no local merchandize item)
ALTER TABLE redemptions ALTER COLUMN item_id DROP NOT NULL;
