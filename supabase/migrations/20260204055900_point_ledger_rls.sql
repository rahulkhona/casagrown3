-- Add RLS policies for point_ledger table
-- Users should be able to:
-- 1. Read their own ledger entries
-- 2. Insert their own ledger entries (for rewards)

-- Policy: Users can read their own point ledger entries
create policy "Users can view own point ledger entries"
  on point_ledger
  for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own point ledger entries
create policy "Users can insert own point ledger entries"
  on point_ledger
  for insert
  with check (auth.uid() = user_id);
