-- Partner showcase fields used by desk intro + partners config
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS highlight BOOLEAN NOT NULL DEFAULT FALSE;
