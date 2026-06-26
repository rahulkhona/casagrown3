-- Migration: Set accepts_email and accepts_sms defaults to true on crm_leads
-- Since unsubscribe is managed via Postmark/Twilio suppression lists, leads are opted-in by default.
ALTER TABLE crm_leads ALTER COLUMN accepts_email SET DEFAULT true;
ALTER TABLE crm_leads ALTER COLUMN accepts_sms SET DEFAULT true;
