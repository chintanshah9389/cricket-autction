-- Allow up to 20 concurrent bidder devices (free-form config input)
ALTER TABLE tournaments
  DROP CONSTRAINT IF EXISTS tournaments_max_bidder_devices_chk;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_max_bidder_devices_chk
  CHECK (max_bidder_devices >= 1 AND max_bidder_devices <= 20);
