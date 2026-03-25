-- Automates Market Schedule native pg_cron rules
-- Listens to market_schedule_policies and auto-calculates cron schedules precisely 

-- Helper function: Closes all active booths and immediately notifies owners
CREATE OR REPLACE FUNCTION public.close_market_booths()
RETURNS void AS $$
BEGIN
  -- 1. Grab all IDs currently open
  WITH open_booths AS (
    SELECT owner_id FROM public.market_booths WHERE is_open = true
  )
  -- 2. Send in-app notification to these sellers
  INSERT INTO public.notifications (user_id, title, message, type, link_url)
  SELECT owner_id,
         'Market Closed!',
         'The market has officially closed for the day. Your storefront has been safely locked.',
         'system',
         '/my-booth'
  FROM open_booths;

  -- 3. Post to market-cron edge function for Push/Email routing
  PERFORM net.http_post(
    url := coalesce(current_setting('app.settings.supabase_url', true), 'http://host.docker.internal:54321') || '/functions/v1/market-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'action', 'seller_lifecycle',
      'type', 'closed',
      'userIds', (SELECT jsonb_agg(owner_id) FROM public.market_booths WHERE is_open = true)
    )
  );

  -- Close them
  UPDATE public.market_booths SET is_open = false WHERE is_open = true;
  
  -- Sweep expired produce quietly into the hidden catalog
  UPDATE public.market_products 
  SET is_active = false 
  WHERE is_active = true 
    AND (market_date::date < current_date OR (expires_at IS NOT NULL AND expires_at < now()));

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Helper function: Sends Pings for prep and hour-before launch
CREATE OR REPLACE FUNCTION public.send_market_lifecycle_ping(ping_type text)
RETURNS void AS $$
BEGIN
  IF ping_type = 'prep' THEN
    -- In-app Notification
    INSERT INTO public.notifications (user_id, title, message, type, link_url)
    SELECT DISTINCT mb.owner_id, 
           'The Market opens tomorrow!', 
           'Review your local harvest and restock your booth shelves now.', 
           'system',
           '/my-booth'
    FROM public.market_booths mb
    JOIN public.market_products mp ON mp.seller_id = mb.owner_id
    WHERE mb.is_open = false AND mp.is_active = true;
    
    -- Edge Routing
    PERFORM net.http_post(
      url := coalesce(current_setting('app.settings.supabase_url', true), 'http://host.docker.internal:54321') || '/functions/v1/market-cron',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)),
      body := jsonb_build_object('action', 'seller_lifecycle', 'type', 'prep', 'userIds', (
        SELECT jsonb_agg(DISTINCT mb.owner_id)
        FROM public.market_booths mb
        JOIN public.market_products mp ON mp.seller_id = mb.owner_id
        WHERE mb.is_open = false AND mp.is_active = true
      ))
    );
    
  ELSIF ping_type = 'launch' THEN
    -- In-app Notification
    INSERT INTO public.notifications (user_id, title, message, type, link_url)
    SELECT DISTINCT mb.owner_id, 
           'The Market opens in 1 hour!', 
           'Quickly review your inventory to safely unlock your storefront to the neighborhood.', 
           'system',
           '/my-booth'
    FROM public.market_booths mb
    JOIN public.market_products mp ON mp.seller_id = mb.owner_id
    WHERE mb.is_open = false AND mp.is_active = true;

    -- Edge Routing (Push Only as specified in Typescript handler)
    PERFORM net.http_post(
      url := coalesce(current_setting('app.settings.supabase_url', true), 'http://host.docker.internal:54321') || '/functions/v1/market-cron',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)),
      body := jsonb_build_object('action', 'seller_lifecycle', 'type', 'launch', 'userIds', (
        SELECT jsonb_agg(DISTINCT mb.owner_id)
        FROM public.market_booths mb
        JOIN public.market_products mp ON mp.seller_id = mb.owner_id
        WHERE mb.is_open = false AND mp.is_active = true
      ))
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Core Synchronization Logic (Decoupled from Trigger so we can initialize it directly)
CREATE OR REPLACE FUNCTION public.execute_market_cron_sync()
RETURNS void AS $$
DECLARE
  rec record;
  close_job_name text;
  close_cron_expr text;
  open_ping_name text;
  open_ping_expr text;
  prep_ping_name text;
  prep_ping_expr text;
  h text;
  m text;
BEGIN
  -- 1. Unschedule all existing jobs that we manage to completely clear the deck safely
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'market_close_dow_%';
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'market_open_ping_dow_%';
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'market_prep_ping_dow_%';

  -- 2. Loop through all enabled policies and schedule precise minute jobs
  FOR rec IN SELECT * FROM public.market_schedule_policies WHERE is_enabled = true LOOP
    
    -- --- A) Market Auto-Close Cron ---
    close_job_name := 'market_close_dow_' || rec.day_of_week;
    -- close_time is expected to be 'HH:MM:SS' or 'HH:MM'
    -- The pg_cron syntax is: MINUTE HOUR * * DOW
    h := split_part(rec.close_time, ':', 1);
    m := split_part(rec.close_time, ':', 2);
    -- Build cron expression (e.g., '0 20 * * 5' for Friday 8pm)
    close_cron_expr := format('%s %s * * %s', m, h, rec.day_of_week);
    
    PERFORM cron.schedule(
      close_job_name,
      close_cron_expr,
      'SELECT public.close_market_booths();'
    );

    -- --- B) Market Open Ping (1 hour before open) ---
    open_ping_name := 'market_open_ping_dow_' || rec.day_of_week;
    -- Subtract 1 hour from open_time
    SELECT EXTRACT(HOUR FROM (rec.open_time::time - interval '1 hour'))::text INTO h;
    SELECT EXTRACT(MINUTE FROM (rec.open_time::time - interval '1 hour'))::text INTO m;
    open_ping_expr := format('%s %s * * %s', m, h, rec.day_of_week);
    
    PERFORM cron.schedule(
      open_ping_name,
      open_ping_expr,
      'SELECT public.send_market_lifecycle_ping(''launch'');'
    );

    -- --- C) Market Prep Ping (5:00 PM the day before) ---
    prep_ping_name := 'market_prep_ping_dow_' || rec.day_of_week;
    -- 5:00 PM = 17:00. Day before = (day_of_week - 1 + 7) % 7
    prep_ping_expr := format('0 17 * * %s', (rec.day_of_week - 1 + 7) % 7);
    
    PERFORM cron.schedule(
      prep_ping_name,
      prep_ping_expr,
      'SELECT public.send_market_lifecycle_ping(''prep'');'
    );

  END LOOP;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Standard Trigger Wrapper
CREATE OR REPLACE FUNCTION public.sync_market_schedule_cron()
RETURNS trigger AS $$
BEGIN
  PERFORM public.execute_market_cron_sync();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Install the automated trigger onto the policies table
DROP TRIGGER IF EXISTS trg_sync_market_schedule_cron ON public.market_schedule_policies;
CREATE TRIGGER trg_sync_market_schedule_cron
  AFTER INSERT OR UPDATE OR DELETE ON public.market_schedule_policies
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.sync_market_schedule_cron();

-- 4. Execute the sync immediately once to initialize the jobs based on current live data
SELECT public.execute_market_cron_sync();
