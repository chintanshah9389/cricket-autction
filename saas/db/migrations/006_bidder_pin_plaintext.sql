-- Store bidder PIN in plaintext so Config can show it again after refresh.
-- Login still verifies against bidder_pin_hash.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS bidder_pin TEXT;
