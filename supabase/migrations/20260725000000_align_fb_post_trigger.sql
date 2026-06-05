-- Migration: Align Facebook page auto-post trigger formatting with Deno edge function buildMessageText()
--
-- 1. Helper function: public.anonymize_address
-- 2. Helper function: public.format_fulfillment_time
-- 3. Helper function: public.format_fulfillment_windows
-- 4. Update trigger function: public.trg_queue_fb_page_post()

-- 1. Create or replace public.anonymize_address helper
CREATE OR REPLACE FUNCTION public.anonymize_address(p_address TEXT)
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_trimmed TEXT;
  v_stripped TEXT;
BEGIN
  IF p_address IS NULL OR trim(p_address) = '' THEN
    RETURN '';
  END IF;
  v_trimmed := trim(p_address);
  IF lower(v_trimmed) LIKE 'near%' THEN
    RETURN v_trimmed;
  END IF;
  -- Remove leading house number/letter, e.g. "123A Main St"
  v_stripped := regexp_replace(v_trimmed, '^\d+[a-zA-Z]?[-/\s]*', '');
  IF v_stripped = v_trimmed THEN
    RETURN v_trimmed;
  END IF;
  RETURN 'Near ' || v_stripped;
END;
$$;

-- 2. Create or replace public.format_fulfillment_time helper
CREATE OR REPLACE FUNCTION public.format_fulfillment_time(p_time TIME)
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_hour INT;
  v_minute INT;
  v_ampm TEXT;
  v_min_str TEXT;
BEGIN
  IF p_time IS NULL THEN
    RETURN '';
  END IF;
  v_hour := date_part('hour', p_time)::int;
  v_minute := date_part('minute', p_time)::int;
  v_ampm := CASE WHEN v_hour >= 12 THEN 'PM' ELSE 'AM' END;
  v_hour := v_hour % 12;
  IF v_hour = 0 THEN
    v_hour := 12;
  END IF;
  IF v_minute > 0 THEN
    v_min_str := ':' || lpad(v_minute::text, 2, '0');
  ELSE
    v_min_str := '';
  END IF;
  RETURN v_hour::text || v_min_str || ' ' || v_ampm;
END;
$$;

-- 3. Create or replace public.format_fulfillment_windows helper
CREATE OR REPLACE FUNCTION public.format_fulfillment_windows(p_booth_id UUID, p_window_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_order TEXT[] := ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  v_day_names TEXT[] := ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  v_day_key TEXT;
  v_day_name TEXT;
  v_index INT;
  v_day_win TEXT;
  v_lines TEXT[] := ARRAY[]::TEXT[];
  v_label TEXT;
BEGIN
  FOR v_index IN 1..7 LOOP
    v_day_key := v_order[v_index];
    v_day_name := v_day_names[v_index];
    
    SELECT string_agg(public.format_fulfillment_time(start_time) || '–' || public.format_fulfillment_time(end_time), ', ' ORDER BY start_time)
      INTO v_day_win
    FROM public.booth_fulfillment_windows
    WHERE booth_id = p_booth_id
      AND window_type = p_window_type
      AND day_of_week = v_day_key;
      
    IF v_day_win IS NOT NULL AND v_day_win <> '' THEN
      v_lines := array_append(v_lines, '    • ' || v_day_name || ': ' || v_day_win);
    END IF;
  END LOOP;

  IF array_length(v_lines, 1) IS NULL THEN
    RETURN '';
  END IF;

  v_label := CASE WHEN p_window_type = 'delivery' THEN 'Delivery hours:' ELSE 'Pickup hours:' END;
  RETURN E'\n  🕒 ' || v_label || E'\n' || array_to_string(v_lines, E'\n');
END;
$$;

-- 4. Update the trigger function
CREATE OR REPLACE FUNCTION public.trg_queue_fb_page_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_type TEXT;
  v_conn RECORD;
  v_booth RECORD;
  v_profile RECORD;
  v_message TEXT;
  v_link TEXT;
  v_photo_url TEXT;
  v_site_url TEXT := coalesce(current_setting('app.settings.site_url', true), 'https://casagrown.com');
  v_seller_today INT;
  v_cg_today INT;
  
  -- formatting details
  v_seller_name TEXT;
  v_unit TEXT;
  v_price_str TEXT;
  v_biz_label TEXT;
  v_permits_arr TEXT[] := ARRAY[]::TEXT[];
  
  -- fulfillment details
  v_offers_pickup BOOLEAN;
  v_offers_delivery BOOLEAN;
  v_resolved_pickup_address TEXT;
  v_resolved_radius INT;
  v_resolved_zipcodes TEXT[];
  v_anonymized_pickup TEXT;
  v_anonymized_base TEXT;
  
  -- fulfillment windows
  v_pickup_win_str TEXT;
  v_delivery_win_str TEXT;
BEGIN
  -- Determine trigger type
  IF TG_OP = 'INSERT' THEN
    -- Only fire for active, non-draft products
    IF NOT NEW.is_active OR NEW.is_draft THEN RETURN NEW; END IF;
    v_trigger_type := 'new_listing';

  ELSIF TG_OP = 'UPDATE' THEN
    -- New listing: was inactive/draft, now active
    IF NEW.is_active AND NOT NEW.is_draft AND (NOT OLD.is_active OR OLD.is_draft) THEN
      v_trigger_type := 'new_listing';

    -- Price drop
    ELSIF NEW.price_usd < OLD.price_usd AND NEW.is_active THEN
      v_trigger_type := 'price_drop';

    -- Back in stock
    ELSIF OLD.inventory = 0 AND NEW.inventory > 0 AND NEW.is_active THEN
      v_trigger_type := 'back_in_stock';

    -- Photo update (only if photos actually changed)
    ELSIF NEW.photos IS DISTINCT FROM OLD.photos AND NEW.is_active AND array_length(NEW.photos, 1) > 0 THEN
      v_trigger_type := 'photo_update';

    ELSE
      -- No relevant change
      RETURN NEW;
    END IF;
  END IF;

  -- Get seller's FB connection
  SELECT * INTO v_conn
  FROM seller_fb_connections
  WHERE user_id = NEW.seller_id
    AND status = 'connected'
    AND fb_page_id IS NOT NULL;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Get booth info
  SELECT * INTO v_booth
  FROM market_booths
  WHERE id = NEW.booth_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Get profile info
  SELECT * INTO v_profile
  FROM profiles
  WHERE id = NEW.seller_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Resolve seller name
  v_seller_name := COALESCE(v_booth.name, v_profile.farm_name, v_profile.full_name, 'Grower');

  -- Resolve unit
  v_unit := COALESCE(NEW.unit, CASE WHEN NEW.category = 'produce' THEN 'lb' ELSE 'each' END);

  -- Resolve price formatted to 2 decimals
  v_price_str := to_char(NEW.price_usd, 'FM9999990.00');

  -- Build message header based on trigger type
  CASE v_trigger_type
    WHEN 'new_listing' THEN
      v_message := '🌱 Just listed from ' || v_seller_name || '!' || E'\n';
    WHEN 'price_drop' THEN
      v_message := '🔥 Price drop from ' || v_seller_name || '!' || E'\n';
    WHEN 'back_in_stock' THEN
      v_message := '📦 Back in stock from ' || v_seller_name || '!' || E'\n';
    WHEN 'photo_update' THEN
      v_message := '📸 Updated from ' || v_seller_name || '!' || E'\n';
  END CASE;

  -- Business type label
  IF v_profile.business_type IS NOT NULL THEN
    v_biz_label := CASE v_profile.business_type
      WHEN 'hobby_gardener' THEN '🌱 Hobby Gardener'
      WHEN 'small_farm' THEN '🚜 Small Farm'
      WHEN 'cottage_food' THEN '🏠 Cottage Food Operation'
      WHEN 'urban_farm' THEN '🏙️ Urban Farm'
      WHEN 'homestead' THEN '🌾 Homestead'
      WHEN 'community_garden' THEN '🌻 Community Garden'
      WHEN 'gardening_service' THEN '🌿 Gardening Service'
      WHEN 'landscaping_service' THEN '🏡 Landscaping Service'
      WHEN 'commercial' THEN '🏢 Commercial / Licensed'
      ELSE NULL
    END;
    IF v_biz_label IS NOT NULL THEN
      v_message := v_message || v_biz_label || E'\n';
    END IF;
  END IF;

  -- About Us (bio)
  IF v_profile.seller_bio IS NOT NULL AND trim(v_profile.seller_bio) <> '' THEN
    v_message := v_message || '🚜 About Us: ' || v_profile.seller_bio || E'\n';
  END IF;

  -- Product name and price
  IF v_trigger_type = 'price_drop' AND TG_OP = 'UPDATE' THEN
    v_message := v_message || E'\n' || NEW.name || ' — $' || v_price_str || '/' || v_unit || ' (was $' || to_char(OLD.price_usd, 'FM9999990.00') || '/' || v_unit || ')' || E'\n';
  ELSE
    v_message := v_message || E'\n' || NEW.name || ' — $' || v_price_str || '/' || v_unit || E'\n';
  END IF;

  -- Product description
  IF NEW.description IS NOT NULL AND trim(NEW.description) <> '' THEN
    v_message := v_message || NEW.description || E'\n';
  END IF;

  -- Resolve fulfillment offerings and details
  v_offers_pickup := (NEW.product_pickup_windows IS NOT NULL AND NEW.product_pickup_windows <> 'null'::jsonb) 
                     OR (NEW.product_pickup_windows IS NULL AND COALESCE(v_booth.offers_pickup, false));
                     
  v_offers_delivery := (NEW.product_delivery_windows IS NOT NULL AND NEW.product_delivery_windows <> 'null'::jsonb)
                       OR (NEW.product_delivery_windows IS NULL AND COALESCE(v_booth.offers_delivery, false));
                       
  v_resolved_pickup_address := COALESCE(NEW.pickup_address, v_booth.pickup_address);
  
  v_resolved_radius := COALESCE(NEW.delivery_radius_miles, COALESCE(v_booth.delivery_radius_miles, 5));
  
  v_resolved_zipcodes := CASE 
    WHEN NEW.delivery_zipcodes IS NOT NULL AND array_length(NEW.delivery_zipcodes, 1) > 0 THEN NEW.delivery_zipcodes
    ELSE v_booth.delivery_zipcodes
  END;

  -- Pickup Section
  IF v_offers_pickup AND v_resolved_pickup_address IS NOT NULL AND trim(v_resolved_pickup_address) <> '' THEN
    v_anonymized_pickup := public.anonymize_address(v_resolved_pickup_address);
    v_message := v_message || E'\n📍 Pickup: ' || v_anonymized_pickup;
    
    -- Format pickup windows
    v_pickup_win_str := public.format_fulfillment_windows(NEW.booth_id, 'pickup');
    IF v_pickup_win_str <> '' THEN
      v_message := v_message || v_pickup_win_str;
    END IF;
  END IF;

  -- Delivery Section
  IF v_offers_delivery THEN
    DECLARE
      v_del_msg TEXT := '';
      v_delivery_win_str TEXT := '';
    BEGIN
      IF v_resolved_radius > 0 THEN
        v_anonymized_base := public.anonymize_address(coalesce(v_booth.booth_address, v_resolved_pickup_address));
        v_del_msg := E'\n🚗 Delivery: within ' || v_resolved_radius || ' miles from our base: ' || v_anonymized_base;
      ELSE
        v_del_msg := E'\n🚗 Delivery: Available';
      END IF;

      -- Format delivery windows
      v_delivery_win_str := public.format_fulfillment_windows(NEW.booth_id, 'delivery');
      IF v_delivery_win_str <> '' THEN
        v_del_msg := v_del_msg || v_delivery_win_str;
      END IF;

      -- Format delivery zip codes
      IF v_resolved_zipcodes IS NOT NULL AND array_length(v_resolved_zipcodes, 1) > 0 THEN
        IF v_resolved_radius > 0 THEN
          v_del_msg := v_del_msg || E'\n📦 Also delivering in Zip Codes: ' || array_to_string(v_resolved_zipcodes, ', ');
        ELSE
          v_del_msg := v_del_msg || E'\n📦 Delivering in Zip Codes: ' || array_to_string(v_resolved_zipcodes, ', ');
        END IF;
      END IF;

      v_message := v_message || v_del_msg;
    END;
  END IF;

  -- Permits / Licenses Section
  IF v_profile.business_license IS NOT NULL AND trim(v_profile.business_license) <> '' THEN
    v_permits_arr := array_append(v_permits_arr, 'License: ' || v_profile.business_license);
  END IF;
  IF v_profile.cottage_food_permit IS NOT NULL AND trim(v_profile.cottage_food_permit) <> '' THEN
    v_permits_arr := array_append(v_permits_arr, 'Cottage Food: ' || v_profile.cottage_food_permit);
  END IF;
  IF v_profile.food_handler_permit IS NOT NULL AND trim(v_profile.food_handler_permit) <> '' THEN
    v_permits_arr := array_append(v_permits_arr, 'Food Handler: ' || v_profile.food_handler_permit);
  END IF;
  
  IF v_permits_arr IS NOT NULL AND array_length(v_permits_arr, 1) > 0 THEN
    v_message := v_message || E'\n\n📄 Permits/Licenses: ' || array_to_string(v_permits_arr, ', ');
  END IF;

  -- Build product link (booth-specific URL)
  v_link := v_site_url || '/market/booth/' || NEW.booth_id || '/product/' || NEW.id;

  -- Order and Chat Links
  v_message := v_message || E'\n\n🛒 Order now → ' || v_link;
  IF v_profile.dm_short_code IS NOT NULL AND trim(v_profile.dm_short_code) <> '' THEN
    v_message := v_message || E'\n💬 Chat with us → ' || v_site_url || '/dm/' || v_profile.dm_short_code || '?ref=facebook';
  END IF;
  v_message := v_message || E'\n\n[Published via CasaGrown Auto-Post]';

  -- Get first photo URL
  v_photo_url := NULL;
  IF NEW.photos IS NOT NULL AND array_length(NEW.photos, 1) > 0 THEN
    v_photo_url := NEW.photos[1];
  END IF;

  -- Queue for seller's page (if opted in)
  IF v_conn.auto_post_enabled THEN
    v_seller_today := fb_post_count_today(NEW.seller_id, 'seller_page');
    IF v_seller_today < 3 THEN
      INSERT INTO fb_post_queue (
        seller_id, booth_id, product_id, target,
        post_message, post_link, post_photo_url,
        status, trigger_type
      ) VALUES (
        NEW.seller_id, NEW.booth_id, NEW.id, 'seller_page',
        v_message, v_link, v_photo_url,
        'approved', v_trigger_type
      );
    END IF;
  END IF;

  -- Queue for CasaGrown's page (if opted in, pending moderation)
  IF v_conn.casagrown_post_enabled THEN
    v_cg_today := fb_post_count_today(NEW.seller_id, 'casagrown_page');
    IF v_cg_today < 2 THEN  -- max 2 per seller per day on CasaGrown page
      INSERT INTO fb_post_queue (
        seller_id, booth_id, product_id, target,
        post_message, post_link, post_photo_url,
        status, trigger_type
      ) VALUES (
        NEW.seller_id, NEW.booth_id, NEW.id, 'casagrown_page',
        v_message, v_link, v_photo_url,
        'pending', v_trigger_type  -- requires admin approval
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
