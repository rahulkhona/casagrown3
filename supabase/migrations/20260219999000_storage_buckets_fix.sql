-- ============================================================================
-- Storage Buckets — Create all required storage buckets
-- ============================================================================
-- The original bucket creation migrations (20260217000003 and 20260217000005)
-- were overwritten with function code. This migration recreates the buckets
-- needed by the application.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-proof-images', 'delivery-proof-images', false)
ON CONFLICT (id) DO NOTHING;
