-- Create the master CRM user metadata table
CREATE TABLE public.crm_user_metadata (
  -- Core Identity
  recipient_id UUID PRIMARY KEY,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('user', 'lead')),
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,          
  push_enabled BOOLEAN DEFAULT false,
  
  -- Geospatial & Community
  zip_code TEXT,
  state_code TEXT,
  country_code TEXT,
  home_community_h3_index TEXT,               
  
  -- Engagement & Retention
  last_active_at TIMESTAMPTZ,                 
  profile_completed_at TIMESTAMPTZ,           
  
  -- Attribution
  signup_source TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  
  -- Financials
  available_balance_usd NUMERIC DEFAULT 0.00, 
  total_earned_usd NUMERIC DEFAULT 0.00,
  lifetime_credits_consumed NUMERIC DEFAULT 0.00,  
  
  -- Buyer Activity
  total_purchases INTEGER DEFAULT 0,
  lifetime_spend NUMERIC DEFAULT 0.00,
  ytd_purchases INTEGER DEFAULT 0,            
  ytd_spend_usd NUMERIC DEFAULT 0.00,
  mtd_purchases INTEGER DEFAULT 0,
  mtd_spend_usd NUMERIC DEFAULT 0.00,
  last_purchase_at TIMESTAMPTZ,
  abandoned_cart_count INTEGER DEFAULT 0,
  buyer_avg_rating NUMERIC,                   
  
  -- Seller Activity
  total_sales INTEGER DEFAULT 0,
  lifetime_revenue NUMERIC DEFAULT 0.00,
  ytd_sales INTEGER DEFAULT 0,                
  ytd_revenue_usd NUMERIC DEFAULT 0.00,
  mtd_sales INTEGER DEFAULT 0,
  mtd_revenue_usd NUMERIC DEFAULT 0.00,
  active_listings_count INTEGER DEFAULT 0,
  last_sale_at TIMESTAMPTZ,
  seller_avg_rating NUMERIC,                  
  payout_verified BOOLEAN DEFAULT false,      
  
  -- Trust & Support
  total_posts_created INTEGER DEFAULT 0,
  total_ads_flagged INTEGER DEFAULT 0,
  total_flags_received INTEGER DEFAULT 0,
  total_disputes_initiated INTEGER DEFAULT 0,      
  total_disputes_resolved INTEGER DEFAULT 0,       
  total_escalations_created INTEGER DEFAULT 0,     
  is_ghosted BOOLEAN DEFAULT false,           
  is_banned BOOLEAN DEFAULT false,            
  
  -- CRM Health
  active_campaigns_enrolled INTEGER DEFAULT 0,
  lifetime_campaigns_enrolled INTEGER DEFAULT 0,   
  enrolled_campaign_ids UUID[] DEFAULT '{}',  
  total_emails_opened INTEGER DEFAULT 0,
  total_sms_clicks INTEGER DEFAULT 0,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.crm_user_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on crm_user_metadata" ON crm_user_metadata FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'service_role' OR public.has_staff_role(auth.uid(), 'admin'));

-- Initialize Metadata for new users
CREATE OR REPLACE FUNCTION public.trg_init_crm_user_metadata()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.crm_user_metadata (recipient_id, recipient_type, sms_enabled, push_enabled, zip_code, country_code)
  VALUES (NEW.id, 'user', NEW.sms_enabled, NEW.push_enabled, NEW.zip_code, NEW.country_code)
  ON CONFLICT (recipient_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_init_crm
AFTER INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_init_crm_user_metadata();

-- Initialize existing profiles
INSERT INTO public.crm_user_metadata (recipient_id, recipient_type, sms_enabled, push_enabled, zip_code, country_code)
SELECT id, 'user', sms_enabled, push_enabled, zip_code, country_code FROM profiles
ON CONFLICT (recipient_id) DO NOTHING;

-- Trigger for Purchases and Sales (market_orders)
CREATE OR REPLACE FUNCTION public.trg_crm_user_metadata_order()
RETURNS trigger AS $$
BEGIN
  -- Increment Buyer stats
  UPDATE crm_user_metadata 
  SET total_purchases = total_purchases + 1,
      ytd_purchases = ytd_purchases + 1,
      mtd_purchases = mtd_purchases + 1,
      lifetime_spend = lifetime_spend + COALESCE(NEW.total_usd, 0),
      ytd_spend_usd = ytd_spend_usd + COALESCE(NEW.total_usd, 0),
      mtd_spend_usd = mtd_spend_usd + COALESCE(NEW.total_usd, 0),
      last_purchase_at = NOW(),
      updated_at = NOW()
  WHERE recipient_id = NEW.buyer_id;

  -- Increment Seller stats
  UPDATE crm_user_metadata 
  SET total_sales = total_sales + 1,
      ytd_sales = ytd_sales + 1,
      mtd_sales = mtd_sales + 1,
      lifetime_revenue = lifetime_revenue + COALESCE(NEW.subtotal_usd, 0),
      ytd_revenue_usd = ytd_revenue_usd + COALESCE(NEW.subtotal_usd, 0),
      mtd_revenue_usd = mtd_revenue_usd + COALESCE(NEW.subtotal_usd, 0),
      last_sale_at = NOW(),
      updated_at = NOW()
  WHERE recipient_id = NEW.seller_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Assume 'completed' is the status indicating a successful order.
CREATE TRIGGER on_market_order_completed_update_crm
AFTER UPDATE OF status ON market_orders
FOR EACH ROW WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
EXECUTE FUNCTION public.trg_crm_user_metadata_order();

-- Automated pg_cron resets for MTD and YTD
SELECT cron.schedule('reset-crm-mtd', '0 0 1 * *', $$
  UPDATE public.crm_user_metadata 
  SET mtd_purchases = 0, mtd_spend_usd = 0, mtd_sales = 0, mtd_revenue_usd = 0;
$$);

SELECT cron.schedule('reset-crm-ytd', '0 0 1 1 *', $$
  UPDATE public.crm_user_metadata 
  SET ytd_purchases = 0, ytd_spend_usd = 0, ytd_sales = 0, ytd_revenue_usd = 0;
$$);
