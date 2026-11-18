/**
 * Disk project folder sync (WhatsApp-style local data).
 * Source of truth: data-project/ via server.js APIs.
 * localStorage is a fast cache that is hydrated on boot.
 */

const PROJECT_API_BASE = "/api/project";

let projectApiReadyCache = null;
let projectApiReadyAt = 0;

async function checkProjectApiReady({ force = false } = {}) {
    const now = Date.now();
    if (!force && projectApiReadyCache !== null && now - projectApiReadyAt < 15000) {
        return projectApiReadyCache;
    }
    try {
        const response = await fetch(`${PROJECT_API_BASE}/health`, { cache: "no-store" });
        projectApiReadyCache = response.ok;
    } catch (_) {
        projectApiReadyCache = false;
    }
    projectApiReadyAt = now;
    return projectApiReadyCache;
}

async function fetchProjectSnapshot() {
    const response = await fetch(PROJECT_API_BASE, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not load project folder.");
    return payload;
}

async function putProjectConfig(config) {
    const response = await fetch(`${PROJECT_API_BASE}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not save project.json.");
    return payload.config;
}

async function putDivisionPlayers(divisionId, players) {
    const id = encodeURIComponent(divisionId || "div_1");
    const response = await fetch(`${PROJECT_API_BASE}/divisions/${id}/players`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: players || [] })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not save players.json.");
    return payload.players;
}

async function putDivisionAuction(divisionId, auction) {
    const id = encodeURIComponent(divisionId || "div_1");
    const response = await fetch(`${PROJECT_API_BASE}/divisions/${id}/auction`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auction: auction || null })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not save auction.json.");
    return payload.auction;
}

async function deleteDivisionAuction(divisionId) {
    const id = encodeURIComponent(divisionId || "div_1");
    const response = await fetch(`${PROJECT_API_BASE}/divisions/${id}/auction`, {
        method: "DELETE"
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not clear auction.json.");
    }
}

async function resetProjectFolderOnDisk() {
    // Invalidate queued PUTs, wait for them to no-op, then wipe on the same serial queue
    const generation = bumpProjectPersistGeneration();
    await flushProjectPersistQueue();
    return enqueueProjectPersist(async () => {
        if (generation !== projectPersistGeneration) {
            throw new Error("Reset superseded by a newer project write.");
        }
        const response = await fetch(PROJECT_API_BASE, { method: "DELETE" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Could not reset project folder.");
        return payload;
    });
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
 * Apply disk snapshot to localStorage.
 * Config + players: disk wins.
 * Auction: disk wins when present; if disk has no auction.json, keep a meaningful
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
 * Boot: data-project/ is the source of truth.
 * localStorage is only a fast cache — never push browser cache over disk on boot.
 */
async function hydrateLocalStorageFromProjectFolder() {
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

async function persistConfigToProjectFolder(config) {
    const generation = projectPersistGeneration;
    return enqueueProjectPersist(async () => {
        if (generation !== projectPersistGeneration) return false;
        if (!(await checkProjectApiReady())) return false;
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
        if (!(await checkProjectApiReady())) return false;
        if (generation !== projectPersistGeneration) return false;
        await putDivisionPlayers(divisionId, players);
        return true;
    });
}

async function persistAuctionToProjectFolder(divisionId, auction) {
    const generation = projectPersistGeneration;
    return enqueueProjectPersist(async () => {
        if (generation !== projectPersistGeneration) return false;
        if (!(await checkProjectApiReady())) return false;
        if (generation !== projectPersistGeneration) return false;
        if (auction == null) {
            await deleteDivisionAuction(divisionId).catch(() => {});
        } else {
            await putDivisionAuction(divisionId, auction);
        }
        return true;
    });
}

/**
 * Serialize disk writes so an older in-flight PUT cannot overwrite a newer
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
        console.warn("Project folder sync:", error?.message || error);
    });
    return run;
}

/** Fire-and-forget disk sync helper (serialized; skips stale generations) */
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
