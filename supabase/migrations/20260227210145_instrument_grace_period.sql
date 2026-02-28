-- Add disabled_at tracking column for grace periods on the new instruments table
ALTER TABLE available_redemption_method_instruments ADD COLUMN disabled_at TIMESTAMP WITH TIME ZONE;

-- The function set_provider_disabled_at() already exists from 20260226000001_provider_disabled_grace_period.sql
-- We just need to attach the trigger to the new instruments table
CREATE TRIGGER trg_set_instrument_disabled_at
BEFORE UPDATE ON available_redemption_method_instruments
FOR EACH ROW
EXECUTE FUNCTION set_provider_disabled_at();
