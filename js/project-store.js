/**
 * Project sync — SaaS only (Postgres + R2).
 * Auction progress + roster always come from Postgres.
 * localStorage is never the source of truth for auctionData / live desk state.
 */

let projectApiReadyCache = null;
let projectApiReadyAt = 0;
/** In-memory mirror of last DB snapshot (not localStorage). */
const dbDivisionRuntime = new Map();

function rememberDivisionRuntimeFromSnapshot(snapshot) {
    dbDivisionRuntime.clear();
    (snapshot?.divisions || []).forEach((division) => {
        const id = division?.id || "div_1";
        const players = Array.isArray(division.players) ? division.players : [];
        dbDivisionRuntime.set(id, {
            playerCount: players.length,
            hasAuction: isMeaningfulAuctionSnapshot(division.auction),
            players
        });
    });
}

function getDbDivisionRuntime(divisionId) {
    return dbDivisionRuntime.get(divisionId || "div_1") || null;
}

function divisionHasDbAuction(divisionId) {
    return Boolean(getDbDivisionRuntime(divisionId)?.hasAuction);
}

function getDbPlayerCount(divisionId) {
    return Number(getDbDivisionRuntime(divisionId)?.playerCount) || 0;
}

function clearAuctionDataBrowserCaches() {
    const keysToRemove = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (key === "auctionData" || key.startsWith("auctionData:")) {
                keysToRemove.push(key);
            }
        }
    } catch (_) {
        return;
    }
    keysToRemove.forEach((key) => {
        try {
            localStorage.removeItem(key);
        } catch (_) {
            // ignore
        }
    });
}

function getSaasTournamentId() {
    try {
        if (window.SaasAuth?.getActiveTournamentId) {
            return window.SaasAuth.getActiveTournamentId();
        }
    } catch (_) {
        // ignore
    }
    try {
        return localStorage.getItem("ca_saas_tournament_id");
    } catch (_) {
        return null;
    }
}

function requireTournamentDb() {
    if (!window.SaasAuth?.api) {
        throw new Error("SaaS auth required. Open /app/login.html and sign in.");
    }
    const id = getSaasTournamentId();
    if (!id) {
        throw new Error("Select a tournament from the dashboard first.");
    }
    return id;
}

function usesTournamentDb() {
    return Boolean(getSaasTournamentId() && window.SaasAuth?.api);
}

function tournamentApiBase() {
    const id = encodeURIComponent(requireTournamentDb());
    return `/api/v1/tournaments/${id}`;
}

async function projectApiFetch(path, { method = "GET", body } = {}) {
    requireTournamentDb();
    return window.SaasAuth.api(path, { method, body });
}

async function checkProjectApiReady({ force = false } = {}) {
    const now = Date.now();
    if (!force && projectApiReadyCache !== null && now - projectApiReadyAt < 15000) {
        return projectApiReadyCache;
    }
    try {
        if (!usesTournamentDb()) {
            projectApiReadyCache = false;
        } else {
            const health = await window.SaasAuth.api("/api/v1/health");
            projectApiReadyCache = Boolean(health?.ok && health?.db);
        }
    } catch (_) {
        projectApiReadyCache = false;
    }
    projectApiReadyAt = now;
    return projectApiReadyCache;
}

async function fetchProjectSnapshot() {
    return projectApiFetch(`${tournamentApiBase()}/snapshot`);
}

async function putProjectConfig(config) {
    const payload = await projectApiFetch(`${tournamentApiBase()}/config`, {
        method: "PUT",
        body: { config }
    });
    return payload.config;
}

async function putDivisionPlayers(divisionId, players) {
    const id = encodeURIComponent(divisionId || "div_1");
    const payload = await projectApiFetch(`${tournamentApiBase()}/divisions/${id}/players`, {
        method: "PUT",
        body: { players: players || [] }
    });
    return payload.players;
}

async function putDivisionAuction(divisionId, auction) {
    const id = encodeURIComponent(divisionId || "div_1");
    const payload = await projectApiFetch(`${tournamentApiBase()}/divisions/${id}/auction`, {
        method: "PUT",
        body: { auction: auction || null, status: "live" }
    });
    if (payload?.revision != null && typeof window !== "undefined") {
        window.__auctionRevision = Number(payload.revision) || 0;
    }
    return payload.auction;
}

async function fetchDivisionAuction(divisionId) {
    const id = encodeURIComponent(divisionId || "div_1");
    return projectApiFetch(`${tournamentApiBase()}/divisions/${id}/auction`);
}

/**
 * Live auction state for squads / roster / teamsheet.
 * SaaS: always Postgres. Legacy: localStorage mirror only.
 */
async function loadLiveAuctionStateForDivision(divisionId) {
    const id = divisionId || "div_1";
    if (usesTournamentDb()) {
        const remote = await fetchDivisionAuction(id);
        if (remote?.revision != null && typeof window !== "undefined") {
            window.__auctionRevision = Number(remote.revision) || 0;
        }
        const auction = remote?.auction;
        if (!auction || typeof auction !== "object") return null;
        if (auction.auctionState && typeof auction.auctionState === "object") {
            return auction.auctionState;
        }
        if (Array.isArray(auction.teams) || Array.isArray(auction.players)) {
            return auction;
        }
        return null;
    }
    try {
        const key =
            typeof getDivisionAuctionDataKey === "function"
                ? getDivisionAuctionDataKey(id)
                : `auctionData:${id}`;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.auctionState || null;
    } catch (_) {
        return null;
    }
}

async function deleteDivisionAuction(divisionId) {
    const id = encodeURIComponent(divisionId || "div_1");
    await projectApiFetch(`${tournamentApiBase()}/divisions/${id}/auction`, {
        method: "DELETE"
    });
}

async function resetProjectFolderOnDisk() {
    const payload = await projectApiFetch(`${tournamentApiBase()}/reset`, {
        method: "POST",
        body: {}
    });
    if (payload?.snapshot) {
        applyProjectSnapshotToLocalStorage(payload.snapshot, { wipeMissingAuction: true });
    }
    return payload;
}

/** True when auction snapshot has a roster worth resuming. */
function isMeaningfulAuctionSnapshot(auction) {
    if (!auction || typeof auction !== "object") return false;
    const players = auction.auctionState?.players || auction.players;
    return Array.isArray(players) && players.length > 0;
}

function readLocalAuctionSnapshot(divisionId) {
    const id = divisionId || "div_1";
    try {
        const raw = localStorage.getItem(`auctionData:${id}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return isMeaningfulAuctionSnapshot(parsed) ? parsed : null;
    } catch (_) {
        return null;
    }
}

/**
 * Apply DB snapshot into working browser mirrors.
 * SaaS: never persist auctionData in localStorage — live desk always reads Postgres.
 * Players/config mirrors are overwritten from DB on every hydrate/reload.
 */
function applyProjectSnapshotToLocalStorage(snapshot, options = {}) {
    if (!snapshot) return { preservedAuctionIds: [] };

    const saasMode =
        typeof usesTournamentDb === "function" ? usesTournamentDb() : Boolean(window.SaasAuth?.api);
    const wipeMissingAuction = options.wipeMissingAuction === true || saasMode;
    const preservedAuctionIds = [];

    rememberDivisionRuntimeFromSnapshot(snapshot);
    if (saasMode) clearAuctionDataBrowserCaches();

    if (snapshot.project) {
        const project =
            typeof normalizeConfig === "function"
                ? normalizeConfig(snapshot.project)
                : snapshot.project;
        localStorage.setItem("auctionConfig", JSON.stringify(project));
    }

    const seen = new Set();
    (snapshot.divisions || []).forEach((division) => {
        const id = division.id || "div_1";
        seen.add(id);
        const players = Array.isArray(division.players) ? division.players : [];
        localStorage.setItem(`auctionPlayers:${id}`, JSON.stringify(players));
        // Never store live auction progress in localStorage for SaaS.
        if (saasMode) {
            localStorage.removeItem(`auctionData:${id}`);
            return;
        }
        const hasDbAuction = isMeaningfulAuctionSnapshot(division.auction);
        if (hasDbAuction && players.length > 0) {
            localStorage.setItem(`auctionData:${id}`, JSON.stringify(division.auction));
        } else {
            const localAuction = readLocalAuctionSnapshot(id);
            if (!wipeMissingAuction && localAuction && players.length > 0) {
                preservedAuctionIds.push(id);
            } else {
                localStorage.removeItem(`auctionData:${id}`);
            }
        }
    });

    // Partners are part of tournament config surface — keep a local mirror for desk/showcase.
    try {
        localStorage.setItem(
            "auctionPartners",
            JSON.stringify(Array.isArray(snapshot.partners) ? snapshot.partners : [])
        );
    } catch (_) {
        // ignore
    }

    // Drop stale division keys not present on disk
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const playersMatch = key.match(/^auctionPlayers:(div_\d+)$/);
        const dataMatch = key.match(/^auctionData:(div_\d+)$/);
        const id = playersMatch?.[1] || dataMatch?.[1];
        if (id && !seen.has(id) && snapshot.divisions) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    return { preservedAuctionIds };
}

function isForceBlankProjectBoot() {
    try {
        if (sessionStorage.getItem("auctionForceBlank") === "1") return true;
    } catch (_) {
        // ignore
    }
    try {
        return new URLSearchParams(window.location.search).get("blank") === "1";
    } catch (_) {
        return false;
    }
}

function clearAuctionLocalStorageCaches() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (
            key === "auctionConfig" ||
            key === "auctionPlayers" ||
            key === "auctionData" ||
            key.startsWith("auctionPlayers:") ||
            key.startsWith("auctionData:") ||
            key === "teamsDrawerPrefs" ||
            key === "auctionDeskPrefs"
        ) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/**
 * Boot: Postgres tournament snapshot is the source of truth.
 * localStorage is only a fast cache — never push browser cache over DB on boot.
 */
async function hydrateLocalStorageFromProjectFolder() {
    if (!usesTournamentDb()) {
        return { ok: false, reason: "saas-required" };
    }
    const ready = await checkProjectApiReady({ force: true });
    if (!ready) return { ok: false, reason: "offline" };

    const forceBlank = isForceBlankProjectBoot();
    const snapshot = await fetchProjectSnapshot();
    if (!snapshot?.project) {
        return { ok: false, reason: "empty-snapshot" };
    }

    if (forceBlank) {
        clearAuctionLocalStorageCaches();
        applyProjectSnapshotToLocalStorage(snapshot, { wipeMissingAuction: true });
        try {
            sessionStorage.removeItem("auctionForceBlank");
        } catch (_) {
            // ignore
        }
        return { ok: true, blank: true, root: snapshot.root, snapshot };
    }

    // Config/players/partners/auction: Postgres wins. Do not push stale browser auction back to DB.
    const applied = applyProjectSnapshotToLocalStorage(snapshot, { wipeMissingAuction: true });

    return {
        ok: true,
        migrated: false,
        root: snapshot.root,
        preservedAuctionIds: applied?.preservedAuctionIds || [],
        snapshot
    };
}

async function pushLocalStorageToProjectFolder() {
    const ready = await checkProjectApiReady();
    if (!ready) return false;

    let config = null;
    try {
        config = JSON.parse(localStorage.getItem("auctionConfig") || "null");
    } catch (_) {
        config = null;
    }
    if (config) await putProjectConfig(config);

    // Only sync divisions that exist in project config (do not invent div_2/div_3)
    const divisionIds = new Set();
    if (Array.isArray(config?.divisions) && config.divisions.length) {
        config.divisions.forEach((d) => d?.id && divisionIds.add(String(d.id)));
    } else {
        divisionIds.add("div_1");
    }

    for (const id of divisionIds) {
        let players = [];
        try {
            players = JSON.parse(localStorage.getItem(`auctionPlayers:${id}`) || "[]") || [];
        } catch (_) {
            players = [];
        }
        await putDivisionPlayers(id, players);

        // SaaS: never push/delete live auction from browser mirrors (desk saves DB directly).
        if (usesTournamentDb()) continue;

        let auction = null;
        try {
            auction = JSON.parse(localStorage.getItem(`auctionData:${id}`) || "null");
        } catch (_) {
            auction = null;
        }
        if (auction) await putDivisionAuction(id, auction);
        else await deleteDivisionAuction(id).catch(() => {});
    }
    return true;
}

async function requireProjectApiReady({ force = true } = {}) {
    const ready = await checkProjectApiReady({ force });
    if (!ready) {
        throw new Error(
            "Database not ready. Sign in, select a tournament, then save again so data persists."
        );
    }
    return true;
}

async function persistConfigToProjectFolder(config) {
    const generation = projectPersistGeneration;
    return enqueueProjectPersist(async () => {
        if (generation !== projectPersistGeneration) return false;
        await requireProjectApiReady({ force: true });
        if (generation !== projectPersistGeneration) return false;

        // Stale tabs can save an older 1-division cache and wipe WOMENS/etc.
        // Keep any disk divisions missing from the incoming payload.
        let next = config;
        try {
            const snapshot = await fetchProjectSnapshot();
            const diskDivisions = snapshot?.project?.divisions;
            const incomingDivisions = Array.isArray(next?.divisions) ? next.divisions : [];
            if (Array.isArray(diskDivisions) && diskDivisions.length > incomingDivisions.length) {
                const byId = new Map(incomingDivisions.map((d) => [d?.id, d]));
                const merged = incomingDivisions.slice();
                diskDivisions.forEach((diskDiv) => {
                    if (diskDiv?.id && !byId.has(diskDiv.id)) {
                        merged.push(diskDiv);
                    }
                });
                next = { ...next, divisions: merged };
            }
        } catch (_) {
            // write incoming as-is if snapshot unavailable
        }

        const saved = await putProjectConfig(next);
        // Always keep local cache aligned with what Postgres actually stored.
        if (saved && typeof saved === "object") {
            try {
                localStorage.setItem("auctionConfig", JSON.stringify(saved));
            } catch (_) {
                // ignore quota
            }
        }
        return true;
    });
}

async function persistPlayersToProjectFolder(divisionId, players) {
    const generation = projectPersistGeneration;
    return enqueueProjectPersist(async () => {
        if (generation !== projectPersistGeneration) return false;
        await requireProjectApiReady({ force: true });
        if (generation !== projectPersistGeneration) return false;
        await putDivisionPlayers(divisionId, players);
        return true;
    });
}

async function persistAuctionToProjectFolder(divisionId, auction) {
    const generation = projectPersistGeneration;
    return enqueueProjectPersist(async () => {
        if (generation !== projectPersistGeneration) return false;
        await requireProjectApiReady({ force: true });
        if (generation !== projectPersistGeneration) return false;
        const id = divisionId || "div_1";
        if (auction == null) {
            await deleteDivisionAuction(id).catch(() => {});
            const prev = getDbDivisionRuntime(id) || { playerCount: 0, players: [] };
            dbDivisionRuntime.set(id, {
                ...prev,
                hasAuction: false
            });
            clearAuctionDataBrowserCaches();
        } else {
            await putDivisionAuction(id, auction);
            const prev = getDbDivisionRuntime(id) || { playerCount: 0, players: [] };
            dbDivisionRuntime.set(id, {
                ...prev,
                hasAuction: isMeaningfulAuctionSnapshot(auction)
            });
            // SaaS never keeps a browser auction mirror.
            if (usesTournamentDb()) {
                try {
                    localStorage.removeItem(`auctionData:${id}`);
                    if (id === "div_1") localStorage.removeItem("auctionData");
                } catch (_) {
                    // ignore
                }
            }
        }
        return true;
    });
}

/** Reload config + players + partners from Postgres into localStorage (source of truth). */
async function reloadTournamentFromDb() {
    await requireProjectApiReady({ force: true });
    const snapshot = await fetchProjectSnapshot();
    if (!snapshot?.project) {
        throw new Error("Could not load tournament configuration from database.");
    }
    applyProjectSnapshotToLocalStorage(snapshot, { wipeMissingAuction: true });
    return snapshot;
}

/**
 * Serialize DB writes so an older in-flight PUT cannot overwrite a newer
 * reset/import. bumpProjectPersistGeneration() invalidates queued work.
 */
let projectPersistChain = Promise.resolve();
let projectPersistGeneration = 0;

function bumpProjectPersistGeneration() {
    projectPersistGeneration += 1;
    return projectPersistGeneration;
}

function getProjectPersistGeneration() {
    return projectPersistGeneration;
}

function enqueueProjectPersist(task) {
    const generation = projectPersistGeneration;
    let result;
    const run = projectPersistChain.then(async () => {
        if (generation !== projectPersistGeneration) return null;
        result = await task();
        return result;
    });
    projectPersistChain = run.catch((error) => {
        console.warn("Tournament DB sync:", error?.message || error);
    });
    return run;
}

/** Fire-and-forget DB sync helper (serialized; skips stale generations) */
function voidProjectPersist(task) {
    enqueueProjectPersist(task);
}

/** Await queued persists for the current generation */
async function flushProjectPersistQueue() {
    const generation = projectPersistGeneration;
    await projectPersistChain;
    if (generation !== projectPersistGeneration) {
        await projectPersistChain;
    }
}
