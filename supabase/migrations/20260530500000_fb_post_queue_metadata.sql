-- Add metadata JSONB and make FKs nullable for CasaGrown-level posts
ALTER TABLE fb_post_queue ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE fb_post_queue ALTER COLUMN seller_id DROP NOT NULL;
ALTER TABLE fb_post_queue ALTER COLUMN booth_id DROP NOT NULL;
ALTER TABLE fb_post_queue ALTER COLUMN product_id DROP NOT NULL;

COMMENT ON COLUMN fb_post_queue.metadata IS
  'JSONB for extra data. Keys: photos (string[]) for product photo carousel, seller_photos ({name,photo,avatar}[]) for welcome post carousel.';
