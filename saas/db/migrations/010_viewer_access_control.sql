-- Public viewer enable/disable + rotatable share key
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS viewer_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS viewer_access_key TEXT;

UPDATE tournaments
SET viewer_access_key = encode(gen_random_bytes(9), 'hex')
WHERE viewer_access_key IS NULL OR trim(viewer_access_key) = '';
