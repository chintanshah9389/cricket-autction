/**
 * Project sync — SaaS only (Postgres + R2).
 * localStorage is a fast cache. No data-project / offline file server.
 */

let projectApiReadyCache = null;
let projectApiReadyAt = 0;

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
    return payload.auction;
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
 * Apply DB snapshot to localStorage cache.
 * Config + players: DB wins.
 * Auction: DB wins when present; if DB has no auction yet, keep a meaningful
 * local mid-auction cache so refresh does not wipe Resume.
 */
function applyProjectSnapshotToLocalStorage(snapshot, options = {}) {
    if (!snapshot) return { preservedAuctionIds: [] };

    const wipeMissingAuction = options.wipeMissingAuction === true;
    const preservedAuctionIds = [];

    if (snapshot.project) {
        localStorage.setItem("auctionConfig", JSON.stringify(snapshot.project));
    }

    const seen = new Set();
    (snapshot.divisions || []).forEach((division) => {
        const id = division.id || "div_1";
        seen.add(id);
        localStorage.setItem(`auctionPlayers:${id}`, JSON.stringify(division.players || []));
        if (isMeaningfulAuctionSnapshot(division.auction)) {
            localStorage.setItem(`auctionData:${id}`, JSON.stringify(division.auction));
        } else {
            const localAuction = readLocalAuctionSnapshot(id);
            if (!wipeMissingAuction && localAuction) {
                // Keep browser mid-auction progress when disk has no auction.json yet
                preservedAuctionIds.push(id);
            } else {
                localStorage.removeItem(`auctionData:${id}`);
            }
        }
    });

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

    if (forceBlank) {
        clearAuctionLocalStorageCaches();
        applyProjectSnapshotToLocalStorage(snapshot, { wipeMissingAuction: true });
        try {
            sessionStorage.removeItem("auctionForceBlank");
        } catch (_) {
            // ignore
        }
        return { ok: true, blank: true, root: snapshot.root };
    }

    // Config/players: disk wins. Auction: keep local mid-progress if disk empty.
    const applied = applyProjectSnapshotToLocalStorage(snapshot, { wipeMissingAuction: false });
    const preservedAuctionIds = applied?.preservedAuctionIds || [];

    // Heal disk so the next refresh also finds Resume (auction.json was missing).
    for (const id of preservedAuctionIds) {
        const auction = readLocalAuctionSnapshot(id);
        if (!auction) continue;
        try {
            await persistAuctionToProjectFolder(id, auction);
        } catch (error) {
            console.warn("Could not restore auction.json for", id, error?.message || error);
        }
    }

    return {
        ok: true,
        migrated: false,
        root: snapshot.root,
        preservedAuctionIds
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

        await putProjectConfig(next);
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
        if (auction == null) {
            await deleteDivisionAuction(divisionId).catch(() => {});
        } else {
            await putDivisionAuction(divisionId, auction);
        }
        return true;
    });
}

/** Reload config + players from Postgres into localStorage (source of truth). */
async function reloadTournamentFromDb() {
    await requireProjectApiReady({ force: true });
    const snapshot = await fetchProjectSnapshot();
    if (!snapshot) throw new Error("Could not load tournament from database.");
    applyProjectSnapshotToLocalStorage(snapshot, { wipeMissingAuction: false });
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
