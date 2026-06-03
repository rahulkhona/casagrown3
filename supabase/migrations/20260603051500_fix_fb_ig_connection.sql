-- Fix FB connection status and add IG business account
UPDATE public.seller_fb_connections 
SET 
  status = 'connected',
  ig_business_account_id = '17841408452074654',
  ig_username = 'khona.rahul',
  updated_at = NOW()
WHERE user_id = 'a0000000-0000-0000-0000-00000000000c';
