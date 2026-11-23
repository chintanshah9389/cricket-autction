const { sendJson, readJson } = require("../lib/http");
const { authenticateRequest } = require("../lib/auth");
const { requireOrgRole } = require("./orgs");
const { query } = require("../db/pool");
const {
  publicUrlForKey,
  resolveMediaKey,
  deleteObjectQuiet
} = require("../lib/r2");

const WRITE_ROLES = ["owner", "admin", "auctioneer"];
const READ_ROLES = ["owner", "admin", "auctioneer", "viewer"];

async function requireUser(req, res) {
  const user = await authenticateRequest(req);
  if (!user) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return user;
}

async function loadTournament(tournamentId) {
  const result = await query(
    `SELECT t.*, o.id AS org_id, o.name AS org_name, o.slug AS org_slug
     FROM tournaments t
     JOIN organizations o ON o.id = t.org_id
     WHERE t.id = $1
     LIMIT 1`,
    [tournamentId]
  );
  return result.rows[0] || null;
}

async function requireTournamentAccess(user, tournamentId, roles) {
  const tournament = await loadTournament(tournamentId);
  if (!tournament) return null;
  const access = await requireOrgRole(user, tournament.org_id, roles);
  if (!access?.org) return null;
  return { tournament, access };
}

function divisionCodeFromSort(sortOrder) {
  return `div_${Number(sortOrder) + 1}`;
}

function sanitizeDivisionCode(value, fallbackIndex) {
  const raw = String(value || "").trim().toLowerCase();
  if (/^div_\d+$/.test(raw)) return raw;
  return divisionCodeFromSort(fallbackIndex);
}

function mapTeamRow(row) {
  const logo = row.logo_key ? publicUrlForKey(row.logo_key) : "";
  const video = row.video_key ? publicUrlForKey(row.video_key) : "";
  return {
    id: row.team_key,
    team_id: row.team_key,
    teamName: row.team_name,
    team_name: row.team_name,
    color: row.color,
    logo: logo || "",
    logoKey: row.logo_key || null,
    video: video || "",
    videoKey: row.video_key || null,
    iconPlayerId: row.icon_player_id || null,
    captionPlayerId: row.caption_player_id || null,
    dbId: row.id
  };
}

function mapPlayerRow(row) {
  const fields = row.fields && typeof row.fields === "object" ? row.fields : {};
  return {
    ...fields,
    id: row.external_id || row.code || row.id,
    dbId: row.id,
    name: row.name,
    category: row.category || fields.category || "",
    role: row.role || fields.role || "",
    photo: row.photo_key ? publicUrlForKey(row.photo_key) : fields.photo || "",
    photoKey: row.photo_key || null,
    status: row.status || "not-auctioned",
    teamId: row.team_id,
    finalPrice: row.final_price
  };
}

function mapPartnerRow(row) {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    tagline: row.tagline || "",
    url: "",
    highlight: false,
    order: row.sort_order,
    sortOrder: row.sort_order,
    logo: row.logo_key ? publicUrlForKey(row.logo_key) || "" : "",
    logoKey: row.logo_key || null,
    video: row.video_key ? publicUrlForKey(row.video_key) || "" : "",
    videoKey: row.video_key || null
  };
}

function mapDivisionSettings(row) {
  return {
    id: row.code,
    dbId: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    teamKitty: Number(row.team_kitty) || 10000000,
    useCategoryBasePrices: row.use_category_base_prices !== false,
    auctionOrder: row.auction_order || "SEQUENCE",
    shuffleWithinCategory: row.shuffle_within_category !== false,
    playerWheelEnabled: row.player_wheel_enabled !== false,
    categorySequence: Array.isArray(row.category_sequence) ? row.category_sequence : [],
    categories: row.categories && typeof row.categories === "object" ? row.categories : {},
    iconCaption: row.icon_caption && typeof row.icon_caption === "object" ? row.icon_caption : {},
    playerFields: row.player_fields && typeof row.player_fields === "object" ? row.player_fields : {}
  };
}

async function buildSnapshot(tournamentId) {
  const tournament = await loadTournament(tournamentId);
  if (!tournament) return null;

  const divisionsResult = await query(
    `SELECT * FROM divisions WHERE tournament_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [tournamentId]
  );
  const divisions = divisionsResult.rows;

  const projectDivisions = [];
  const divisionPayloads = [];

  for (const division of divisions) {
    const teams = await query(
      `SELECT * FROM teams WHERE division_id = $1 ORDER BY team_key ASC`,
      [division.id]
    );
    const players = await query(
      `SELECT * FROM players WHERE division_id = $1 ORDER BY created_at ASC`,
      [division.id]
    );
    const session = await query(
      `SELECT * FROM auction_sessions WHERE division_id = $1 LIMIT 1`,
      [division.id]
    );
    const settings = mapDivisionSettings(division);
    const mappedTeams = teams.rows.map(mapTeamRow);
    projectDivisions.push({
      ...settings,
      teams: mappedTeams
    });
    divisionPayloads.push({
      id: settings.id,
      dbId: division.id,
      players: players.rows.map(mapPlayerRow),
      auction: session.rows[0]?.snapshot || null,
      auctionStatus: session.rows[0]?.status || "idle",
      auctionRevision: session.rows[0]?.revision || 0
    });
  }

  const partners = await query(
    `SELECT * FROM partners WHERE tournament_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [tournamentId]
  );

  const activeDivisionId =
    projectDivisions[0]?.id ||
    (divisions[0] ? divisionCodeFromSort(divisions[0].sort_order) : "div_1");

  return {
    ok: true,
    root: "postgres",
    mode: "tournament-db",
    organization: {
      id: tournament.org_id,
      name: tournament.org_name,
      slug: tournament.org_slug
    },
    tournament: {
      id: tournament.id,
      name: tournament.name,
      year: tournament.year,
      slug: tournament.slug,
      logoKey: tournament.logo_key,
      logo: tournament.logo_key ? publicUrlForKey(tournament.logo_key) : null
    },
    project: {
      tournament: {
        name: tournament.name,
        year: tournament.year,
        logoKey: tournament.logo_key || null,
        logo: tournament.logo_key ? publicUrlForKey(tournament.logo_key) || "" : ""
      },
      activeDivisionId,
      divisions: projectDivisions,
      teams: projectDivisions[0]?.teams || []
    },
    divisions: divisionPayloads,
    partners: partners.rows.map(mapPartnerRow)
  };
}

async function syncTeamsForDivision(client, divisionDbId, teams) {
  const list = Array.isArray(teams) ? teams : [];
  const existing = await client.query(
    `SELECT team_key, logo_key, video_key FROM teams WHERE division_id = $1`,
    [divisionDbId]
  );
  const existingByKey = new Map(
    existing.rows.map((row) => [Number(row.team_key), row])
  );
  const keepKeys = [];
  for (let i = 0; i < list.length; i++) {
    const team = list[i] || {};
    const teamKey = Number(team.id ?? team.team_id ?? team.teamKey ?? i + 1);
    keepKeys.push(teamKey);
    const prev = existingByKey.get(teamKey);
    const logoKey = resolveMediaKey(team, "logoKey", "logo");
    const videoKey = resolveMediaKey(team, "videoKey", "video");
    if (prev?.logo_key && prev.logo_key !== logoKey) {
      await deleteObjectQuiet(prev.logo_key);
      await client.query(`DELETE FROM media_objects WHERE object_key = $1`, [prev.logo_key]);
    }
    if (prev?.video_key && prev.video_key !== videoKey) {
      await deleteObjectQuiet(prev.video_key);
      await client.query(`DELETE FROM media_objects WHERE object_key = $1`, [prev.video_key]);
    }
    await client.query(
      `INSERT INTO teams (division_id, team_key, team_name, color, logo_key, video_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (division_id, team_key) DO UPDATE SET
         team_name = EXCLUDED.team_name,
         color = EXCLUDED.color,
         logo_key = EXCLUDED.logo_key,
         video_key = EXCLUDED.video_key,
         updated_at = NOW()`,
      [
        divisionDbId,
        teamKey,
        String(team.teamName || team.team_name || team.name || `Team ${teamKey}`),
        String(team.color || "#3498db"),
        logoKey,
        videoKey
      ]
    );
  }
  if (keepKeys.length) {
    const removed = await client.query(
      `SELECT logo_key, video_key FROM teams
       WHERE division_id = $1
         AND NOT (team_key = ANY($2::int[]))`,
      [divisionDbId, keepKeys]
    );
    for (const row of removed.rows) {
      if (row.logo_key) {
        await deleteObjectQuiet(row.logo_key);
        await client.query(`DELETE FROM media_objects WHERE object_key = $1`, [row.logo_key]);
      }
      if (row.video_key) {
        await deleteObjectQuiet(row.video_key);
        await client.query(`DELETE FROM media_objects WHERE object_key = $1`, [row.video_key]);
      }
    }
    await client.query(
      `DELETE FROM teams
       WHERE division_id = $1
         AND NOT (team_key = ANY($2::int[]))`,
      [divisionDbId, keepKeys]
    );
  } else {
    const removed = await client.query(
      `SELECT logo_key, video_key FROM teams WHERE division_id = $1`,
      [divisionDbId]
    );
    for (const row of removed.rows) {
      if (row.logo_key) {
        await deleteObjectQuiet(row.logo_key);
        await client.query(`DELETE FROM media_objects WHERE object_key = $1`, [row.logo_key]);
      }
      if (row.video_key) {
        await deleteObjectQuiet(row.video_key);
        await client.query(`DELETE FROM media_objects WHERE object_key = $1`, [row.video_key]);
      }
    }
    await client.query(`DELETE FROM teams WHERE division_id = $1`, [divisionDbId]);
  }
}

async function resolveDivision(tournamentId, codeOrId) {
  const key = String(codeOrId || "").trim();
  const byCode = await query(
    `SELECT * FROM divisions WHERE tournament_id = $1 AND code = $2 LIMIT 1`,
    [tournamentId, key]
  );
  if (byCode.rows[0]) return byCode.rows[0];
  const byId = await query(
    `SELECT * FROM divisions WHERE tournament_id = $1 AND id::text = $2 LIMIT 1`,
    [tournamentId, key]
  );
  return byId.rows[0] || null;
}

async function handleTournamentRoutes(req, res, url) {
  const snapshotMatch = url.pathname.match(/^\/api\/v1\/tournaments\/([^/]+)\/snapshot$/);
  if (snapshotMatch && req.method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const tournamentId = snapshotMatch[1];
    const ctx = await requireTournamentAccess(user, tournamentId, READ_ROLES);
    if (!ctx) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const snapshot = await buildSnapshot(tournamentId);
    sendJson(res, 200, snapshot);
    return true;
  }

  const configMatch = url.pathname.match(/^\/api\/v1\/tournaments\/([^/]+)\/config$/);
  if (configMatch && req.method === "PUT") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const tournamentId = configMatch[1];
    const ctx = await requireTournamentAccess(user, tournamentId, WRITE_ROLES);
    if (!ctx) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const body = await readJson(req);
    const config = body.config || body;
    const tournamentMeta = config.tournament || {};
    const divisions = Array.isArray(config.divisions) ? config.divisions : [];

    const client = await require("../db/pool").getPool().connect();
    try {
      await client.query("BEGIN");
      const prevLogo = await client.query(
        `SELECT logo_key FROM tournaments WHERE id = $1`,
        [tournamentId]
      );
      const nextLogoKey = resolveMediaKey(tournamentMeta, "logoKey", "logo");
      const previousLogoKey = prevLogo.rows[0]?.logo_key || null;
      if (previousLogoKey && previousLogoKey !== nextLogoKey) {
        await deleteObjectQuiet(previousLogoKey);
        await client.query(`DELETE FROM media_objects WHERE object_key = $1`, [
          previousLogoKey
        ]);
      }
      await client.query(
        `UPDATE tournaments
         SET name = COALESCE(NULLIF($2, ''), name),
             year = COALESCE(NULLIF($3, ''), year),
             logo_key = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [
          tournamentId,
          String(tournamentMeta.name || "").trim(),
          String(tournamentMeta.year || "").trim(),
          nextLogoKey
        ]
      );

      const keepCodes = [];
      for (let i = 0; i < divisions.length; i++) {
        const div = divisions[i] || {};
        const code = sanitizeDivisionCode(div.id || div.code, i);
        keepCodes.push(code);
        const upsert = await client.query(
          `INSERT INTO divisions (
             tournament_id, name, code, sort_order, team_kitty,
             use_category_base_prices, auction_order, shuffle_within_category,
             player_wheel_enabled, category_sequence, categories, icon_caption, player_fields
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8,
             $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb
           )
           ON CONFLICT (tournament_id, code) DO UPDATE SET
             name = EXCLUDED.name,
             sort_order = EXCLUDED.sort_order,
             team_kitty = EXCLUDED.team_kitty,
             use_category_base_prices = EXCLUDED.use_category_base_prices,
             auction_order = EXCLUDED.auction_order,
             shuffle_within_category = EXCLUDED.shuffle_within_category,
             player_wheel_enabled = EXCLUDED.player_wheel_enabled,
             category_sequence = EXCLUDED.category_sequence,
             categories = EXCLUDED.categories,
             icon_caption = EXCLUDED.icon_caption,
             player_fields = EXCLUDED.player_fields,
             updated_at = NOW()
           RETURNING id`,
          [
            tournamentId,
            String(div.name || `Division ${i + 1}`),
            code,
            Number.isFinite(Number(div.sortOrder)) ? Number(div.sortOrder) : i,
            Number(div.teamKitty) || 10000000,
            div.useCategoryBasePrices !== false,
            String(div.auctionOrder || "SEQUENCE"),
            div.shuffleWithinCategory !== false,
            div.playerWheelEnabled !== false,
            JSON.stringify(Array.isArray(div.categorySequence) ? div.categorySequence : []),
            JSON.stringify(div.categories && typeof div.categories === "object" ? div.categories : {}),
            JSON.stringify(div.iconCaption && typeof div.iconCaption === "object" ? div.iconCaption : {}),
            JSON.stringify(div.playerFields && typeof div.playerFields === "object" ? div.playerFields : {})
          ]
        );
        const divisionId = upsert.rows[0].id;
        await client.query(
          `INSERT INTO auction_sessions (division_id, status, snapshot)
           VALUES ($1, 'idle', '{}'::jsonb)
           ON CONFLICT (division_id) DO NOTHING`,
          [divisionId]
        );
        await syncTeamsForDivision(client, divisionId, div.teams);
      }

      if (keepCodes.length) {
        await client.query(
          `DELETE FROM divisions
           WHERE tournament_id = $1
             AND NOT (code = ANY($2::text[]))`,
          [tournamentId, keepCodes]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    sendJson(res, 200, { ok: true, config: (await buildSnapshot(tournamentId)).project });
    return true;
  }

  const partnersMatch = url.pathname.match(/^\/api\/v1\/tournaments\/([^/]+)\/partners$/);
  if (partnersMatch && req.method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const tournamentId = partnersMatch[1];
    const ctx = await requireTournamentAccess(user, tournamentId, READ_ROLES);
    if (!ctx) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const partners = await query(
      `SELECT * FROM partners WHERE tournament_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [tournamentId]
    );
    sendJson(res, 200, { partners: partners.rows.map(mapPartnerRow) });
    return true;
  }

  if (partnersMatch && req.method === "PUT") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const tournamentId = partnersMatch[1];
    const ctx = await requireTournamentAccess(user, tournamentId, WRITE_ROLES);
    if (!ctx) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const body = await readJson(req);
    const partners = Array.isArray(body.partners) ? body.partners : [];
    const client = await require("../db/pool").getPool().connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        `SELECT logo_key, video_key FROM partners WHERE tournament_id = $1`,
        [tournamentId]
      );
      const keepKeys = new Set();
      await client.query(`DELETE FROM partners WHERE tournament_id = $1`, [tournamentId]);
      for (let i = 0; i < partners.length; i++) {
        const p = partners[i] || {};
        const logoKey = resolveMediaKey(p, "logoKey", "logo");
        const videoKey = resolveMediaKey(p, "videoKey", "video");
        if (logoKey) keepKeys.add(logoKey);
        if (videoKey) keepKeys.add(videoKey);
        await client.query(
          `INSERT INTO partners (
             tournament_id, name, tier, tagline, sort_order, logo_key, video_key
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            tournamentId,
            String(p.name || `Partner ${i + 1}`),
            String(p.tier || "partner"),
            String(p.tagline || ""),
            Number.isFinite(Number(p.sortOrder ?? p.order))
              ? Number(p.sortOrder ?? p.order)
              : i,
            logoKey,
            videoKey
          ]
        );
      }
      for (const row of previous.rows) {
        for (const key of [row.logo_key, row.video_key]) {
          if (key && !keepKeys.has(key)) {
            await deleteObjectQuiet(key);
            await client.query(`DELETE FROM media_objects WHERE object_key = $1`, [key]);
          }
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const saved = await query(
      `SELECT * FROM partners WHERE tournament_id = $1 ORDER BY sort_order ASC`,
      [tournamentId]
    );
    sendJson(res, 200, { partners: saved.rows.map(mapPartnerRow) });
    return true;
  }

  const playersMatch = url.pathname.match(
    /^\/api\/v1\/tournaments\/([^/]+)\/divisions\/([^/]+)\/players$/
  );
  if (playersMatch && req.method === "PUT") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const tournamentId = playersMatch[1];
    const divisionKey = decodeURIComponent(playersMatch[2]);
    const ctx = await requireTournamentAccess(user, tournamentId, WRITE_ROLES);
    if (!ctx) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const division = await resolveDivision(tournamentId, divisionKey);
    if (!division) {
      sendJson(res, 404, { error: "Division not found" });
      return true;
    }
    const body = await readJson(req);
    const players = Array.isArray(body.players) ? body.players : [];
    const client = await require("../db/pool").getPool().connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        `SELECT photo_key FROM players WHERE division_id = $1`,
        [division.id]
      );
      const keepKeys = new Set();
      await client.query(`DELETE FROM players WHERE division_id = $1`, [division.id]);
      for (const player of players) {
        const externalId = String(player.id || player.externalId || "").trim() || null;
        const photoKey = resolveMediaKey(player, "photoKey", "photo");
        if (photoKey) keepKeys.add(photoKey);
        const fields = { ...player };
        delete fields.dbId;
        delete fields.photoKey;
        delete fields.teamId;
        delete fields.finalPrice;
        if (photoKey) fields.photo = publicUrlForKey(photoKey) || fields.photo || "";
        await client.query(
          `INSERT INTO players (
             division_id, external_id, code, name, category, role, photo_key, fields, status, final_price
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
          [
            division.id,
            externalId,
            String(player.code || externalId || ""),
            String(player.name || "Player"),
            String(player.category || ""),
            String(player.role || ""),
            photoKey,
            JSON.stringify(fields),
            String(player.status || "not-auctioned"),
            player.finalPrice != null ? Number(player.finalPrice) : null
          ]
        );
      }
      for (const row of previous.rows) {
        if (row.photo_key && !keepKeys.has(row.photo_key)) {
          await deleteObjectQuiet(row.photo_key);
          await client.query(`DELETE FROM media_objects WHERE object_key = $1`, [
            row.photo_key
          ]);
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const saved = await query(`SELECT * FROM players WHERE division_id = $1`, [division.id]);
    sendJson(res, 200, { players: saved.rows.map(mapPlayerRow) });
    return true;
  }

  const auctionMatch = url.pathname.match(
    /^\/api\/v1\/tournaments\/([^/]+)\/divisions\/([^/]+)\/auction$/
  );
  if (auctionMatch && req.method === "PUT") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const tournamentId = auctionMatch[1];
    const divisionKey = decodeURIComponent(auctionMatch[2]);
    const ctx = await requireTournamentAccess(user, tournamentId, WRITE_ROLES);
    if (!ctx) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const division = await resolveDivision(tournamentId, divisionKey);
    if (!division) {
      sendJson(res, 404, { error: "Division not found" });
      return true;
    }
    const body = await readJson(req);
    const auction = body.auction ?? body;
    const status = String(body.status || "live");
    const safeStatus = ["idle", "live", "finished"].includes(status) ? status : "live";
    const result = await query(
      `INSERT INTO auction_sessions (division_id, status, snapshot, revision, updated_at)
       VALUES ($1, $2, $3::jsonb, 1, NOW())
       ON CONFLICT (division_id) DO UPDATE SET
         status = EXCLUDED.status,
         snapshot = EXCLUDED.snapshot,
         revision = auction_sessions.revision + 1,
         updated_at = NOW()
       RETURNING snapshot, status, revision`,
      [division.id, safeStatus, JSON.stringify(auction && typeof auction === "object" ? auction : {})]
    );
    sendJson(res, 200, {
      auction: result.rows[0].snapshot,
      status: result.rows[0].status,
      revision: result.rows[0].revision
    });
    return true;
  }

  if (auctionMatch && req.method === "DELETE") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const tournamentId = auctionMatch[1];
    const divisionKey = decodeURIComponent(auctionMatch[2]);
    const ctx = await requireTournamentAccess(user, tournamentId, WRITE_ROLES);
    if (!ctx) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const division = await resolveDivision(tournamentId, divisionKey);
    if (!division) {
      sendJson(res, 404, { error: "Division not found" });
      return true;
    }
    await query(
      `INSERT INTO auction_sessions (division_id, status, snapshot, revision, updated_at)
       VALUES ($1, 'idle', '{}'::jsonb, 1, NOW())
       ON CONFLICT (division_id) DO UPDATE SET
         status = 'idle',
         snapshot = '{}'::jsonb,
         revision = auction_sessions.revision + 1,
         updated_at = NOW()`,
      [division.id]
    );
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}

module.exports = { handleTournamentRoutes, buildSnapshot };
