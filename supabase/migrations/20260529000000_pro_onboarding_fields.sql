-- Pro onboarding: farm/business fields on profiles + configurable trial days

-- Farm/business fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS farm_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_license TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_logo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS seller_bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS food_handler_permit TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cottage_food_permit TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS insurance_provider TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_features_enabled JSONB DEFAULT '{}';

-- Configurable free trial days (0 = no trial)
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS pro_free_trial_days INTEGER NOT NULL DEFAULT 0;

-- Comments
COMMENT ON COLUMN profiles.farm_name IS 'Farm or business name displayed on booths';
COMMENT ON COLUMN profiles.business_type IS 'Business type: sole_proprietor, llc, partnership, corporation';
COMMENT ON COLUMN profiles.business_license IS 'State/county business license number';
COMMENT ON COLUMN profiles.business_logo_url IS 'Logo URL for booth branding';
COMMENT ON COLUMN profiles.food_handler_permit IS 'Food handler permit number';
COMMENT ON COLUMN profiles.cottage_food_permit IS 'Cottage food permit number';
COMMENT ON COLUMN profiles.insurance_provider IS 'Liability insurance provider name';
COMMENT ON COLUMN profiles.pro_features_enabled IS 'JSONB of enabled Pro features e.g. {"multiple_booths":true,"whatsapp_sharing":true}';
COMMENT ON COLUMN platform_settings.pro_free_trial_days IS 'Number of free trial days for Pro. 0 = no trial.';
