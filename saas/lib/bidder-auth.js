const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

function accessSecret() {
  return process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me";
}

function bidderTokenTtl() {
  return process.env.BIDDER_TOKEN_TTL || "12h";
}

function ttlToMs(ttl) {
  const raw = String(ttl || "12h").trim();
  const match = raw.match(/^(\d+)\s*([smhd])$/i);
  if (!match) return 12 * 60 * 60 * 1000;
  const amount = Number(match[1]) || 12;
  const unit = match[2].toLowerCase();
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  if (unit === "d") return amount * 24 * 60 * 60 * 1000;
  return 12 * 60 * 60 * 1000;
}

function hashPin(pin) {
  return bcrypt.hash(String(pin), 10);
}

function verifyPin(pin, pinHash) {
  if (!pinHash) return Promise.resolve(false);
  return bcrypt.compare(String(pin || ""), String(pinHash || ""));
}

function clampMaxBidderDevices(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 2;
  return Math.min(20, Math.max(1, Math.round(n)));
}

function signBidderToken({
  tournamentId,
  divisionId,
  divisionCode,
  teamId,
  teamName,
  sessionId
}) {
  return jwt.sign(
    {
      typ: "bidder",
      tournamentId,
      divisionId,
      divisionCode,
      teamId,
      teamName,
      sid: sessionId
    },
    accessSecret(),
    { expiresIn: bidderTokenTtl() }
  );
}

function verifyBidderToken(token) {
  try {
    const payload = jwt.verify(String(token || ""), accessSecret());
    if (payload?.typ !== "bidder") return null;
    if (!payload.tournamentId || !payload.divisionId || payload.teamId == null) return null;
    if (!payload.sid) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function authenticateBidderRequest(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return verifyBidderToken(match[1]);
}

function randomBidderCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function randomBidderPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

module.exports = {
  hashPin,
  verifyPin,
  signBidderToken,
  verifyBidderToken,
  authenticateBidderRequest,
  randomBidderCode,
  randomBidderPin,
  clampMaxBidderDevices,
  bidderTokenTtl,
  ttlToMs
};
