-- Cricket Auction SaaS — initial schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  mobile TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_or_mobile_chk CHECK (
    (email IS NOT NULL AND length(trim(email)) > 0)
    OR (mobile IS NOT NULL AND length(trim(mobile)) > 0)
  )
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'auctioneer', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS memberships_user_id_idx ON memberships(user_id);

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  year TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  logo_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, slug)
);

CREATE TABLE IF NOT EXISTS divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  team_kitty BIGINT NOT NULL DEFAULT 10000000,
  use_category_base_prices BOOLEAN NOT NULL DEFAULT TRUE,
  auction_order TEXT NOT NULL DEFAULT 'SEQUENCE',
  shuffle_within_category BOOLEAN NOT NULL DEFAULT TRUE,
  player_wheel_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  category_sequence JSONB NOT NULL DEFAULT '[]'::jsonb,
  categories JSONB NOT NULL DEFAULT '{}'::jsonb,
  icon_caption JSONB NOT NULL DEFAULT '{}'::jsonb,
  player_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS divisions_tournament_id_idx ON divisions(tournament_id);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  team_key INT NOT NULL,
  team_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3498db',
  logo_key TEXT,
  video_key TEXT,
  icon_player_id UUID,
  caption_player_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (division_id, team_key)
);

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  external_id TEXT,
  code TEXT,
  name TEXT NOT NULL,
  category TEXT,
  role TEXT,
  photo_key TEXT,
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'not-auctioned',
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  final_price BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS players_division_id_idx ON players(division_id);
CREATE INDEX IF NOT EXISTS players_external_id_idx ON players(division_id, external_id);

ALTER TABLE teams
  DROP CONSTRAINT IF EXISTS teams_icon_player_id_fkey,
  DROP CONSTRAINT IF EXISTS teams_caption_player_id_fkey;

ALTER TABLE teams
  ADD CONSTRAINT teams_icon_player_id_fkey
    FOREIGN KEY (icon_player_id) REFERENCES players(id) ON DELETE SET NULL,
  ADD CONSTRAINT teams_caption_player_id_fkey
    FOREIGN KEY (caption_player_id) REFERENCES players(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'partner',
  tagline TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  logo_key TEXT,
  video_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auction_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL UNIQUE REFERENCES divisions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'live', 'finished')),
  revision BIGINT NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  client_mutation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, seq)
);

CREATE UNIQUE INDEX IF NOT EXISTS auction_events_mutation_uidx
  ON auction_events(session_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS auction_events_session_seq_idx ON auction_events(session_id, seq);

CREATE TABLE IF NOT EXISTS media_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT,
  byte_size BIGINT,
  purpose TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
