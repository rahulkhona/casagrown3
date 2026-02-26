-- Add disabled_at tracking column for grace periods
ALTER TABLE provider_queue_status ADD COLUMN disabled_at TIMESTAMP WITH TIME ZONE;

-- Create function to automatically set disabled_at on toggle
CREATE OR REPLACE FUNCTION set_provider_disabled_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = false AND OLD.is_active = true THEN
    NEW.disabled_at = NOW();
  ELSIF NEW.is_active = true THEN
    NEW.disabled_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to provider_queue_status table
CREATE TRIGGER trg_set_provider_disabled_at
BEFORE UPDATE ON provider_queue_status
FOR EACH ROW
EXECUTE FUNCTION set_provider_disabled_at();
