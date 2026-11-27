-- Max concurrent bidder devices per tournament + active session tracking
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS max_bidder_devices INT NOT NULL DEFAULT 2;

ALTER TABLE tournaments
  DROP CONSTRAINT IF EXISTS tournaments_max_bidder_devices_chk;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_max_bidder_devices_chk
  CHECK (max_bidder_devices >= 1 AND max_bidder_devices <= 20);

CREATE TABLE IF NOT EXISTS bidder_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_agent TEXT NOT NULL DEFAULT '',
  device_label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS bidder_sessions_team_expires_idx
  ON bidder_sessions (team_id, expires_at);

CREATE INDEX IF NOT EXISTS bidder_sessions_tournament_idx
  ON bidder_sessions (tournament_id);
