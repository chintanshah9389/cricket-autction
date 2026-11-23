const { sendJson, readJson } = require("../lib/http");
const {
  findUserByLogin,
  verifyPassword,
  signAccessToken,
  createSession,
  publicUser,
  listMemberships,
  authenticateRequest,
  hashPassword,
  cleanIdentity,
  hashToken,
  refreshSecret
} = require("../lib/auth");
const { query } = require("../db/pool");
const jwt = require("jsonwebtoken");

async function handleAuthRoutes(req, res, url) {
  if (url.pathname === "/api/v1/auth/login" && req.method === "POST") {
    const body = await readJson(req);
    const login = body.login || body.email || body.mobile;
    const password = body.password;
    const user = await findUserByLogin(login);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      sendJson(res, 401, { error: "Invalid login or password" });
      return true;
    }
    const accessToken = signAccessToken(user);
    const refreshToken = await createSession(user.id);
    const memberships = await listMemberships(user.id);
    sendJson(res, 200, {
      user: publicUser(user),
      memberships,
      accessToken,
      refreshToken
    });
    return true;
  }

  if (url.pathname === "/api/v1/auth/refresh" && req.method === "POST") {
    const body = await readJson(req);
    const refreshToken = body.refreshToken;
    if (!refreshToken) {
      sendJson(res, 400, { error: "refreshToken required" });
      return true;
    }
    let payload;
    try {
      payload = jwt.verify(refreshToken, refreshSecret());
    } catch (_) {
      sendJson(res, 401, { error: "Invalid refresh token" });
      return true;
    }
    const session = await query(
      `SELECT * FROM sessions
       WHERE user_id = $1
         AND refresh_token_hash = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [payload.sub, hashToken(refreshToken)]
    );
    if (!session.rows[0]) {
      sendJson(res, 401, { error: "Session expired" });
      return true;
    }
    const userResult = await query(
      `SELECT * FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [payload.sub]
    );
    const user = userResult.rows[0];
    if (!user) {
      sendJson(res, 401, { error: "User inactive" });
      return true;
    }
    sendJson(res, 200, {
      user: publicUser(user),
      accessToken: signAccessToken(user),
      memberships: await listMemberships(user.id)
    });
    return true;
  }

  if (url.pathname === "/api/v1/auth/me" && req.method === "GET") {
    const user = await authenticateRequest(req);
    if (!user) {
      sendJson(res, 401, { error: "Unauthorized" });
      return true;
    }
    sendJson(res, 200, {
      user: publicUser(user),
      memberships: await listMemberships(user.id)
    });
    return true;
  }

  if (url.pathname === "/api/v1/auth/register-owner" && req.method === "POST") {
    // Bootstrap path for first org owner (disabled if you only want Super Admin invites later)
    const body = await readJson(req);
    const email = cleanIdentity(body.email);
    const mobile = cleanIdentity(body.mobile)?.replace(/\s+/g, "") || null;
    const password = String(body.password || "");
    const name = String(body.name || "").trim() || "Owner";
    const orgName = String(body.orgName || "").trim();
    if (!email && !mobile) {
      sendJson(res, 400, { error: "email or mobile required" });
      return true;
    }
    if (password.length < 8) {
      sendJson(res, 400, { error: "password must be at least 8 characters" });
      return true;
    }
    if (!orgName) {
      sendJson(res, 400, { error: "orgName required" });
      return true;
    }

    const passwordHash = await hashPassword(password);
    const slugBase = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org";

    try {
      await query("BEGIN");
      const userInsert = await query(
        `INSERT INTO users (email, mobile, password_hash, name)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [email ? email.toLowerCase() : null, mobile, passwordHash, name]
      );
      const user = userInsert.rows[0];
      let slug = slugBase;
      let n = 1;
      while (true) {
        const clash = await query(`SELECT 1 FROM organizations WHERE slug = $1`, [slug]);
        if (!clash.rows[0]) break;
        n += 1;
        slug = `${slugBase}-${n}`;
      }
      const orgInsert = await query(
        `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING *`,
        [orgName, slug]
      );
      const org = orgInsert.rows[0];
      await query(
        `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [org.id, user.id]
      );
      await query("COMMIT");

      const accessToken = signAccessToken(user);
      const refreshToken = await createSession(user.id);
      sendJson(res, 201, {
        user: publicUser(user),
        organization: { id: org.id, name: org.name, slug: org.slug },
        memberships: await listMemberships(user.id),
        accessToken,
        refreshToken
      });
    } catch (error) {
      await query("ROLLBACK");
      if (String(error.message || "").includes("duplicate") || error.code === "23505") {
        sendJson(res, 409, { error: "Email or mobile already registered" });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (url.pathname === "/api/v1/auth/logout" && req.method === "POST") {
    const body = await readJson(req);
    const refreshToken = body.refreshToken;
    if (refreshToken) {
      await query(
        `UPDATE sessions
         SET revoked_at = NOW()
         WHERE refresh_token_hash = $1 AND revoked_at IS NULL`,
        [hashToken(refreshToken)]
      );
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}

module.exports = { handleAuthRoutes };
