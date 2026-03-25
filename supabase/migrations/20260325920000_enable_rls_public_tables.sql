-- Security migration: Lock down all public schema tables missing Row Level Security
-- Addresses the 'rls_disabled_in_public' vulnerability flagged by Supabase.

-- 1. platform_settings
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.platform_settings FOR SELECT USING (true);

-- 2. incentive_campaigns
ALTER TABLE public.incentive_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.incentive_campaigns FOR SELECT USING (true);

-- 3. campaign_zones
ALTER TABLE public.campaign_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.campaign_zones FOR SELECT USING (true);

-- 4. campaign_rewards
ALTER TABLE public.campaign_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.campaign_rewards FOR SELECT USING (true);

-- 5. giftcards_cache
ALTER TABLE public.giftcards_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.giftcards_cache FOR SELECT USING (true);

-- 6. charity_projects_cache
ALTER TABLE public.charity_projects_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.charity_projects_cache FOR SELECT USING (true);

-- 7. demo_booth_templates
ALTER TABLE public.demo_booth_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.demo_booth_templates FOR SELECT USING (true);

-- 8. demo_product_catalog
ALTER TABLE public.demo_product_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.demo_product_catalog FOR SELECT USING (true);

-- 9. communities
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.communities FOR SELECT USING (true);
