const { Readable } = require("stream");
const { query } = require("../db/pool");
const { sendJson } = require("../lib/http");
const { publicUrlForKey, getObjectStream, keyFromPublicUrl } = require("../lib/r2");

function unwrapAuction(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return { state: null };
  }
  if (snapshot.auctionState && typeof snapshot.auctionState === "object") {
    return { state: snapshot.auctionState };
  }
  return { state: snapshot };
}

function findPlayer(list, id) {
  if (id == null || id === "") return null;
  const needle = String(id).trim();
  if (!needle) return null;
  return (
    (list || []).find((player) => {
      if (!player) return false;
      return (
        String(player.id) === needle ||
        String(player.code || "") === needle ||
        String(player.code || "").toLowerCase() === needle.toLowerCase()
      );
    }) || null
  );
}

function findTeam(teams, id) {
  if (id == null || id === "") return null;
  const needle = String(id).trim();
  return (
    (teams || []).find(
      (team) => String(team.team_id) === needle || Number(team.team_id) === Number(needle)
    ) || null
  );
}

function mapPlayer(player) {
  if (!player) return null;
  const photo =
    player.photo ||
    player.photoUrl ||
    (player.photoKey || player.photo_key
      ? publicUrlForKey(player.photoKey || player.photo_key)
      : "") ||
    "";
  return {
    id: player.id,
    code: player.code || "",
    name: player.name || "",
    photo,
    category: player.category || "",
    role: player.role || "",
    status: player.status || "not-auctioned",
    finalPrice: player.finalPrice == null ? null : Number(player.finalPrice),
    team: player.team == null ? null : player.team,
    currentClub: player.currentClub || "",
    battingStyle: player.battingStyle || "",
    bowlingStyle: player.bowlingStyle || ""
  };
}

function enrichPhoto(player, playersRows) {
  if (!player) return player;
  const row = (playersRows || []).find(
    (entry) =>
      String(entry.external_id || "") === String(player.id) ||
      String(entry.code || "") === String(player.code || "") ||
      String(entry.code || "") === String(player.id)
  );
  // Prefer current DB/R2 key so live auction snapshots cannot keep deleted photo URLs.
  if (row?.photo_key) {
    player.photo = publicUrlForKey(row.photo_key) || player.photo || "";
    player.photoKey = row.photo_key;
    return player;
  }
  if (!player.photo) {
    const fieldPhoto = row?.fields?.photo || row?.photo || "";
    if (fieldPhoto) player.photo = fieldPhoto;
  }
  return player;
}

function teamLogo(team, logoByKey) {
  const direct = String(team?.logo || "").trim();
  if (direct.startsWith("http") || direct.startsWith("data:") || direct.startsWith("/")) {
    return direct;
  }
  const fromDb = logoByKey.get(String(team?.team_id));
  if (fromDb) return fromDb;
  return direct || "";
}

async function resolveTournament(ref) {
  const value = String(ref || "").trim();
  if (!value) return null;
  if (/^[0-9a-f-]{36}$/i.test(value)) {
    const byId = await query(
      `SELECT id, name, year, slug, logo_key, is_active,
              viewer_enabled, viewer_access_key
       FROM tournaments WHERE id = $1::uuid LIMIT 1`,
      [value]
    );
    return byId.rows[0] || null;
  }
  const bySlug = await query(
    `SELECT id, name, year, slug, logo_key, is_active,
            viewer_enabled, viewer_access_key
     FROM tournaments
     WHERE lower(slug) = lower($1) AND is_active = TRUE
     LIMIT 1`,
    [value]
  );
  return bySlug.rows[0] || null;
}

async function resolveDivision(tournamentId, divisionKey) {
  const key = String(divisionKey || "").trim();
  const rows = await query(
    `SELECT id, code, name, sort_order
     FROM divisions
     WHERE tournament_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [tournamentId]
  );
  if (!rows.rows.length) return null;
  if (!key) return rows.rows[0];
  return (
    rows.rows.find((row) => row.code === key || String(row.id) === key) ||
    rows.rows[0]
  );
}

function publicMediaProxyUrl(objectKey) {
  const key = String(objectKey || "").trim().replace(/^\//, "");
  if (!key) return "";
  return `/api/v1/public/media?key=${encodeURIComponent(key)}`;
}

function mapPublicPartner(row) {
  if (!row) return null;
  const logoKey = row.logo_key || null;
  const videoKey = row.video_key || null;
  return {
    id: row.id,
    name: row.name || "",
    tier: String(row.tier || "partner").toLowerCase(),
    tagline: row.tagline || "",
    url: row.url || "",
    logo: logoKey ? publicUrlForKey(logoKey) || "" : "",
    // Same-origin proxy (Range/206) first, then public CDN URL.
    video: videoKey
      ? publicMediaProxyUrl(videoKey) || publicUrlForKey(videoKey) || ""
      : "",
    videoKey: videoKey || null,
    videoDirect: videoKey ? publicUrlForKey(videoKey) || "" : ""
  };
}

async function pipePublicMedia(req, res, objectKey) {
  const key = String(objectKey || "").trim().replace(/^\//, "");
  if (!key || !key.startsWith("org/")) {
    sendJson(res, 400, { error: "Invalid media key" });
    return;
  }
  // Only allow partner media through the public proxy.
  if (!key.includes("/partner-video/") && !key.includes("/partner-logo/")) {
    sendJson(res, 403, { error: "Media not publicly shareable" });
    return;
  }

  const publicUrl = publicUrlForKey(key);
  const range = String(req.headers.range || "").trim() || undefined;

  // Prefer reverse-proxying the public R2 URL so mobile gets correct 206 Range responses
  // on a same-origin path (more reliable than raw S3 GetObject through some edges).
  if (publicUrl) {
    try {
      const upstreamHeaders = {};
      if (range) upstreamHeaders.Range = range;
      const upstream = await fetch(publicUrl, { headers: upstreamHeaders });
      if (!(upstream.ok || upstream.status === 206)) {
        sendJson(res, upstream.status || 404, { error: "Media not found" });
        return;
      }
      const headers = {
        "Content-Type": upstream.headers.get("content-type") || "video/mp4",
        "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*"
      };
      const contentLength = upstream.headers.get("content-length");
      const contentRange = upstream.headers.get("content-range");
      if (contentLength) headers["Content-Length"] = contentLength;
      if (contentRange) headers["Content-Range"] = contentRange;
      res.writeHead(upstream.status, headers);
      const body = upstream.body;
      if (!body) {
        res.end();
        return;
      }
      if (typeof body.getReader === "function" && Readable.fromWeb) {
        Readable.fromWeb(body).pipe(res);
        return;
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.end(buffer);
      return;
    } catch (error) {
      console.warn("public media proxy fetch failed:", error.message || error);
      // fall through to S3/worker stream
    }
  }

  try {
    const object = await getObjectStream(key, { range });
    const headers = {
      "Content-Type": object.contentType || "application/octet-stream",
      "Accept-Ranges": object.acceptRanges || "bytes",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*"
    };
    if (object.contentLength) headers["Content-Length"] = object.contentLength;
    if (object.contentRange) headers["Content-Range"] = object.contentRange;
    res.writeHead(object.statusCode || (range ? 206 : 200), headers);

    const body = object.body;
    if (!body) {
      res.end();
      return;
    }
    if (typeof body.pipe === "function") {
      body.pipe(res);
      return;
    }
    if (typeof body.getReader === "function" && Readable.fromWeb) {
      Readable.fromWeb(body).pipe(res);
      return;
    }
    if (typeof body.transformToByteArray === "function") {
      const bytes = await body.transformToByteArray();
      res.end(Buffer.from(bytes));
      return;
    }
    const buffer = Buffer.from(await body.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, Number(error.statusCode) || 404, {
        error: error.message || "Media not found"
      });
    } else {
      res.destroy(error);
    }
  }
}

function buildViewerPayload({
  tournament,
  division,
  sessionRow,
  playersRows,
  teamsRows,
  partnersRows
}) {
  const { state } = unwrapAuction(sessionRow?.snapshot);
  const revision = Number(sessionRow?.revision) || 0;
  const status = sessionRow?.status || "idle";

  const logoByKey = new Map();
  (teamsRows || []).forEach((row) => {
    if (row.logo_key) {
      logoByKey.set(String(row.team_key), publicUrlForKey(row.logo_key) || "");
    }
  });

  const auctionTeams = Array.isArray(state?.teams) ? state.teams : [];
  // Prefer auction snapshot teams; fall back to DB team list for empty auctions.
  const teamsSource =
    auctionTeams.length > 0
      ? auctionTeams
      : (teamsRows || []).map((row) => ({
          team_id: row.team_key,
          team_name: row.team_name,
          color: row.color,
          logo: row.logo_key ? publicUrlForKey(row.logo_key) : "",
          remaining_budget: 0,
          total_cost: 0,
          player_bought: 0,
          players: []
        }));

  const fromDb = (playersRows || []).map((row) => ({
    id: row.external_id || row.code || row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    role: row.role,
    photo: row.photo_key ? publicUrlForKey(row.photo_key) : "",
    status: row.status || "not-auctioned",
    currentClub: row.fields?.currentClub || "",
    battingStyle: row.fields?.battingStyle || "",
    bowlingStyle: row.fields?.bowlingStyle || "",
    finalPrice: row.final_price,
    team: row.team_id,
    preAssignRole: row.fields?.preAssignRole || ""
  }));
  const fromState =
    Array.isArray(state?.allPlayers) && state.allPlayers.length
      ? state.allPlayers.map((player) => enrichPhoto({ ...player }, playersRows))
      : [];
  const master = fromState.length ? fromState : fromDb;

  const auctionCount = Math.max(0, Number(state?.auctionCount) || 0);
  const queue = Array.isArray(state?.players) ? state.players : [];
  const current = queue[auctionCount] || null;
  if (current) enrichPhoto(current, playersRows);

  const bids = Array.isArray(current?.bids) ? current.bids : [];
  const lastBid = bids.length ? bids[bids.length - 1] : null;
  const leading = lastBid != null ? findTeam(teamsSource, lastBid.team) : null;
  const playerStatus = String(current?.status || "").toLowerCase();
  const isSold = playerStatus === "sold";
  const soldRef =
    isSold && current?.team != null && current.team !== ""
      ? current.team
      : isSold && lastBid
        ? lastBid.team
        : null;
  const soldTeam = soldRef != null ? findTeam(teamsSource, soldRef) : null;

  const teams = teamsSource.map((team) => {
    const logo = teamLogo(team, logoByKey);
    const squad = (team.players || [])
      .map((id) => findPlayer(master, id))
      .filter(Boolean)
      .map((player) => mapPlayer(enrichPhoto(player, playersRows)));
    return {
      teamId: team.team_id,
      teamName: team.team_name || "Team",
      color: team.color || "#16325c",
      logo,
      playerBought: Number(team.player_bought) || squad.length,
      totalCost: Number(team.total_cost) || 0,
      purse: Number(team.remaining_budget) || 0,
      squad
    };
  });

  const soldPlayers = master
    .filter((player) => String(player.status || "").toLowerCase() === "sold")
    .map((player) => {
      const mapped = mapPlayer(enrichPhoto(player, playersRows));
      const team = findTeam(teamsSource, player.team);
      return {
        ...mapped,
        teamName: team?.team_name || null,
        teamLogo: team ? teamLogo(team, logoByKey) : "",
        teamColor: team?.color || ""
      };
    });

  const partners = (partnersRows || [])
    .map(mapPublicPartner)
    .filter(Boolean)
    .sort((a, b) => {
      const rank = { title: 0, presented: 1, partner: 2 };
      return (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9);
    });
  const titleSponsors = partners.filter((partner) => partner.tier === "title");
  const featuredSponsors =
    titleSponsors.length > 0
      ? titleSponsors
      : partners.filter((partner) => partner.video || partner.logo).slice(0, 3);

  return {
    revision,
    status,
    tournament: {
      id: tournament.id,
      name: tournament.name,
      year: tournament.year || "",
      slug: tournament.slug,
      logo: tournament.logo_key ? publicUrlForKey(tournament.logo_key) || "" : ""
    },
    division: {
      id: division.code,
      name: division.name
    },
    currentPlayer: current
      ? {
          ...mapPlayer(current),
          currentBid: lastBid
            ? Number(lastBid.amount) || 0
            : Number(current.finalPrice) || Number(current.basePrice) || 0,
          leadingTeamId: leading ? leading.team_id : null,
          leadingTeamName: leading?.team_name || null,
          leadingTeamLogo: leading ? teamLogo(leading, logoByKey) : "",
          leadingTeamColor: leading?.color || "",
          soldTeamId: soldTeam ? soldTeam.team_id : soldRef,
          soldTeamName: soldTeam?.team_name || null,
          soldTeamLogo: soldTeam ? teamLogo(soldTeam, logoByKey) : "",
          soldTeamColor: soldTeam?.color || "",
          settled: ["sold", "unsold", "skipped"].includes(playerStatus)
        }
      : null,
    teams,
    soldCount: soldPlayers.length,
    recentSold: soldPlayers.slice(-8).reverse(),
    partners,
    titleSponsors: featuredSponsors,
    viewerCount: 0
  };
}

const VIEWER_TTL_SECONDS = 45;

async function touchViewerPresence({
  viewerKey,
  tournamentId,
  divisionId,
  userAgent
}) {
  const key = String(viewerKey || "").trim().slice(0, 80);
  if (!key) return;
  await query(
    `INSERT INTO viewer_presence (viewer_key, tournament_id, division_id, user_agent, last_seen_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (viewer_key) DO UPDATE SET
       tournament_id = EXCLUDED.tournament_id,
       division_id = EXCLUDED.division_id,
       user_agent = EXCLUDED.user_agent,
       last_seen_at = NOW()`,
    [key, tournamentId, divisionId, String(userAgent || "").slice(0, 240)]
  );
}

async function countLiveViewers(divisionId) {
  await query(
    `DELETE FROM viewer_presence
     WHERE last_seen_at < NOW() - make_interval(secs => $1)`,
    [VIEWER_TTL_SECONDS]
  ).catch(() => {});
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM viewer_presence
     WHERE division_id = $1
       AND last_seen_at > NOW() - make_interval(secs => $2)`,
    [divisionId, VIEWER_TTL_SECONDS]
  );
  return Number(result.rows[0]?.count) || 0;
}

async function handleViewerRoutes(req, res, url) {
  if (url.pathname === "/api/v1/public/media" && req.method === "GET") {
    const keyParam = String(url.searchParams.get("key") || "").trim();
    const fromUrl = keyFromPublicUrl(String(url.searchParams.get("url") || "").trim());
    await pipePublicMedia(req, res, keyParam || fromUrl || "");
    return true;
  }

  if (url.pathname === "/api/v1/public/media" && req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Range",
      "Access-Control-Max-Age": "86400"
    });
    res.end();
    return true;
  }

  if (url.pathname === "/api/v1/public/live" && req.method === "GET") {
    const tournamentRef = String(
      url.searchParams.get("tournament") ||
        url.searchParams.get("t") ||
        url.searchParams.get("slug") ||
        ""
    ).trim();
    const divisionKey = String(
      url.searchParams.get("division") || url.searchParams.get("div") || ""
    ).trim();
    const viewerKey = String(
      url.searchParams.get("viewerKey") || url.searchParams.get("vk") || ""
    ).trim();
    const accessKey = String(
      url.searchParams.get("k") ||
        url.searchParams.get("key") ||
        url.searchParams.get("access") ||
        ""
    ).trim();

    if (!tournamentRef) {
      sendJson(res, 400, { error: "Tournament slug or id is required (?t=slug)." });
      return true;
    }

    const tournament = await resolveTournament(tournamentRef);
    if (!tournament || tournament.is_active === false) {
      sendJson(res, 404, { error: "Tournament not found." });
      return true;
    }
    if (tournament.viewer_enabled === false) {
      sendJson(res, 403, {
        error: "Public viewer link is disabled. Ask the organizer for a new link."
      });
      return true;
    }
    const expectedKey = String(tournament.viewer_access_key || "").trim();
    if (expectedKey && accessKey !== expectedKey) {
      sendJson(res, 403, {
        error: "This viewer link is invalid or was revoked. Ask for a fresh link."
      });
      return true;
    }

    const division = await resolveDivision(tournament.id, divisionKey);
    if (!division) {
      sendJson(res, 404, { error: "Division not found." });
      return true;
    }

    if (viewerKey) {
      await touchViewerPresence({
        viewerKey,
        tournamentId: tournament.id,
        divisionId: division.id,
        userAgent: req.headers["user-agent"]
      }).catch((error) => {
        console.warn("viewer presence:", error.message || error);
      });
    }

    const [session, players, teams, partners, viewerCount] = await Promise.all([
      query(
        `SELECT snapshot, status, revision, updated_at
         FROM auction_sessions
         WHERE division_id = $1
         LIMIT 1`,
        [division.id]
      ),
      query(
        `SELECT * FROM players WHERE division_id = $1 ORDER BY created_at ASC`,
        [division.id]
      ),
      query(
        `SELECT team_key, team_name, color, logo_key
         FROM teams
         WHERE division_id = $1
         ORDER BY team_key ASC`,
        [division.id]
      ),
      query(
        `SELECT id, name, tier, tagline, url, logo_key, video_key, sort_order, highlight
         FROM partners
         WHERE tournament_id = $1
         ORDER BY sort_order ASC, created_at ASC`,
        [tournament.id]
      ),
      countLiveViewers(division.id).catch(() => 0)
    ]);

    const payload = buildViewerPayload({
      tournament,
      division,
      sessionRow: session.rows[0] || null,
      playersRows: players.rows,
      teamsRows: teams.rows,
      partnersRows: partners.rows
    });
    payload.viewerCount = viewerCount;

    sendJson(res, 200, payload);
    return true;
  }

  return false;
}

module.exports = { handleViewerRoutes };
