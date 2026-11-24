-- Optional per-team bidder portal credentials (phone bidding).
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS bidder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bidder_code TEXT,
  ADD COLUMN IF NOT EXISTS bidder_pin_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS teams_division_bidder_code_uidx
  ON teams (division_id, lower(bidder_code))
  WHERE bidder_code IS NOT NULL AND length(trim(bidder_code)) > 0;
