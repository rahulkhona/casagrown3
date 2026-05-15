-- Add image_url column to growbot_shared_responses for plant photo context in polls
ALTER TABLE public.growbot_shared_responses
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.growbot_shared_responses.image_url IS
  'Optional image URL (base64 data URI or storage URL) attached to the user question that prompted this poll';
