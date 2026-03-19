-- =============================================================================
-- User Feedback table — pre-alpha / alpha testing
-- Supports bug reports AND feature improvement requests
-- =============================================================================

create table if not exists public.user_feedback (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid references auth.users(id) on delete set null,
  type          text not null default 'bug' check (type in ('bug','feature','improvement','other')),
  message       text not null,
  page_url      text,
  user_agent    text,
  screenshot_url text,
  extra_context  jsonb default '{}',
  status        text not null default 'open' check (status in ('open','in_progress','resolved','wont_fix','planned')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

-- RLS
alter table public.user_feedback enable row level security;

-- Authenticated users can insert their own feedback
create policy "Users can submit feedback"
  on public.user_feedback for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Users can read their own feedback
create policy "Users can view own feedback"
  on public.user_feedback for select
  to authenticated
  using (reporter_id = auth.uid());

-- Indexes
create index if not exists idx_user_feedback_status on public.user_feedback (status, created_at desc);
create index if not exists idx_user_feedback_type on public.user_feedback (type, created_at desc);
create index if not exists idx_user_feedback_reporter on public.user_feedback (reporter_id);
