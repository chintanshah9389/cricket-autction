const { query, withClient } = require("../db/pool");
const { sendJson, readJson } = require("../lib/http");
const { publicUrlForKey } = require("../lib/r2");
const {
  hashPin,
  verifyPin,
  signBidderToken,
  authenticateBidderRequest,
  clampMaxBidderDevices,
  ttlToMs,
  bidderTokenTtl
} = require("../lib/bidder-auth");

async function requireActiveBidder(req, res) {
  const auth = authenticateBidderRequest(req);
  if (!auth) {
    sendJson(res, 401, { error: "Bidder login required." });
    return null;
  }
  const session = await query(
    `SELECT id FROM bidder_sessions
     WHERE id = $1::uuid
       AND expires_at > NOW()
     LIMIT 1`,
    [auth.sid]
  );
  if (!session.rows[0]) {
    sendJson(res, 401, { error: "Session expired or signed out on another device. Log in again." });
    return null;
  }
  query(
    `UPDATE bidder_sessions SET last_seen_at = NOW() WHERE id = $1::uuid`,
    [auth.sid]
  ).catch(() => {});
  return auth;
}

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
  const key = String(name || "")
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (key.includes("RISING")) return "RISING STAR";
  if (key.includes("KEY") && key.includes("PLAYER")) return "KEY PLAYERS";
  if (key.includes("EVER") && key.includes("GREEN")) return "EVERGREEN";
  return key;
}

function displayCategory(name) {
  const normalized = normalizeCategory(name);
  if (normalized === "KEY PLAYERS") return "KEY PLAYER";
  if (!normalized) return "this category";
  return normalized
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function getActiveDivisionConfig(state) {
  const config = state?.config || {};
  const divisions = Array.isArray(config.divisions) ? config.divisions : [];
  return (
    divisions.find((division) => division.id === state?.divisionId) ||
    divisions.find((division) => division.id === config.activeDivisionId) ||
    divisions[0] ||
    config
  );
}

function findCategoryMeta(state, categoryName) {
  const name = normalizeCategory(categoryName);
  const active = getActiveDivisionConfig(state);
  const categories = active?.categories || state?.config?.categories || {};
  if (categories[name]) return { name, ...(categories[name] || {}) };
  if (categoryName && categories[categoryName]) {
    return { name, ...(categories[categoryName] || {}) };
  }
  const matchedKey = Object.keys(categories).find(
    (key) => normalizeCategory(key) === name
  );
  if (matchedKey) return { name, ...(categories[matchedKey] || {}) };
  return { name, basePrice: 0, maxPlayers: 0 };
}

function findPlayer(list, id) {
  if (id == null || id === "") return null;
  const needle = String(id).trim();
  if (!needle) return null;
  const needleNum = Number(needle);
  const needleIsNumeric = Number.isFinite(needleNum) && /^\d+$/.test(needle);
  return (
    (list || []).find((player) => {
      if (!player) return false;
      if (String(player.id) === needle || String(player.code || "") === needle) return true;
      if (String(player.code || "").toLowerCase() === needle.toLowerCase()) return true;
      if (
        needleIsNumeric &&
        Number.isFinite(Number(player.id)) &&
        Number(player.id) === needleNum
      ) {
        return true;
      }
      return false;
    }) || null
  );
}

function isIconCaptionPlayer(player) {
  const role = String(player?.preAssignRole || "").toLowerCase();
  return role === "icon" || role === "caption";
}

function countTeamCategory(state, teamId, categoryName) {
  const name = normalizeCategory(categoryName);
  const team = (state.teams || []).find((entry) => Number(entry.team_id) === Number(teamId));
  if (!team) return 0;
  const active = getActiveDivisionConfig(state);
  const iconCaption = active?.iconCaption && typeof active.iconCaption === "object"
    ? active.iconCaption
    : {};
  const countPreAssign = iconCaption.countTowardCategoryQuota !== false;
  const master = state.allPlayers || state.players || [];
  const seen = new Set();
  let count = 0;

  const consider = (player) => {
    if (!player) return;
    if (!countPreAssign && isIconCaptionPlayer(player)) return;
    if (normalizeCategory(player.category) !== name) return;
    const key = String(player.id ?? player.code ?? "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    count += 1;
  };

  (team.players || []).forEach((playerId) => consider(findPlayer(master, playerId)));
  if (countPreAssign) {
    consider(findPlayer(master, team.iconPlayerId));
    consider(findPlayer(master, team.captionPlayerId));
  }
  // Fallback: anyone marked sold to this team in the master list (covers id/code mismatch).
  master.forEach((player) => {
    if (!player) return;
    if (Number(player.team) !== Number(teamId)) return;
    const status = String(player.status || "").toLowerCase();
    if (status && status !== "sold") return;
    consider(player);
  });
  return count;
}

function getCategoryMax(state, categoryName) {
  return Number(findCategoryMeta(state, categoryName).maxPlayers) || 0;
}

function getCategoryBase(state, categoryName) {
  return Number(findCategoryMeta(state, categoryName).basePrice) || 0;
}

function getCategorySequence(state) {
  const active = getActiveDivisionConfig(state);
  const sequence = Array.isArray(active?.categorySequence)
    ? active.categorySequence
    : Array.isArray(state?.config?.categorySequence)
      ? state.config.categorySequence
      : [];
  if (sequence.length) return sequence.map(normalizeCategory);
  return Object.keys(active?.categories || state?.config?.categories || {}).map(normalizeCategory);
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

function getSquadCapacity(state) {
  const active = getActiveDivisionConfig(state);
  const categories = active?.categories || state?.config?.categories || {};
  return Object.values(categories).reduce(
    (sum, category) => sum + (Number(category?.maxPlayers) || 0),
    0
  );
}

function formatRupeeShort(amount) {
  const value = Number(amount) || 0;
  if (value >= 10000000) {
    const cr = value / 10000000;
    return `${Number.isInteger(cr) ? cr : cr.toFixed(2)} Cr`;
  }
  if (value >= 100000) {
    const lakh = value / 100000;
    return `${Number.isInteger(lakh) ? lakh : lakh.toFixed(1)} L`;
  }
  if (value >= 1000) {
    const k = value / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(0)} K`;
  }
  return String(value);
}

function mapPublicPlayer(player) {
  if (!player) return null;
  const key = player.photoKey || player.photo_key || null;
  const photo =
    (key ? publicUrlForKey(key) : "") ||
    player.photo ||
    player.photoUrl ||
    "";
  return {
    id: player.id,
    code: player.code || "",
    name: player.name || "",
    photo,
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

function enrichPhotoFromRows(player, playersRows, masterList) {
  if (!player) return player;
  const row = (playersRows || []).find(
    (entry) =>
      String(entry.external_id || "") === String(player.id) ||
      String(entry.code || "") === String(player.code || "") ||
      String(entry.code || "") === String(player.id) ||
      String(entry.id) === String(player.id)
  );
  // Prefer current DB/R2 key over stale URLs baked into the live auction snapshot.
  if (row?.photo_key) {
    player.photo = publicUrlForKey(row.photo_key) || player.photo || "";
    player.photoKey = row.photo_key;
    return player;
  }
  if (player.photo) return player;
  const fromMaster = findPlayer(masterList, player.id) || findPlayer(masterList, player.code);
  if (fromMaster?.photo) {
    player.photo = fromMaster.photo;
    return player;
  }
  const fieldPhoto = row?.fields?.photo || "";
  if (fieldPhoto) player.photo = fieldPhoto;
  return player;
}

function buildLivePayload(auth, snapshotRow, playersRows, teamMetaByKey = new Map()) {
  const revision = Number(snapshotRow?.revision) || 0;
  const status = snapshotRow?.status || "idle";
  const { state } = unwrapAuction(snapshotRow?.snapshot);
  const teamId = Number(auth.teamId);
  const team =
    findAuctionTeam(state?.teams, teamId) || {
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

  const playerStatus = String(current?.status || "").toLowerCase();
  const isSold = playerStatus === "sold";
  const leadingVisual =
    lastBid != null
      ? resolveTeamVisual(lastBid.team, state?.teams || [], teamMetaByKey)
      : { teamId: null, teamName: null, teamLogo: "", teamColor: "" };
  const soldTeamRef = isSold
    ? current?.team != null && current.team !== ""
      ? current.team
      : lastBid?.team
    : null;
  const soldVisual = soldTeamRef != null
    ? resolveTeamVisual(soldTeamRef, state?.teams || [], teamMetaByKey)
    : { teamId: null, teamName: null, teamLogo: "", teamColor: "" };

  const liveState = state || { teams: [team], config: {} };
  const budget = getSpendable(liveState, teamId, current?.category);
  const categoryName = normalizeCategory(current?.category);
  const owned = current ? countTeamCategory(liveState, teamId, categoryName) : 0;
  const maxPlayers = current ? getCategoryMax(liveState, categoryName) : 0;
  const categoryPending = maxPlayers > 0 ? Math.max(0, maxPlayers - owned) : 0;
  const quotaFull = maxPlayers > 0 && owned >= maxPlayers;
  const ownLead = lastBid != null && Number(lastBid.team) === teamId;
  const settled = ["sold", "unsold", "skipped"].includes(playerStatus);
  const cannotAfford = nextAmount > 0 && nextAmount > budget.spendable;
  const canBid =
    Boolean(current) &&
    !settled &&
    !ownLead &&
    !quotaFull &&
    nextAmount > 0 &&
    !cannotAfford;
  let bidBlockReason = "";
  if (!current) {
    bidBlockReason = "Waiting for the auction desk to open a player.";
  } else if (settled) {
    if (isSold) {
      // Sold result is shown in the UI card — keep banner empty.
      bidBlockReason = "";
    } else {
      bidBlockReason = "This player is already settled.";
    }
  } else if (ownLead) {
    bidBlockReason = "Your team already has the current bid.";
  } else if (quotaFull) {
    const label = displayCategory(categoryName || current?.category);
    bidBlockReason = `${label} quota is fulfilled (${owned}/${maxPlayers}). You cannot bid on this category.`;
  } else if (cannotAfford) {
    bidBlockReason =
      `Cannot bid ${formatRupeeShort(nextAmount)}. ` +
      `Must keep ${formatRupeeShort(budget.reserve)} reserved for ${budget.remainingSlots} remaining category minimums. ` +
      `Spendable now: ${formatRupeeShort(budget.spendable)}.`;
  }
  const bought = Number(team.player_bought) || (team.players || []).length || 0;
  const capacity = getSquadCapacity(liveState);
  const slotsLeft = Math.max(0, capacity - bought);

  const fromDb = (playersRows || []).map((row) => ({
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
    team: row.team_id,
    preAssignRole: row.fields?.preAssignRole || ""
  }));
  const fromState =
    Array.isArray(state?.allPlayers) && state.allPlayers.length
      ? state.allPlayers.map((player) => enrichPhotoFromRows({ ...player }, playersRows, fromDb))
      : [];
  const master = fromState.length ? fromState : fromDb;
  if (current) enrichPhotoFromRows(current, playersRows, master);

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
    .map((player) => mapPublicPlayer(enrichPhotoFromRows(player, playersRows, master)));

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
      pending: categoryPending,
      slotsLeft,
      playerBought: bought,
      squadCapacity: capacity,
      totalCost: Number(team.total_cost) || 0,
      reserveSlots: budget.remainingSlots
    },
    currentPlayer: current
      ? {
          ...mapPublicPlayer(current),
          currentBid: lastBid
            ? Number(lastBid.amount) || 0
            : Number(current.finalPrice) || 0,
          leadingTeamId: leadingVisual.teamId,
          leadingTeamName: leadingVisual.teamName,
          leadingTeamLogo: leadingVisual.teamLogo,
          leadingTeamColor: leadingVisual.teamColor,
          soldTeamId: soldVisual.teamId,
          soldTeamName: soldVisual.teamName,
          soldTeamLogo: soldVisual.teamLogo,
          soldTeamColor: soldVisual.teamColor,
          nextStep,
          nextAmount,
          canBid,
          ownLead,
          quotaFull,
          cannotAfford,
          categoryOwned: owned,
          categoryMax: maxPlayers,
          settled,
          bidBlockReason
        }
      : null,
    bidBlockReason,
    categories: byCategory,
    squad,
    divisionId: auth.divisionCode || auth.divisionId,
    divisionName: state?.divisionName || ""
  };
}

async function loadDivisionRules(divisionId) {
  const result = await query(
    `SELECT id, code, name, categories, category_sequence, icon_caption
     FROM divisions
     WHERE id = $1
     LIMIT 1`,
    [divisionId]
  );
  return result.rows[0] || null;
}

function attachDivisionConfig(state, divisionRow) {
  if (!state || typeof state !== "object") return state;
  if (!divisionRow) return state;
  const categories =
    divisionRow.categories && typeof divisionRow.categories === "object"
      ? divisionRow.categories
      : {};
  const categorySequence = Array.isArray(divisionRow.category_sequence)
    ? divisionRow.category_sequence
    : [];
  const iconCaption =
    divisionRow.icon_caption && typeof divisionRow.icon_caption === "object"
      ? divisionRow.icon_caption
      : {};
  const divisionId = divisionRow.code || state.divisionId || "div_1";
  const existingConfig =
    state.config && typeof state.config === "object" ? state.config : {};
  const existingDivisions = Array.isArray(existingConfig.divisions)
    ? existingConfig.divisions
    : [];
  const divisionConfig = {
    id: divisionId,
    name: divisionRow.name || state.divisionName || "Division",
    categories,
    categorySequence,
    iconCaption
  };
  let divisions = existingDivisions.slice();
  const index = divisions.findIndex(
    (item) => item?.id === divisionId || item?.code === divisionId
  );
  if (index >= 0) {
    divisions[index] = {
      ...divisions[index],
      ...divisionConfig,
      categories:
        Object.keys(categories).length > 0
          ? categories
          : divisions[index].categories || {},
      categorySequence:
        categorySequence.length > 0
          ? categorySequence
          : divisions[index].categorySequence || [],
      iconCaption: {
        ...(divisions[index].iconCaption || {}),
        ...iconCaption
      }
    };
  } else {
    divisions = [divisionConfig, ...divisions];
  }
  state.config = {
    ...existingConfig,
    activeDivisionId: divisionId,
    divisions,
    // Flat fallbacks used by older helpers
    categories:
      Object.keys(categories).length > 0
        ? categories
        : existingConfig.categories || {},
    categorySequence:
      categorySequence.length > 0
        ? categorySequence
        : existingConfig.categorySequence || []
  };
  state.divisionId = divisionId;
  if (divisionRow.name) state.divisionName = divisionRow.name;
  return state;
}

function findAuctionTeam(teams, id) {
  if (id == null || id === "") return null;
  const needle = String(id).trim();
  if (!needle) return null;
  return (
    (teams || []).find((entry) => {
      if (!entry) return false;
      if (String(entry.team_id) === needle) return true;
      const asNum = Number(needle);
      return Number.isFinite(asNum) && Number(entry.team_id) === asNum;
    }) || null
  );
}

function resolveTeamPublicLogo(team, teamMetaByKey) {
  if (!team) return "";
  const direct = String(team.logo || "").trim();
  if (direct.startsWith("http") || direct.startsWith("data:") || direct.startsWith("/")) {
    return direct;
  }
  const key = String(team.logoKey || team.logo_key || "").trim();
  if (key) return publicUrlForKey(key) || "";
  const fromDb = teamMetaByKey?.get(String(team.team_id))?.logo;
  if (fromDb) return fromDb;
  if (direct) return direct;
  return "";
}

function resolveTeamVisual(teamOrId, teams, teamMetaByKey) {
  const team =
    teamOrId && typeof teamOrId === "object"
      ? teamOrId
      : findAuctionTeam(teams, teamOrId);
  const id = team?.team_id != null ? team.team_id : teamOrId;
  const meta = id != null ? teamMetaByKey?.get(String(id)) : null;
  const logo = resolveTeamPublicLogo(team || { team_id: id }, teamMetaByKey) || meta?.logo || "";
  return {
    teamId: id != null && id !== "" ? Number(id) || id : null,
    teamName: team?.team_name || meta?.name || null,
    teamLogo: logo,
    teamColor: team?.color || meta?.color || ""
  };
}

async function loadSessionForAuth(auth) {
  const session = await query(
    `SELECT s.*, d.code AS division_code, d.name AS division_name, d.id AS division_db_id,
            d.categories AS division_categories, d.category_sequence AS division_category_sequence,
            d.icon_caption AS division_icon_caption
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
  const teams = await query(
    `SELECT team_key, team_name, color, logo_key FROM teams WHERE division_id = $1`,
    [auth.divisionId]
  );
  const teamMetaByKey = new Map();
  (teams.rows || []).forEach((row) => {
    teamMetaByKey.set(String(row.team_key), {
      name: row.team_name || "",
      color: row.color || "",
      logo: row.logo_key ? publicUrlForKey(row.logo_key) || "" : ""
    });
  });
  const row = session.rows[0] || null;
  if (row) {
    const { state } = unwrapAuction(row.snapshot);
    if (state) {
      attachDivisionConfig(state, {
        code: row.division_code,
        name: row.division_name,
        categories: row.division_categories,
        category_sequence: row.division_category_sequence,
        icon_caption: row.division_icon_caption
      });
      (state.teams || []).forEach((team) => {
        const visual = resolveTeamVisual(team, state.teams, teamMetaByKey);
        if (visual.teamLogo) team.logo = visual.teamLogo;
        if (!team.color && visual.teamColor) team.color = visual.teamColor;
        if (!team.team_name && visual.teamName) team.team_name = visual.teamName;
      });
      const { wrapper } = unwrapAuction(row.snapshot);
      row.snapshot = {
        ...(wrapper || {}),
        auctionState: state
      };
    }
  }
  return { session: row, players: players.rows, teamMetaByKey };
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
              d.tournament_id, tn.name AS tournament_name, tn.slug AS tournament_slug,
              tn.max_bidder_devices
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

    const maxDevices = clampMaxBidderDevices(team.max_bidder_devices);
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 240);
    const deviceLabel = String(body.deviceLabel || body.device || "").trim().slice(0, 80);
    const expiresAt = new Date(Date.now() + ttlToMs(bidderTokenTtl()));

    const sessionResult = await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          `DELETE FROM bidder_sessions WHERE team_id = $1 AND expires_at <= NOW()`,
          [team.id]
        );
        const active = await client.query(
          `SELECT id FROM bidder_sessions
           WHERE team_id = $1 AND expires_at > NOW()
           ORDER BY last_seen_at ASC, created_at ASC`,
          [team.id]
        );
        let kicked = 0;
        const overflow = active.rows.length + 1 - maxDevices;
        if (overflow > 0) {
          const toKick = active.rows.slice(0, overflow).map((row) => row.id);
          if (toKick.length) {
            await client.query(
              `DELETE FROM bidder_sessions WHERE id = ANY($1::uuid[])`,
              [toKick]
            );
            kicked = toKick.length;
          }
        }
        const inserted = await client.query(
          `INSERT INTO bidder_sessions (
             team_id, tournament_id, user_agent, device_label, expires_at
           ) VALUES ($1, $2, $3, $4, $5)
           RETURNING id, created_at, expires_at`,
          [team.id, team.tournament_id, userAgent, deviceLabel, expiresAt.toISOString()]
        );
        const after = await client.query(
          `SELECT COUNT(*)::int AS count FROM bidder_sessions
           WHERE team_id = $1 AND expires_at > NOW()`,
          [team.id]
        );
        await client.query("COMMIT");
        return {
          session: inserted.rows[0],
          kicked,
          activeDevices: Number(after.rows[0]?.count) || 1
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    const token = signBidderToken({
      tournamentId: team.tournament_id,
      divisionId: team.division_db_id,
      divisionCode: team.division_code,
      teamId: team.team_key,
      teamName: team.team_name,
      sessionId: sessionResult.session.id
    });

    sendJson(res, 200, {
      token,
      maxDevices,
      activeDevices: sessionResult.activeDevices,
      kickedDevices: sessionResult.kicked,
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
        slug: team.tournament_slug,
        maxBidderDevices: maxDevices
      }
    });
    return true;
  }

  if (url.pathname === "/api/v1/bidder/logout" && req.method === "POST") {
    const auth = authenticateBidderRequest(req);
    if (auth?.sid) {
      await query(`DELETE FROM bidder_sessions WHERE id = $1::uuid`, [auth.sid]).catch(() => {});
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/v1/bidder/live" && req.method === "GET") {
    const auth = await requireActiveBidder(req, res);
    if (!auth) return true;
    const { session, players, teamMetaByKey } = await loadSessionForAuth(auth);
    sendJson(res, 200, buildLivePayload(auth, session, players, teamMetaByKey));
    return true;
  }

  if (url.pathname === "/api/v1/bidder/bid" && req.method === "POST") {
    const auth = await requireActiveBidder(req, res);
    if (!auth) return true;
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

        const divisionRules = await client.query(
          `SELECT code, name, categories, category_sequence, icon_caption
           FROM divisions WHERE id = $1 LIMIT 1`,
          [auth.divisionId]
        );
        attachDivisionConfig(state, divisionRules.rows[0] || null);

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
          const label = displayCategory(player.category);
          await client.query("ROLLBACK");
          return {
            status: 409,
            body: {
              error: `${label} quota is fulfilled (${owned}/${maxPlayers}). You cannot bid on this category.`,
              quotaFull: true,
              owned,
              maxPlayers
            }
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
              error:
                `Cannot bid ${formatRupeeShort(amount)}. ` +
                `Must keep ${formatRupeeShort(afford.reserve)} reserved for ${afford.remainingSlots} remaining category minimums. ` +
                `Spendable now: ${formatRupeeShort(afford.spendable)}.`,
              spendable: afford.spendable,
              reserve: afford.reserve,
              purse: afford.purse,
              remainingSlots: afford.remainingSlots,
              cannotAfford: true
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

      const { players, teamMetaByKey } = await loadSessionForAuth(auth);
      const divisionRules = await loadDivisionRules(auth.divisionId);
      const { wrapper, state: liveState } = unwrapAuction(result.snapshotRow?.snapshot);
      if (liveState) attachDivisionConfig(liveState, divisionRules);
      (liveState?.teams || []).forEach((team) => {
        const visual = resolveTeamVisual(team, liveState.teams, teamMetaByKey);
        if (visual.teamLogo) team.logo = visual.teamLogo;
        if (!team.color && visual.teamColor) team.color = visual.teamColor;
        if (!team.team_name && visual.teamName) team.team_name = visual.teamName;
      });
      const live = buildLivePayload(
        auth,
        {
          ...(result.snapshotRow || {}),
          revision: result.body.revision,
          snapshot: liveState
            ? { ...(wrapper || {}), auctionState: liveState }
            : result.snapshotRow?.snapshot
        },
        players,
        teamMetaByKey
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
