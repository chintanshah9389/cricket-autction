const { sendJson, readJson } = require("../lib/http");
const { authenticateRequest, hashPassword, cleanIdentity } = require("../lib/auth");
const { query } = require("../db/pool");
const { deleteObjectQuiet } = require("../lib/r2");

async function purgeMediaKeys(keys) {
  const unique = [...new Set((keys || []).filter(Boolean))];
  for (const key of unique) {
    await deleteObjectQuiet(key);
    await query(`DELETE FROM media_objects WHERE object_key = $1`, [key]).catch(() => {});
  }
  return unique.length;
}

async function collectOrgMediaKeys(orgId) {
  const result = await query(
    `SELECT object_key FROM media_objects WHERE org_id = $1`,
    [orgId]
  );
  return result.rows.map((row) => row.object_key);
}

async function collectTournamentMediaKeys(tournamentId) {
  const [tournament, teams, players, partners, media] = await Promise.all([
    query(`SELECT logo_key, org_id FROM tournaments WHERE id = $1`, [tournamentId]),
    query(
      `SELECT t.logo_key, t.video_key
       FROM teams t
       JOIN divisions d ON d.id = t.division_id
       WHERE d.tournament_id = $1`,
      [tournamentId]
    ),
    query(
      `SELECT p.photo_key
       FROM players p
       JOIN divisions d ON d.id = p.division_id
       WHERE d.tournament_id = $1`,
      [tournamentId]
    ),
    query(
      `SELECT logo_key, video_key FROM partners WHERE tournament_id = $1`,
      [tournamentId]
    ),
    query(
      `SELECT m.object_key
       FROM media_objects m
       JOIN tournaments t ON t.org_id = m.org_id
       WHERE t.id = $1
         AND m.object_key LIKE ('org/' || t.org_id::text || '/tournaments/' || t.id::text || '/%')`,
      [tournamentId]
    )
  ]);
  const keys = [];
  if (tournament.rows[0]?.logo_key) keys.push(tournament.rows[0].logo_key);
  for (const row of teams.rows) {
    if (row.logo_key) keys.push(row.logo_key);
    if (row.video_key) keys.push(row.video_key);
  }
  for (const row of players.rows) {
    if (row.photo_key) keys.push(row.photo_key);
  }
  for (const row of partners.rows) {
    if (row.logo_key) keys.push(row.logo_key);
    if (row.video_key) keys.push(row.video_key);
  }
  for (const row of media.rows) keys.push(row.object_key);
  return keys;
}

async function requireSuperAdmin(req, res) {
  const user = await authenticateRequest(req);
  if (!user) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  if (!user.is_super_admin) {
    sendJson(res, 403, { error: "Super Admin only" });
    return null;
  }
  return user;
}

async function count(sql) {
  const result = await query(sql);
  return Number(result.rows[0]?.c || 0);
}

function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    isSuperAdmin: row.is_super_admin,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    membershipCount: row.membership_count
  };
}

/** Delete non-super-admin users by id, never the acting Super Admin. */
async function deleteRelatedUsers(userIds, protectUserId) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const result = await query(
    `DELETE FROM users
     WHERE id = ANY($1::uuid[])
       AND is_super_admin = FALSE
       AND ($2::uuid IS NULL OR id <> $2)
     RETURNING id, name, email, mobile`,
    [ids, protectUserId || null]
  );
  return result.rows;
}

async function memberUserIdsForOrg(orgId) {
  const result = await query(
    `SELECT user_id FROM memberships WHERE org_id = $1`,
    [orgId]
  );
  return result.rows.map((row) => row.user_id);
}

async function handleSuperAdminRoutes(req, res, url) {
  if (url.pathname === "/api/v1/super/overview" && req.method === "GET") {
    const user = await requireSuperAdmin(req, res);
    if (!user) return true;

    const [
      organizations,
      users,
      memberships,
      tournaments,
      divisions,
      teams,
      players,
      partners,
      mediaObjects,
      auctionSessions,
      auctionLive,
      auctionFinished,
      auctionIdle,
      activeRefreshSessions,
      auctionEvents
    ] = await Promise.all([
      count(`SELECT COUNT(*)::int AS c FROM organizations`),
      count(`SELECT COUNT(*)::int AS c FROM users`),
      count(`SELECT COUNT(*)::int AS c FROM memberships`),
      count(`SELECT COUNT(*)::int AS c FROM tournaments`),
      count(`SELECT COUNT(*)::int AS c FROM divisions`),
      count(`SELECT COUNT(*)::int AS c FROM teams`),
      count(`SELECT COUNT(*)::int AS c FROM players`),
      count(`SELECT COUNT(*)::int AS c FROM partners`),
      count(`SELECT COUNT(*)::int AS c FROM media_objects`),
      count(`SELECT COUNT(*)::int AS c FROM auction_sessions`),
      count(`SELECT COUNT(*)::int AS c FROM auction_sessions WHERE status = 'live'`),
      count(`SELECT COUNT(*)::int AS c FROM auction_sessions WHERE status = 'finished'`),
      count(`SELECT COUNT(*)::int AS c FROM auction_sessions WHERE status = 'idle'`),
      count(
        `SELECT COUNT(*)::int AS c FROM sessions WHERE revoked_at IS NULL AND expires_at > NOW()`
      ),
      count(`SELECT COUNT(*)::int AS c FROM auction_events`)
    ]);

    sendJson(res, 200, {
      generatedAt: new Date().toISOString(),
      counts: {
        organizations,
        users,
        memberships,
        tournaments,
        divisions,
        teams,
        players,
        partners,
        mediaObjects,
        auctionSessions,
        auctionLive,
        auctionFinished,
        auctionIdle,
        activeRefreshSessions,
        auctionEvents
      },
      notes: {
        access:
          "Super Admin has highest platform access: view, edit, and delete any org, user, or tournament.",
        r2: "Media blobs are intended for Cloudflare R2; media_objects stores keys/metadata in Postgres."
      }
    });
    return true;
  }

  if (url.pathname === "/api/v1/super/db" && req.method === "GET") {
    const user = await requireSuperAdmin(req, res);
    if (!user) return true;

    const tables = [
      "users",
      "sessions",
      "organizations",
      "memberships",
      "tournaments",
      "divisions",
      "teams",
      "players",
      "partners",
      "auction_sessions",
      "auction_events",
      "media_objects",
      "schema_migrations"
    ];
    const rows = [];
    for (const table of tables) {
      const result = await query(`SELECT COUNT(*)::int AS c FROM ${table}`);
      rows.push({ table, rows: Number(result.rows[0].c) });
    }

    const db = await query(`SELECT current_database() AS name, current_user AS db_user`);
    sendJson(res, 200, {
      database: db.rows[0],
      tables: rows,
      totalRows: rows.reduce((sum, row) => sum + row.rows, 0)
    });
    return true;
  }

  if (url.pathname === "/api/v1/super/organizations" && req.method === "GET") {
    const user = await requireSuperAdmin(req, res);
    if (!user) return true;

    const result = await query(
      `SELECT
         o.id,
         o.name,
         o.slug,
         o.is_active,
         o.created_at,
         o.updated_at,
         COUNT(DISTINCT m.id)::int AS member_count,
         COUNT(DISTINCT t.id)::int AS tournament_count
       FROM organizations o
       LEFT JOIN memberships m ON m.org_id = o.id
       LEFT JOIN tournaments t ON t.org_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    );
    sendJson(res, 200, { organizations: result.rows });
    return true;
  }

  const orgMatch = url.pathname.match(/^\/api\/v1\/super\/organizations\/([^/]+)$/);
  if (orgMatch) {
    const actor = await requireSuperAdmin(req, res);
    if (!actor) return true;
    const orgId = orgMatch[1];

    if (req.method === "GET") {
      const orgResult = await query(
        `SELECT id, name, slug, is_active, created_at, updated_at
         FROM organizations WHERE id = $1`,
        [orgId]
      );
      if (!orgResult.rows[0]) {
        sendJson(res, 404, { error: "Organization not found" });
        return true;
      }
      const [members, tournaments] = await Promise.all([
        query(
          `SELECT u.id, u.name, u.email, u.mobile, u.is_active, m.role, m.created_at
           FROM memberships m
           JOIN users u ON u.id = m.user_id
           WHERE m.org_id = $1
           ORDER BY m.created_at`,
          [orgId]
        ),
        query(
          `SELECT id, name, year, slug, is_active, created_at
           FROM tournaments WHERE org_id = $1 ORDER BY created_at DESC`,
          [orgId]
        )
      ]);
      sendJson(res, 200, {
        organization: orgResult.rows[0],
        members: members.rows,
        tournaments: tournaments.rows
      });
      return true;
    }

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const existing = await query(`SELECT * FROM organizations WHERE id = $1`, [orgId]);
      if (!existing.rows[0]) {
        sendJson(res, 404, { error: "Organization not found" });
        return true;
      }
      const name =
        body.name != null ? String(body.name).trim() : existing.rows[0].name;
      let slug =
        body.slug != null
          ? String(body.slug)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 40)
          : existing.rows[0].slug;
      if (!name) {
        sendJson(res, 400, { error: "name required" });
        return true;
      }
      if (!slug) slug = existing.rows[0].slug;
      const isActive =
        body.isActive != null || body.is_active != null
          ? Boolean(body.isActive ?? body.is_active)
          : existing.rows[0].is_active;
      try {
        const updated = await query(
          `UPDATE organizations
           SET name = $2, slug = $3, is_active = $4, updated_at = NOW()
           WHERE id = $1
           RETURNING id, name, slug, is_active, created_at, updated_at`,
          [orgId, name, slug, isActive]
        );
        sendJson(res, 200, { organization: updated.rows[0] });
      } catch (error) {
        if (error.code === "23505") {
          sendJson(res, 409, { error: "slug already exists" });
          return true;
        }
        throw error;
      }
      return true;
    }

    if (req.method === "DELETE") {
      const relatedUserIds = await memberUserIdsForOrg(orgId);
      const mediaKeys = await collectOrgMediaKeys(orgId);
      const purgedMedia = await purgeMediaKeys(mediaKeys);
      const deleted = await query(
        `DELETE FROM organizations WHERE id = $1
         RETURNING id, name, slug`,
        [orgId]
      );
      if (!deleted.rows[0]) {
        sendJson(res, 404, { error: "Organization not found" });
        return true;
      }
      // Org cascade removed memberships/tournaments/media/players/auctions.
      // Delete former members who now belong to no other org.
      const orphaned = relatedUserIds.length
        ? await query(
            `SELECT u.id
             FROM users u
             WHERE u.id = ANY($1::uuid[])
               AND u.is_super_admin = FALSE
               AND NOT EXISTS (
                 SELECT 1 FROM memberships m WHERE m.user_id = u.id
               )`,
            [relatedUserIds]
          )
        : { rows: [] };
      const deletedUsers = await deleteRelatedUsers(
        orphaned.rows.map((row) => row.id),
        actor.id
      );
      sendJson(res, 200, {
        deleted: true,
        organization: deleted.rows[0],
        deletedUsers,
        deletedUserCount: deletedUsers.length,
        purgedMedia
      });
      return true;
    }
  }

  if (url.pathname === "/api/v1/super/users" && req.method === "GET") {
    const user = await requireSuperAdmin(req, res);
    if (!user) return true;

    const result = await query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.mobile,
         u.is_super_admin,
         u.is_active,
         u.created_at,
         u.updated_at,
         COUNT(m.id)::int AS membership_count
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT 500`
    );
    sendJson(res, 200, { users: result.rows.map(mapUser) });
    return true;
  }

  const userMatch = url.pathname.match(/^\/api\/v1\/super\/users\/([^/]+)$/);
  if (userMatch) {
    const actor = await requireSuperAdmin(req, res);
    if (!actor) return true;
    const userId = userMatch[1];

    if (req.method === "GET") {
      const result = await query(
        `SELECT id, name, email, mobile, is_super_admin, is_active, created_at, updated_at
         FROM users WHERE id = $1`,
        [userId]
      );
      if (!result.rows[0]) {
        sendJson(res, 404, { error: "User not found" });
        return true;
      }
      const memberships = await query(
        `SELECT m.role, m.created_at, o.id AS org_id, o.name AS org_name, o.slug AS org_slug
         FROM memberships m
         JOIN organizations o ON o.id = m.org_id
         WHERE m.user_id = $1
         ORDER BY o.name`,
        [userId]
      );
      sendJson(res, 200, {
        user: mapUser(result.rows[0]),
        memberships: memberships.rows
      });
      return true;
    }

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const existing = await query(`SELECT * FROM users WHERE id = $1`, [userId]);
      if (!existing.rows[0]) {
        sendJson(res, 404, { error: "User not found" });
        return true;
      }
      const current = existing.rows[0];
      const name = body.name != null ? String(body.name).trim() : current.name;
      const email =
        body.email !== undefined
          ? cleanIdentity(body.email)
            ? cleanIdentity(body.email).toLowerCase()
            : null
          : current.email;
      const mobile =
        body.mobile !== undefined
          ? cleanIdentity(body.mobile)?.replace(/\s+/g, "") || null
          : current.mobile;
      const isActive =
        body.isActive != null || body.is_active != null
          ? Boolean(body.isActive ?? body.is_active)
          : current.is_active;
      let isSuperAdmin = current.is_super_admin;
      if (body.isSuperAdmin != null || body.is_super_admin != null) {
        isSuperAdmin = Boolean(body.isSuperAdmin ?? body.is_super_admin);
      }
      if (actor.id === userId && !isSuperAdmin) {
        sendJson(res, 400, { error: "You cannot remove your own Super Admin flag" });
        return true;
      }
      if (actor.id === userId && isActive === false) {
        sendJson(res, 400, { error: "You cannot deactivate your own account" });
        return true;
      }
      if (!email && !mobile) {
        sendJson(res, 400, { error: "email or mobile required" });
        return true;
      }

      const password = body.password != null ? String(body.password) : "";
      let passwordHash = current.password_hash;
      if (password) {
        if (password.length < 8) {
          sendJson(res, 400, { error: "password must be at least 8 characters" });
          return true;
        }
        passwordHash = await hashPassword(password);
      }

      try {
        const updated = await query(
          `UPDATE users
           SET name = $2,
               email = $3,
               mobile = $4,
               is_active = $5,
               is_super_admin = $6,
               password_hash = $7,
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, name, email, mobile, is_super_admin, is_active, created_at, updated_at`,
          [userId, name || "", email, mobile, isActive, isSuperAdmin, passwordHash]
        );
        if (body.revokeSessions === true) {
          await query(
            `UPDATE sessions SET revoked_at = NOW()
             WHERE user_id = $1 AND revoked_at IS NULL`,
            [userId]
          );
        }
        sendJson(res, 200, { user: mapUser(updated.rows[0]) });
      } catch (error) {
        if (error.code === "23505") {
          sendJson(res, 409, { error: "email or mobile already in use" });
          return true;
        }
        throw error;
      }
      return true;
    }

    if (req.method === "DELETE") {
      if (actor.id === userId) {
        sendJson(res, 400, { error: "You cannot delete your own Super Admin account" });
        return true;
      }
      const deleted = await query(
        `DELETE FROM users WHERE id = $1
         RETURNING id, name, email, mobile`,
        [userId]
      );
      if (!deleted.rows[0]) {
        sendJson(res, 404, { error: "User not found" });
        return true;
      }
      sendJson(res, 200, {
        deleted: true,
        user: {
          id: deleted.rows[0].id,
          name: deleted.rows[0].name,
          email: deleted.rows[0].email,
          mobile: deleted.rows[0].mobile
        }
      });
      return true;
    }
  }

  if (url.pathname === "/api/v1/super/tournaments" && req.method === "GET") {
    const user = await requireSuperAdmin(req, res);
    if (!user) return true;

    const result = await query(
      `SELECT
         t.id,
         t.name,
         t.year,
         t.slug,
         t.is_active,
         t.created_at,
         t.updated_at,
         o.id AS org_id,
         o.name AS org_name,
         o.slug AS org_slug,
         COUNT(DISTINCT d.id)::int AS division_count,
         COUNT(DISTINCT p.id)::int AS player_count,
         COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'live')::int AS live_sessions
       FROM tournaments t
       JOIN organizations o ON o.id = t.org_id
       LEFT JOIN divisions d ON d.tournament_id = t.id
       LEFT JOIN players p ON p.division_id = d.id
       LEFT JOIN auction_sessions s ON s.division_id = d.id
       GROUP BY t.id, o.id
       ORDER BY t.created_at DESC
       LIMIT 500`
    );
    sendJson(res, 200, { tournaments: result.rows });
    return true;
  }

  const tournamentMatch = url.pathname.match(/^\/api\/v1\/super\/tournaments\/([^/]+)$/);
  if (tournamentMatch) {
    const actor = await requireSuperAdmin(req, res);
    if (!actor) return true;
    const tournamentId = tournamentMatch[1];

    if (req.method === "GET") {
      const result = await query(
        `SELECT
           t.id, t.name, t.year, t.slug, t.is_active, t.logo_key, t.created_at, t.updated_at,
           o.id AS org_id, o.name AS org_name, o.slug AS org_slug
         FROM tournaments t
         JOIN organizations o ON o.id = t.org_id
         WHERE t.id = $1`,
        [tournamentId]
      );
      if (!result.rows[0]) {
        sendJson(res, 404, { error: "Tournament not found" });
        return true;
      }
      const divisions = await query(
        `SELECT id, name, code, sort_order, created_at
         FROM divisions WHERE tournament_id = $1
         ORDER BY sort_order ASC, created_at ASC`,
        [tournamentId]
      );
      sendJson(res, 200, {
        tournament: result.rows[0],
        divisions: divisions.rows
      });
      return true;
    }

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const existing = await query(`SELECT * FROM tournaments WHERE id = $1`, [tournamentId]);
      if (!existing.rows[0]) {
        sendJson(res, 404, { error: "Tournament not found" });
        return true;
      }
      const current = existing.rows[0];
      const name = body.name != null ? String(body.name).trim() : current.name;
      const year = body.year != null ? String(body.year).trim() : current.year;
      let slug =
        body.slug != null
          ? String(body.slug)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 40)
          : current.slug;
      if (!name) {
        sendJson(res, 400, { error: "name required" });
        return true;
      }
      if (!slug) slug = current.slug;
      const isActive =
        body.isActive != null || body.is_active != null
          ? Boolean(body.isActive ?? body.is_active)
          : current.is_active;
      const orgId =
        body.orgId || body.org_id
          ? String(body.orgId || body.org_id)
          : current.org_id;

      if (orgId !== current.org_id) {
        const orgCheck = await query(`SELECT id FROM organizations WHERE id = $1`, [orgId]);
        if (!orgCheck.rows[0]) {
          sendJson(res, 400, { error: "Target organization not found" });
          return true;
        }
      }

      try {
        const updated = await query(
          `UPDATE tournaments
           SET org_id = $2, name = $3, year = $4, slug = $5, is_active = $6, updated_at = NOW()
           WHERE id = $1
           RETURNING id, org_id, name, year, slug, is_active, created_at, updated_at`,
          [tournamentId, orgId, name, year, slug, isActive]
        );
        sendJson(res, 200, { tournament: updated.rows[0] });
      } catch (error) {
        if (error.code === "23505") {
          sendJson(res, 409, { error: "tournament slug already exists in org" });
          return true;
        }
        throw error;
      }
      return true;
    }

    if (req.method === "DELETE") {
      const existing = await query(
        `SELECT id, name, year, slug, org_id FROM tournaments WHERE id = $1`,
        [tournamentId]
      );
      if (!existing.rows[0]) {
        sendJson(res, 404, { error: "Tournament not found" });
        return true;
      }
      const orgId = existing.rows[0].org_id;
      const mediaKeys = await collectTournamentMediaKeys(tournamentId);
      const purgedMedia = await purgeMediaKeys(mediaKeys);

      // Cascade removes divisions, teams, players, partners, auction sessions/events.
      // Do NOT delete org users here — that only happens on organization delete.
      const deleted = await query(
        `DELETE FROM tournaments WHERE id = $1
         RETURNING id, name, year, slug, org_id`,
        [tournamentId]
      );

      const remaining = await query(
        `SELECT COUNT(*)::int AS c FROM tournaments WHERE org_id = $1`,
        [orgId]
      );

      sendJson(res, 200, {
        deleted: true,
        tournament: deleted.rows[0],
        relatedDataRemoved: true,
        remainingTournamentsInOrg: Number(remaining.rows[0]?.c || 0),
        deletedUsers: [],
        deletedUserCount: 0,
        purgedMedia
      });
      return true;
    }
  }

  if (url.pathname === "/api/v1/super/auctions" && req.method === "GET") {
    const user = await requireSuperAdmin(req, res);
    if (!user) return true;

    const result = await query(
      `SELECT
         s.id,
         s.status,
         s.revision,
         s.updated_at,
         d.id AS division_id,
         d.name AS division_name,
         t.id AS tournament_id,
         t.name AS tournament_name,
         t.year AS tournament_year,
         o.id AS org_id,
         o.name AS org_name,
         o.slug AS org_slug
       FROM auction_sessions s
       JOIN divisions d ON d.id = s.division_id
       JOIN tournaments t ON t.id = d.tournament_id
       JOIN organizations o ON o.id = t.org_id
       ORDER BY
         CASE s.status WHEN 'live' THEN 0 WHEN 'idle' THEN 1 ELSE 2 END,
         s.updated_at DESC
       LIMIT 200`
    );
    sendJson(res, 200, { auctions: result.rows });
    return true;
  }

  return false;
}

module.exports = { handleSuperAdminRoutes };
