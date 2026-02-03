-- Add country_code column to profiles table
-- Using ISO 3166-1 alpha-3 format (e.g., 'USA', 'CAN', 'MEX')

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS country_code VARCHAR(3) DEFAULT 'USA';

COMMENT ON COLUMN profiles.country_code IS 'ISO 3166-1 alpha-3 country code';
