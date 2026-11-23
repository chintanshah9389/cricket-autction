const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { query } = require("../db/pool");

function accessSecret() {
  return process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me";
}

function refreshSecret() {
  return process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me";
}

function cleanIdentity(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeLogin(login) {
  const value = cleanIdentity(login);
  if (!value) return { email: null, mobile: null };
  if (value.includes("@")) return { email: value.toLowerCase(), mobile: null };
  return { email: null, mobile: value.replace(/\s+/g, "") };
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), 12);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(String(password || ""), String(passwordHash || ""));
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      sa: Boolean(user.is_super_admin),
      name: user.name
    },
    accessSecret(),
    { expiresIn: process.env.JWT_ACCESS_TTL || "15m" }
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function createSession(userId) {
  const refreshToken = jwt.sign({ sub: userId, typ: "refresh" }, refreshSecret(), {
    expiresIn: process.env.JWT_REFRESH_TTL || "30d"
  });
  const decoded = jwt.decode(refreshToken);
  const expiresAt = new Date((decoded?.exp || 0) * 1000);
  await query(
    `INSERT INTO sessions (user_id, refresh_token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashToken(refreshToken), expiresAt.toISOString()]
  );
  return refreshToken;
}

async function findUserByLogin(login) {
  const { email, mobile } = normalizeLogin(login);
  if (!email && !mobile) return null;
  const result = await query(
    `SELECT * FROM users
     WHERE is_active = TRUE
       AND (
         ($1::text IS NOT NULL AND lower(email) = lower($1))
         OR ($2::text IS NOT NULL AND mobile = $2)
       )
     LIMIT 1`,
    [email, mobile]
  );
  return result.rows[0] || null;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    mobile: user.mobile,
    name: user.name,
    isSuperAdmin: Boolean(user.is_super_admin)
  };
}

async function authenticateRequest(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const payload = jwt.verify(match[1], accessSecret());
    const result = await query(
      `SELECT * FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [payload.sub]
    );
    return result.rows[0] || null;
  } catch (_) {
    return null;
  }
}

async function listMemberships(userId) {
  const result = await query(
    `SELECT m.role, o.id AS org_id, o.name AS org_name, o.slug AS org_slug
     FROM memberships m
     JOIN organizations o ON o.id = m.org_id
     WHERE m.user_id = $1 AND o.is_active = TRUE
     ORDER BY o.name`,
    [userId]
  );
  return result.rows.map((row) => ({
    role: row.role,
    org: { id: row.org_id, name: row.org_name, slug: row.org_slug }
  }));
}

module.exports = {
  cleanIdentity,
  normalizeLogin,
  hashPassword,
  verifyPassword,
  signAccessToken,
  createSession,
  findUserByLogin,
  publicUser,
  authenticateRequest,
  listMemberships,
  hashToken,
  refreshSecret
};
