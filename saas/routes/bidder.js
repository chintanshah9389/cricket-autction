const { query, withClient } = require("../db/pool");
const { sendJson, readJson } = require("../lib/http");
const { publicUrlForKey } = require("../lib/r2");
const {
  hashPin,
  verifyPin,
  signBidderToken,
  authenticateBidderRequest
} = require("../lib/bidder-auth");

function unwrapAuction(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return { wrapper: null, state: null };
  }
  if (snapshot.auctionState && typeof snapshot.auctionState === "object") {
    return { wrapper: snapshot, state: snapshot.auctionState };
  }
  return { wrapper: { auctionState: snapshot }, state: snapshot };
}

function bidIncrement(currentBid) {
  const value = Number(currentBid) || 0;
  if (value >= 10000000) return 500000;
  if (value >= 5000000) return 200000;
  if (value >= 1000000) return 100000;
  return 50000;
}

function normalizeCategory(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function findPlayer(list, id) {
  if (id == null || id === "") return null;
  const needle = String(id);
  return (
    (list || []).find(
      (player) =>
        player &&
        (String(player.id) === needle ||
          String(player.code || "").toLowerCase() === needle.toLowerCase())
    ) || null
  );
}

function countTeamCategory(state, teamId, categoryName) {
  const name = normalizeCategory(categoryName);
  const team = (state.teams || []).find((entry) => Number(entry.team_id) === Number(teamId));
  if (!team) return 0;
  const master = state.allPlayers || state.players || [];
  let count = 0;
  const seen = new Set();
  (team.players || []).forEach((playerId) => {
    const player = findPlayer(master, playerId);
    if (!player) return;
    if (normalizeCategory(player.category) !== name) return;
    const key = String(player.id ?? player.code ?? "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    count += 1;
  });
  return count;
}

function getCategoryMax(state, categoryName) {
  const name = normalizeCategory(categoryName);
  const config = state.config || {};
  const divisions = Array.isArray(config.divisions) ? config.divisions : [];
  const active =
    divisions.find((division) => division.id === state.divisionId) ||
    divisions.find((division) => division.id === config.activeDivisionId) ||
    divisions[0] ||
    config;
  const categories = active?.categories || config.categories || {};
  const meta = categories[name] || categories[categoryName] || {};
  return Number(meta.maxPlayers) || 0;
}

function getCategoryBase(state, categoryName) {
  const name = normalizeCategory(categoryName);
  const config = state.config || {};
  const divisions = Array.isArray(config.divisions) ? config.divisions : [];
  const active =
    divisions.find((division) => division.id === state.divisionId) ||
    divisions.find((division) => division.id === config.activeDivisionId) ||
    divisions[0] ||
    config;
  const categories = active?.categories || config.categories || {};
  const meta = categories[name] || categories[categoryName] || {};
  return Number(meta.basePrice) || 0;
}

function getCategorySequence(state) {
  const config = state.config || {};
  const divisions = Array.isArray(config.divisions) ? config.divisions : [];
  const active =
    divisions.find((division) => division.id === state.divisionId) ||
    divisions.find((division) => division.id === config.activeDivisionId) ||
    divisions[0] ||
    config;
  const sequence = Array.isArray(active?.categorySequence)
    ? active.categorySequence
    : Array.isArray(config.categorySequence)
      ? config.categorySequence
      : [];
  if (sequence.length) return sequence.map(normalizeCategory);
  return Object.keys(active?.categories || config.categories || {}).map(normalizeCategory);
}

function getSpendable(state, teamId, fillingCategory) {
  const team = (state.teams || []).find((entry) => Number(entry.team_id) === Number(teamId));
  const purse = Number(team?.remaining_budget) || 0;
  const filling = fillingCategory ? normalizeCategory(fillingCategory) : null;
  let reserve = 0;
  let remainingSlots = 0;
  getCategorySequence(state).forEach((name) => {
    const maxPlayers = getCategoryMax(state, name);
    if (maxPlayers <= 0) return;
    const owned = countTeamCategory(state, teamId, name);
    let need = Math.max(0, maxPlayers - owned);
    if (filling && name === filling) need = Math.max(0, need - 1);
    const basePrice = getCategoryBase(state, name);
    reserve += need * basePrice;
    remainingSlots += need;
  });
  return {
    purse,
    reserve,
    spendable: Math.max(0, purse - reserve),
    remainingSlots
  };
}

function mapPublicPlayer(player) {
  if (!player) return null;
  return {
    id: player.id,
    code: player.code || "",
    name: player.name || "",
    photo: player.photo || "",
    category: player.category || "",
    role: player.role || "",
    battingStyle: player.battingStyle || "",
    bowlingStyle: player.bowlingStyle || "",
    currentClub: player.currentClub || "",
    mobile: player.mobile || "",
    basePrice: Number(player.basePrice) || 0,
    status: player.status || "not-auctioned",
    finalPrice: player.finalPrice == null ? null : Number(player.finalPrice),
    team: player.team == null ? null : player.team
  };
}

function buildLivePayload(auth, snapshotRow, playersRows) {
  const revision = Number(snapshotRow?.revision) || 0;
  const status = snapshotRow?.status || "idle";
  const { state } = unwrapAuction(snapshotRow?.snapshot);
  const teamId = Number(auth.teamId);
  const team =
    (state?.teams || []).find((entry) => Number(entry.team_id) === teamId) || {
      team_id: teamId,
      team_name: auth.teamName,
      remaining_budget: 0,
      total_cost: 0,
      player_bought: 0,
      players: []
    };

  const auctionCount = Math.max(0, Number(state?.auctionCount) || 0);
  const queue = Array.isArray(state?.players) ? state.players : [];
  const current = queue[auctionCount] || null;
  const bids = Array.isArray(current?.bids) ? current.bids : [];
  const lastBid = bids.length ? bids[bids.length - 1] : null;
  const currentAmount = lastBid ? Number(lastBid.amount) || 0 : Number(current?.basePrice) || 0;
  const nextStep = current
    ? bids.length
      ? bidIncrement(currentAmount)
      : Math.max(0, Number(current.basePrice) || 0)
    : 0;
  const nextAmount = current
    ? bids.length
      ? currentAmount + nextStep
      : Math.max(0, Number(current.basePrice) || 0)
    : 0;

  const leadingTeam =
    lastBid != null
      ? (state.teams || []).find((entry) => Number(entry.team_id) === Number(lastBid.team))
      : null;

  const budget = getSpendable(state || { teams: [team] }, teamId, current?.category);
  const categoryName = normalizeCategory(current?.category);
  const owned = current ? countTeamCategory(state || { teams: [team] }, teamId, categoryName) : 0;
  const maxPlayers = current ? getCategoryMax(state || {}, categoryName) : 0;
  const quotaFull = maxPlayers > 0 && owned >= maxPlayers;
  const ownLead = lastBid != null && Number(lastBid.team) === teamId;
  const settled = ["sold", "unsold", "skipped"].includes(
    String(current?.status || "").toLowerCase()
  );
  const canBid =
    Boolean(current) &&
    !settled &&
    !ownLead &&
    !quotaFull &&
    nextAmount > 0 &&
    nextAmount <= budget.spendable;

  const master =
    (Array.isArray(state?.allPlayers) && state.allPlayers.length
      ? state.allPlayers
      : null) ||
    (playersRows || []).map((row) => ({
      id: row.external_id || row.code || row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      role: row.role,
      photo: row.photo_key ? publicUrlForKey(row.photo_key) : "",
      status: row.status || "not-auctioned",
      currentClub: row.fields?.currentClub || "",
      mobile: row.fields?.mobile || "",
      battingStyle: row.fields?.battingStyle || "",
      bowlingStyle: row.fields?.bowlingStyle || "",
      finalPrice: row.final_price,
      team: row.team_id
    })) ||
    [];

  const byCategory = {};
  master.forEach((player) => {
    const cat = normalizeCategory(player.category) || "OTHER";
    if (!byCategory[cat]) byCategory[cat] = [];
    const onSquad = (team.players || []).some(
      (id) => String(id) === String(player.id) || String(id) === String(player.code)
    );
    byCategory[cat].push({
      ...mapPublicPlayer(player),
      onSquad,
      status: onSquad ? "sold" : player.status || "not-auctioned"
    });
  });

  const squad = (team.players || [])
    .map((id) => findPlayer(master, id))
    .filter(Boolean)
    .map(mapPublicPlayer);

  return {
    revision,
    status,
    team: {
      teamId,
      teamName: team.team_name || auth.teamName,
      color: team.color || "#3498db",
      logo: team.logo || "",
      purse: budget.purse,
      reserved: budget.reserve,
      spendable: budget.spendable,
      pending: budget.remainingSlots,
      slotsLeft: Math.max(
        0,
        (Number(team.team_budget) || budget.purse + (Number(team.total_cost) || 0)) > 0
          ? Math.max(0, 15 - (Number(team.player_bought) || (team.players || []).length))
          : Math.max(0, 15 - (team.players || []).length)
      ),
      playerBought: Number(team.player_bought) || (team.players || []).length,
      totalCost: Number(team.total_cost) || 0
    },
    currentPlayer: current
      ? {
          ...mapPublicPlayer(current),
          currentBid: lastBid ? Number(lastBid.amount) || 0 : 0,
          leadingTeamId: lastBid ? Number(lastBid.team) : null,
          leadingTeamName: leadingTeam?.team_name || null,
          nextStep,
          nextAmount,
          canBid,
          ownLead,
          quotaFull,
          settled
        }
      : null,
    categories: byCategory,
    squad,
    divisionId: auth.divisionCode || auth.divisionId,
    divisionName: state?.divisionName || ""
  };
}

async function loadSessionForAuth(auth) {
  const session = await query(
    `SELECT s.*, d.code AS division_code, d.name AS division_name, d.id AS division_db_id
     FROM auction_sessions s
     JOIN divisions d ON d.id = s.division_id
     WHERE s.division_id = $1
     LIMIT 1`,
    [auth.divisionId]
  );
  const players = await query(
    `SELECT * FROM players WHERE division_id = $1 ORDER BY created_at ASC`,
    [auth.divisionId]
  );
  return { session: session.rows[0] || null, players: players.rows };
}

async function handleBidderRoutes(req, res, url) {
  if (url.pathname === "/api/v1/bidder/login" && req.method === "POST") {
    const body = await readJson(req);
    const code = String(body.code || body.bidderCode || "").trim();
    const pin = String(body.pin || body.bidderPin || "").trim();
    const divisionKey = String(body.divisionId || body.division || "").trim();
    const tournamentRef = String(body.tournamentId || body.tournament || body.slug || "").trim();

    if (!code || !pin) {
      sendJson(res, 400, { error: "Team code and PIN are required." });
      return true;
    }

    let tournamentId = tournamentRef;
    if (tournamentRef && !/^[0-9a-f-]{36}$/i.test(tournamentRef)) {
      const bySlug = await query(
        `SELECT id FROM tournaments WHERE lower(slug) = lower($1) AND is_active = TRUE LIMIT 1`,
        [tournamentRef]
      );
      tournamentId = bySlug.rows[0]?.id || null;
    }
    if (!tournamentId) {
      // Fall back: find by bidder code alone if unique enough with division
      tournamentId = null;
    }

    const teamResult = await query(
      `SELECT t.*, d.id AS division_db_id, d.code AS division_code, d.name AS division_name,
              d.tournament_id, tn.name AS tournament_name, tn.slug AS tournament_slug
       FROM teams t
       JOIN divisions d ON d.id = t.division_id
       JOIN tournaments tn ON tn.id = d.tournament_id
       WHERE t.bidder_enabled = TRUE
         AND t.bidder_code IS NOT NULL
         AND lower(t.bidder_code) = lower($1)
         AND ($2::uuid IS NULL OR d.tournament_id = $2::uuid)
         AND ($3::text = '' OR d.code = $3 OR d.id::text = $3)
       LIMIT 1`,
      [code, tournamentId, divisionKey]
    );
    const team = teamResult.rows[0];
    if (!team) {
      sendJson(res, 401, { error: "Invalid team code or PIN." });
      return true;
    }
    const ok = await verifyPin(pin, team.bidder_pin_hash);
    if (!ok) {
      sendJson(res, 401, { error: "Invalid team code or PIN." });
      return true;
    }

    const token = signBidderToken({
      tournamentId: team.tournament_id,
      divisionId: team.division_db_id,
      divisionCode: team.division_code,
      teamId: team.team_key,
      teamName: team.team_name
    });

    sendJson(res, 200, {
      token,
      team: {
        teamId: team.team_key,
        teamName: team.team_name,
        color: team.color,
        logo: team.logo_key ? publicUrlForKey(team.logo_key) : ""
      },
      division: {
        id: team.division_code,
        dbId: team.division_db_id,
        name: team.division_name
      },
      tournament: {
        id: team.tournament_id,
        name: team.tournament_name,
        slug: team.tournament_slug
      }
    });
    return true;
  }

  if (url.pathname === "/api/v1/bidder/live" && req.method === "GET") {
    const auth = authenticateBidderRequest(req);
    if (!auth) {
      sendJson(res, 401, { error: "Bidder login required." });
      return true;
    }
    const { session, players } = await loadSessionForAuth(auth);
    sendJson(res, 200, buildLivePayload(auth, session, players));
    return true;
  }

  if (url.pathname === "/api/v1/bidder/bid" && req.method === "POST") {
    const auth = authenticateBidderRequest(req);
    if (!auth) {
      sendJson(res, 401, { error: "Bidder login required." });
      return true;
    }
    const body = await readJson(req);
    const expectedRevision = Number(body.expectedRevision);
    const teamId = Number(auth.teamId);

    try {
      const result = await withClient(async (client) => {
        await client.query("BEGIN");
        const locked = await client.query(
          `SELECT * FROM auction_sessions WHERE division_id = $1 FOR UPDATE`,
          [auth.divisionId]
        );
        const row = locked.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return { status: 409, body: { error: "Auction has not started." } };
        }
        const currentRev = Number(row.revision) || 0;
        if (Number.isFinite(expectedRevision) && expectedRevision !== currentRev) {
          await client.query("ROLLBACK");
          return {
            status: 409,
            body: { error: "Auction updated. Refresh and try again.", revision: currentRev }
          };
        }

        const { wrapper, state } = unwrapAuction(row.snapshot);
        if (!state || !Array.isArray(state.players) || !state.players.length) {
          await client.query("ROLLBACK");
          return { status: 409, body: { error: "No live player to bid on." } };
        }

        const idx = Math.max(0, Number(state.auctionCount) || 0);
        const player = state.players[idx];
        if (!player) {
          await client.query("ROLLBACK");
          return { status: 409, body: { error: "No live player to bid on." } };
        }
        const status = String(player.status || "not-auctioned").toLowerCase();
        if (status === "sold" || status === "unsold" || status === "skipped") {
          await client.query("ROLLBACK");
          return { status: 409, body: { error: "Player is already settled." } };
        }

        if (!Array.isArray(player.bids)) player.bids = [];
        const lastBid = player.bids.length ? player.bids[player.bids.length - 1] : null;
        if (lastBid && Number(lastBid.team) === teamId) {
          await client.query("ROLLBACK");
          return { status: 409, body: { error: "Your team already has the current bid." } };
        }

        const maxPlayers = getCategoryMax(state, player.category);
        const owned = countTeamCategory(state, teamId, player.category);
        if (maxPlayers > 0 && owned >= maxPlayers) {
          await client.query("ROLLBACK");
          return {
            status: 409,
            body: { error: `Category full (${owned}/${maxPlayers}).` }
          };
        }

        let amount;
        if (player.bids.length === 0) {
          amount = Math.max(0, Number(player.basePrice) || 0);
        } else {
          const currentAmount = Number(lastBid.amount) || 0;
          amount = currentAmount + bidIncrement(currentAmount);
        }
        if (body.amount != null && body.amount !== "") {
          const requested = Number(body.amount);
          if (Number.isFinite(requested) && requested >= amount) amount = requested;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          await client.query("ROLLBACK");
          return { status: 400, body: { error: "Invalid bid amount." } };
        }

        const afford = getSpendable(state, teamId, player.category);
        if (amount > afford.spendable) {
          await client.query("ROLLBACK");
          return {
            status: 409,
            body: {
              error: `Cannot bid that amount. Spendable ${afford.spendable}.`,
              spendable: afford.spendable,
              reserve: afford.reserve,
              purse: afford.purse
            }
          };
        }

        player.bids.push({ team: teamId, amount });
        // Mirror onto allPlayers copy when present
        if (Array.isArray(state.allPlayers)) {
          const master = findPlayer(state.allPlayers, player.id) || findPlayer(state.allPlayers, player.code);
          if (master) master.bids = player.bids.slice();
        }

        const nextWrapper = {
          ...(wrapper || {}),
          auctionState: state,
          savedAt: new Date().toISOString()
        };

        const updated = await client.query(
          `UPDATE auction_sessions
           SET snapshot = $2::jsonb,
               status = CASE WHEN status = 'idle' THEN 'live' ELSE status END,
               revision = revision + 1,
               updated_at = NOW()
           WHERE division_id = $1
           RETURNING snapshot, status, revision`,
          [auth.divisionId, JSON.stringify(nextWrapper)]
        );

        await client.query(
          `INSERT INTO auction_events (session_id, seq, event_type, payload, client_mutation_id)
           VALUES (
             $1,
             COALESCE((SELECT MAX(seq) FROM auction_events WHERE session_id = $1), 0) + 1,
             'bidder_bid',
             $2::jsonb,
             $3
           )`,
          [
            row.id,
            JSON.stringify({
              teamId,
              amount,
              playerId: player.id,
              playerName: player.name
            }),
            body.clientMutationId || null
          ]
        ).catch(() => {
          // Events are best-effort; do not fail the bid if insert has issues
        });

        await client.query("COMMIT");
        return {
          status: 200,
          body: {
            ok: true,
            revision: Number(updated.rows[0].revision) || currentRev + 1,
            amount,
            teamId
          },
          snapshotRow: updated.rows[0]
        };
      });

      if (result.status !== 200) {
        sendJson(res, result.status, result.body);
        return true;
      }

      const players = await query(
        `SELECT * FROM players WHERE division_id = $1 ORDER BY created_at ASC`,
        [auth.divisionId]
      );
      const live = buildLivePayload(
        auth,
        {
          ...(result.snapshotRow || {}),
          revision: result.body.revision,
          snapshot: result.snapshotRow?.snapshot
        },
        players.rows
      );
      sendJson(res, 200, { ...result.body, live });
      return true;
    } catch (error) {
      console.error("bidder bid:", error);
      sendJson(res, 500, { error: error.message || "Bid failed." });
      return true;
    }
  }

  return false;
}

module.exports = { handleBidderRoutes, bidIncrement, unwrapAuction };
