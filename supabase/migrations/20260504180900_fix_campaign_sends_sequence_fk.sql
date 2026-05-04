-- Fix: crm_campaign_sends.sequence_id FK uses ON DELETE SET NULL
-- but chk_campaign_or_sequence prevents nulling both campaign_id and sequence_id.
-- Change to ON DELETE CASCADE so sends are removed with their sequence.

ALTER TABLE crm_campaign_sends
  DROP CONSTRAINT IF EXISTS crm_campaign_sends_sequence_id_fkey;

ALTER TABLE crm_campaign_sends
  ADD CONSTRAINT crm_campaign_sends_sequence_id_fkey
  FOREIGN KEY (sequence_id) REFERENCES crm_sequences (id) ON DELETE CASCADE;
