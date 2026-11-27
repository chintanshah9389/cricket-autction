let configCache = null;
let activeDivisionId = null;
let currentView = "teams";
let rosterByDivision = new Map();
let auctionByDivision = new Map();

const board = document.getElementById("board");
const statusText = document.getElementById("status-text");
const divisionTabs = document.getElementById("division-tabs");
const divisionLabel = document.getElementById("division-label");
const pageHeading = document.querySelector(".topbar-brand h1");
const tournamentLogo = document.getElementById("tournament-logo");
const feeChips = document.getElementById("fee-chips");
const iconFeeChip = document.getElementById("icon-fee-chip");
const captionFeeChip = document.getElementById("caption-fee-chip");

function moneyLabel(amount) {
    if (typeof formatMoney === "function") return formatMoney(amount);
    if (typeof showAmount === "function") return showAmount(amount);
    return `Rs ${Number(amount) || 0}`;
}

function sameId(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b) || Number(a) === Number(b);
}

function resolvePhoto(photo) {
    const value = String(photo || "").trim();
    if (!value || /placeholder\.png/i.test(value)) return "../assets/placeholder.png";
    if (/^(https?:|data:|blob:)/i.test(value)) return value;
    if (value.startsWith("../") || value.startsWith("/")) return value;
    if (value.startsWith("assets/") || value.startsWith("data-project/")) return `../${value}`;
    return `../${value.replace(/^\.\//, "")}`;
}

function resolveTeamLogo(team) {
    if (typeof getTeamLogoSrc === "function") {
        return getTeamLogoSrc(team, "../assets/teams-logo");
    }
    return resolvePhoto(team?.logo || "");
}

function playerCode(player) {
    if (typeof getPlayerDisplayCode === "function") return getPlayerDisplayCode(player);
    return player?.code || player?.id || "—";
}

function categoryLabel(name) {
    return typeof displayCategoryName === "function"
        ? displayCategoryName(name)
        : String(name || "—");
}

function findPlayer(list, playerId) {
    if (playerId == null || playerId === "") return null;
    return (list || []).find((player) => sameId(player?.id, playerId)) || null;
}

async function loadDivisionPlayers(divisionId) {
    if (rosterByDivision.has(divisionId)) return rosterByDivision.get(divisionId);

    let players = [];
    // Always prefer fresh DB roster in SaaS.
    if (typeof resolveAuctionPlayers === "function") {
        try {
            players = await resolveAuctionPlayers(null, divisionId);
        } catch (_) {
            players = [];
        }
    }
    if (!players.length && typeof fetchProjectSnapshot === "function") {
        try {
            const snapshot = await fetchProjectSnapshot();
            const entry = (snapshot.divisions || []).find((item) => item.id === divisionId);
            if (Array.isArray(entry?.players)) players = entry.players;
        } catch (_) {
            players = [];
        }
    }
    if (!players.length && typeof loadStoredPlayers === "function") {
        players = loadStoredPlayers(divisionId) || [];
    }
    rosterByDivision.set(divisionId, players);
    return players;
}

async function loadDivisionAuction(divisionId) {
    if (auctionByDivision.has(divisionId)) return auctionByDivision.get(divisionId);
    let auctionState = null;
    try {
        if (typeof loadLiveAuctionStateForDivision === "function") {
            auctionState = await loadLiveAuctionStateForDivision(divisionId);
        } else if (typeof fetchDivisionAuction === "function") {
            const remote = await fetchDivisionAuction(divisionId);
            auctionState = remote?.auction?.auctionState || null;
        }
    } catch (_) {
        auctionState = null;
    }
    // No localStorage fallback — stale browser auction mirrors caused wrong UI.
    auctionByDivision.set(divisionId, auctionState);
    return auctionState;
}

function buildAssignments(division, players, auctionState) {
    const settings =
        typeof normalizeIconCaptionSettings === "function"
            ? normalizeIconCaptionSettings(division?.iconCaption)
            : division?.iconCaption || {};
    const teams = Array.isArray(division?.teams) ? division.teams : [];
    const master =
        (Array.isArray(auctionState?.allPlayers) && auctionState.allPlayers.length
            ? auctionState.allPlayers
            : players) || [];
    const liveTeams = Array.isArray(auctionState?.teams) ? auctionState.teams : [];

    const rows = teams.map((team) => {
        const liveTeam =
            liveTeams.find((entry) => sameId(entry.team_id, team.team_id)) || team;
        // Config is the source of truth. Do not fall back to stale auction caption/icon IDs.
        const iconId = team.iconPlayerId;
        const captionId = team.captionPlayerId;

        const iconPlayer = findPlayer(master, iconId) || findPlayer(players, iconId);
        const captionPlayer = findPlayer(master, captionId) || findPlayer(players, captionId);

        return {
            team,
            liveTeam,
            iconPlayer: iconPlayer
                ? {
                      ...iconPlayer,
                      preAssignRole: "icon",
                      finalPrice:
                          iconPlayer.finalPrice ??
                          settings.iconFee ??
                          0
                  }
                : null,
            captionPlayer: captionPlayer
                ? {
                      ...captionPlayer,
                      preAssignRole: "caption",
                      finalPrice:
                          captionPlayer.finalPrice ??
                          settings.captionFee ??
                          0
                  }
                : null
        };
    });

    return { settings, rows };
}

function renderPoster(player, role, team, index = 0) {
    if (!player || !team) return "";
    const accent = team.color || (role === "caption" ? "#1b93cf" : "#0f9d94");

    return `
        <article class="poster" style="--accent:${accent}; --i:${index}">
            <img class="poster-photo" src="${resolvePhoto(player.photo)}" alt="${player.name || "Player"}" onerror="this.src='../assets/placeholder.png'">
            <div class="poster-scrim" aria-hidden="true"></div>
            <span class="poster-role">${role}</span>
            <div class="poster-team">
                <img src="${resolveTeamLogo(team)}" alt="${team.team_name}" onerror="this.style.visibility='hidden'">
            </div>
            <div class="poster-copy">
                <p class="team-name">${team.team_name}</p>
                <h2>${player.name || "Player"}</h2>
                <p class="meta">${playerCode(player)} · ${categoryLabel(player.category)} · ${player.role || "Player"}</p>
                <p class="fee">${moneyLabel(player.finalPrice || 0)}</p>
            </div>
        </article>
    `;
}

function collectPosters(rows, view) {
    const posters = [];
    rows.forEach((row) => {
        if ((view === "teams" || view === "icons") && row.iconPlayer) {
            posters.push(renderPoster(row.iconPlayer, "icon", row.team, posters.length));
        }
        if ((view === "teams" || view === "captions") && row.captionPlayer) {
            posters.push(renderPoster(row.captionPlayer, "caption", row.team, posters.length));
        }
    });
    return posters.filter(Boolean);
}

function syncViewTabs(rows) {
    const iconCount = rows.filter((row) => row.iconPlayer).length;
    const captionCount = rows.filter((row) => row.captionPlayer).length;
    const iconsTab = document.querySelector('.view-tab[data-view="icons"]');
    const captionsTab = document.querySelector('.view-tab[data-view="captions"]');
    if (iconsTab) iconsTab.hidden = iconCount === 0;
    if (captionsTab) captionsTab.hidden = captionCount === 0;

    if (currentView === "captions" && captionCount === 0) currentView = "teams";
    if (currentView === "icons" && iconCount === 0) currentView = "teams";
    document.querySelectorAll(".view-tab").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.view === currentView);
    });

    if (pageHeading) {
        if (currentView === "icons") pageHeading.textContent = "Icons";
        else if (currentView === "captions") pageHeading.textContent = "Captions";
        else pageHeading.textContent = captionCount ? "Icons & Captions" : "Icons";
    }
}

function renderBoard(assignments) {
    const { settings, rows } = assignments;

    if (!settings?.enabled) {
        board.innerHTML = `
            <div class="empty-state">
                Icon / Caption is not enabled for this division.<br>
                Open <a href="../config/">Config</a>, turn it on, assign players, Save, then Start New Auction.
            </div>
        `;
        statusText.textContent = "Feature off for this division";
        return;
    }

    syncViewTabs(rows);
    const posters = collectPosters(rows, currentView);

    if (!posters.length) {
        board.innerHTML = `
            <div class="empty-state">
                No players to show here yet.<br>
                Assign them in <a href="../config/">Config</a>, Save, then Start New Auction.
            </div>
        `;
        statusText.textContent = "No assignments yet";
        return;
    }

    board.innerHTML = posters.join("");

    const iconCount = rows.filter((row) => row.iconPlayer).length;
    const captionCount = rows.filter((row) => row.captionPlayer).length;
    if (currentView === "icons") {
        statusText.textContent = `${iconCount} icon${iconCount === 1 ? "" : "s"}`;
    } else if (currentView === "captions") {
        statusText.textContent = `${captionCount} caption${captionCount === 1 ? "" : "s"}`;
    } else {
        statusText.textContent = captionCount
            ? `${iconCount} icon · ${captionCount} caption`
            : `${iconCount} icon${iconCount === 1 ? "" : "s"}`;
    }
}

function renderDivisionTabs() {
    const divisions = configCache?.divisions || [];
    divisionTabs.innerHTML = divisions
        .map(
            (division) => `
            <button type="button" class="division-tab ${division.id === activeDivisionId ? "is-active" : ""}" data-division-id="${division.id}">
                ${division.name}
            </button>
        `
        )
        .join("");

    divisionTabs.querySelectorAll("[data-division-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
            activeDivisionId = btn.dataset.divisionId;
            void refreshPage();
        });
    });
}

function bindViewTabs() {
    document.querySelectorAll(".view-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
            currentView = btn.dataset.view || "teams";
            document.querySelectorAll(".view-tab").forEach((el) => {
                el.classList.toggle("is-active", el === btn);
            });
            void refreshPage({ keepStatus: true });
        });
    });
}

async function refreshPage({ keepStatus = false } = {}) {
    // Always re-fetch DB roster/auction for the active division (no stale page cache).
    rosterByDivision.delete(activeDivisionId);
    auctionByDivision.delete(activeDivisionId);

    const division = (configCache?.divisions || []).find((item) => item.id === activeDivisionId);
    if (!division) {
        board.innerHTML = `<div class="empty-state">No division found.</div>`;
        return;
    }

    if (divisionLabel) divisionLabel.textContent = division.name;

    const settings =
        typeof normalizeIconCaptionSettings === "function"
            ? normalizeIconCaptionSettings(division.iconCaption)
            : division.iconCaption || {};

    if (feeChips) {
        feeChips.hidden = !settings.enabled;
        if (iconFeeChip) {
            iconFeeChip.hidden = !(Number(settings.iconFee) > 0);
            iconFeeChip.textContent = `Icon ${moneyLabel(settings.iconFee || 0)}`;
        }
        if (captionFeeChip) {
            captionFeeChip.hidden = !(Number(settings.captionFee) > 0);
            captionFeeChip.textContent = `Caption ${moneyLabel(settings.captionFee || 0)}`;
        }
    }

    if (!keepStatus) statusText.textContent = "Loading assignments…";
    renderDivisionTabs();

    const [players, auctionState] = await Promise.all([
        loadDivisionPlayers(division.id),
        loadDivisionAuction(division.id)
    ]);
    const assignments = buildAssignments(division, players, auctionState);
    renderBoard(assignments);
}

async function boot() {
    bindViewTabs();
    try {
        configCache =
            typeof getAuctionConfig === "function"
                ? await getAuctionConfig()
                : typeof loadAuctionConfig === "function"
                  ? await loadAuctionConfig()
                  : null;
        if (!configCache && typeof normalizeConfig === "function") {
            configCache = normalizeConfig({});
        }
    } catch (error) {
        statusText.textContent = error.message || "Could not load configuration.";
        board.innerHTML = `<div class="empty-state">Could not load config.</div>`;
        return;
    }

    activeDivisionId = configCache.activeDivisionId || configCache.divisions?.[0]?.id || "div_1";

    const logoSrc =
        typeof getTournamentLogoSrc === "function"
            ? getTournamentLogoSrc(configCache.tournament, "../assets/tournament-logo.svg")
            : configCache.tournament?.logo || "../assets/tournament-logo.svg";
    if (tournamentLogo) {
        tournamentLogo.src = String(logoSrc).startsWith("assets/")
            ? `../${logoSrc}`
            : logoSrc;
    }

    await refreshPage();
}

boot();
