-- Schedule Facebook post generation (daily) and publishing (every 5 min)
-- generate-fb-posts: Picks Pro sellers' products, auto-posts to seller pages,
--   and queues CasaGrown page posts for admin review
-- publish-fb-post: Publishes approved CasaGrown page posts from the queue
DO $outer$
BEGIN
  -- ── Unschedule daily posts (retired in favor of real-time sync) ──
  BEGIN PERFORM cron.unschedule('generate-fb-posts'); EXCEPTION WHEN OTHERS THEN END;

  -- ── Publish approved posts every 5 minutes ──
  BEGIN PERFORM cron.unschedule('publish-fb-posts'); EXCEPTION WHEN OTHERS THEN END;

  PERFORM cron.schedule('publish-fb-posts', '*/5 * * * *',
    $inner2$
      SELECT net.http_post(
        url := get_edge_fn_base_url() || '/publish-fb-post',
        headers := edge_fn_headers(),
        body := '{}'::jsonb
      )
    $inner2$
  );
  RAISE NOTICE 'Scheduled publish-fb-posts every 5 minutes';

  -- ── Publish queued videos and reels every 5 minutes (Retired) ──
  BEGIN PERFORM cron.unschedule('publish-video-posts'); EXCEPTION WHEN OTHERS THEN END;
END $outer$;
