-- Allow 'cancelled' status for deposit_intents when user rejects or aborts wallet connection
ALTER TABLE deposit_intents 
  DROP CONSTRAINT IF EXISTS deposit_intents_status_valid;

ALTER TABLE deposit_intents 
  ADD CONSTRAINT deposit_intents_status_valid 
  CHECK (status IN ('pending', 'confirmed', 'failed', 'expired', 'cancelled'));
