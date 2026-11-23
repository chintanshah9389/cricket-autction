-- Stable desk-facing division codes (div_1, div_2, …) per tournament
ALTER TABLE divisions
  ADD COLUMN IF NOT EXISTS code TEXT;

UPDATE divisions
SET code = 'div_' || (sort_order + 1)
WHERE code IS NULL OR length(trim(code)) = 0;

ALTER TABLE divisions
  ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS divisions_tournament_code_uidx
  ON divisions (tournament_id, code);
