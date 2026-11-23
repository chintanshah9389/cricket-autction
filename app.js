//History stack
let history = {
        undoStack: [],
        redoStack: []
}

let state = {
        players: [],
        teams: [],
        auctionCount: 0,
        soldCount: 0,
        unsoldCount: 0,
        soldPlayers: [],
        unsoldPlayers: [],
        skippedPlayers: []
    };

const getTournamentData = async () => {
    const response = await fetch("data/tournament.json");
    // Return the fetched data directly
    return await response.json();
};

function getActiveDivisionIdFromConfig(config) {
    return config?.activeDivisionId || config?.divisions?.[0]?.id || "div_1";
}

function getAuctionDataStorageKey(divisionId) {
    if (typeof getDivisionAuctionDataKey === "function") {
        return getDivisionAuctionDataKey(divisionId);
    }
    return `auctionData:${divisionId || "div_1"}`;
}

function divisionHasSavedAuction(divisionId) {
    try {
        if (typeof migrateLegacyDivisionStorage === "function") {
            migrateLegacyDivisionStorage(divisionId);
        }
        const raw = localStorage.getItem(getAuctionDataStorageKey(divisionId));
        if (!raw) return false;
        if (typeof isMeaningfulAuctionSnapshot === "function") {
            return isMeaningfulAuctionSnapshot(JSON.parse(raw));
        }
        const parsed = JSON.parse(raw);
        const players = parsed?.auctionState?.players;
        return Array.isArray(players) && players.length > 0;
    } catch (_) {
        return false;
    }
}

// Players for this division only — never fall back to a shared global file
const getPlayersData = async (divisionId) => {
    const id = divisionId || getActivePlayersDivisionId?.() || "div_1";
    if (typeof resolveAuctionPlayers === "function") {
        return resolveAuctionPlayers(null, id);
    }
    return [];
};

// Keys for teams in list order. Avoids plain "s" / "u" (sold / unsold). Extra teams still clickable.
const TEAM_HOTKEYS = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=",
    "q", "w", "e", "r", "t", "y", "o", "a", "d", "f", "g", "h",
    "j", "k", "l", "z", "x", "c", "v", "n", "m", "b", "p"
];

function findTeam(teamId) {
    return state.teams.find(team => team.team_id === teamId);
}

function teamFromHotkey(key) {
    const index = TEAM_HOTKEYS.indexOf(key);
    if (index < 0 || index >= state.teams.length) return null;
    return state.teams[index];
}

//DOM for Welcome Screen
let welcomeScreen = document.getElementById("welcome-screen");
let welcomeResumeBtn = document.getElementById("welcome-resume-btn");
let welcomeStartNewBtn = document.getElementById("welcome-start-new-btn");
let welcomeResetBtn = document.getElementById("welcome-reset-btn");
let welcomeResetProjectBtn = document.getElementById("welcome-reset-project-btn");
let welcomeLogo = document.getElementById("welcome-logo");
let welcomeTitle = document.getElementById("welcome-title");
let welcomeDivisions = document.getElementById("welcome-divisions");
let welcomeDivisionNote = document.getElementById("welcome-division-note");
let bigContainer = document.getElementById("big-container");
let welcomeConfigCache = null;

// Partners intro (when returning from config / players / partners)
let partnersIntro = document.getElementById("partners-intro");
let partnersIntroTier = document.getElementById("partners-intro-tier");
let partnersIntroLogo = document.getElementById("partners-intro-logo");
let partnersIntroVideo = document.getElementById("partners-intro-video");
let partnersIntroMediaWrap = document.getElementById("partners-intro-media-wrap");
let partnersIntroName = document.getElementById("partners-intro-name");
let partnersIntroTagline = document.getElementById("partners-intro-tagline");
let partnersIntroDots = document.getElementById("partners-intro-dots");
let partnersIntroContinue = document.getElementById("partners-intro-continue");
let partnersIntroCaption = document.getElementById("partners-intro-caption");
let partnersIntroBrandLogo = document.getElementById("partners-intro-brand-logo");
let partnersIntroList = [];
let partnersIntroIndex = 0;
let partnersIntroTimer = null;
let partnersIntroVideoHandler = null;

function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fadePartnersIntroCaption(out) {
    if (!partnersIntroCaption) return;
    if (out) {
        partnersIntroCaption.classList.add("is-fading");
        await waitMs(420);
    } else {
        partnersIntroCaption.classList.remove("is-fading");
    }
}

const PARTNER_TIER_LABELS = {
    title: "Title Partner",
    presented: "Presented By",
    partner: "Partner"
};

function shouldShowPartnersIntro() {
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("showPartners") === "1") return true;
        const ref = String(document.referrer || "");
        if (!ref) return false;
        const refUrl = new URL(ref);
        if (refUrl.origin !== window.location.origin) return false;
        const path = refUrl.pathname || "";
        return (
            path.includes("/config") ||
            path.includes("/partners") ||
            path.includes("/squads")
        );
    } catch (_) {
        return false;
    }
}

function clearPartnersIntroQuery() {
    try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has("showPartners")) return;
        url.searchParams.delete("showPartners");
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, "", next || "./");
    } catch (_) {
        // ignore
    }
}

function clearPartnersIntroTimers() {
    if (partnersIntroTimer) {
        clearTimeout(partnersIntroTimer);
        partnersIntroTimer = null;
    }
    if (partnersIntroVideo && partnersIntroVideoHandler) {
        partnersIntroVideo.removeEventListener("ended", partnersIntroVideoHandler);
        partnersIntroVideoHandler = null;
    }
}

function stopPartnersIntroVideo() {
    if (!partnersIntroVideo) return;
    partnersIntroVideo.pause();
    partnersIntroVideo.removeAttribute("src");
    partnersIntroVideo.classList.add("is-hidden");
    try {
        partnersIntroVideo.load();
    } catch (_) {
        // ignore
    }
}

function playPartnersIntroVideo(src, { loop = false } = {}) {
    return new Promise((resolve) => {
        if (!partnersIntroVideo || !src) {
            resolve(false);
            return;
        }
        stopPartnersIntroVideo();
        partnersIntroVideo.classList.remove("is-hidden");
        partnersIntroVideo.muted = true;
        partnersIntroVideo.playsInline = true;
        partnersIntroVideo.loop = loop;
        partnersIntroVideo.src = src;
        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            partnersIntroVideo.removeEventListener("canplay", onReady);
            resolve(ok);
        };
        const onReady = () => {
            partnersIntroVideo.play().then(() => finish(true)).catch(() => finish(false));
        };
        partnersIntroVideo.addEventListener("canplay", onReady);
        partnersIntroVideo.addEventListener("error", () => finish(false), { once: true });
    });
}

async function renderPartnersIntroSlide({ animate = false } = {}) {
    if (!partnersIntroList.length) return;
    if (animate) await fadePartnersIntroCaption(true);

    const partner = partnersIntroList[partnersIntroIndex % partnersIntroList.length];
    if (partnersIntroTier) {
        const tier = partner.tier || "partner";
        partnersIntroTier.textContent = PARTNER_TIER_LABELS[tier] || "Partner";
        partnersIntroTier.dataset.tier = tier;
    }
    if (partnersIntroName) {
        partnersIntroName.textContent = String(partner.name || "Partner").trim();
    }
    const tagline = String(partner.tagline || "").trim();
    if (partnersIntroTagline) {
        if (tagline) {
            partnersIntroTagline.textContent = tagline;
            partnersIntroTagline.classList.remove("is-hidden");
        } else {
            partnersIntroTagline.textContent = "";
            partnersIntroTagline.classList.add("is-hidden");
        }
    }

    const videoSrc = String(partner.video || "").trim();
    const logoSrc = String(partner.logo || "").trim();

    if (partnersIntroBrandLogo) {
        if (logoSrc) {
            partnersIntroBrandLogo.classList.remove("is-hidden");
            partnersIntroBrandLogo.src = logoSrc;
            partnersIntroBrandLogo.alt = `${partner.name || "Partner"} logo`;
            partnersIntroBrandLogo.onerror = () => {
                partnersIntroBrandLogo.onerror = null;
                partnersIntroBrandLogo.classList.add("is-hidden");
                partnersIntroBrandLogo.removeAttribute("src");
            };
        } else {
            partnersIntroBrandLogo.classList.add("is-hidden");
            partnersIntroBrandLogo.removeAttribute("src");
        }
    }

    if (videoSrc && partnersIntroVideo) {
        if (partnersIntroMediaWrap) partnersIntroMediaWrap.dataset.mode = "video";
        if (partnersIntroLogo) {
            partnersIntroLogo.classList.add("is-hidden");
            partnersIntroLogo.removeAttribute("src");
        }
        const played = await playPartnersIntroVideo(videoSrc, {
            loop: partnersIntroList.length <= 1
        });
        if (!played && logoSrc && partnersIntroLogo) {
            stopPartnersIntroVideo();
            if (partnersIntroMediaWrap) partnersIntroMediaWrap.dataset.mode = "logo";
            partnersIntroLogo.classList.remove("is-hidden");
            partnersIntroLogo.src = logoSrc;
            partnersIntroLogo.alt = partner.name || "Partner logo";
        }
    } else {
        stopPartnersIntroVideo();
        if (partnersIntroMediaWrap) partnersIntroMediaWrap.dataset.mode = "logo";
        if (partnersIntroLogo) {
            if (logoSrc) {
                partnersIntroLogo.classList.remove("is-hidden");
                partnersIntroLogo.src = logoSrc;
                partnersIntroLogo.alt = partner.name || "Partner logo";
            } else {
                partnersIntroLogo.classList.add("is-hidden");
                partnersIntroLogo.removeAttribute("src");
            }
        }
    }

    if (partnersIntroDots) {
        // Hide lone blue dots — only useful when multiple partners cycle
        partnersIntroDots.innerHTML =
            partnersIntroList.length > 1
                ? partnersIntroList
                      .map(
                          (_, i) =>
                              `<span class="partners-intro-dot${i === partnersIntroIndex % partnersIntroList.length ? " is-active" : ""}"></span>`
                      )
                      .join("")
                : "";
    }

    await fadePartnersIntroCaption(false);
    schedulePartnersIntroAdvance(partner);
}

function advancePartnersIntro() {
    if (partnersIntroList.length <= 1) return;
    partnersIntroIndex = (partnersIntroIndex + 1) % partnersIntroList.length;
    renderPartnersIntroSlide({ animate: true });
}

function schedulePartnersIntroAdvance(partner) {
    clearPartnersIntroTimers();
    if (partnersIntroList.length <= 1) return;

    const hasVideo = Boolean(String(partner?.video || "").trim());
    if (hasVideo && partnersIntroVideo) {
        partnersIntroVideoHandler = () => advancePartnersIntro();
        partnersIntroVideo.addEventListener("ended", partnersIntroVideoHandler);
        partnersIntroTimer = setTimeout(() => advancePartnersIntro(), 20000);
        return;
    }
    partnersIntroTimer = setTimeout(() => advancePartnersIntro(), 4000);
}

function hidePartnersIntro() {
    clearPartnersIntroTimers();
    stopPartnersIntroVideo();
    if (partnersIntro) partnersIntro.hidden = true;
    clearPartnersIntroQuery();
}

async function maybeShowPartnersIntro() {
    if (!partnersIntro || !shouldShowPartnersIntro()) {
        clearPartnersIntroQuery();
        return;
    }

    try {
        let all = [];
        try {
            all = JSON.parse(localStorage.getItem("auctionPartners") || "[]");
        } catch (_) {
            all = [];
        }
        if (!Array.isArray(all) || !all.length) {
            const tournamentId =
                (typeof getSaasTournamentId === "function" && getSaasTournamentId()) ||
                window.SaasAuth?.getActiveTournamentId?.();
            if (!tournamentId || !window.SaasAuth?.api) {
                clearPartnersIntroQuery();
                return;
            }
            const payload = await window.SaasAuth.api(
                `/api/v1/tournaments/${encodeURIComponent(tournamentId)}/partners`
            );
            all = Array.isArray(payload.partners) ? payload.partners : [];
        }
        partnersIntroList = all
            .filter((p) => p && p.highlight)
            .sort((a, b) => Number(a.order || a.sortOrder || 0) - Number(b.order || b.sortOrder || 0));
        if (!partnersIntroList.length) {
            clearPartnersIntroQuery();
            return;
        }

        partnersIntroIndex = 0;
        partnersIntroCaption?.classList.add("is-fading");
        partnersIntro.hidden = false;
        renderPartnersIntroSlide();
    } catch (_) {
        clearPartnersIntroQuery();
    }
}

//Buttons for Editing Budgets
let budgetModal = document.getElementById("budget-modal");
let modalCloseBtn = document.getElementById("modal-close-btn");
let budgetEditorList = document.getElementById("budget-editor-list");

//DOM for Direct Bidding
let directBidModal = document.getElementById("direct-bid-modal");
let directBidCloseBtn = document.getElementById("direct-bid-close-btn");
let teamSelectDropdown = document.getElementById("team-select-dropdown");
let directBidAmountInput = document.getElementById("direct-bid-amount");
let submitBidBtn = document.getElementById("submit-bid-btn");
let directBidForm = document.getElementById("direct-bid-form");

//DOM for Finish Screen
let roundEndModal = document.getElementById("round-end-modal");
let restartUnsoldBtn = document.getElementById("restart-unsold-btn");
let finishAuctionBtn = document.getElementById("finish-auction-btn");
let roundSummaryText = document.getElementById("round-summary-text");

//DOM for Final Finish Screen
let finishScreenModal = document.getElementById("finish-screen-modal");
let finishModalCloseBtn = document.getElementById("finish-modal-close-btn");

//DOM Manipulation
let playerName = document.getElementById("player-name");
let playerPhoto = document.getElementById("player-image")
let playerRole = document.getElementById("player-role");
let playerLocation = document.getElementById("player-location");
let playerMobile = document.getElementById("player-mobile");
let playerAge = document.getElementById("player-age");
let playerAgeCategory = document.getElementById("player-age-category");
let playerBatting = document.getElementById("player-batting");
let playerBowling = document.getElementById("player-bowling");
let playerCategory = document.getElementById("player-category");
let playerId = document.getElementById("player-id");
let playerBasePrice = document.getElementById("base-price");
let playerBasePriceSection = document.getElementById("base-price-section");
let playerPhotoStage = document.querySelector(".player-stage") || document.getElementById("player-image")?.closest(".player-photo-card");

let currentBidAmount = document.getElementById("current-bid");
let currentBidTeam = document.getElementById("current-bid-team");

//Button DOM's
let undoButton   = document.getElementById("undo-button");
let redoButton   = document.getElementById("redo-button");
let resetButton  = document.getElementById("reset-button");
let teamsButton  = document.getElementById("teams-button");
let skipButton   = document.getElementById("skip-button");
let spinButton   = document.getElementById("spin-button");
let unsoldButton = document.getElementById("unsold-button");
let soldButton   = document.getElementById("sold-button");
let nextButton   = document.getElementById("next-button");

//Seal DOM
unsoldSeal = document.getElementById("unsold-seal");
soldSeal = document.getElementById("sold-seal");


// showAmount / formatMoney come from js/money.js

/**
 * Leave the full-page welcome and show the live auction desk.
 */
function enterAuctionDesk() {
    document.body.classList.remove("welcome-active");
    if (welcomeScreen) welcomeScreen.hidden = true;
    if (bigContainer) bigContainer.hidden = false;
}

/**
 * Starts the main UI after welcome. Auction state is already prepared in initApp.
 */
function startMainApplication() {
    if (!requireServerOnline("open the auction desk")) return;
    // Leave welcome first — renderUI() skips player details while welcome-active.
    enterAuctionDesk();
    renderUI();
    updateUndoRedoButtons();
}

function requireServerOnline(actionLabel = "continue") {
    if (isServerOnline()) return true;
    alert(`Cannot ${actionLabel}: local server is offline.\n\nRun: node server.js\nThen open http://localhost:3000 and retry.`);
    updateServerStatusUI();
    return false;
}

async function handleWelcomeResume() {
    if (!requireServerOnline("resume auction")) return;
    try {
        // Always resume from DB so Icon/Caption + category settings match last Save
        if (typeof getAuctionConfig === "function") {
            const divisionId =
                welcomeConfigCache?.activeDivisionId ||
                (typeof getActiveDivisionIdFromConfig === "function"
                    ? getActiveDivisionIdFromConfig(welcomeConfigCache)
                    : null);
            welcomeConfigCache = await getAuctionConfig();
            if (divisionId && typeof setActiveDivisionId === "function") {
                welcomeConfigCache = setActiveDivisionId(welcomeConfigCache, divisionId);
            }
        }
        await loadAuctionStateForActiveDivision(welcomeConfigCache);
        showTournamentDetails();
        refreshWelcomeDivisionActions();
    } catch (error) {
        alert(error?.message || "Could not reload tournament from the database.");
        return;
    }
    startMainApplication();
}

async function handleWelcomeStartNew() {
    if (!requireServerOnline("start a new auction")) return;
    const divisionId =
        welcomeConfigCache?.activeDivisionId ||
        (typeof getActiveDivisionIdFromConfig === "function"
            ? getActiveDivisionIdFromConfig(welcomeConfigCache)
            : "div_1");
    try {
        // Config + players + Icon/Caption assignments come from DB only
        if (typeof getAuctionConfig === "function") {
            welcomeConfigCache = await getAuctionConfig();
            if (divisionId && typeof setActiveDivisionId === "function") {
                welcomeConfigCache = setActiveDivisionId(welcomeConfigCache, divisionId);
            }
        }
        localStorage.removeItem(getAuctionDataStorageKey(divisionId));
        if (divisionId === "div_1") localStorage.removeItem("auctionData");
        if (typeof bumpProjectPersistGeneration === "function") {
            bumpProjectPersistGeneration();
        }
        // Await DB clear so we never rebuild on top of a stale auction snapshot
        if (typeof persistAuctionToProjectFolder === "function") {
            await persistAuctionToProjectFolder(divisionId, null);
            if (typeof flushProjectPersistQueue === "function") {
                await flushProjectPersistQueue();
            }
        }
        await loadAuctionStateForActiveDivision(welcomeConfigCache);
        // Persist Icon/Caption pre-assigns immediately so Resume picks them up from DB
        await saveAuctionProgress({ awaitDisk: true, critical: true });
        const iconCount = (state.teams || []).reduce((sum, team) => {
            const hasIcon = team?.iconPlayerId != null && team.iconPlayerId !== "";
            const hasCaption = team?.captionPlayerId != null && team.captionPlayerId !== "";
            return sum + (hasIcon ? 1 : 0) + (hasCaption ? 1 : 0);
        }, 0);
        const preAssigned = (state.allPlayers || []).filter(
            (player) =>
                String(player?.preAssignRole || "").toLowerCase() === "icon" ||
                String(player?.preAssignRole || "").toLowerCase() === "caption"
        ).length;
        if (iconCount > 0 && preAssigned === 0) {
            alert(
                "Icon/Caption players are set in Config but could not be matched to the roster. Re-save Config, then Start New again."
            );
        } else if (preAssigned > 0) {
            console.info(`Icon/Caption: ${preAssigned} player(s) pre-assigned and removed from the auction queue.`);
        }
        showTournamentDetails();
        refreshWelcomeDivisionActions();
    } catch (error) {
        alert(error?.message || "Could not start a new auction from the database.");
        return;
    }
    startMainApplication();
}

//This Function is used to show tounament details in the screen
function showTournamentDetails() {
    // Check if tournament data exists before trying to display it
    if (!state.tournament) return;

    const title = getTournamentTitle(state.tournament);
    const divisionName = state.divisionName || getActiveDivision(welcomeConfigCache || state.config || {})?.name;
    const deskTitle = divisionName ? `${title} — ${divisionName}` : title;
    const logoSrc = getTournamentLogoSrc(state.tournament, "assets/tournament-logo.svg");

    const logoEl = document.querySelector(".tournament-logo");
    const headline = document.querySelector(".headline");
    if (logoEl) {
        logoEl.src = logoSrc;
        logoEl.onerror = () => {
            logoEl.src = "assets/tournament-logo.svg";
        };
    }
    if (headline) {
        headline.innerText = deskTitle;
    }

    if (welcomeLogo) {
        welcomeLogo.src = logoSrc;
        welcomeLogo.onerror = () => {
            welcomeLogo.src = "assets/tournament-logo.svg";
        };
    }
    if (welcomeTitle) {
        welcomeTitle.innerText = title;
    }
}

function isServerOnline() {
    return document.body.dataset.serverOnline === "1";
}

function setOfflineOnlyMode(offline) {
    const panel = document.getElementById("offline-only-panel");
    const brand = document.querySelector(".welcome-brand");
    const online = document.getElementById("welcome-online");
    const banner = document.getElementById("server-status-banner");
    document.body.classList.toggle("server-offline-only", offline);
    document.documentElement.classList.toggle("boot-offline", offline);
    document.documentElement.classList.toggle("boot-online", !offline);
    if (panel) panel.hidden = !offline;
    if (brand) brand.hidden = offline;
    if (online) online.hidden = offline;
    if (banner && offline) banner.hidden = true;
    // Never enter the desk from an offline boot
    if (offline && bigContainer) bigContainer.hidden = true;
    if (offline && welcomeScreen) {
        welcomeScreen.hidden = false;
        document.body.classList.add("welcome-active");
    }
    if (!offline && brand) brand.hidden = false;
    if (!offline && online) online.hidden = false;
}

async function updateServerStatusUI() {
    const banner = document.getElementById("server-status-banner");
    const chip = document.getElementById("desk-server-chip");
    let online = false;
    if (typeof checkProjectApiReady === "function") {
        try {
            online = await checkProjectApiReady({ force: true });
        } catch (_) {
            online = false;
        }
    }
    document.body.dataset.serverOnline = online ? "1" : "0";
    if (banner) {
        banner.hidden = false;
        banner.dataset.state = online ? "online" : "offline";
        banner.textContent = online
            ? "Server online — using live project data."
            : "Offline — server is down. Refresh or restart the auction server. Old browser cache will not be used.";
    }
    if (chip) {
        chip.hidden = false;
        chip.dataset.state = online ? "online" : "offline";
        chip.textContent = online ? "LIVE" : "OFFLINE";
        chip.title = online
            ? "Connected to live project data"
            : "Server down — auction desk blocked until server is back";
    }
    // Only lock the welcome boot path; don't yank an already-live in-memory auction
    if (document.body.classList.contains("welcome-active")) {
        setOfflineOnlyMode(!online);
    }
    return online;
}

function refreshWelcomeDivisionActions() {
    if (!isServerOnline()) {
        setOfflineOnlyMode(true);
        if (welcomeResumeBtn) welcomeResumeBtn.hidden = true;
        if (welcomeStartNewBtn) welcomeStartNewBtn.hidden = true;
        if (welcomeResetBtn) welcomeResetBtn.hidden = true;
        if (welcomeDivisionNote) {
            welcomeDivisionNote.textContent = "Offline — wait for the server, then retry to load live project data.";
        }
        return;
    }

    setOfflineOnlyMode(false);
    const config = welcomeConfigCache;
    if (!config) return;
    const active = getActiveDivision(config);
    const hasSaved = divisionHasSavedAuction(active.id);

    if (welcomeResumeBtn) welcomeResumeBtn.hidden = !hasSaved;
    if (welcomeResetBtn) welcomeResetBtn.hidden = !hasSaved;
    // Always offer Start New so Excel re-uploads can load without Reset
    if (welcomeStartNewBtn) welcomeStartNewBtn.hidden = false;
    if (welcomeDivisionNote) {
        const teamCount = (active.teams || []).length;
        const playerCount =
            typeof loadStoredPlayers === "function"
                ? (loadStoredPlayers(active.id) || []).length
                : 0;
        welcomeDivisionNote.textContent = hasSaved
            ? `Saved auction found for ${active.name}. Resume to continue, or Start New to reload the latest Excel roster.`
            : `No saved auction for ${active.name}. Start New to begin with the current roster.`;
    }
}

function renderWelcomeDivisions() {
    if (!welcomeDivisions || !welcomeConfigCache) return;
    const divisions = listDivisions(welcomeConfigCache);
    welcomeDivisions.innerHTML = "";
    divisions.forEach((division) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `welcome-division-btn${
            division.id === welcomeConfigCache.activeDivisionId ? " is-active" : ""
        }`;
        const teamCount = Array.isArray(division.teams) ? division.teams.length : 0;
        let playerCount = 0;
        if (typeof loadStoredPlayers === "function") {
            const stored = loadStoredPlayers(division.id);
            playerCount = Array.isArray(stored) ? stored.length : 0;
        }
        button.innerHTML = `<span class="welcome-division-name">${division.name}</span><span class="welcome-division-meta">${teamCount} teams · ${playerCount} players</span>`;
        button.title = `${division.name}: ${teamCount} teams, ${playerCount} players`;
        button.addEventListener("click", () => selectWelcomeDivision(division.id));
        welcomeDivisions.appendChild(button);
    });
    refreshWelcomeDivisionActions();
}

let welcomeDivisionSwitchToken = 0;

async function selectWelcomeDivision(divisionId) {
    if (!welcomeConfigCache || welcomeConfigCache.activeDivisionId === divisionId) return;

    const token = ++welcomeDivisionSwitchToken;
    welcomeConfigCache = setActiveDivisionId(welcomeConfigCache, divisionId);
    // Update the active tab immediately — don't wait on a large auction.json fetch.
    renderWelcomeDivisions();
    const active = getActiveDivision(welcomeConfigCache);
    if (welcomeDivisionNote) {
        welcomeDivisionNote.textContent = `Switching to ${active.name}…`;
    }
    if (welcomeResumeBtn) welcomeResumeBtn.disabled = true;
    if (welcomeStartNewBtn) welcomeStartNewBtn.disabled = true;
    if (welcomeResetBtn) welcomeResetBtn.disabled = true;
    welcomeDivisions?.querySelectorAll(".welcome-division-btn").forEach((btn) => {
        btn.disabled = true;
    });

    try {
        if (typeof saveAuctionConfigToDisk === "function") {
            await saveAuctionConfigToDisk(welcomeConfigCache);
        } else {
            saveAuctionConfig(welcomeConfigCache);
        }
        await loadAuctionStateForActiveDivision(welcomeConfigCache);
    } catch (error) {
        if (token !== welcomeDivisionSwitchToken) return;
        if (welcomeDivisionNote) {
            welcomeDivisionNote.textContent =
                error?.message || `Could not switch to ${active.name}. Try again.`;
        }
        welcomeDivisions?.querySelectorAll(".welcome-division-btn").forEach((btn) => {
            btn.disabled = false;
        });
        if (welcomeResumeBtn) welcomeResumeBtn.disabled = false;
        if (welcomeStartNewBtn) welcomeStartNewBtn.disabled = false;
        if (welcomeResetBtn) welcomeResetBtn.disabled = false;
        return;
    }

    if (token !== welcomeDivisionSwitchToken) return;

    if (welcomeResumeBtn) welcomeResumeBtn.disabled = false;
    if (welcomeStartNewBtn) welcomeStartNewBtn.disabled = false;
    if (welcomeResetBtn) welcomeResetBtn.disabled = false;
    renderWelcomeDivisions();
    showTournamentDetails();
    if (typeof updateUndoRedoButtons === "function") updateUndoRedoButtons();
    if (!document.body.classList.contains("welcome-active") && typeof renderUI === "function") {
        renderUI();
    }
}

async function loadAuctionStateForActiveDivision(auctionConfig) {
    const division = getActiveDivision(auctionConfig);
    migrateLegacyDivisionStorage?.(division.id);

    history = { undoStack: [], redoStack: [] };
    state = {
        players: [],
        teams: [],
        auctionCount: 0,
        soldCount: 0,
        unsoldCount: 0,
        soldPlayers: [],
        unsoldPlayers: [],
        skippedPlayers: [],
        divisionId: division.id,
        divisionName: division.name
    };

    // Prefer disk auction.json, then lean browser mirror
    let savedData = null;
    if (typeof loadDivisionAuctionFromProject === "function") {
        try {
            savedData = await loadDivisionAuctionFromProject(division.id);
        } catch (_) {
            savedData = null;
        }
    }
    if (!savedData || (typeof isMeaningfulAuctionSnapshot === "function" && !isMeaningfulAuctionSnapshot(savedData))) {
        try {
            const raw = localStorage.getItem(getAuctionDataStorageKey(division.id));
            savedData = raw ? JSON.parse(raw) : null;
        } catch (_) {
            savedData = null;
        }
    }
    let useSaved =
        Boolean(savedData) &&
        (typeof isMeaningfulAuctionSnapshot !== "function" || isMeaningfulAuctionSnapshot(savedData));

    // Stale/empty snapshot after Excel upload — prefer live roster over frozen empty state
    if (useSaved) {
        const savedPlayers = savedData?.auctionState?.players || [];
        const roster =
            typeof loadStoredPlayers === "function" ? loadStoredPlayers(division.id) : null;
        if ((!Array.isArray(savedPlayers) || savedPlayers.length === 0) &&
            Array.isArray(roster) &&
            roster.length > 0) {
            useSaved = false;
            localStorage.removeItem(getAuctionDataStorageKey(division.id));
            if (typeof invalidateDivisionAuctionProgress === "function") {
                invalidateDivisionAuctionProgress(division.id);
            }
        }
    }

    if (useSaved && savedData) {
        state = savedData.auctionState;
        history = savedData.historyData || history;
        if (!state.allPlayers) {
            state.allPlayers = (state.players || []).slice();
        }
        state.config = auctionConfig;
        state.tournament = buildTournamentState(auctionConfig, state.tournament);
        state.divisionId = division.id;
        state.divisionName = division.name;
        if (typeof reconcileAuctionTeamsFromConfig === "function") {
            reconcileAuctionTeamsFromConfig(state, auctionConfig);
        } else if (typeof syncTeamMediaFromConfig === "function") {
            syncTeamMediaFromConfig(state, auctionConfig);
        }

        const normalizeSavedPlayer = (player) => {
            if (!player) return;
            player.category = normalizeCategoryName(player.category);
            if (typeof normalizePlayerRecord === "function") {
                const fixed = normalizePlayerRecord(player);
                player.code = fixed.code;
                // Keep category from stored/sheet data (normalizePlayerRecord already used CATEGORY field)
                player.category = fixed.category;
            } else {
                player.code = getPlayerDisplayCode(player);
            }
        };
        (state.players || []).forEach(normalizeSavedPlayer);
        (state.allPlayers || []).forEach(normalizeSavedPlayer);

        // Latest Config base prices / category max (do not keep stale 20L defaults)
        if (typeof syncLiveAuctionPricingFromConfig === "function") {
            syncLiveAuctionPricingFromConfig(state, auctionConfig);
        }

        // Re-bind Icon/Caption from Config so category quota setting still applies after DB resume
        let iconEnsured = false;
        if (typeof ensureIconCaptionAssignments === "function") {
            const queueBefore = (state.players || []).length;
            const beforeBought = (state.teams || []).reduce(
                (sum, team) => sum + (Number(team.player_bought) || 0),
                0
            );
            ensureIconCaptionAssignments(state, auctionConfig);
            const afterBought = (state.teams || []).reduce(
                (sum, team) => sum + (Number(team.player_bought) || 0),
                0
            );
            iconEnsured =
                afterBought !== beforeBought || (state.players || []).length !== queueBefore;
        }

        if (!state.activeAuctionCategory) {
            setActiveAuctionCategory(
                getPlayerAuctionCategoryName(state.players?.[state.auctionCount]) ||
                    getCategorySequence?.(auctionConfig)?.[0]
            );
        } else {
            setActiveAuctionCategory(state.activeAuctionCategory);
        }

        if (state.auctionCount < (state.players || []).length) {
            const lastPlayerStatus = state.players[state.auctionCount]?.status;
            if (lastPlayerStatus === "sold" || lastPlayerStatus === "unsold" || lastPlayerStatus === "skipped") {
                const locked = getCurrentAuctionCategoryName();
                const nextSame = findNextEligibleAuctionIndex(state.auctionCount, {
                    categoryName: locked || null
                });
                // Prefer next waiting player in the locked category — never auto-skip to Evergreen
                if (nextSame >= 0) state.auctionCount = nextSame;
            }
        }

        // Re-apply category sequence to the remaining queue (fixes mixed categories on resume)
        if (typeof reorderRemainingPlayersByCategory === "function") {
            reorderRemainingPlayersByCategory(state, auctionConfig);
        }

        // Repair truncated queues (waiting players still in allPlayers but missing from players)
        ensureAuctionQueueFromMaster();

        // Persist repaired Icon/Caption counts so the next resume matches the desk
        if (iconEnsured) {
            try {
                await saveAuctionProgress({ awaitDisk: true, critical: false });
            } catch (_) {
                // desk can continue; next bid will save
            }
        }
    } else {
        state.players = await getPlayersData(division.id);
        state.allPlayers = state.players.slice();
        applyConfigToAuctionState(state, auctionConfig);
        // Teams come only from this division's config — never a shared teams.json
        if (!state.teams?.length && typeof buildFreshTeamsFromConfig === "function") {
            state.teams = buildFreshTeamsFromConfig(auctionConfig);
        }
        // Second pass: catch id/code mismatches that the first apply missed
        if (typeof ensureIconCaptionAssignments === "function") {
            ensureIconCaptionAssignments(state, auctionConfig);
        }
        if (typeof syncLiveAuctionPricingFromConfig === "function") {
            syncLiveAuctionPricingFromConfig(state, auctionConfig);
        }
        if (!state.activeAuctionCategory) {
            setActiveAuctionCategory(
                getPlayerAuctionCategoryName(state.players?.[0]) ||
                    getCategorySequence?.(auctionConfig)?.[0]
            );
        }
    }
}

function triggerAnim(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
}

//this function will show specific player details in the UI
async function setPlayerPhotoElement(imgEl, photoRef) {
    if (!imgEl) return;
    const divisionId = state.divisionId || welcomeConfigCache?.activeDivisionId || "div_1";
    imgEl.onerror = function () {
        this.onerror = null;
        this.src = "assets/placeholder.png";
    };
    if (typeof resolvePlayerPhotoSrc === "function") {
        try {
            imgEl.src = await resolvePlayerPhotoSrc(photoRef, {
                divisionId,
                fromPrefix: "",
                verifyLocal: true
            });
            return;
        } catch (_) {
            // fall through
        }
    }
    const value = String(photoRef || "").trim();
    imgEl.src = value && !/^idb:/i.test(value) ? value : "assets/placeholder.png";
}

function getAuctionPlayerFieldsConfig() {
    const config = typeof getActiveConfig === "function" ? getActiveConfig(state) : state?.config;
    if (config?.playerFields) return config.playerFields;
    if (typeof normalizePlayerFields === "function") return normalizePlayerFields(null);
    return {};
}

function isAuctionPlayerFieldVisible(fieldKey) {
    if (typeof isPlayerFieldVisible === "function") {
        return isPlayerFieldVisible(getActiveConfig?.(state) || state?.config, fieldKey);
    }
    const fields = getAuctionPlayerFieldsConfig();
    if (!fields[fieldKey]) return true;
    return fields[fieldKey].visible !== false;
}

function getAuctionCustomPlayerFieldDefs() {
    const fields = getAuctionPlayerFieldsConfig();
    const defs =
        typeof listPlayerFieldDefs === "function"
            ? listPlayerFieldDefs(fields)
            : [];
    return defs.filter(
        (def) =>
            (def.custom === true || String(def.key).startsWith("x_")) &&
            isAuctionPlayerFieldVisible(def.key)
    );
}

function ensureAuctionCustomPlayerFieldNodes() {
    const metaBar = document.getElementById("players-data-section");
    if (!metaBar) return;
    const customDefs = getAuctionCustomPlayerFieldDefs();
    const wanted = new Set(customDefs.map((def) => def.key));

    metaBar.querySelectorAll("[data-player-field][data-custom-field='true']").forEach((el) => {
        const key = el.getAttribute("data-player-field");
        if (!wanted.has(key)) el.remove();
    });

    customDefs.forEach((def) => {
        let node = metaBar.querySelector(`[data-player-field="${def.key}"]`);
        if (!node) {
            node = document.createElement("article");
            node.className = "player-stat";
            node.setAttribute("data-player-field", def.key);
            node.setAttribute("data-custom-field", "true");
            node.innerHTML = `
                <div class="player-data-head"><span>${def.label}</span></div>
                <span class="player-data-info" id="player-field-${def.key}">—</span>
            `;
            metaBar.appendChild(node);
        } else {
            node.setAttribute("data-custom-field", "true");
            const labelEl = node.querySelector(".player-data-head span");
            if (labelEl) labelEl.textContent = def.label;
            const valueEl = node.querySelector(".player-data-info");
            if (valueEl && !valueEl.id) valueEl.id = `player-field-${def.key}`;
        }
    });
}

function applyAuctionPlayerFieldVisibility() {
    ensureAuctionCustomPlayerFieldNodes();
    document.querySelectorAll("[data-player-field]").forEach((el) => {
        const key = el.getAttribute("data-player-field");
        el.hidden = !isAuctionPlayerFieldVisible(key);
    });
    if (playerBasePriceSection) {
        playerBasePriceSection.hidden = !isAuctionPlayerFieldVisible("basePrice");
    }
    if (playerPhotoStage) {
        playerPhotoStage.hidden = !isAuctionPlayerFieldVisible("photo");
    } else if (playerPhoto) {
        playerPhoto.hidden = !isAuctionPlayerFieldVisible("photo");
    }
}

function showPlayerDetails(i) {
    triggerAnim(document.querySelector(".player-stage"), "player-swap");
    applyAuctionPlayerFieldVisibility();

    const player = state.players[i];
    syncPlayerPhotoFrameStatus(player);
    updateSoldTeamBadge(player);
    playerName.innerText = player.name;
    const photoName = document.getElementById("photo-player-name");
    if (photoName) photoName.innerText = player.name || "—";
    if (playerRole) playerRole.innerText = player.role || "—";
    setPlayerPhotoElement(playerPhoto, player.photo);
    if (playerPhoto) playerPhoto.alt = player.name;
    if (playerLocation) {
        playerLocation.innerText = player.currentClub || "—";
    }
    if (playerMobile) {
        playerMobile.innerText = player.mobile || "—";
    }
    if (playerAge) {
        playerAge.innerText = player.age != null && player.age !== ""
            ? String(player.age)
            : "—";
    }
    if (playerAgeCategory) {
        playerAgeCategory.innerText = player.ageCategory || "—";
    }
    if (playerBatting) {
        playerBatting.innerText = player.battingStyle || "—";
    }
    if (playerBowling) {
        playerBowling.innerText = player.bowlingStyle || "—";
    }
    getAuctionCustomPlayerFieldDefs().forEach((def) => {
        const valueEl =
            document.getElementById(`player-field-${def.key}`) ||
            document.querySelector(`[data-player-field="${def.key}"] .player-data-info`);
        if (!valueEl) return;
        const value =
            typeof getPlayerFieldDisplayValue === "function"
                ? getPlayerFieldDisplayValue(player, def.key)
                : player?.customFields?.[def.key];
        valueEl.innerText = value != null && String(value).trim() !== "" ? String(value) : "—";
    });
    const categoryName = normalizeCategoryName(state.players[i].category);
    const categoryMeta = getCategoryConfig(getActiveConfig(state), categoryName);
    playerCategory.innerText = categoryName;
    const maxPerTeam = Number(categoryMeta.maxPlayers) || 0;
    const poolCount = (state.allPlayers || state.players || []).filter(
        (p) => normalizeCategoryName(p.category) === categoryName
    ).length;
    const remainingInPool = (state.players || []).filter(
        (p) =>
            normalizeCategoryName(p.category) === categoryName &&
            p.status !== "sold" &&
            p.status !== "unsold" &&
            p.status !== "skipped"
    ).length;
    playerCategory.title = `Max ${maxPerTeam} per team · ${poolCount} players in this category`;
    const quotaEl = document.getElementById("player-category-quota");
    const poolEl = document.getElementById("player-category-pool");
    if (quotaEl) {
        quotaEl.textContent = maxPerTeam > 0 ? `${maxPerTeam} / team` : "";
        quotaEl.hidden = maxPerTeam <= 0;
    }
    if (poolEl) {
        poolEl.textContent =
            poolCount > 0
                ? `${remainingInPool}/${poolCount} left in pool`
                : "";
        poolEl.hidden = poolCount <= 0;
    }
    updateCategoryJumpControls();
    playerId.innerText = getPlayerDisplayCode(state.players[i]);
    const liveBase =
        Number(state.players[i].basePrice) ||
        Number(categoryMeta.basePrice) ||
        0;
    playerBasePrice.innerText = showAmount(liveBase);

    updateCurrentBidPanel(state.players[i]);


    // --- 💡 NEW CONSOLIDATED UI LOGIC (Using classList) ---
    const playerStatus = state.players[i].status;
    const hasBids = state.players[i].bids.length > 0;
    const statusChip = document.getElementById("player-status-chip");

    // Use 'style.display' for buttons (this is fine)
    // Use 'classList' for seals
    if (playerStatus === "sold") {
        // Player is SOLD
        soldButton.style.display = "none";
        unsoldButton.style.display = "none";
        nextButton.style.display = "block";
        unsoldSeal.classList.remove("show");
        playSoldSealAnimation();
        if (statusChip) {
            statusChip.dataset.status = "sold";
            statusChip.textContent = "SOLD";
        }

    } else if (playerStatus === "unsold" || playerStatus === "skipped") {
        // Player is UNSOLD or SKIPPED
        soldButton.style.display = "none";
        unsoldButton.style.display = "none";
        nextButton.style.display = "block";
        soldSeal.classList.remove("show", "is-animating");
        unsoldSeal.classList.add("show");
        if (statusChip) {
            statusChip.dataset.status = playerStatus;
            statusChip.textContent = playerStatus === "skipped" ? "SKIPPED" : "UNSOLD";
        }

    } else { 
        // Player is "not-auctioned" (i.e., bidding is active)
        soldSeal.classList.remove("show", "is-animating");
        unsoldSeal.classList.remove("show");
        if (statusChip) {
            statusChip.dataset.status = hasBids ? "bidding" : "live";
            statusChip.textContent = hasBids ? "BIDDING" : "LIVE";
        }

        if (hasBids) {
            // Active with bids
            soldButton.style.display = "block";
            unsoldButton.style.display = "none";
            nextButton.style.display = "none";
        } else {
            // Active with NO bids
            soldButton.style.display = "none";
            unsoldButton.style.display = "block";
            nextButton.style.display = "none";
        }
    }
}

function getTeamSquadCapacity(auctionState = state) {
    const config = getActiveConfig(auctionState);
    return Object.values(config.categories || {}).reduce(
        (sum, category) => sum + (Number(category?.maxPlayers) || 0),
        0
    );
}

function setCurrentBidTeamLogo(team) {
    const logoEl = document.getElementById("current-bid-team-logo");
    if (!logoEl) return;

    const logoSrc =
        team && typeof getTeamLogoSrc === "function"
            ? String(getTeamLogoSrc(team) || "").trim()
            : String(team?.logo || "").trim();

    if (!team || !logoSrc) {
        logoEl.hidden = true;
        logoEl.removeAttribute("src");
        logoEl.alt = "";
        return;
    }

    logoEl.onerror = () => {
        logoEl.hidden = true;
    };
    logoEl.onload = () => {
        logoEl.hidden = false;
    };
    logoEl.alt = `${team.team_name || "Team"} logo`;
    logoEl.hidden = false;
    logoEl.src = logoSrc;
}

function updateCurrentBidPanel(player) {
    const bidSection = document.getElementById("current-bid-section");
    const teamPanel = document.getElementById("current-bid-team-panel");
    const teamStats = document.getElementById("current-bid-team-stats");
    const purseEl = document.getElementById("current-bid-team-purse");
    const reservedEl = document.getElementById("current-bid-team-reserved");
    const spendableEl = document.getElementById("current-bid-team-spendable");
    const pendingEl = document.getElementById("current-bid-team-pending");
    const slotsEl = document.getElementById("current-bid-team-slots");

    if (!player || !player.bids || player.bids.length === 0) {
        currentBidAmount.innerText = "00K";
        currentBidTeam.innerText = "NO BIDS";
        setCurrentBidTeamLogo(null);
        if (teamPanel) teamPanel.style.backgroundColor = "#73849a";
        if (bidSection) bidSection.dataset.hasBidder = "false";
        if (teamStats) teamStats.hidden = true;
        if (purseEl) purseEl.textContent = "—";
        if (reservedEl) reservedEl.textContent = "—";
        if (spendableEl) spendableEl.textContent = "—";
        if (pendingEl) pendingEl.textContent = "—";
        if (slotsEl) slotsEl.textContent = "—";
        return;
    }

    const lastBid = player.bids[player.bids.length - 1];
    const team = findTeam(lastBid.team);
    const quota = team
        ? getCategoryQuotaStatus(state, team.team_id, player.category)
        : null;
    const budget =
        team && typeof getTeamSpendableBudget === "function"
            ? getTeamSpendableBudget(state, team.team_id, {
                  fillingCategory: player.category
              })
            : null;
    const capacity = getTeamSquadCapacity(state);
    const bought = Number(team?.player_bought) || 0;
    const slotsLeft = Math.max(0, capacity - bought);
    // After this buy they'd use one slot; pending for category is slots still open
    const categoryPending = quota ? Math.max(0, quota.remaining) : 0;

    currentBidAmount.innerText = showAmount(lastBid.amount);
    currentBidTeam.innerText = team ? team.team_name : "UNKNOWN";
    setCurrentBidTeamLogo(team || null);
    if (teamPanel) teamPanel.style.backgroundColor = team ? team.color : "#12a39a";
    if (bidSection) bidSection.dataset.hasBidder = "true";

    if (teamStats) teamStats.hidden = !team;
    if (purseEl) {
        purseEl.textContent = team ? showAmount(team.remaining_budget) : "—";
        purseEl.title = team ? `Remaining purse: ${formatMoney(team.remaining_budget)}` : "";
    }
    if (reservedEl) {
        reservedEl.textContent = budget ? showAmount(budget.reserve) : "—";
        reservedEl.title = budget
            ? `Reserved for ${budget.remainingSlots} remaining category minimums: ${formatMoney(budget.reserve)}`
            : "";
    }
    if (spendableEl) {
        spendableEl.textContent = budget ? showAmount(budget.spendable) : "—";
        spendableEl.title = budget
            ? `Max bid now after reserves: ${formatMoney(budget.spendable)}`
            : "";
    }
    if (pendingEl) {
        pendingEl.textContent = quota ? `${categoryPending}` : "—";
        pendingEl.title = quota
            ? `${quota.owned}/${quota.max} ${displayCategoryName(quota.name)} bought · ${categoryPending} pending in category`
            : "";
    }
    if (slotsEl) {
        slotsEl.textContent = `${slotsLeft}`;
        slotsEl.title = `${bought}/${capacity} squad filled · ${slotsLeft} slots left overall`;
    }
}

// Bid increments scaled for Rs auctions (Lakh / Crore).
function bidIncrement(currentBid) {
  if (currentBid >= 10000000) { // 1 Cr+
    return 500000; // +5 L
  } else if (currentBid >= 5000000) { // 50 L+
    return 200000; // +2 L
  } else if (currentBid >= 1000000) { // 10 L+
    return 100000; // +1 L
  }
  // Below 10 L: minimum step is 50 K (no 25 K / 10 K)
  return 50000;
}

function isOverlayBlockingBids() {
    const wheelOpen = document.getElementById("player-wheel-modal")?.style.display === "flex";
    const categoryOpen = document.getElementById("category-complete-modal")?.style.display === "flex";

    // Clear stale flags if the overlays are already closed
    if (playerWheelBusy && !wheelOpen) playerWheelBusy = false;
    if (categoryGateBusy && !categoryOpen) categoryGateBusy = false;

    return (playerWheelBusy && wheelOpen) || (categoryGateBusy && categoryOpen);
}

function bidPlayer(team_id) {
    if (isOverlayBlockingBids()) return;

    const player = state.players[state.auctionCount];
    const team = findTeam(team_id);
    if (!player || !team) return;

    if (!Array.isArray(player.bids)) player.bids = [];

    const status = String(player.status || "not-auctioned").toLowerCase();
    // Prevent bidding for finished players
    if (status === "unsold" || status === "sold" || status === "skipped") {
        console.log(`Can't bid: ${player.name} is already ${status}.`);
        return;
    }

    const quota = getCategoryQuotaStatus(state, team_id, player.category);
    if (quota.isFull) {
        alert(`${team.team_name} already has ${quota.owned}/${quota.max} ${quota.name} players.`);
        return;
    }

    const basePrice = Number(player.basePrice) || 0;
    let bidAmount;

    if (player.bids.length === 0) {
        // First bid = base price
        bidAmount = basePrice;
    } else {
        const lastBid = player.bids[player.bids.length - 1];
        if (!lastBid) return;
        const nextAmount = Number(lastBid.amount) + bidIncrement(Number(lastBid.amount));

        // Prevent same team from bidding twice in a row
        if (Number(lastBid.team) === Number(team_id)) {
            console.log(`${team.team_name} already has the current bid.`);
            return;
        }
        bidAmount = nextAmount;
    }

    if (!Number.isFinite(bidAmount) || bidAmount <= 0) return;

    const afford =
        typeof canTeamAffordBid === "function"
            ? canTeamAffordBid(state, team_id, bidAmount, { fillingCategory: player.category })
            : {
                  ok: team.remaining_budget >= bidAmount,
                  purse: team.remaining_budget,
                  reserve: 0,
                  spendable: team.remaining_budget,
                  remainingSlots: 0
              };
    if (!afford.ok) {
        const reserveText =
            typeof formatMoney === "function" ? formatMoney(afford.reserve) : String(afford.reserve);
        const spendableText =
            typeof formatMoney === "function"
                ? formatMoney(afford.spendable)
                : String(afford.spendable);
        const bidText =
            typeof formatMoney === "function" ? formatMoney(bidAmount) : String(bidAmount);
        alert(
            `${team.team_name} cannot bid ${bidText}.\n` +
                `Must keep ${reserveText} reserved for ${afford.remainingSlots} remaining category minimums.\n` +
                `Spendable now: ${spendableText}.`
        );
        return;
    }

    //Save history
    saveHistory();

    state.players[state.auctionCount].bids.push({
        team: Number(team_id),
        amount: bidAmount
    });
    console.log(`${state.players[state.auctionCount].name} is bidded by ${team.team_name}`);

    // Keep master list in sync
    const master = state.allPlayers?.find((p) => p.id === player.id);
    if (master && master !== player) {
        if (!Array.isArray(master.bids)) master.bids = [];
        master.bids = player.bids.slice();
    }

    //Update the UI
    renderUI();
    triggerAnim(document.getElementById("current-bid"), "updated");
    triggerAnim(document.getElementById("current-bid-section"), "live-bid");
    triggerAnim(document.getElementById(`team-${team_id}`), "bid-flash");
    triggerAnim(document.getElementById(`team-rail-${team_id}`), "bid-flash");

    // Disk-first mid-auction save (await so refresh is safe)
    saveAuctionProgress({ awaitDisk: true, critical: true });
}

/** Drop in-memory data-URL media so saves fit browser/disk quotas. Logos reload from Config. */
function leanAuctionState(source) {
    let next;
    try {
        next = JSON.parse(JSON.stringify(source || {}));
    } catch (_) {
        next = { ...(source || {}) };
    }
    delete next.config;
    (next.teams || []).forEach((team) => {
        if (!team || typeof team !== "object") return;
        const logo = String(team.logo || "");
        if (!logo || logo.startsWith("data:")) delete team.logo;
        const video = String(team.video || "");
        if (!video || video.startsWith("data:")) delete team.video;
    });
    const slimPlayers = (list) => {
        (list || []).forEach((player) => {
            if (!player || typeof player !== "object") return;
            const photo = String(player.photo || "");
            if (photo.startsWith("data:")) player.photo = "assets/placeholder.png";
        });
    };
    slimPlayers(next.players);
    slimPlayers(next.allPlayers);
    return next;
}

function leanHistoryData(source, maxSteps = 3) {
    const undo = Array.isArray(source?.undoStack) ? source.undoStack.slice(-maxSteps) : [];
    const redo = Array.isArray(source?.redoStack) ? source.redoStack.slice(-maxSteps) : [];
    return {
        undoStack: undo.map((snap) => leanAuctionState(snap)),
        redoStack: redo.map((snap) => leanAuctionState(snap))
    };
}

function buildAuctionSavePayload() {
    return {
        auctionState: leanAuctionState(state),
        // Keep tiny undo on disk only; browser mirror skips history
        historyData: leanHistoryData(history, 3),
        savedAt: Date.now()
    };
}

/** Remove oversized auction caches left by older builds (logos + undo copies). */
function purgeBloatedAuctionBrowserCache() {
    const keys = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (key === "auctionData" || key.startsWith("auctionData:")) keys.push(key);
        }
    } catch (_) {
        return;
    }
    keys.forEach((key) => {
        try {
            const raw = localStorage.getItem(key) || "";
            // > ~750KB is too fat for a lean auction mirror
            if (raw.length > 750000) {
                localStorage.removeItem(key);
                console.warn("Purged bloated browser auction cache:", key, raw.length);
            }
        } catch (_) {
            try {
                localStorage.removeItem(key);
            } catch (__) {
                // ignore
            }
        }
    });
}

function writeLeanAuctionBrowserMirror(divisionId, data) {
    const key = getAuctionDataStorageKey(divisionId);
    // Browser gets state only — no undo history (that is what blew the 5MB quota)
    const mirror = {
        auctionState: data.auctionState,
        historyData: { undoStack: [], redoStack: [] },
        savedAt: data.savedAt || Date.now()
    };
    localStorage.setItem(key, JSON.stringify(mirror));
}

/**
 * Expert mid-auction save:
 * 1) Disk auction.json is source of truth
 * 2) Browser cache is only a tiny lean mirror (optional)
 * Never block the desk on browser quota when disk save works.
 */
async function saveAuctionProgress({ awaitDisk = false, critical = false } = {}) {
    const divisionId = state.divisionId || welcomeConfigCache?.activeDivisionId || "div_1";
    const data = buildAuctionSavePayload();
    let diskOk = false;
    let localOk = false;

    if (typeof persistAuctionToProjectFolder === "function") {
        try {
            const pending = persistAuctionToProjectFolder(divisionId, data);
            if (awaitDisk) {
                const result = await pending;
                if (typeof flushProjectPersistQueue === "function") {
                    await flushProjectPersistQueue();
                }
                diskOk = result !== false;
            } else {
                pending
                    .then((result) => {
                        if (result === false) {
                            console.warn("auction.json sync skipped (API not ready).");
                        }
                    })
                    .catch((error) => {
                        console.warn("Could not write auction.json:", error?.message || error);
                    });
                diskOk = true; // queued; desk continues
            }
        } catch (error) {
            console.warn("Could not write auction.json:", error?.message || error);
            diskOk = false;
        }
    }

    try {
        writeLeanAuctionBrowserMirror(divisionId, data);
        localOk = true;
    } catch (error) {
        console.warn("Browser auction mirror skipped (quota). Disk remains source of truth.", error);
        try {
            // Clear old fat cache once, then retry tiny mirror
            purgeBloatedAuctionBrowserCache();
            localStorage.removeItem(getAuctionDataStorageKey(divisionId));
            writeLeanAuctionBrowserMirror(divisionId, data);
            localOk = true;
        } catch (_) {
            localOk = false;
        }
    }

    if (critical && !diskOk && !localOk) {
        alert("Could not save auction progress. Keep node server.js running, then bid/sold again.");
    }
    console.log(
        diskOk
            ? localOk
                ? "Auction saved to disk + browser mirror."
                : "Auction saved to disk (browser mirror skipped)."
            : localOk
              ? "Auction saved to browser mirror only (disk unavailable)."
              : "Auction save failed."
    );
    return { diskOk, localOk };
}

function saveData() {
    // Fire-and-forget for normal UI paths; disk-first under the hood
    saveAuctionProgress({ awaitDisk: false, critical: false });
}

async function flushAuctionProgressToDisk() {
    await saveAuctionProgress({ awaitDisk: true, critical: false });
}

function unsoldPlayer() {
    //Prevent player to unsold after a bid is placed
    if (state.players[state.auctionCount].bids.length > 0) {
        console.log("A player can't be unsold because atleast one bid is placed.");
        return;
    }

    const player = state.players[state.auctionCount];

    saveHistory();
    markPlayerUnsold(player, { reason: "unsold" });
    renderUI();
    saveAuctionProgress({ awaitDisk: true, critical: true });
}

let soldCelebrationTimer = null;
let soldCelebrationVideoHandler = null;

function hideTeamSoldVideo() {
    const overlay = document.getElementById("team-sold-video");
    const videoEl = document.getElementById("team-sold-video-el");
    if (soldCelebrationTimer) {
        clearTimeout(soldCelebrationTimer);
        soldCelebrationTimer = null;
    }
    if (videoEl) {
        if (soldCelebrationVideoHandler) {
            videoEl.removeEventListener("ended", soldCelebrationVideoHandler);
            soldCelebrationVideoHandler = null;
        }
        videoEl.pause();
        videoEl.removeAttribute("src");
        try {
            videoEl.load();
        } catch (_) {
            // ignore
        }
    }
    if (overlay) {
        overlay.classList.remove("is-active");
        overlay.dataset.mode = "logo";
        overlay.hidden = true;
    }
}

function playSoldSealAnimation() {
    if (!soldSeal) return;
    const frame = document.getElementById("player-photo-frame") || document.querySelector(".squareBox");
    soldSeal.classList.remove("show", "is-animating");
    if (frame) frame.classList.remove("is-stamp-impact");
    // Restart CSS animation when a player is sold again
    void soldSeal.offsetWidth;
    soldSeal.classList.add("show", "is-animating");
    if (frame) {
        void frame.offsetWidth;
        frame.classList.add("is-stamp-impact");
    }
}

function updateSoldTeamBadge(player) {
    const badge = document.getElementById("sold-team-badge");
    const logoEl = document.getElementById("sold-team-badge-logo");
    const nameEl = document.getElementById("sold-team-badge-name");
    const priceEl = document.getElementById("sold-seal-price");
    const seal = document.getElementById("sold-seal");
    if (!badge) return;

    const team = player?.status === "sold" ? findTeam(player.team) : null;
    if (!team) {
        badge.hidden = true;
        if (seal) seal.style.removeProperty("--sold-team-color");
        if (logoEl) {
            logoEl.hidden = true;
            logoEl.removeAttribute("src");
            logoEl.alt = "";
        }
        if (nameEl) nameEl.textContent = "";
        if (priceEl) {
            priceEl.hidden = true;
            priceEl.textContent = "";
        }
        return;
    }

    const logoSrc =
        typeof getTeamLogoSrc === "function" ? getTeamLogoSrc(team) : String(team.logo || "").trim();
    const accent = String(team.color || "").trim() || "#149e63";
    if (seal) seal.style.setProperty("--sold-team-color", accent);

    badge.hidden = false;
    if (nameEl) nameEl.textContent = team.team_name || "Team";
    if (priceEl) {
        const priceText =
            player?.finalPrice != null && typeof showAmount === "function"
                ? showAmount(player.finalPrice)
                : "";
        priceEl.textContent = priceText ? `For ${priceText}` : "";
        priceEl.hidden = !priceText;
    }
    if (logoEl) {
        logoEl.alt = `${team.team_name || "Team"} logo`;
        if (logoSrc) {
            logoEl.hidden = false;
            logoEl.src = logoSrc;
            logoEl.onerror = () => {
                logoEl.hidden = true;
            };
        } else {
            logoEl.hidden = true;
            logoEl.removeAttribute("src");
        }
    }
}

function syncPlayerPhotoFrameStatus(player) {
    const frame = document.getElementById("player-photo-frame") || document.querySelector(".squareBox");
    if (!frame) return;
    const status = player?.status || "live";
    if (status === "sold") frame.dataset.status = "sold";
    else if (status === "unsold" || status === "skipped") frame.dataset.status = status;
    else frame.dataset.status = "live";
}

/** Always show sold celebration with team logo + name; play team video when available. */
function maybeShowTeamSoldVideo(team, player) {
    const overlay = document.getElementById("team-sold-video");
    const videoEl = document.getElementById("team-sold-video-el");
    const logoEl = document.getElementById("team-sold-logo");
    const nameEl = document.getElementById("team-sold-video-name");
    const metaEl = document.getElementById("team-sold-video-meta");
    const priceEl = document.getElementById("team-sold-price");
    const barLineEl = document.getElementById("team-sold-bar-line");
    if (!overlay || !team) return;

    if (soldCelebrationTimer) {
        clearTimeout(soldCelebrationTimer);
        soldCelebrationTimer = null;
    }

    const teamName = team.team_name || "Team";
    const logoSrc =
        typeof getTeamLogoSrc === "function" ? getTeamLogoSrc(team) : String(team.logo || "").trim();
    const videoSrc =
        typeof getTeamVideoSrc === "function"
            ? getTeamVideoSrc(team)
            : String(team.video || "").trim();
    const category = displayCategoryName(normalizeCategoryName(player?.category));
    const priceText =
        player?.finalPrice != null && typeof showAmount === "function"
            ? showAmount(player.finalPrice)
            : player?.finalPrice != null
              ? String(player.finalPrice)
              : "";

    if (nameEl) nameEl.textContent = teamName;
    if (metaEl) {
        metaEl.textContent = player?.name
            ? `${player.name}${category ? ` · ${category}` : ""}`
            : "";
    }
    if (priceEl) priceEl.textContent = priceText ? `Sold for ${priceText}` : "";
    if (barLineEl) {
        barLineEl.textContent = player?.name
            ? `${player.name} → ${teamName}`
            : `${teamName} wins the bid`;
    }
    if (logoEl) {
        logoEl.alt = `${teamName} logo`;
        if (logoSrc) {
            logoEl.hidden = false;
            logoEl.src = logoSrc;
            logoEl.onerror = () => {
                logoEl.hidden = true;
            };
        } else {
            logoEl.hidden = true;
            logoEl.removeAttribute("src");
        }
    }

    const teamColor = String(team.color || "").trim();
    if (teamColor) overlay.style.setProperty("--sold-team-color", teamColor);
    else overlay.style.removeProperty("--sold-team-color");

    overlay.hidden = false;
    overlay.dataset.mode = videoSrc ? "video" : "logo";
    // Restart CSS entrance animations
    overlay.classList.remove("is-active");
    void overlay.offsetWidth;
    overlay.classList.add("is-active");

    if (videoEl) {
        if (soldCelebrationVideoHandler) {
            videoEl.removeEventListener("ended", soldCelebrationVideoHandler);
            soldCelebrationVideoHandler = null;
        }
        if (videoSrc) {
            videoEl.muted = true;
            videoEl.playsInline = true;
            videoEl.loop = false;
            videoEl.src = videoSrc;
            soldCelebrationVideoHandler = () => hideTeamSoldVideo();
            videoEl.addEventListener("ended", soldCelebrationVideoHandler);
            videoEl.play().catch(() => {
                // Keep logo celebration if autoplay fails
                soldCelebrationTimer = setTimeout(hideTeamSoldVideo, 4200);
            });
        } else {
            videoEl.removeAttribute("src");
            try {
                videoEl.load();
            } catch (_) {
                // ignore
            }
            soldCelebrationTimer = setTimeout(hideTeamSoldVideo, 4200);
        }
    } else {
        soldCelebrationTimer = setTimeout(hideTeamSoldVideo, 4200);
    }
}

function soldPlayer() {
    //prevent player to be sold until a bid is placed
    if(state.players[state.auctionCount].bids.length === 0){
        console.log("Can't sold this player because no bid is placed");
        return;
    }

    const player = state.players[state.auctionCount];  //current_player
    const lastBid = player.bids[player.bids.length - 1];        //take the final bid of the players
    const team = findTeam(lastBid.team);
    if (!team) return;

    const quota = getCategoryQuotaStatus(state, lastBid.team, player.category);
    if (quota.isFull) {
        alert(`${team.team_name} already has the maximum ${quota.max} ${quota.name} players. Undo the bid or choose another team.`);
        return;
    }

    //Save history
    saveHistory();

    state.soldPlayers.push(player.id);       //add player id in the sold players list

    //change the status of the player at the main player object at the players array
    state.players[state.auctionCount].status = "sold";

    state.soldCount++;       //increase the sold player count

    //Update the main player object
    state.players[state.auctionCount].finalPrice = lastBid.amount;
    state.players[state.auctionCount].team = lastBid.team;

    // --- 💡 FIX: UPDATE THE MASTER LIST (state.allPlayers) ---
    const playerInMasterList = state.allPlayers.find(p => p.id === player.id);
    if (playerInMasterList) {
        playerInMasterList.status = "sold";
        playerInMasterList.finalPrice = lastBid.amount;
        playerInMasterList.team = lastBid.team;
    }

    //update the main team object
    team.players.push(player.id);       //add the player id in the state.teams' player list
    team.player_bought++;               //Increase total numbers of player
    team.total_cost += lastBid.amount;        //Update teams' total cost
    team.remaining_budget = team.team_budget - team.total_cost;        //Update teams' remaining budget

    console.log(`${player.name} is sold to ${team.team_name}`);

    //Update the UI with updated team data
    renderTeams();

    // Stay on the desk: sold stamp/logo animates on the player photo (no full-page interrupt)
    if (typeof hideTeamSoldVideo === "function") hideTeamSoldVideo();
    renderUI();

    saveAuctionProgress({ awaitDisk: true, critical: true });
}

const WHEEL_COLORS = [
    "#e74c3c", "#3498db", "#27ae60", "#9b59b6", "#f39c12", "#16a085",
    "#d35400", "#1f9ad6", "#c23b8a", "#4f5bd5", "#0f766e", "#b45309"
];

let playerWheelBusy = false;
let playerWheelTimer = null;
let playerWheelSpotlightTimer = null;
let playerWheelResolve = null;
let categoryGateBusy = false;
let pendingCategoryTransition = null;

function shuffleCopy(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr;
}

function isPlayerWheelEnabled() {
    return getActiveConfig(state).playerWheelEnabled !== false;
}

function isAuctionSettledStatus(status) {
    const value = String(status || "").toLowerCase();
    return value === "sold" || value === "unsold" || value === "skipped";
}

function isWheelEligiblePlayer(player) {
    if (!player) return false;
    // Sold / unsold / skipped never appear on the spinner
    return !isAuctionSettledStatus(player.status);
}

/** Master roster — never trust a truncated live queue alone. */
function getMasterPlayers() {
    if (Array.isArray(state.allPlayers) && state.allPlayers.length) {
        return state.allPlayers;
    }
    return Array.isArray(state.players) ? state.players : [];
}

/**
 * Rebuild live auction queue from allPlayers when waiting players were dropped
 * (false "Round Complete / All sold" with not-auctioned left in master).
 * Returns true when there is still someone to auction.
 */
function rebuildAuctionQueueFromMaster() {
    const master = getMasterPlayers();
    if (!master.length) return false;

    const config = getActiveConfig(state);
    const ordered =
        typeof orderPlayersForAuction === "function"
            ? orderPlayersForAuction(master, config)
            : master.slice();

    state.allPlayers = master;
    state.players = ordered;

    const locked = state.activeAuctionCategory
        ? normalizeCategoryName(state.activeAuctionCategory)
        : "";
    const nextIndex = ordered.findIndex((player) => {
        if (isAuctionSettledStatus(player.status)) return false;
        if (!locked) return true;
        return normalizeCategoryName(player.category) === locked;
    });
    if (nextIndex < 0) {
        // Keep pointer inside the locked category when possible — never auto-skip to Evergreen
        if (locked) {
            const inLocked = ordered.findIndex(
                (player) => normalizeCategoryName(player.category) === locked
            );
            state.auctionCount = inLocked >= 0 ? inLocked : ordered.length;
            return false;
        }
        state.auctionCount = ordered.length;
        return false;
    }

    state.auctionCount = nextIndex;
    return true;
}

/** If the live queue is missing unsettled master players, repair it. */
function ensureAuctionQueueFromMaster() {
    const master = getMasterPlayers();
    if (!master.length) return false;

    const queue = Array.isArray(state.players) ? state.players : [];
    const queueIds = new Set(queue.map((player) => player.id));
    // Only repair when unsettled players are missing — sold Icon/Caption may
    // intentionally be absent from the live queue (shorter than master).
    const missingUnsettled = master.some(
        (player) => !isAuctionSettledStatus(player.status) && !queueIds.has(player.id)
    );

    if (missingUnsettled) {
        return rebuildAuctionQueueFromMaster();
    }

    const locked = state.activeAuctionCategory
        ? normalizeCategoryName(state.activeAuctionCategory)
        : "";
    const current = queue[state.auctionCount];
    if (!current || isAuctionSettledStatus(current.status)) {
        const nextIndex = queue.findIndex((player, index) => {
            if (index < Number(state.auctionCount || 0)) return false;
            if (isAuctionSettledStatus(player.status)) return false;
            if (!locked) return true;
            return normalizeCategoryName(player.category) === locked;
        });
        if (nextIndex >= 0) {
            state.auctionCount = nextIndex;
            return true;
        }
        // Category exhausted — do not jump into the next category here
        if (locked) return false;
        return rebuildAuctionQueueFromMaster();
    }

    return true;
}

function getAuctionOrderMode() {
    return getActiveConfig(state).auctionOrder === "RANDOM" ? "RANDOM" : "SEQUENCE";
}

function getWheelEligiblePlayers() {
    return (state.players || []).filter(isWheelEligiblePlayer);
}

/**
 * Spinner pool:
 * - RANDOM auction → all remaining players
 * - Category sequence → only remaining players in the active category
 */
function getWheelPoolPlayers(anchorPlayer = null) {
    const remaining = getWheelEligiblePlayers();
    if (getAuctionOrderMode() === "RANDOM") return remaining;

    const locked = getCurrentAuctionCategoryName();
    const anchor =
        anchorPlayer ||
        state.players?.[state.auctionCount] ||
        remaining[0] ||
        null;
    const category =
        locked ||
        (anchor ? normalizeCategoryName(anchor.category) : "");
    if (!category) return [];

    const sameCategory = remaining.filter(
        (player) => normalizeCategoryName(player.category) === category
    );
    // Never fall back to a mixed pool during category sequence
    return sameCategory;
}

function getWheelTargetPlayer() {
    const players = state.players || [];
    const current = players[state.auctionCount];
    if (isWheelEligiblePlayer(current)) return current;

    for (let i = state.auctionCount + 1; i < players.length; i++) {
        if (isWheelEligiblePlayer(players[i])) return players[i];
    }

    return getWheelEligiblePlayers()[0] || null;
}

function buildWheelCandidates(winner) {
    if (!isWheelEligiblePlayer(winner)) return [];

    const remaining = getWheelPoolPlayers(winner);
    const pool = shuffleCopy(remaining.filter((player) => player.id !== winner.id));
    const picks = [winner, ...pool].slice(0, 12);

    const unique = [];
    const seen = new Set();
    picks.forEach((player) => {
        if (!player || seen.has(player.id) || !isWheelEligiblePlayer(player)) return;
        seen.add(player.id);
        unique.push(player);
    });
    if (!unique.find((player) => player.id === winner.id)) unique.unshift(winner);
    return shuffleCopy(unique);
}

async function openPlayerWheelShowcase() {
    if (playerWheelBusy) return;

    const winner = getWheelTargetPlayer();
    if (!winner) {
        console.log("No remaining players available for the wheel.");
        return;
    }

    await runPlayerWheel(winner);
}

function updateWheelSpotlight(player, { finalReveal = false } = {}) {
    const photo = document.getElementById("wheel-result-photo");
    const name = document.getElementById("wheel-result-name");
    const meta = document.getElementById("wheel-result-meta");
    const label = document.getElementById("wheel-spotlight-label");
    const spotlight = document.getElementById("wheel-spotlight");
    if (!player) return;

    if (photo) {
        setPlayerPhotoElement(photo, player.photo);
    }
    if (name) name.textContent = player.name || "—";
    if (meta) {
        const category = displayCategoryName(normalizeCategoryName(player.category));
        meta.textContent = `${player.role || "Player"} · ${category}`;
    }
    if (label) label.textContent = finalReveal ? "Selected player" : "Spinning";
    if (spotlight) spotlight.classList.toggle("is-winner", Boolean(finalReveal));
}

function closePlayerWheel() {
    const modal = document.getElementById("player-wheel-modal");
    const wheel = document.getElementById("player-wheel");
    if (playerWheelTimer) {
        clearTimeout(playerWheelTimer);
        playerWheelTimer = null;
    }
    if (playerWheelSpotlightTimer) {
        clearInterval(playerWheelSpotlightTimer);
        playerWheelSpotlightTimer = null;
    }
    if (modal) {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }
    if (wheel) {
        wheel.style.transition = "none";
        wheel.style.transform = "rotate(0deg)";
    }
    playerWheelBusy = false;
    const resolve = playerWheelResolve;
    playerWheelResolve = null;
    if (resolve) resolve();
}

function runPlayerWheel(winner) {
    return new Promise((resolve) => {
        const modal = document.getElementById("player-wheel-modal");
        const wheel = document.getElementById("player-wheel");
        const skipBtn = document.getElementById("wheel-skip-btn");
        if (!modal || !wheel || !isWheelEligiblePlayer(winner)) {
            resolve();
            return;
        }

        const poolPlayers = getWheelPoolPlayers(winner);
        const remainingCount = poolPlayers.length;
        const candidates = buildWheelCandidates(winner);
        if (!candidates.length) {
            resolve();
            return;
        }

        playerWheelBusy = true;
        playerWheelResolve = resolve;

        const orderMode = getAuctionOrderMode();
        const categoryLabel = displayCategoryName(normalizeCategoryName(winner.category));
        const title = modal.querySelector(".wheel-title");
        const subtitle = modal.querySelector(".wheel-subtitle");
        const eyebrow = modal.querySelector(".wheel-eyebrow");

        // Breakdown so a huge count is clearly "this category only" vs whole auction
        const allEligible = getWheelEligiblePlayers();
        const counts = {};
        allEligible.forEach((player) => {
            const name = displayCategoryName(normalizeCategoryName(player.category));
            counts[name] = (counts[name] || 0) + 1;
        });
        const breakdown = Object.entries(counts)
            .map(([name, count]) => `${name} ${count}`)
            .join(" · ");

        if (eyebrow) {
            eyebrow.textContent =
                orderMode === "RANDOM"
                    ? `Player Wheel · Random · ${allEligible.length} left`
                    : `Player Wheel · ${categoryLabel} only · ${breakdown || "—"}`;
        }
        if (title) {
            title.textContent =
                orderMode === "RANDOM"
                    ? "Selecting next player"
                    : `Selecting ${categoryLabel}`;
        }
        if (subtitle) {
            subtitle.textContent =
                orderMode === "RANDOM"
                    ? `Spinning ${remainingCount} remaining player${remainingCount === 1 ? "" : "s"}…`
                    : `Spinning ${remainingCount} ${categoryLabel} player${remainingCount === 1 ? "" : "s"} left in this category…`;
        }

        const sliceAngle = 360 / candidates.length;
        const winnerIndex = Math.max(
            0,
            candidates.findIndex((player) => player.id === winner.id)
        );

        const conic = candidates
            .map((player, index) => {
                const color = WHEEL_COLORS[index % WHEEL_COLORS.length];
                const start = index * sliceAngle;
                const end = (index + 1) * sliceAngle;
                return `${color} ${start}deg ${end}deg`;
            })
            .join(", ");

        wheel.innerHTML = "";
        wheel.style.background = `conic-gradient(from -90deg, ${conic})`;

        candidates.forEach((player, index) => {
            const label = document.createElement("div");
            label.className = "wheel-label";
            const angle = -90 + index * sliceAngle + sliceAngle / 2;
            const cat = displayCategoryName(normalizeCategoryName(player.category));
            label.style.setProperty("--wheel-angle", `${angle}deg`);
            label.innerHTML = `
                <div class="wheel-label-card">
                    <img src="${player.photo || "assets/placeholder.png"}" alt="" onerror="this.src='assets/placeholder.png'">
                    <span>${player.name}</span>
                    <small>${cat}</small>
                </div>
            `;
            wheel.appendChild(label);
        });

        const spotlight = document.getElementById("wheel-spotlight");
        if (spotlight) spotlight.classList.remove("is-winner");
        updateWheelSpotlight(candidates[0], { finalReveal: false });

        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");

        // Pointer sits at top. Segments start from -90deg (top) going clockwise.
        const winnerCenterFromTop = winnerIndex * sliceAngle + sliceAngle / 2;
        const targetRotation = 360 * 6 + (360 - winnerCenterFromTop);

        wheel.style.transition = "none";
        wheel.style.transform = "rotate(0deg)";
        void wheel.offsetWidth;
        wheel.style.transition = "transform 4.2s cubic-bezier(0.12, 0.75, 0.12, 1)";
        wheel.style.transform = `rotate(${targetRotation}deg)`;

        let tick = 0;
        playerWheelSpotlightTimer = setInterval(() => {
            tick += 1;
            const preview = candidates[tick % candidates.length];
            updateWheelSpotlight(preview, { finalReveal: false });
        }, 120);

        const finish = () => {
            if (playerWheelSpotlightTimer) {
                clearInterval(playerWheelSpotlightTimer);
                playerWheelSpotlightTimer = null;
            }
            updateWheelSpotlight(winner, { finalReveal: true });
            playerWheelTimer = setTimeout(() => {
                closePlayerWheel();
            }, 900);
        };

        playerWheelTimer = setTimeout(finish, 4300);

        if (skipBtn) {
            skipBtn.onclick = () => {
                updateWheelSpotlight(winner, { finalReveal: true });
                closePlayerWheel();
            };
        }
    });
}

async function revealPlayerAtCount(index, { useWheel = true } = {}) {
    if (index >= state.players.length) {
        renderUI();
        return;
    }

    const shouldSpin = useWheel && isPlayerWheelEnabled() && !playerWheelBusy;
    if (shouldSpin) {
        await runPlayerWheel(state.players[index]);
    }
    renderUI();
    console.log(`${state.players[index].name}'s data loaded`);
}

function getCategoryRoundStats(categoryName) {
    const name = normalizeCategoryName(categoryName);
    // Use master roster so a truncated live queue cannot fake "category complete"
    const inCategory = getMasterPlayers().filter(
        (player) => normalizeCategoryName(player.category) === name
    );
    const sold = inCategory.filter((player) => player.status === "sold").length;
    // Skipped players count as unsold for category summary / re-auction pool
    const unsold = inCategory.filter(
        (player) => player.status === "unsold" || player.status === "skipped"
    ).length;
    const pending = Math.max(0, inCategory.length - sold - unsold);
    return {
        total: inCategory.length,
        sold,
        unsold,
        skipped: 0,
        pending
    };
}

function findCategoryCompletion(fromIndex) {
    const players = state.players || [];
    const current = players[fromIndex];
    if (!current) return null;

    const fromCategory = normalizeCategoryName(current.category);
    const stats = getCategoryRoundStats(fromCategory);
    // Category is finished only when nobody in this category is still waiting
    if ((stats.pending || 0) > 0) return null;

    const remaining = players.slice(fromIndex + 1);
    if (!remaining.length) return null;

    const nextPlayerInQueue = remaining.find(
        (player) => normalizeCategoryName(player.category) !== fromCategory
    );
    if (!nextPlayerInQueue) return null;

    const toCategory = normalizeCategoryName(nextPlayerInQueue.category);
    if (!toCategory || toCategory === fromCategory) return null;

    return {
        fromIndex,
        toIndex: players.indexOf(nextPlayerInQueue),
        fromCategory,
        toCategory,
        stats
    };
}

function closeCategoryCompleteModal() {
    const modal = document.getElementById("category-complete-modal");
    if (modal) {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }
    categoryGateBusy = false;
    pendingCategoryTransition = null;
}

function openCategoryCompleteModal(transition) {
    const modal = document.getElementById("category-complete-modal");
    const title = document.getElementById("category-complete-title");
    const text = document.getElementById("category-complete-text");
    const statsEl = document.getElementById("category-complete-stats");
    if (!modal || !transition) return;

    categoryGateBusy = true;
    pendingCategoryTransition = transition;

    const fromLabel = displayCategoryName(transition.fromCategory);
    const toLabel = displayCategoryName(transition.toCategory);
    const { sold, unsold, pending, total } = transition.stats || {};

    if (title) title.textContent = `${fromLabel} complete`;
    if (text) {
        text.textContent = `All ${fromLabel} players are done. Do you want to continue to ${toLabel}?`;
    }
    if (statsEl) {
        // Sold + Unsold (includes skipped) = Total
        statsEl.innerHTML = `
            <div class="stat-pill"><em>Sold</em><strong>${sold || 0}</strong></div>
            <div class="stat-pill"><em>Unsold</em><strong>${unsold || 0}</strong></div>
            ${(pending || 0) > 0 ? `<div class="stat-pill"><em>Pending</em><strong>${pending}</strong></div>` : ""}
            <div class="stat-pill"><em>Total</em><strong>${total || 0}</strong></div>
        `;
        statsEl.title = `Sold ${sold || 0} + Unsold ${unsold || 0} (includes skipped)${pending ? ` + Pending ${pending}` : ""} = Total ${total || 0}`;
    }

    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
}

function continueToNextCategory() {
    if (!pendingCategoryTransition) {
        closeCategoryCompleteModal();
        return;
    }
    const toIndex = Number(pendingCategoryTransition.toIndex);
    const toCategory = pendingCategoryTransition.toCategory;
    closeCategoryCompleteModal();
    if (toCategory) setActiveAuctionCategory(toCategory);
    if (Number.isFinite(toIndex) && toIndex >= 0) {
        state.auctionCount = toIndex;
        revealPlayerAtCount(state.auctionCount, { useWheel: true });
        saveData();
        return;
    }
    advanceToNextPlayer({ useWheel: true });
}

function stayOnCompletedCategory() {
    closeCategoryCompleteModal();
    // Stay locked on the finished category — do not reveal the next category yet
    renderUI();
}

function getPlayerAuctionCategoryName(player = state?.players?.[state?.auctionCount]) {
    return normalizeCategoryName(player?.category);
}

function getCurrentAuctionCategoryName() {
    if (state?.activeAuctionCategory) {
        return normalizeCategoryName(state.activeAuctionCategory);
    }
    return getPlayerAuctionCategoryName();
}

function setActiveAuctionCategory(categoryName) {
    if (!state) return;
    state.activeAuctionCategory = normalizeCategoryName(categoryName) || "";
}

/** Categories available to jump to, in sequence order. */
function getCategoryJumpOptions() {
    ensureAuctionQueueFromMaster();
    const players = state.players || [];
    const config = getActiveConfig(state);
    const sequence =
        typeof getCategorySequence === "function"
            ? getCategorySequence(config).map((name) => normalizeCategoryName(name))
            : [];
    const current = getCurrentAuctionCategoryName();
    const byCategory = new Map();

    players.forEach((player, index) => {
        const name = normalizeCategoryName(player.category) || "OTHER";
        if (!byCategory.has(name)) {
            byCategory.set(name, {
                category: name,
                label: displayCategoryName(name),
                total: 0,
                pending: 0,
                sold: 0,
                unsold: 0,
                firstEligibleIndex: -1
            });
        }
        const row = byCategory.get(name);
        row.total += 1;
        const status = String(player.status || "").toLowerCase();
        if (status === "sold") row.sold += 1;
        else if (status === "unsold" || status === "skipped") row.unsold += 1;
        else {
            row.pending += 1;
            if (row.firstEligibleIndex < 0) row.firstEligibleIndex = index;
        }
    });

    const orderedNames = [
        ...sequence.filter((name) => byCategory.has(name)),
        ...[...byCategory.keys()].filter((name) => !sequence.includes(name))
    ];

    const currentSeqIndex = sequence.indexOf(current);
    let nextCategory = null;
    for (let i = currentSeqIndex + 1; i < orderedNames.length; i++) {
        const option = byCategory.get(orderedNames[i]);
        if (option && option.pending > 0 && option.firstEligibleIndex >= 0) {
            nextCategory = option.category;
            break;
        }
    }
    if (!nextCategory) {
        for (const name of orderedNames) {
            if (name === current) continue;
            const option = byCategory.get(name);
            if (option && option.pending > 0 && option.firstEligibleIndex >= 0) {
                nextCategory = option.category;
                break;
            }
        }
    }

    return orderedNames.map((name) => {
        const option = byCategory.get(name);
        return {
            ...option,
            isCurrent: name === current,
            isNext: name === nextCategory,
            canJump: option.pending > 0 && option.firstEligibleIndex >= 0 && name !== current
        };
    });
}

function findNextCategoryJump() {
    return getCategoryJumpOptions().find((option) => option.isNext) || null;
}

function updateCategoryJumpControls() {
    const options = getCategoryJumpOptions();
    const canJump = options.some((option) => option.canJump);
    const next = options.find((option) => option.isNext);
    const footerBtn = document.getElementById("next-category-button");
    const chipBtn = document.getElementById("category-jump-btn");
    const label = next
        ? `Next category · ${next.label}`
        : "Change category";

    [footerBtn, chipBtn].forEach((btn) => {
        if (!btn) return;
        btn.disabled = !canJump;
        btn.title = canJump
            ? (next ? `Jump to ${next.label} (or pick another)` : "Change category")
            : "No other category with waiting players";
        if (btn.id === "category-jump-btn") {
            btn.textContent = next ? `Next: ${next.label}` : "Next category";
        }
    });

    if (footerBtn) {
        footerBtn.dataset.nextCategory = next?.category || "";
    }
}

function closeCategorySwitchModal() {
    const modal = document.getElementById("category-switch-modal");
    if (modal) {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }
}

function jumpToCategory(categoryName, { confirmIfPending = true } = {}) {
    const target = normalizeCategoryName(categoryName);
    if (!target) return false;

    const options = getCategoryJumpOptions();
    const option = options.find((row) => row.category === target);
    if (!option || option.firstEligibleIndex < 0) {
        alert(`No waiting players left in ${displayCategoryName(target)}.`);
        return false;
    }

    const current = getCurrentAuctionCategoryName();
    if (option.category === current) {
        closeCategorySwitchModal();
        return false;
    }

    const currentStats = getCategoryRoundStats(current);
    if (confirmIfPending && (currentStats.pending || 0) > 0) {
        const ok = confirm(
            `${displayCategoryName(current)} still has ${currentStats.pending} player${currentStats.pending === 1 ? "" : "s"} waiting.\n\nJump to ${option.label} anyway?`
        );
        if (!ok) return false;
    }

    closeCategoryCompleteModal();
    closeCategorySwitchModal();
    setActiveAuctionCategory(target);
    state.auctionCount = option.firstEligibleIndex;
    revealPlayerAtCount(state.auctionCount, { useWheel: true });
    saveAuctionProgress({ awaitDisk: true, critical: true });
    return true;
}

function jumpToNextCategory() {
    const next = findNextCategoryJump();
    if (!next) {
        alert("No next category with waiting players.");
        return;
    }
    jumpToCategory(next.category, { confirmIfPending: true });
}

function getSearchableAuctionPlayers({ includeUnsold = true, categoryName = "" } = {}) {
    ensureAuctionQueueFromMaster();
    const wanted = categoryName ? normalizeCategoryName(categoryName) : "";
    return (state.players || [])
        .map((player, index) => ({ player, index }))
        .filter(({ player }) => {
            if (!player) return false;
            const status = String(player.status || "not-auctioned").toLowerCase();
            const waiting = !isAuctionSettledStatus(status);
            const unsoldLike = isUnsoldLikeStatus(status);
            if (!waiting && !(includeUnsold && unsoldLike)) return false;
            if (wanted && normalizeCategoryName(player.category) !== wanted) return false;
            return true;
        });
}

function closeFindPlayerModal() {
    const modal = document.getElementById("find-player-modal");
    if (modal) {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }
}

function renderFindPlayerResults() {
    const list = document.getElementById("find-player-results");
    const input = document.getElementById("find-player-input");
    const categorySelect = document.getElementById("find-player-category");
    const includeUnsold = document.getElementById("find-player-include-unsold");
    if (!list) return;

    const query = String(input?.value || "").trim().toLowerCase();
    const categoryName = String(categorySelect?.value || "");
    const rows = getSearchableAuctionPlayers({
        includeUnsold: includeUnsold ? includeUnsold.checked : true,
        categoryName
    }).filter(({ player }) => {
        if (!query) return true;
        const haystack = [
            player.name,
            player.code,
            getPlayerDisplayCode?.(player),
            player.currentClub,
            player.role,
            player.mobile,
            player.category
        ]
            .map((value) => String(value || "").toLowerCase())
            .join(" ");
        return haystack.includes(query);
    });

    if (!rows.length) {
        list.innerHTML = `<div class="find-player-empty">No matching waiting / unsold players.</div>`;
        return;
    }

    list.innerHTML = rows
        .slice(0, 80)
        .map(({ player, index }) => {
            const status = String(player.status || "not-auctioned").toLowerCase();
            const action = isUnsoldLikeStatus(status) ? "Re-auction" : "Auction";
            const meta = [
                getPlayerDisplayCode?.(player) || player.code || player.id,
                displayCategoryName(player.category),
                player.role || "",
                status === "not-auctioned" ? "waiting" : status
            ]
                .filter(Boolean)
                .join(" · ");
            return `
                <button type="button" class="find-player-row" data-find-index="${index}">
                    <img src="${player.photo || "assets/placeholder.png"}" alt="" onerror="this.src='assets/placeholder.png'">
                    <span>
                        <strong>${player.name || "Player"}</strong>
                        <small>${meta}</small>
                    </span>
                    <span class="find-action">${action}</span>
                </button>
            `;
        })
        .join("");

    list.querySelectorAll("[data-find-index]").forEach((btn) => {
        btn.addEventListener("click", () => {
            auctionSelectedPlayerAtIndex(Number(btn.dataset.findIndex));
        });
    });
}

function openFindPlayerModal() {
    if (playerWheelBusy) return;

    const modal = document.getElementById("find-player-modal");
    const categorySelect = document.getElementById("find-player-category");
    const input = document.getElementById("find-player-input");
    if (!modal) return;

    if (categorySelect) {
        const current = getCurrentAuctionCategoryName();
        const options = getCategoryJumpOptions();
        categorySelect.innerHTML = `<option value="">All categories</option>${options
            .map(
                (row) =>
                    `<option value="${row.category}" ${row.category === current ? "selected" : ""}>${row.label} (${row.pending} waiting)</option>`
            )
            .join("")}`;
    }

    if (input) input.value = "";
    renderFindPlayerResults();
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => input?.focus(), 40);
}

function auctionSelectedPlayerAtIndex(index) {
    ensureAuctionQueueFromMaster();
    const player = state.players?.[index];
    if (!player) {
        alert("Player not found in the auction queue.");
        return;
    }

    const current = state.players?.[state.auctionCount];
    if (current && Array.isArray(current.bids) && current.bids.length > 0) {
        const ok = confirm(
            `${current.name} already has bids.\n\nSwitch to ${player.name} anyway? Current bids will stay on ${current.name}.`
        );
        if (!ok) return;
    }

    const status = String(player.status || "").toLowerCase();
    if (status === "sold") {
        alert(`${player.name} is already sold.`);
        return;
    }

    if (isUnsoldLikeStatus(status)) {
        const ok = confirm(`Re-auction ${player.name} from the unsold pool?`);
        if (!ok) return;
        saveHistory();
        player.status = "not-auctioned";
        player.bids = [];
        player.finalPrice = null;
        player.team = null;
        const master = (state.allPlayers || []).find((entry) => entry.id === player.id);
        if (master) {
            master.status = "not-auctioned";
            master.bids = [];
            master.finalPrice = null;
            master.team = null;
        }
        if (Array.isArray(state.unsoldPlayers)) {
            state.unsoldPlayers = state.unsoldPlayers.filter((id) => id !== player.id);
            state.unsoldCount = state.unsoldPlayers.length;
        }
    } else if (index === state.auctionCount && !isAuctionSettledStatus(status)) {
        closeFindPlayerModal();
        renderUI();
        return;
    } else {
        saveHistory();
    }

    closeFindPlayerModal();
    closeCategoryCompleteModal();
    closeRoundEndModal();
    state.auctionCount = index;
    revealPlayerAtCount(state.auctionCount, { useWheel: false });
    saveAuctionProgress({ awaitDisk: true, critical: true });
}

function openCategorySwitchModal() {
    if (playerWheelBusy) return;

    const modal = document.getElementById("category-switch-modal");
    const list = document.getElementById("category-switch-list");
    const text = document.getElementById("category-switch-text");
    const nextBtn = document.getElementById("category-switch-next-btn");
    if (!modal || !list) return;

    const options = getCategoryJumpOptions();
    const current = options.find((row) => row.isCurrent);
    const next = options.find((row) => row.isNext);
    const jumpable = options.filter((row) => row.canJump);

    if (text) {
        text.textContent = current
            ? `Currently on ${current.label}. Pick another category anytime — even if this one is not finished.`
            : "Pick a category to auction next.";
    }

    if (nextBtn) {
        nextBtn.disabled = !next;
        nextBtn.textContent = next ? `Go to ${next.label}` : "No next category";
        nextBtn.onclick = () => jumpToNextCategory();
    }

    if (!jumpable.length) {
        list.innerHTML = `<div class="unsold-pool-empty">No other category has waiting players right now.</div>`;
    } else {
        list.innerHTML = options.map((row) => {
            const meta = `${row.pending} waiting · ${row.sold} sold · ${row.unsold} unsold`;
            const badge = row.isCurrent ? "Current" : row.isNext ? "Next" : row.canJump ? "Jump" : "Done";
            const disabled = row.isCurrent || !row.canJump ? "disabled" : "";
            return `
                <button type="button" class="category-switch-row${row.isCurrent ? " is-current" : ""}${row.isNext ? " is-next" : ""}" data-jump-category="${row.category}" ${disabled}>
                    <span>
                        <strong>${row.label}</strong>
                        <small>${meta}</small>
                    </span>
                    <span class="switch-badge">${badge}</span>
                </button>
            `;
        }).join("");

        list.querySelectorAll("[data-jump-category]").forEach((btn) => {
            btn.addEventListener("click", () => {
                jumpToCategory(btn.dataset.jumpCategory, { confirmIfPending: true });
            });
        });
    }

    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
}

function findNextEligibleAuctionIndex(fromIndex = state.auctionCount, { categoryName = null } = {}) {
    const players = state.players || [];
    const wanted = categoryName ? normalizeCategoryName(categoryName) : null;
    for (let i = Math.max(0, Number(fromIndex) + 1); i < players.length; i++) {
        if (!isWheelEligiblePlayer(players[i])) continue;
        if (wanted && normalizeCategoryName(players[i].category) !== wanted) continue;
        return i;
    }
    return -1;
}

function buildCategoryExhaustedTransition(fromCategory) {
    const from = normalizeCategoryName(fromCategory);
    if (!from) return null;
    const stats = getCategoryRoundStats(from);
    const options = getCategoryJumpOptions();
    const next =
        options.find((row) => row.isNext && row.canJump) ||
        options.find((row) => row.canJump && !row.isCurrent);
    if (!next || next.firstEligibleIndex < 0) return null;
    return {
        fromIndex: state.auctionCount,
        toIndex: next.firstEligibleIndex,
        fromCategory: from,
        toCategory: next.category,
        stats
    };
}

function advanceToNextPlayer({ useWheel = true } = {}) {
    const locked = getCurrentAuctionCategoryName();
    let nextIndex = findNextEligibleAuctionIndex(state.auctionCount, {
        categoryName: locked || null
    });
    if (nextIndex < 0) {
        // Live queue may have dropped waiting players — rebuild from master first
        if (ensureAuctionQueueFromMaster()) {
            nextIndex = findNextEligibleAuctionIndex(state.auctionCount - 1, {
                categoryName: locked || null
            });
        }
    }
    if (nextIndex < 0) {
        // Do not auto-jump into the next category (e.g. Evergreen during KEY PLAYER)
        const transition =
            findCategoryCompletion(state.auctionCount) ||
            buildCategoryExhaustedTransition(locked);
        if (transition) {
            openCategoryCompleteModal(transition);
            saveData();
            return;
        }
        openRoundEndModal();
        saveData();
        return;
    }
    state.auctionCount = nextIndex;
    if (!state.activeAuctionCategory) {
        setActiveAuctionCategory(state.players[nextIndex]?.category);
    }
    revealPlayerAtCount(state.auctionCount, { useWheel });
    saveData();
}

function nextPlayer() {
    if (isOverlayBlockingBids()) return;

    const transition = findCategoryCompletion(state.auctionCount);
    if (transition) {
        openCategoryCompleteModal(transition);
        return;
    }

    advanceToNextPlayer({ useWheel: true });
}

function markPlayerUnsold(player, { reason = "unsold" } = {}) {
    if (!player) return;
    player.status = "unsold";
    if (!Array.isArray(state.unsoldPlayers)) state.unsoldPlayers = [];
    if (!state.unsoldPlayers.includes(player.id)) {
        state.unsoldPlayers.push(player.id);
    }
    state.unsoldCount = state.unsoldPlayers.length;

    const playerInMasterList = (state.allPlayers || []).find((p) => p.id === player.id);
    if (playerInMasterList) {
        playerInMasterList.status = "unsold";
    }
    console.log(
        reason === "skip"
            ? `${player.name} skipped → added to unsold pool`
            : `${player.name} remains unsold.`
    );
}

function skipPlayer() {
    saveHistory();

    //Prevent skipping a player once Bidded
    if (state.players[state.auctionCount].bids.length != 0) {
        console.log("Can't skip this player because bid is placed.");
        return;
    }

    const player = state.players[state.auctionCount];
    // SKIP = move into unsold pool (same as UNSOLD), grouped by their category
    markPlayerUnsold(player, { reason: "skip" });

    renderUI();
    nextPlayer();
    saveAuctionProgress({ awaitDisk: true, critical: true });
}

const TEAMS_DRAWER_KEY = "teamsDrawerPrefs";

function getTeamsDrawerPrefs() {
    try {
        return JSON.parse(localStorage.getItem(TEAMS_DRAWER_KEY) || "{}");
    } catch (_) {
        return {};
    }
}

function saveTeamsDrawerPrefs(prefs) {
    localStorage.setItem(TEAMS_DRAWER_KEY, JSON.stringify(prefs));
}

function syncTeamsDrawerUI() {
    const drawer = document.getElementById("teams-drawer");
    const backdrop = document.getElementById("teams-backdrop");
    const lockBtn = document.getElementById("teams-lock-btn");
    if (!drawer) return;

    const open = drawer.dataset.open === "true";
    const locked = drawer.dataset.locked === "true";
    document.body.classList.toggle("teams-drawer-open", open);
    document.body.classList.toggle("teams-drawer-locked", locked && open);

    if (backdrop) {
        backdrop.hidden = !open || locked;
    }
    if (lockBtn) {
        lockBtn.textContent = locked ? "Unlock" : "Lock";
        lockBtn.classList.toggle("is-active", locked);
        lockBtn.title = locked ? "Unlock drawer" : "Lock drawer open";
    }
}

function setTeamsDrawerOpen(open, { persist = true } = {}) {
    const drawer = document.getElementById("teams-drawer");
    if (!drawer) return;
    const locked = drawer.dataset.locked === "true";
    if (!open && locked) return;
    drawer.dataset.open = open ? "true" : "false";
    syncTeamsDrawerUI();
    if (persist) {
        const prefs = getTeamsDrawerPrefs();
        prefs.open = open;
        saveTeamsDrawerPrefs(prefs);
    }
}

function setTeamsDrawerLocked(locked) {
    const drawer = document.getElementById("teams-drawer");
    if (!drawer) return;
    drawer.dataset.locked = locked ? "true" : "false";
    if (locked) drawer.dataset.open = "true";
    syncTeamsDrawerUI();
    const prefs = getTeamsDrawerPrefs();
    prefs.locked = locked;
    prefs.open = drawer.dataset.open === "true";
    saveTeamsDrawerPrefs(prefs);
}

function toggleTeamsDrawer() {
    const drawer = document.getElementById("teams-drawer");
    if (!drawer) return;
    const open = drawer.dataset.open === "true";
    setTeamsDrawerOpen(!open);
}

function isDeskMenuOpen() {
    const overlay = document.getElementById("desk-menu-overlay");
    return Boolean(overlay && !overlay.hidden);
}

function setDeskMenuOpen(open) {
    const trigger = document.getElementById("desk-menu-trigger");
    const overlay = document.getElementById("desk-menu-overlay");
    if (!trigger || !overlay) return;
    if (open) setWelcomeMenuOpen(false);
    overlay.hidden = !open;
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("desk-menu-open", open);
}

function toggleDeskMenu() {
    setDeskMenuOpen(!isDeskMenuOpen());
}

function isWelcomeMenuOpen() {
    const overlay = document.getElementById("welcome-menu-overlay");
    return Boolean(overlay && !overlay.hidden);
}

function setWelcomeMenuOpen(open) {
    const trigger = document.getElementById("welcome-menu-trigger");
    const overlay = document.getElementById("welcome-menu-overlay");
    if (!trigger || !overlay) return;
    if (open) setDeskMenuOpen(false);
    overlay.hidden = !open;
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("welcome-menu-open", open);
}

function toggleWelcomeMenu() {
    setWelcomeMenuOpen(!isWelcomeMenuOpen());
}

function bindMenuSheet(overlay, closeFn) {
    if (!overlay) return;
    overlay.querySelectorAll(".desk-menu-item").forEach((item) => {
        item.addEventListener("click", () => {
            if (item.disabled) return;
            closeFn();
        });
    });
}

function initDeskMenu() {
    const trigger = document.getElementById("desk-menu-trigger");
    const overlay = document.getElementById("desk-menu-overlay");
    if (!trigger || !overlay) return;

    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleDeskMenu();
    });

    document.getElementById("desk-menu-close")?.addEventListener("click", () => setDeskMenuOpen(false));
    document.getElementById("desk-menu-backdrop")?.addEventListener("click", () => setDeskMenuOpen(false));
    bindMenuSheet(overlay, () => setDeskMenuOpen(false));
}

function initWelcomeMenu() {
    const trigger = document.getElementById("welcome-menu-trigger");
    const overlay = document.getElementById("welcome-menu-overlay");
    if (!trigger || !overlay) return;

    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleWelcomeMenu();
    });

    document.getElementById("welcome-menu-close")?.addEventListener("click", () => setWelcomeMenuOpen(false));
    document.getElementById("welcome-menu-backdrop")?.addEventListener("click", () => setWelcomeMenuOpen(false));
    bindMenuSheet(overlay, () => setWelcomeMenuOpen(false));
}

function initTeamsDrawer() {
    const drawer = document.getElementById("teams-drawer");
    const prefs = getTeamsDrawerPrefs();
    if (!drawer) return;

    drawer.dataset.locked = prefs.locked ? "true" : "false";
    // First visit defaults to open so the drawer is discoverable
    drawer.dataset.open = prefs.locked || prefs.open !== false ? "true" : "false";
    syncTeamsDrawerUI();

    document.getElementById("teams-lock-btn")?.addEventListener("click", () => {
        setTeamsDrawerLocked(drawer.dataset.locked !== "true");
    });
    document.getElementById("teams-close-btn")?.addEventListener("click", () => {
        if (drawer.dataset.locked === "true") setTeamsDrawerLocked(false);
        setTeamsDrawerOpen(false);
    });
    document.getElementById("teams-backdrop")?.addEventListener("click", () => {
        setTeamsDrawerOpen(false);
    });
    document.getElementById("teams-rail-open")?.addEventListener("click", () => {
        toggleTeamsDrawer();
    });
    document.getElementById("teams-filter")?.addEventListener("input", () => {
        applyTeamsFilter();
    });
}

function normalizeTeamsFilterQuery(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
}

function applyTeamsFilter() {
    const input = document.getElementById("teams-filter");
    const query = normalizeTeamsFilterQuery(input?.value || "");
    document.querySelectorAll("#teams-data-section .team-container").forEach((card) => {
        const name = normalizeTeamsFilterQuery(card.dataset.teamName || "");
        card.hidden = Boolean(query) && !name.includes(query);
    });
    document.querySelectorAll("#teams-rail .team-rail-btn").forEach((btn) => {
        const name = normalizeTeamsFilterQuery(btn.dataset.teamName || "");
        btn.hidden = Boolean(query) && !name.includes(query);
    });
}

function getTeamsOrderedForCurrentCategory() {
    const categoryName = getCurrentAuctionCategoryName();
    const indexed = (state.teams || []).map((team, index) => {
        const quota = categoryName
            ? getCategoryQuotaStatus(state, team.team_id, categoryName)
            : null;
        return { team, index, quota };
    });

    if (!categoryName) return indexed;

    // Open for this category first, then full teams; keep hotkey index stable via index
    indexed.sort((a, b) => {
        const aFull = a.quota?.isFull ? 1 : 0;
        const bFull = b.quota?.isFull ? 1 : 0;
        if (aFull !== bFull) return aFull - bFull;
        const aRem = a.quota?.remaining ?? 0;
        const bRem = b.quota?.remaining ?? 0;
        if (aRem !== bRem) return bRem - aRem;
        return a.index - b.index;
    });
    return indexed;
}

function renderTeams() {
    const container = document.getElementById("teams-data-section");
    const rail = document.getElementById("teams-rail");
    if (!container) return;

    container.innerHTML = "";
    if (rail) {
        rail.querySelectorAll(".team-rail-btn").forEach((btn) => btn.remove());
    }

    const categoryName = getCurrentAuctionCategoryName();
    const categoryLabel = categoryName ? displayCategoryName(categoryName) : "";
    const ordered = getTeamsOrderedForCurrentCategory();
    const teamCount = Math.max(1, ordered.length);
    container.style.setProperty("--team-rows", String(teamCount));

    ordered.forEach(({ team, index, quota }) => {
        const teamId = team.team_id;
        const hotkey = TEAM_HOTKEYS[index] || "";
        const accent = team.color || "#16325c";
        const logoSrc = getTeamLogoSrc(team);
        const isFull = Boolean(quota?.isFull);
        const categoryChip = quota
            ? `${quota.owned}/${quota.max} ${categoryLabel}`
            : "";
        const budget =
            typeof getTeamSpendableBudget === "function"
                ? getTeamSpendableBudget(state, teamId, {
                      fillingCategory: categoryName || undefined
                  })
                : {
                      purse: Number(team.remaining_budget) || 0,
                      reserve: 0,
                      spendable: Number(team.remaining_budget) || 0,
                      remainingSlots: 0
                  };
        const spendable = budget.spendable;
        const reserved = budget.reserve;
        const moneyTitle = `Spendable ${formatMoney(spendable)} · Purse ${formatMoney(budget.purse)} · Reserved ${formatMoney(reserved)} for ${budget.remainingSlots} category slots`;

        const teamElement = document.createElement("button");
        teamElement.type = "button";
        teamElement.className = `team-container${isFull ? " category-full" : " category-open"}`;
        teamElement.id = `team-${teamId}`;
        teamElement.dataset.teamName = String(team.team_name || "").toLowerCase();
        teamElement.dataset.categoryOpen = isFull ? "0" : "1";
        teamElement.style.setProperty("--team-accent", accent);
        teamElement.setAttribute(
            "aria-label",
            isFull
                ? `${team.team_name} full for ${categoryLabel}`
                : `Bid with ${team.team_name}`
        );
        if (isFull) {
            teamElement.title = `${team.team_name} already has max ${categoryLabel} players`;
        }

        teamElement.innerHTML = `
            <div class="logo-container">
                <img src="${logoSrc}" class="logo-img" id="logo-${teamId}" onerror="this.style.visibility='hidden'" alt="">
            </div>
            <div class="team-main">
                <div class="team-copy">
                    <div class="name-container" id="name-container-${teamId}">
                        <span id="team-name-${teamId}">${team.team_name}</span>
                        ${hotkey ? `<span class="team-hotkey" title="Hotkey">${hotkey}</span>` : ""}
                    </div>
                    <div class="team-data-container">
                        <div class="taken-player" title="Players bought">
                            <span id="taken-player-${teamId}">${team.player_bought}</span>
                            <span class="stat-label">players</span>
                        </div>
                        ${
                            categoryChip
                                ? `<span class="team-category-chip ${isFull ? "is-full" : "is-open"}" title="Current category slots">${categoryChip}</span>`
                                : ""
                        }
                    </div>
                </div>
                <div class="money-remaining" title="${moneyTitle}">
                    <div class="money-remaining-top">
                        <span class="stat-label">Spendable</span>
                        <span class="stat-amount" id="money-remaining-${teamId}">${showAmount(spendable)}</span>
                    </div>
                    <span class="stat-sub">Purse ${showAmount(team.remaining_budget)} · Res ${showAmount(reserved)}</span>
                </div>
            </div>
        `;
        teamElement.addEventListener("click", makeBidHandler(teamId));
        container.appendChild(teamElement);

        if (rail) {
            const railBtn = document.createElement("button");
            railBtn.type = "button";
            railBtn.className = `team-rail-btn${isFull ? " category-full" : ""}`;
            railBtn.id = `team-rail-${teamId}`;
            railBtn.dataset.teamName = String(team.team_name || "").toLowerCase();
            railBtn.style.setProperty("--team-accent", accent);
            railBtn.title = categoryChip
                ? `${team.team_name} · ${categoryChip}${hotkey ? ` (${hotkey})` : ""}`
                : `${team.team_name} (${hotkey || "click"})`;
            railBtn.setAttribute("aria-label", `Quick bid ${team.team_name}`);
            railBtn.innerHTML = `
                <img src="${logoSrc}" alt="" onerror="this.style.visibility='hidden'">
                <span>${hotkey || "•"}</span>
            `;
            railBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                bidPlayer(teamId);
            });
            railBtn.addEventListener("dblclick", (event) => {
                event.preventDefault();
                setTeamsDrawerOpen(true);
            });
            rail.appendChild(railBtn);
        }
    });

    applyTeamsFilter();
}




//Add event lister to every teams button
//We save the references because when we need to remove the event listener then we can
function makeBidHandler(teamId) {
    return function (event) { // Add 'event' as an argument
        if (event.ctrlKey) {
            // Ctrl+click opens the squad page
            window.open(`squads/?team=${teamId}`, '_blank');
        } else if (event.shiftKey) {
            // Shift+click opens custom bid for that team
            openDirectBidModal(teamId);
        } else {
            // Otherwise, place the next automatic bid
            bidPlayer(teamId);
        }
    }
}


    
// for (let i = 0; i < state.teams.length; i++) {
//     const teamElement = document.getElementById(`team-${i + 1}`);
//     const handler = makeBidHandler(i + 11); // create the handler for this team
//     handlers.push(handler);                 // save the reference
//     teamElement.addEventListener("click", handler);
    
// }

function renderUI() {
    renderTeams();

    // Stay quiet on the welcome screen or when no players are loaded yet
    if (document.body.classList.contains("welcome-active")) {
        return;
    }

    if (!state.players.length) {
        if (ensureAuctionQueueFromMaster() && state.players.length) {
            showPlayerDetails(state.auctionCount);
            return;
        }
        if (playerName) playerName.innerText = "No players loaded";
        return;
    }

    if (state.auctionCount >= state.players.length) {
        if (ensureAuctionQueueFromMaster() && state.auctionCount < state.players.length) {
            showPlayerDetails(state.auctionCount);
            return;
        }
        openRoundEndModal();
        return;
    }

    showPlayerDetails(state.auctionCount);
}

async function resetAll() {
    if (!requireServerOnline("reset division data")) return;
    const securityKey = prompt("Enter the security key to reset this division: (rezwan19)");

    if (securityKey !== "rezwan19") {
        alert("Wrong security key!");
        return;
    }

    const divisionId =
        state.divisionId ||
        welcomeConfigCache?.activeDivisionId ||
        getActiveDivisionIdFromConfig(welcomeConfigCache) ||
        "div_1";

    // Clear browser cache for this division's auction progress
    localStorage.removeItem(getAuctionDataStorageKey(divisionId));
    if (divisionId === "div_1") {
        localStorage.removeItem("auctionData");
    }

    // Also remove auction.json for this division on disk (players/photos stay)
    try {
        if (typeof deleteDivisionAuction === "function") {
            await deleteDivisionAuction(divisionId);
        } else if (typeof persistAuctionToProjectFolder === "function") {
            await persistAuctionToProjectFolder(divisionId, null);
        }
    } catch (error) {
        alert(error.message || "Could not clear division auction on disk.");
        return;
    }

    window.location.reload();
}

async function resetEntireProjectFlow() {
    if (!requireServerOnline("reset the project")) return;
    const confirmed = confirm(
        "Reset ENTIRE project?\n\nThis clears all divisions, teams, players, auction progress, and offline photos.\nYou will get a blank project (no teams, Main Auction only)."
    );
    if (!confirmed) return;

    const securityKey = prompt("Enter the security key to reset the whole project: (rezwan19)");
    if (securityKey !== "rezwan19") {
        alert("Wrong security key!");
        return;
    }

    try {
        try {
            sessionStorage.setItem("auctionForceBlank", "1");
        } catch (_) {
            // ignore
        }
        if (typeof resetEntireProject === "function") {
            await resetEntireProject();
        } else {
            localStorage.clear();
        }
        // Cache-bust so the browser does not keep an old welcome screen
        window.location.href = `./index.html?blank=1&ts=${Date.now()}`;
    } catch (error) {
        alert(error.message || "Could not reset project.");
    }
}


//Functions for UNDO-REDO buttons visibility
function updateUndoRedoButtons() {
    undoButton.disabled = history.undoStack.length === 0;
    redoButton.disabled = history.redoStack.length === 0;
}

//UNDO-REDO Functionality
function saveHistory() {
    //Clear the redostack
    history.redoStack = [];

    // Lean snapshot — avoid cloning multi-MB team logo data-URLs into undo memory
    history.undoStack.push(leanAuctionState(state));

    if (history.undoStack.length > 10) {
        history.undoStack.shift();
    }

    updateUndoRedoButtons();
}

function undoChange() {
    //If the undoStack is empty then we have nothing to do
    if(history.undoStack.length == 0){
        console.log("Error: There is nothing to undo.");
        return;
    }

    //Save current state to redoStack
    history.redoStack.push(leanAuctionState(state));

    const lastState = history.undoStack.pop();
    state = lastState;
    if (typeof reconcileAuctionTeamsFromConfig === "function") {
        reconcileAuctionTeamsFromConfig(state, welcomeConfigCache || state.config);
    }

    console.log("Undone changes.");

    //update UI
    renderUI();

    //Save the current state
    saveData();

    const currentPlayer = state.players[state.auctionCount];
    if (currentPlayer.status === "sold") {
        unsoldSeal.classList.remove("show");
        playSoldSealAnimation();
    } else if (currentPlayer.status === "unsold" || currentPlayer.status === "skipped") {
        unsoldSeal.classList.add("show");
        soldSeal.classList.remove("show", "is-animating");
    } else {
        soldSeal.classList.remove("show", "is-animating");
        unsoldSeal.classList.remove("show");
    }

    updateUndoRedoButtons();

}

function redoChange() {
    //If the redoStack is empty then we have nothing to do
    if(history.redoStack.length == 0){
        console.log("Error: There is nothing to redo.");
        return;
    }

    history.undoStack.push(leanAuctionState(state));

    console.log("Redone changes.");

    const nextState = history.redoStack.pop();
    state = nextState;
    if (typeof reconcileAuctionTeamsFromConfig === "function") {
        reconcileAuctionTeamsFromConfig(state, welcomeConfigCache || state.config);
    }

    //update UI
    renderUI();

    //Save the current state
    saveData();

    const currentPlayer = state.players[state.auctionCount];
    if (currentPlayer.status === "sold") {
        unsoldSeal.classList.remove("show");
        playSoldSealAnimation();
    } else if (currentPlayer.status === "unsold" || currentPlayer.status === "skipped") {
        unsoldSeal.classList.add("show");
        soldSeal.classList.remove("show", "is-animating");
    } else {
        soldSeal.classList.remove("show", "is-animating");
        unsoldSeal.classList.remove("show");
    }

    updateUndoRedoButtons();

}

function requestEndAuction({ force = false } = {}) {
    const unsoldCount = getUnsoldPlayers().length;
    if (!force && unsoldCount > 0 && isRequireAllPlayersSoldEnabled()) {
        openFinishConfirmModal();
        return;
    }
    endAuction();
}

function endAuction() {
    closeRoundEndModal();
    closeFinishConfirmModal();
    closeUnsoldPoolModal();

    console.log("All players have been auctioned. The auction is now closed.");

    soldButton.disabled = true;
    unsoldButton.disabled = true;
    skipButton.disabled = true;
    nextButton.disabled = true;
    undoButton.disabled = true;
    redoButton.disabled = true;

    document.querySelectorAll(".team-container").forEach((el) => {
        el.style.pointerEvents = "none";
        el.style.opacity = "0.7";
    });

    saveData();
    showFinishScreen();
}


//====== BUDGETING =============================================
/**
 * Opens the budget editor modal and populates it with team data.
 */
function openBudgetModal() {
    budgetEditorList.innerHTML = ''; // Clear old list
    
    state.teams.forEach(team => {
        const row = document.createElement('div');
        row.className = 'budget-row';
        
        row.innerHTML = `
            <label for="budget-input-${team.team_id}">${team.team_name}</label>
            <input type="number" id="budget-input-${team.team_id}" value="${team.team_budget}" step="50000">
            <div class="budget-controls">
                <button data-team="${team.team_id}" data-action="subtract">-</button>
                <button data-team="${team.team_id}" data-action="add">+</button>
            </div>
        `;
        budgetEditorList.appendChild(row);
    });
    
    budgetModal.style.display = 'flex';
}

function closeBudgetModal() {
    budgetModal.style.display = 'none';
}

/**
 * Adjusts a team's total budget and recalculates their remaining budget.
 * Used for the +/- buttons.
 */
function adjustTeamBudget(teamId, amount) {
    saveHistory();
    const team = state.teams.find(t => t.team_id === teamId);
    if (!team) return;
    
    team.team_budget += amount;
    team.remaining_budget += amount;

    // Update the input field in the modal to show the new value
    const inputField = document.getElementById(`budget-input-${teamId}`);
    if (inputField) inputField.value = team.team_budget;
    
    renderUI();
    saveData();
}

/**
 * Sets a team's total budget to a new value from the input field.
 */
function setTeamBudget(teamId, newTotalBudget) {
    saveHistory();
    const team = state.teams.find(t => t.team_id === teamId);
    if (!team || isNaN(newTotalBudget)) return;

    // Calculate the *difference* and apply it to the remaining budget
    const budgetChange = newTotalBudget - team.team_budget;
    team.team_budget = newTotalBudget;
    team.remaining_budget += budgetChange;
    
    renderUI();
    saveData();
}


/**
 * Opens the Direct Bid modal.
 * Optional teamId pre-selects that team in the dropdown.
 */
function openDirectBidModal(teamId = null) {
    if (state.auctionCount >= state.players.length) return;

    const player = state.players[state.auctionCount];
    
    // Don't open if auction is over or player is already sold
    if (!player || player.status === "sold" || player.status === "unsold" || player.status === "skipped") return;

    // Populate team dropdown
    teamSelectDropdown.innerHTML = ''; // Clear old options
    state.teams.forEach(team => {
        const quota = getCategoryQuotaStatus(state, team.team_id, player.category);
        const budget =
            typeof getTeamSpendableBudget === "function"
                ? getTeamSpendableBudget(state, team.team_id, {
                      fillingCategory: player.category
                  })
                : {
                      purse: Number(team.remaining_budget) || 0,
                      spendable: Number(team.remaining_budget) || 0,
                      reserve: 0
                  };
        const option = document.createElement('option');
        option.value = team.team_id;
        option.textContent = `${team.team_name} (spendable ${formatMoney(budget.spendable)} / purse ${formatMoney(budget.purse)}) · ${quota.owned}/${quota.max} ${quota.name}`;
        if (quota.isFull) {
            option.disabled = true;
            option.textContent += " · FULL";
        }
        teamSelectDropdown.appendChild(option);
    });

    if (teamId && findTeam(teamId)) {
        teamSelectDropdown.value = String(teamId);
    }

    // Set a suggested bid amount
    let suggestedAmount = player.basePrice;
    if (player.bids.length > 0) {
        const lastBid = player.bids[player.bids.length - 1];
        suggestedAmount = lastBid.amount + bidIncrement(lastBid.amount);
    }
    directBidAmountInput.value = suggestedAmount;
    updateDirectBidPreview();

    directBidModal.style.display = 'flex';
    setTimeout(() => {
        directBidAmountInput.focus();
        directBidAmountInput.select();
    }, 0);
}

function updateDirectBidPreview() {
    const preview = document.getElementById("direct-bid-preview");
    if (!preview) return;

    const amount = parseInt(directBidAmountInput.value, 10);
    if (isNaN(amount) || amount <= 0) {
        preview.textContent = "Enter amount in full rupees";
        return;
    }
    preview.textContent = `Will show as ${formatMoney(amount)}`;
}

function closeDirectBidModal() {
    directBidModal.style.display = 'none';
}

/**
 * Handles the logic for a custom "Direct Bid"
 */
function handleDirectBidSubmit(event) {
    event.preventDefault(); // Stop the form from reloading the page
    
    // 1. Get values from the form
    const teamId = parseInt(teamSelectDropdown.value);
    const amount = parseInt(directBidAmountInput.value);
    
    const player = state.players[state.auctionCount];
    const team = state.teams.find(t => t.team_id === teamId);

    // 2. --- Validation ---
    if (!team || isNaN(amount) || amount <= 0) {
        alert("Invalid input. Please check the team and amount.");
        return;
    }
    const quota = getCategoryQuotaStatus(state, teamId, player.category);
    if (quota.isFull) {
        alert(`${team.team_name} already has ${quota.owned}/${quota.max} ${quota.name} players.`);
        return;
    }
    if (player.bids.length === 0 && amount < player.basePrice) {
        alert(`The bid must be at least the base price of ${formatMoney(player.basePrice)}.`);
        return;
    }
    const afford =
        typeof canTeamAffordBid === "function"
            ? canTeamAffordBid(state, teamId, amount, { fillingCategory: player.category })
            : {
                  ok: team.remaining_budget >= amount,
                  purse: team.remaining_budget,
                  reserve: 0,
                  spendable: team.remaining_budget,
                  remainingSlots: 0
              };
    if (!afford.ok) {
        alert(
            `${team.team_name} cannot bid ${formatMoney(amount)}.\n` +
                `Must keep ${formatMoney(afford.reserve)} reserved for ${afford.remainingSlots} remaining category minimums.\n` +
                `Spendable now: ${formatMoney(afford.spendable)}.`
        );
        return;
    }
    if (player.bids.length > 0) {
        const lastBid = player.bids[player.bids.length - 1];
        if (amount <= lastBid.amount) {
            alert(`The bid must be higher than the current bid of ${formatMoney(lastBid.amount)}.`);
            return;
        }
        if (lastBid.team === teamId) {
            alert(`${team.team_name} cannot bid twice in a row.`);
            return;
        }
    }

    // 3. --- Process the Bid ---
    saveHistory(); // Save for undo
    state.players[state.auctionCount].bids.push({ team: teamId, amount: amount });
    console.log(`DIRECT BID: ${player.name} bidded by ${team.team_name} for ${formatMoney(amount)}`);
    
    renderUI(); // Update the main screen
    triggerAnim(document.getElementById("current-bid"), "updated");
    triggerAnim(document.getElementById("current-bid-section"), "live-bid");
    triggerAnim(document.getElementById(`team-${teamId}`), "bid-flash");
    triggerAnim(document.getElementById(`team-rail-${teamId}`), "bid-flash");
    saveData(); // Save to localStorage
    closeDirectBidModal(); // Close the pop-up
}

const AUCTION_DESK_PREFS_KEY = "auctionDeskPrefs";

function getAuctionDeskPrefs() {
    try {
        return JSON.parse(localStorage.getItem(AUCTION_DESK_PREFS_KEY) || "{}");
    } catch (_) {
        return {};
    }
}

function saveAuctionDeskPrefs(prefs) {
    localStorage.setItem(AUCTION_DESK_PREFS_KEY, JSON.stringify(prefs || {}));
}

function isRequireAllPlayersSoldEnabled() {
    return Boolean(getAuctionDeskPrefs().requireAllPlayersSold);
}

function setRequireAllPlayersSold(enabled) {
    const prefs = getAuctionDeskPrefs();
    prefs.requireAllPlayersSold = Boolean(enabled);
    saveAuctionDeskPrefs(prefs);
}

function isUnsoldLikeStatus(status) {
    const value = String(status || "").toLowerCase();
    return value === "unsold" || value === "skipped";
}

function getUnsoldPlayers({ categoryName = null } = {}) {
    const wanted = categoryName ? normalizeCategoryName(categoryName) : null;
    return (state.allPlayers || []).filter((player) => {
        if (!isUnsoldLikeStatus(player.status)) return false;
        if (!wanted) return true;
        return normalizeCategoryName(player.category) === wanted;
    });
}

function getUnsoldPlayersByCategory() {
    const config = getActiveConfig(state);
    const sequence = getCategorySequence(config);
    const grouped = new Map();

    getUnsoldPlayers().forEach((player) => {
        const name = normalizeCategoryName(player.category) || "OTHER";
        if (!grouped.has(name)) grouped.set(name, []);
        grouped.get(name).push(player);
    });

    const orderedNames = [
        ...sequence.filter((name) => grouped.has(name)),
        ...[...grouped.keys()].filter((name) => !sequence.includes(name))
    ];

    return orderedNames.map((name) => ({
        category: name,
        label: displayCategoryName(name),
        players: grouped.get(name) || []
    }));
}

/**
 * Opens the new modal when a round ends.
 */
function openRoundEndModal() {
    // Last chance: don't claim "complete" while master still has waiting players
    if (ensureAuctionQueueFromMaster() && state.auctionCount < (state.players || []).length) {
        closeRoundEndModal();
        showPlayerDetails(state.auctionCount);
        saveData();
        return;
    }

    const groups = getUnsoldPlayersByCategory();
    const unsoldCount = groups.reduce((sum, group) => sum + group.players.length, 0);
    const waitingCount = getMasterPlayers().filter(
        (player) => !isAuctionSettledStatus(player.status)
    ).length;
    const breakdown = document.getElementById("round-unsold-breakdown");
    const viewBtn = document.getElementById("round-view-unsold-btn");

    if (waitingCount > 0) {
        roundSummaryText.innerText = `${waitingCount} player${waitingCount === 1 ? "" : "s"} still waiting in the pool. Continuing…`;
        restartUnsoldBtn.style.display = "none";
        if (viewBtn) viewBtn.style.display = "none";
        rebuildAuctionQueueFromMaster();
        closeRoundEndModal();
        showPlayerDetails(state.auctionCount);
        saveData();
        return;
    }

    if (unsoldCount > 0) {
        roundSummaryText.innerText = `Round complete. ${unsoldCount} player${unsoldCount === 1 ? "" : "s"} still need a team.`;
        restartUnsoldBtn.style.display = "block";
        if (viewBtn) viewBtn.style.display = "block";
    } else {
        roundSummaryText.innerText = "All players have been sold. The auction is complete.";
        restartUnsoldBtn.style.display = "none";
        if (viewBtn) viewBtn.style.display = "none";
    }

    if (breakdown) {
        if (!groups.length) {
            breakdown.innerHTML = "";
        } else {
            breakdown.innerHTML = groups.map((group) => `
                <div class="round-cat-row">
                    <span><strong>${group.label}</strong> · ${group.players.length} unsold</span>
                    <button type="button" data-reauction-category="${group.category}">Re-auction</button>
                </div>
            `).join("");
            breakdown.querySelectorAll("[data-reauction-category]").forEach((btn) => {
                btn.addEventListener("click", () => {
                    restartAuctionForUnsold({ categoryName: btn.dataset.reauctionCategory });
                });
            });
        }
    }

    roundEndModal.style.display = "flex";
}

function closeRoundEndModal() {
    roundEndModal.style.display = "none";
}

function renderUnsoldPoolModal() {
    const list = document.getElementById("unsold-pool-list");
    const summary = document.getElementById("unsold-pool-summary");
    const reauctionAllBtn = document.getElementById("unsold-reauction-all-btn");
    const pref = document.getElementById("require-all-sold-pref");
    const groups = getUnsoldPlayersByCategory();
    const total = groups.reduce((sum, group) => sum + group.players.length, 0);

    if (pref) pref.checked = isRequireAllPlayersSoldEnabled();

    if (summary) {
        summary.textContent = total
            ? `${total} player${total === 1 ? "" : "s"} still need a team across ${groups.length} categor${groups.length === 1 ? "y" : "ies"}.`
            : "No unsold or skipped players right now.";
    }

    if (reauctionAllBtn) {
        reauctionAllBtn.disabled = total === 0;
        reauctionAllBtn.style.opacity = total ? "1" : "0.55";
    }

    if (!list) return;

    if (!groups.length) {
        list.innerHTML = `<div class="unsold-pool-empty">Pool is clear — every listed player has a team.</div>`;
        return;
    }

    list.innerHTML = groups.map((group) => `
        <section class="unsold-category-card">
            <div class="unsold-category-head">
                <div>
                    <strong>${group.label}</strong>
                    <span>${group.players.length} player${group.players.length === 1 ? "" : "s"}</span>
                </div>
                <button type="button" class="reauction-category-btn" data-reauction-category="${group.category}">
                    Re-auction
                </button>
            </div>
            <div class="unsold-player-rows">
                ${group.players.map((player) => `
                    <div class="unsold-player-row">
                        <img src="${player.photo || "assets/placeholder.png"}" alt="" onerror="this.src='assets/placeholder.png'">
                        <div>
                            <strong>${player.name || "Player"}</strong>
                            <em>${player.role || "—"} · ${getPlayerDisplayCode(player)}</em>
                        </div>
                        <span class="status-tag ${player.status === "skipped" ? "skipped" : ""}">${player.status || "unsold"}</span>
                    </div>
                `).join("")}
            </div>
        </section>
    `).join("");

    list.querySelectorAll("[data-reauction-category]").forEach((btn) => {
        btn.addEventListener("click", () => {
            restartAuctionForUnsold({ categoryName: btn.dataset.reauctionCategory });
        });
    });
}

function openUnsoldPoolModal() {
    const modal = document.getElementById("unsold-pool-modal");
    if (!modal) return;
    renderUnsoldPoolModal();
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
}

function closeUnsoldPoolModal() {
    const modal = document.getElementById("unsold-pool-modal");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
}

function openFinishConfirmModal() {
    const modal = document.getElementById("finish-confirm-modal");
    const title = document.getElementById("finish-confirm-title");
    const text = document.getElementById("finish-confirm-text");
    const groups = getUnsoldPlayersByCategory();
    const total = groups.reduce((sum, group) => sum + group.players.length, 0);
    if (!modal || total === 0) return;

    const categoryBits = groups.map((group) => `${group.label} (${group.players.length})`).join(", ");
    if (title) title.textContent = `${total} player${total === 1 ? "" : "s"} still unsold`;
    if (text) {
        text.textContent = isRequireAllPlayersSoldEnabled()
            ? `You asked to confirm that every player joins a team. Still open: ${categoryBits}. Re-auction them, or finish anyway.`
            : `Still open: ${categoryBits}. You can re-auction by category, or finish anyway.`;
    }

    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
}

function closeFinishConfirmModal() {
    const modal = document.getElementById("finish-confirm-modal");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
}

/**
 * Start a fresh round with unsold/skipped players.
 * Pass categoryName to re-auction only that category.
 */
function restartAuctionForUnsold({ categoryName = null } = {}) {
    const pool = getUnsoldPlayers({ categoryName });

    if (pool.length === 0) {
        alert(
            categoryName
                ? `No unsold players left in ${displayCategoryName(categoryName)}.`
                : "There are no unsold or skipped players to re-auction."
        );
        return;
    }

    const label = categoryName
        ? displayCategoryName(categoryName)
        : "all unsold categories";
    const ok = confirm(
        `Re-auction ${pool.length} player${pool.length === 1 ? "" : "s"} from ${label}?\n\nThis starts a new round with only those players.`
    );
    if (!ok) return;

    saveHistory();

    pool.forEach((player) => {
        player.status = "not-auctioned";
        player.bids = [];
        player.finalPrice = null;
        player.team = null;
    });

    const config = getActiveConfig(state);
    state.players = orderPlayersForAuction(pool, config);
    state.auctionCount = 0;
    state.soldPlayers = [];
    state.unsoldPlayers = [];
    state.skippedPlayers = [];

    closeRoundEndModal();
    closeUnsoldPoolModal();
    closeFinishConfirmModal();
    renderUI();
    saveData();
    revealPlayerAtCount(0, { useWheel: isPlayerWheelEnabled() });
}

/**
 * Closes the final summary screen.
 */
function closeFinishScreen() {
    finishScreenModal.style.display = "none";
}

/**
 * Calculates insights and shows the final summary screen.
 */
function showFinishScreen() {
    // 1. --- Calculate Insights ---
    let totalSpent = 0;
    const soldPlayers = state.allPlayers.filter(p => p.status === 'sold');
    
    soldPlayers.forEach(player => {
        totalSpent += player.finalPrice;
    });

    // Sort sold players by price (highest first)
    soldPlayers.sort((a, b) => b.finalPrice - a.finalPrice);
    
    // Get the top 3
    const top3Buys = soldPlayers.slice(0, 3);

    
    // 2. --- Populate Modal Content ---
    
    // Header
        document.getElementById('finish-tournament-logo').src = state.tournament
        ? getTournamentLogoSrc(state.tournament, "assets/tournament-logo.svg")
        : "assets/tournament-logo.svg";
    document.getElementById('finish-tournament-name').textContent = state.tournament
        ? getTournamentTitle(state.tournament)
        : "Auction Complete";
    
    // Simple Insights List
    const insightsList = document.getElementById('finish-insights-list');
    insightsList.innerHTML = `
        <li>Total Players Sold: <strong>${soldPlayers.length}</strong></li>
        <li>Total Money Spent: <strong>${formatMoney(totalSpent)}</strong></li>
    `;

    // Top 3 Buys
    const topBuysContainer = document.getElementById('finish-top-buys');
    topBuysContainer.innerHTML = ''; // Clear old cards
    
    for (const player of top3Buys) {
        const team = state.teams.find(t => t.team_id === player.team);
        const teamName = team ? team.team_name : 'N/A';
        const teamColor = team ? team.color : '#555';

        const cardHTML = `
            <div class="top-buy-card">
                <img src="${player.photo}" alt="${player.name}">
                <div class="card-info">
                    <div class="card-name">${player.name}</div>
                    <div class="card-price">${formatMoney(player.finalPrice)}</div>
                    <div class="card-team" style="background-color: ${teamColor};">
                        ${teamName}
                    </div>
                </div>
            </div>
        `;
        topBuysContainer.innerHTML += cardHTML;
    }
    
    // Team Logos
    const teamLogosContainer = document.getElementById('finish-team-logos');
    teamLogosContainer.innerHTML = ''; // Clear old logos
    state.teams.forEach(team => {
        teamLogosContainer.innerHTML += `<img src="${getTeamLogoSrc(team)}" alt="${team.team_name}" onerror="this.style.visibility='hidden'">`;
    });

    // Organizer (You can fill this in)
    // document.getElementById('finish-organizer-name').textContent = state.tournament.organizer;
    
    // **NOTE:** Make sure you have "organizer-photo.png" and "developer-photo.png"
    // in your "assets" folder, or change the src path in the HTML.

    // 3. --- Show the Modal ---
    finishScreenModal.style.display = 'flex';
}

async function bootLiveProjectFromServer() {
    if (typeof reloadTournamentFromDb === "function") {
        await reloadTournamentFromDb();
    }
    welcomeConfigCache = await getAuctionConfig();
    await loadAuctionStateForActiveDivision(welcomeConfigCache);
    renderWelcomeDivisions();
    showTournamentDetails();
    refreshWelcomeDivisionActions();
    renderUI();
    updateUndoRedoButtons();
}

// Main App Logic
const initApp = async () => {
    // Clear fat auction caches from older builds so mid-auction never hits browser quota
    purgeBloatedAuctionBrowserCache();

    const bootParams = new URLSearchParams(window.location.search);
    const forceBlankBoot = bootParams.get("blank") === "1";
    if (forceBlankBoot) {
        try {
            sessionStorage.setItem("auctionForceBlank", "1");
        } catch (_) {
            // ignore
        }
        if (typeof clearAuctionLocalStorageCaches === "function") {
            clearAuctionLocalStorageCaches();
        }
    }

    // Stay on welcome until we know server status — never silently use stale cache
    document.body.classList.add("welcome-active");
    if (welcomeScreen) welcomeScreen.hidden = false;
    if (bigContainer) bigContainer.hidden = true;

    // SaaS desk: auth + tournament required before any config hydrate.
    try {
        if (window.SaasAuth?.requireAuth) {
            const me = await window.SaasAuth.requireAuth();
            if (!me) return;
        }
        if (typeof usesTournamentDb === "function" && !usesTournamentDb()) {
            window.location.replace("/app/tournaments.html");
            return;
        }
    } catch (error) {
        if (welcomeTitle) welcomeTitle.innerText = "Sign in required";
        if (welcomeDivisionNote) {
            welcomeDivisionNote.textContent =
                error.message || "Sign in and select a tournament to load configuration from the database.";
        }
        return;
    }

    const online = await updateServerStatusUI();
    if (!online) {
        setOfflineOnlyMode(true);
        if (welcomeTitle) welcomeTitle.innerText = "Cricket Auction";
        // Wire retry early so user can recover without full reload of stale data
        document.getElementById("offline-retry-btn")?.addEventListener("click", async () => {
            const retryOnline = await updateServerStatusUI();
            if (!retryOnline) {
                alert("Still offline. Refresh the page, or restart the auction server, then retry.");
                return;
            }
            window.location.reload();
        });
        // Keep polling; when server returns, reload for a clean live boot
        setInterval(async () => {
            const nowOnline = await updateServerStatusUI();
            if (nowOnline && document.body.classList.contains("server-offline-only")) {
                window.location.reload();
            }
        }, 5000);
        return;
    }

    // Load full tournament config + players + partners from Postgres only.
    try {
        if (welcomeDivisionNote) {
            welcomeDivisionNote.textContent = "Loading configuration from database…";
        }
        await bootLiveProjectFromServer();
        state.tournament = buildTournamentState(welcomeConfigCache || DEFAULT_AUCTION_CONFIG);
        const active = getActiveDivision(welcomeConfigCache || {});
        const teamCount = (active?.teams || []).length;
        if (welcomeDivisionNote) {
            welcomeDivisionNote.textContent = `Loaded from database: ${
                getTournamentTitle?.(welcomeConfigCache?.tournament) || "Tournament"
            } · ${(welcomeConfigCache?.divisions || []).length || 0} division(s) · ${teamCount} teams.`;
        }
    } catch (error) {
        console.error("Could not load tournament from database:", error);
        if (welcomeTitle) welcomeTitle.innerText = "Database load failed";
        if (welcomeDivisionNote) {
            welcomeDivisionNote.textContent =
                error.message ||
                "Could not load configuration from database. Open Config, click Save, then refresh.";
        }
        return;
    }

    if (forceBlankBoot) {
        // Drop ?blank=1 from the URL after a successful blank boot
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete("blank");
            url.searchParams.delete("ts");
            window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        } catch (_) {
            // ignore
        }
    } 

    // --- ADD LISTENERS FOR THE MODAL ---
    modalCloseBtn.addEventListener('click', closeBudgetModal);

    //--- DIRECT BIDDING -------
    directBidCloseBtn.addEventListener('click', closeDirectBidModal);
    directBidForm.addEventListener('submit', handleDirectBidSubmit);
    directBidAmountInput.addEventListener('input', updateDirectBidPreview);

    const customBidButton = document.getElementById("custom-bid-button");
    const currentBidSection = document.getElementById("current-bid-section");
    if (customBidButton) {
        customBidButton.addEventListener("click", (event) => {
            event.stopPropagation();
            openDirectBidModal();
        });
    }
    if (currentBidSection) {
        currentBidSection.addEventListener("click", (event) => {
            if (event.target.closest("#custom-bid-button")) return;
            openDirectBidModal();
        });
        currentBidSection.title = "Click to enter a custom bid amount";
        currentBidSection.style.cursor = "pointer";
    }

    // Use event delegation for the dynamic buttons
    budgetEditorList.addEventListener('click', (event) => {
        const target = event.target;
        if (target.tagName !== 'BUTTON') return;
        
        const action = target.dataset.action;
        const teamId = parseInt(target.dataset.team);
        let amount = 0;
        
        if (action === 'add') amount = 50000;
        if (action === 'subtract') amount = -50000;
        
        if (amount !== 0) {
            adjustTeamBudget(teamId, amount);
        }
    });

    // Use event delegation for the dynamic input fields
    budgetEditorList.addEventListener('change', (event) => {
        const target = event.target;
        if (target.tagName !== 'INPUT' || target.type !== 'number') return;
        
        const teamId = parseInt(target.id.split('-')[2]);
        const newValue = parseInt(target.value);
        
        setTeamBudget(teamId, newValue);
    });



    // Welcome screen listeners
    welcomeResumeBtn?.addEventListener("click", handleWelcomeResume);
    welcomeStartNewBtn?.addEventListener("click", handleWelcomeStartNew);
    welcomeResetBtn?.addEventListener("click", resetAll);
    welcomeResetProjectBtn?.addEventListener("click", () => {
        resetEntireProjectFlow();
    });
    document.getElementById("desk-reset-project-btn")?.addEventListener("click", () => {
        resetEntireProjectFlow();
    });
    initWelcomeMenu();
    partnersIntroContinue?.addEventListener("click", hidePartnersIntro);
    document.getElementById("team-sold-video-continue")?.addEventListener("click", hideTeamSoldVideo);

    // Keep mid-auction progress durable across refresh / tab hide
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "hidden") return;
        if (document.body.classList.contains("welcome-active")) return;
        if (!state?.players?.length) return;
        saveData();
        flushAuctionProgressToDisk();
    });
    window.addEventListener("pagehide", () => {
        if (document.body.classList.contains("welcome-active")) return;
        if (!state?.players?.length) return;
        saveData();
    });

    // Stay on the full-page welcome until the user chooses an action
    document.body.classList.add("welcome-active");
    if (welcomeScreen) welcomeScreen.hidden = false;
    if (bigContainer) bigContainer.hidden = true;
    maybeShowPartnersIntro();
    // Re-check after hydrate so Resume appears when local/disk auction exists
    await updateServerStatusUI();
    refreshWelcomeDivisionActions();
    // Keep server status visible during long auction sessions
    setInterval(() => {
        updateServerStatusUI().then(() => refreshWelcomeDivisionActions());
    }, 20000);
     
    //Click event for Buttons
    unsoldButton.addEventListener("click", () => unsoldPlayer());
    nextButton.addEventListener("click", () => nextPlayer());
    soldButton.addEventListener("click", () => soldPlayer());
    skipButton.addEventListener("click", () => skipPlayer());
    if (spinButton) {
        spinButton.addEventListener("click", () => openPlayerWheelShowcase());
    }
    document.getElementById("unsold-pool-button")?.addEventListener("click", () => openUnsoldPoolModal());
    document.getElementById("unsold-pool-close-btn")?.addEventListener("click", closeUnsoldPoolModal);
    document.getElementById("unsold-pool-done-btn")?.addEventListener("click", closeUnsoldPoolModal);
    document.getElementById("unsold-reauction-all-btn")?.addEventListener("click", () => {
        restartAuctionForUnsold();
    });
    document.getElementById("require-all-sold-pref")?.addEventListener("change", (event) => {
        setRequireAllPlayersSold(event.target.checked);
    });
    document.getElementById("round-view-unsold-btn")?.addEventListener("click", () => {
        closeRoundEndModal();
        openUnsoldPoolModal();
    });
    document.getElementById("finish-view-unsold-btn")?.addEventListener("click", () => {
        closeFinishConfirmModal();
        openUnsoldPoolModal();
    });
    document.getElementById("finish-reauction-btn")?.addEventListener("click", () => {
        restartAuctionForUnsold();
    });
    document.getElementById("finish-anyway-btn")?.addEventListener("click", () => {
        requestEndAuction({ force: true });
    });

    initDeskMenu();
    initTeamsDrawer();

    teamsButton.addEventListener("click", (event) => {
        if (event.shiftKey) {
            window.open("squads/", "_blank");
            return;
        }
        toggleTeamsDrawer();
    });
    teamsButton.title = "Toggle teams drawer (Shift+click opens squads)";

    const configButton = document.getElementById("config-button");
    if (configButton) {
        configButton.addEventListener("click", () => {
            window.open("config/", "_blank");
        });
    }
    document.getElementById("players-button")?.addEventListener("click", () => {
        window.open("config/players.html", "_blank");
    });
    document.getElementById("icon-caption-page-button")?.addEventListener("click", () => {
        window.open("icon-caption/", "_blank");
    });

    resetButton.addEventListener("click", () => resetAll());
    undoButton.addEventListener("click", () => undoChange());
    redoButton.addEventListener("click", () => redoChange());

    // --- LISTENERS FOR FINISH AUCTION ---
    restartUnsoldBtn.addEventListener("click", () => restartAuctionForUnsold());
    finishAuctionBtn.addEventListener("click", () => requestEndAuction());

    document.getElementById("category-continue-btn")?.addEventListener("click", continueToNextCategory);
    document.getElementById("category-stay-btn")?.addEventListener("click", stayOnCompletedCategory);
    document.getElementById("next-category-button")?.addEventListener("click", () => openCategorySwitchModal());
    document.getElementById("category-jump-btn")?.addEventListener("click", () => openCategorySwitchModal());
    document.getElementById("category-switch-close-btn")?.addEventListener("click", closeCategorySwitchModal);
    document.getElementById("category-switch-cancel-btn")?.addEventListener("click", closeCategorySwitchModal);
    document.getElementById("find-player-button")?.addEventListener("click", () => openFindPlayerModal());
    document.getElementById("find-player-chip-btn")?.addEventListener("click", () => openFindPlayerModal());
    document.getElementById("find-player-close-btn")?.addEventListener("click", closeFindPlayerModal);
    document.getElementById("find-player-cancel-btn")?.addEventListener("click", closeFindPlayerModal);
    document.getElementById("find-player-input")?.addEventListener("input", renderFindPlayerResults);
    document.getElementById("find-player-category")?.addEventListener("change", renderFindPlayerResults);
    document.getElementById("find-player-include-unsold")?.addEventListener("change", renderFindPlayerResults);

    // --- LISTENERS FOR FINAL SUMMARY ---
    finishModalCloseBtn.addEventListener('click', closeFinishScreen);

    //Add keyboard command for sold unsold next
    // A single, efficient listener for all keyboard shortcuts
    window.addEventListener("keydown", function(event){
        // Check if the user is currently typing in an input, select, or textarea
        const targetTag = event.target.tagName;
            if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') {
                return; // If so, do nothing and just let them type.
        }

        if (playerWheelBusy) {
            if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const skipBtn = document.getElementById("wheel-skip-btn");
                if (skipBtn) skipBtn.click();
            }
            return;
        }

        if (categoryGateBusy) {
            if (event.key === "Enter") {
                event.preventDefault();
                continueToNextCategory();
            } else if (event.key === "Escape") {
                event.preventDefault();
                stayOnCompletedCategory();
            }
            return;
        }

        const categorySwitchOpen =
            document.getElementById("category-switch-modal")?.style.display === "flex";
        if (categorySwitchOpen) {
            if (event.key === "Escape") {
                event.preventDefault();
                closeCategorySwitchModal();
            } else if (event.key === "Enter") {
                event.preventDefault();
                jumpToNextCategory();
            }
            return;
        }

        const findPlayerOpen =
            document.getElementById("find-player-modal")?.style.display === "flex";
        if (findPlayerOpen) {
            if (event.key === "Escape") {
                event.preventDefault();
                closeFindPlayerModal();
            }
            return;
        }

        // Bid for the team mapped to this hotkey (list order)
        const biddingTeam = teamFromHotkey(event.key);
        if (biddingTeam) {
            bidPlayer(biddingTeam.team_id);
            return;
        }

        // Handle other letter-based shortcuts
        switch(event.key.toLowerCase()){
            case "escape":
                if (isDeskMenuOpen()) {
                    setDeskMenuOpen(false);
                    break;
                }
                setTeamsDrawerOpen(false);
                break;
            case "t":
                if (event.shiftKey) {
                    event.preventDefault();
                    toggleTeamsDrawer();
                }
                break;
            case "u":
                unsoldPlayer();
                break;
            case "s":
                soldPlayer();
                break;
            case "w":
                openPlayerWheelShowcase();
                break;
            case "enter":
                nextPlayer();
                break;
            case "z":
                if(event.ctrlKey && event.shiftKey) {
                    redoChange()
                } else if (event.ctrlKey) {
                    undoChange();
                }
                break;
            case "m":
                if (event.ctrlKey) {
                    event.preventDefault(); // Stop browser's default action
                    if (budgetModal.style.display === 'none') {
                        openBudgetModal();
                    } else {
                        closeBudgetModal();
                    }
                }
                break;
            case "b":
                if (event.ctrlKey) {
                    event.preventDefault(); // Stop browser's default action
                    openDirectBidModal();
                }
                break;
            case "p":
                if (event.shiftKey) {
                    event.preventDefault();
                    window.open('squads/roster/', '_blank');
                }
                break;
        }
    });
};

// 🔷 Make sure to run when DOM is loaded
document.addEventListener("DOMContentLoaded", initApp);
