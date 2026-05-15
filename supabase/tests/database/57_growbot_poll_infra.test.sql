begin;
select plan(8);

-- ════════════════════════════════════════════════════════════════
-- GrowBot Poll Infrastructure Tests
-- Validates the DB schema, storage policies, and cron job
-- that support the poll sharing + media persistence pipeline.
-- ════════════════════════════════════════════════════════════════

-- 1. growbot_shared_responses has image_url column
select has_column(
  'public', 'growbot_shared_responses', 'image_url',
  'growbot_shared_responses should have image_url column for persistent plant photos'
);

-- 2. growbot_shared_responses has actions column (JSONB for tool cards)
select has_column(
  'public', 'growbot_shared_responses', 'actions',
  'growbot_shared_responses should have actions column for card data (DiagnosisCard, etc.)'
);

-- 3. growbot_shared_responses has bot_response column
select has_column(
  'public', 'growbot_shared_responses', 'bot_response',
  'growbot_shared_responses should have bot_response column for AI text'
);

-- 4. growbot_shared_responses has question column
select has_column(
  'public', 'growbot_shared_responses', 'question',
  'growbot_shared_responses should have question column'
);

-- 5. chat-media storage bucket exists
select ok(
  exists(select 1 from storage.buckets where id = 'chat-media'),
  'chat-media storage bucket should exist for GrowBot image uploads'
);

-- 6. Anon insert policy exists for growbot/ path
select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'chat_media_growbot_insert'
  ),
  'chat_media_growbot_insert RLS policy should exist (allows anon upload to growbot/ path)'
);

-- 7. Public read policy exists for chat-media
select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'chat_media_public_read'
  ),
  'chat_media_public_read RLS policy should exist (allows anyone to view shared poll images)'
);

-- 8. Cleanup cron job is scheduled
select ok(
  exists(select 1 from cron.job where jobname = 'growbot-media-cleanup'),
  'growbot-media-cleanup cron job should be scheduled for 180-day retention'
);

select * from finish();
rollback;
