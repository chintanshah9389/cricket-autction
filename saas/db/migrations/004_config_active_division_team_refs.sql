-- Persist active division + team icon/caption refs with full tournament config
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS active_division_code TEXT;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS icon_player_ref TEXT,
  ADD COLUMN IF NOT EXISTS caption_player_ref TEXT;

UPDATE tournaments t
SET active_division_code = d.code
FROM (
  SELECT DISTINCT ON (tournament_id) tournament_id, code
  FROM divisions
  ORDER BY tournament_id, sort_order ASC, created_at ASC
) d
WHERE t.id = d.tournament_id
  AND (t.active_division_code IS NULL OR length(trim(t.active_division_code)) = 0);
