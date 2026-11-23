const { sendJson, readJson } = require("../lib/http");
const { authenticateRequest, publicUser, hashPassword, cleanIdentity } = require("../lib/auth");
const { query } = require("../db/pool");

async function requireUser(req, res) {
  const user = await authenticateRequest(req);
  if (!user) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return user;
}

async function requireOrgRole(user, orgId, roles) {
  if (user.is_super_admin) {
    const org = await query(`SELECT * FROM organizations WHERE id = $1`, [orgId]);
    return { org: org.rows[0] || null, role: "super_admin" };
  }
  const result = await query(
    `SELECT m.role, o.*
     FROM memberships m
     JOIN organizations o ON o.id = m.org_id
     WHERE m.user_id = $1 AND m.org_id = $2
     LIMIT 1`,
    [user.id, orgId]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (roles && !roles.includes(row.role)) return null;
  return {
    role: row.role,
    org: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      is_active: row.is_active
    }
  };
}

async function handleOrgRoutes(req, res, url) {
  if (url.pathname === "/api/v1/orgs" && req.method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return true;
    if (user.is_super_admin) {
      const result = await query(
        `SELECT id, name, slug, is_active, created_at FROM organizations ORDER BY name`
      );
      sendJson(res, 200, { organizations: result.rows, asSuperAdmin: true });
      return true;
    }
    const result = await query(
      `SELECT o.id, o.name, o.slug, o.is_active, o.created_at, m.role
       FROM organizations o
       JOIN memberships m ON m.org_id = o.id
       WHERE m.user_id = $1
       ORDER BY o.name`,
      [user.id]
    );
    sendJson(res, 200, { organizations: result.rows, asSuperAdmin: false });
    return true;
  }

  if (url.pathname === "/api/v1/orgs" && req.method === "POST") {
    const user = await requireUser(req, res);
    if (!user) return true;
    if (!user.is_super_admin) {
      sendJson(res, 403, { error: "Only Super Admin can create organizations" });
      return true;
    }
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    if (!name) {
      sendJson(res, 400, { error: "name required" });
      return true;
    }
    let slug = String(body.slug || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    if (!slug) slug = "org";
    try {
      const inserted = await query(
        `INSERT INTO organizations (name, slug) VALUES ($1, $2)
         RETURNING id, name, slug, is_active, created_at`,
        [name, slug]
      );
      sendJson(res, 201, { organization: inserted.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        sendJson(res, 409, { error: "slug already exists" });
        return true;
      }
      throw error;
    }
    return true;
  }

  const memberMatch = url.pathname.match(/^\/api\/v1\/orgs\/([^/]+)\/members$/);
  if (memberMatch && req.method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const orgId = memberMatch[1];
    const access = await requireOrgRole(user, orgId, ["owner", "admin"]);
    if (!access?.org) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const result = await query(
      `SELECT u.id, u.email, u.mobile, u.name, u.is_active, m.role, m.created_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.org_id = $1
       ORDER BY m.created_at`,
      [orgId]
    );
    sendJson(res, 200, {
      organization: access.org,
      members: result.rows.map((row) => ({
        ...publicUser(row),
        role: row.role,
        isActive: row.is_active,
        createdAt: row.created_at
      }))
    });
    return true;
  }

  if (memberMatch && req.method === "POST") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const orgId = memberMatch[1];
    const access = await requireOrgRole(user, orgId, ["owner", "admin"]);
    if (!access?.org) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const body = await readJson(req);
    const email = cleanIdentity(body.email);
    const mobile = cleanIdentity(body.mobile)?.replace(/\s+/g, "") || null;
    const password = String(body.password || "");
    const name = String(body.name || "").trim() || "User";
    const role = String(body.role || "viewer");
    if (!["owner", "admin", "auctioneer", "viewer"].includes(role)) {
      sendJson(res, 400, { error: "invalid role" });
      return true;
    }
    if (!email && !mobile) {
      sendJson(res, 400, { error: "email or mobile required" });
      return true;
    }
    if (password.length < 8) {
      sendJson(res, 400, { error: "password must be at least 8 characters" });
      return true;
    }

    const passwordHash = await hashPassword(password);
    try {
      await query("BEGIN");
      let target = null;
      const existing = await query(
        `SELECT * FROM users
         WHERE ($1::text IS NOT NULL AND lower(email) = lower($1))
            OR ($2::text IS NOT NULL AND mobile = $2)
         LIMIT 1`,
        [email ? email.toLowerCase() : null, mobile]
      );
      if (existing.rows[0]) {
        target = existing.rows[0];
      } else {
        const inserted = await query(
          `INSERT INTO users (email, mobile, password_hash, name)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [email ? email.toLowerCase() : null, mobile, passwordHash, name]
        );
        target = inserted.rows[0];
      }
      await query(
        `INSERT INTO memberships (org_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [orgId, target.id, role]
      );
      await query("COMMIT");
      sendJson(res, 201, {
        member: { ...publicUser(target), role }
      });
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
    return true;
  }

  const tournamentList = url.pathname.match(/^\/api\/v1\/orgs\/([^/]+)\/tournaments$/);
  if (tournamentList && req.method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const orgId = tournamentList[1];
    const access = await requireOrgRole(user, orgId, [
      "owner",
      "admin",
      "auctioneer",
      "viewer"
    ]);
    if (!access?.org) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const result = await query(
      `SELECT id, name, year, slug, logo_key, is_active, created_at, updated_at
       FROM tournaments
       WHERE org_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    sendJson(res, 200, { organization: access.org, tournaments: result.rows });
    return true;
  }

  if (tournamentList && req.method === "POST") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const orgId = tournamentList[1];
    const access = await requireOrgRole(user, orgId, ["owner", "admin"]);
    if (!access?.org) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    const year = String(body.year || new Date().getFullYear());
    if (!name) {
      sendJson(res, 400, { error: "name required" });
      return true;
    }
    let slug = String(body.slug || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "tournament";
    try {
      await query("BEGIN");
      const tournament = await query(
        `INSERT INTO tournaments (org_id, name, year, slug)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [orgId, name, year, slug]
      );
      const t = tournament.rows[0];
      const division = await query(
        `INSERT INTO divisions (tournament_id, name, code, sort_order)
         VALUES ($1, 'Main Auction', 'div_1', 0)
         RETURNING *`,
        [t.id]
      );
      await query(
        `INSERT INTO auction_sessions (division_id, status, snapshot)
         VALUES ($1, 'idle', '{}'::jsonb)`,
        [division.rows[0].id]
      );
      await query("COMMIT");
      sendJson(res, 201, {
        tournament: t,
        division: division.rows[0]
      });
    } catch (error) {
      await query("ROLLBACK");
      if (error.code === "23505") {
        sendJson(res, 409, { error: "tournament slug already exists in org" });
        return true;
      }
      throw error;
    }
    return true;
  }

  return false;
}

module.exports = { handleOrgRoutes, requireOrgRole };
