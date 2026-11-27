-- Live public viewer presence (heartbeat-based view count)
CREATE TABLE IF NOT EXISTS viewer_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_key TEXT NOT NULL,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (viewer_key)
);

CREATE INDEX IF NOT EXISTS viewer_presence_live_idx
  ON viewer_presence (division_id, last_seen_at);

CREATE INDEX IF NOT EXISTS viewer_presence_tournament_idx
  ON viewer_presence (tournament_id, last_seen_at);
