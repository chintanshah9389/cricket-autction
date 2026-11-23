/**
 * Tournament media helpers — SaaS R2 only (keys stored in Postgres).
 * No data-project / offline file server.
 */

const OFFLINE_DB_NAME = "cricket-auction-offline";
const OFFLINE_DB_VERSION = 1;
const OFFLINE_MEDIA_STORE = "media";

const offlineObjectUrlCache = new Map();
let assetsApiReadyCache = null;
let assetsApiReadyAt = 0;

function isIdbPhotoRef(value) {
    return /^idb:/i.test(String(value || "").trim());
}

function isDivisionAssetsPhotoPath(value, divisionId) {
    const photo = String(value || "").trim().replace(/^\.\.\//, "");
    const id = divisionId || "div_1";
    return (
        photo.startsWith(`data-project/divisions/${id}/photos/`) ||
        photo.startsWith(`assets/players-photo/${id}/`)
    );
}

async function fetchDivisionPhotoIndex(divisionId) {
    const id = divisionId || "div_1";
    const empty = { codes: new Set(), paths: new Set(), count: 0 };
    try {
        const ready = await checkAssetsApiReady();
        if (!ready) return empty;
        const response = await fetch(`/api/photos/${encodeURIComponent(id)}/status`, {
            cache: "no-store"
        });
        if (!response.ok) return empty;
        const payload = await response.json().catch(() => ({ files: [] }));
        const codes = new Set();
        const paths = new Set();
        for (const file of payload.files || []) {
            const fileName = String(file.file || "").toLowerCase();
            const code = fileName.replace(/\.[^.]+$/, "");
            if (fileName) codes.add(fileName);
            if (code) codes.add(code);
            const rel = String(file.path || "")
                .replace(/\\/g, "/")
                .replace(/^\//, "")
                .toLowerCase();
            if (rel) paths.add(rel);
        }
        return {
            codes,
            paths,
            count: Number(payload.count) || (payload.files || []).length
        };
    } catch (_) {
        return empty;
    }
}

function photoRefExistsInIndex(photo, divisionId, index) {
    if (!index) return false;
    const value = String(photo || "")
        .trim()
        .replace(/^\.\.\//, "")
        .replace(/\\/g, "/")
        .replace(/^\//, "");
    if (!value) return false;
    if (value.startsWith("data:") || /^https?:\/\//i.test(value)) return true;
    if (isIdbPhotoRef(value)) return true;
    const base = value.split("/").pop().toLowerCase();
    const code = base.replace(/\.[^.]+$/, "");
    if (index.paths.has(value.toLowerCase())) return true;
    if (base && index.codes.has(base)) return true;
    if (code && index.codes.has(code)) return true;
    return false;
}

function mediaRecordKey(divisionId, kind, id) {
    return `${divisionId || "div_1"}|${kind || "player"}|${String(id)}`;
}

function parseIdbPhotoRef(value, fallbackDivisionId = "div_1") {
    const raw = String(value || "").trim();
    const parts = raw.replace(/^idb:/i, "").split(":");
    if (parts.length >= 3) {
        return { divisionId: parts[0], kind: parts[1], id: parts.slice(2).join(":") };
    }
    if (parts.length === 2) {
        return { divisionId: fallbackDivisionId, kind: parts[0], id: parts[1] };
    }
    return null;
}

function openOfflineDb() {
    return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("IndexedDB is not available in this browser."));
            return;
        }
        const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(OFFLINE_MEDIA_STORE)) {
                const store = db.createObjectStore(OFFLINE_MEDIA_STORE, { keyPath: "key" });
                store.createIndex("divisionId", "divisionId", { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not open offline database."));
    });
}

function revokeOfflineObjectUrl(cacheKey) {
    const url = offlineObjectUrlCache.get(cacheKey);
    if (url) {
        URL.revokeObjectURL(url);
        offlineObjectUrlCache.delete(cacheKey);
    }
}

async function getOfflineMediaRecord(divisionId, kind, id) {
    const key = mediaRecordKey(divisionId, kind, id);
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OFFLINE_MEDIA_STORE, "readonly");
        const req = tx.objectStore(OFFLINE_MEDIA_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function getOfflineMediaObjectUrl(divisionId, kind, id) {
    const key = mediaRecordKey(divisionId, kind, id);
    if (offlineObjectUrlCache.has(key)) return offlineObjectUrlCache.get(key);
    try {
        const record = await getOfflineMediaRecord(divisionId, kind, id);
        if (!record?.blob) return "";
        const url = URL.createObjectURL(record.blob);
        offlineObjectUrlCache.set(key, url);
        return url;
    } catch (_) {
        return "";
    }
}

async function checkAssetsApiReady({ force = false } = {}) {
    const now = Date.now();
    if (!force && assetsApiReadyCache !== null && now - assetsApiReadyAt < 15000) {
        return assetsApiReadyCache;
    }
    try {
        const response = await fetch("/api/photos/health", { cache: "no-store" });
        assetsApiReadyCache = response.ok;
    } catch (_) {
        assetsApiReadyCache = false;
    }
    assetsApiReadyAt = now;
    return assetsApiReadyCache;
}

function usesSaasMedia() {
    return Boolean(
        typeof usesTournamentDb === "function" &&
            usesTournamentDb() &&
            window.SaasAuth?.uploadMedia
    );
}

function requireSaasMedia() {
    if (!usesSaasMedia()) {
        throw new Error("Cloud media requires login + selected tournament (Postgres + R2).");
    }
}

async function requireAssetsApi() {
    requireSaasMedia();
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Could not read media."));
        reader.readAsDataURL(blob);
    });
}

function dataUrlToBlob(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data URL.");
    const mime = match[1];
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

function dataUrlToBase64(dataUrl) {
    const match = String(dataUrl || "").match(/^data:[^;]+;base64,(.+)$/);
    if (match) return match[1];
    return String(dataUrl || "");
}

async function resizeImageBlob(blob, maxSize = 512, quality = 0.82) {
    if (!blob) return blob;
    try {
        let source;
        if (typeof createImageBitmap === "function") {
            source = await createImageBitmap(blob);
        } else {
            source = await new Promise((resolve, reject) => {
                const url = URL.createObjectURL(blob);
                const image = new Image();
                image.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve(image);
                };
                image.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error("Could not decode image."));
                };
                image.src = url;
            });
        }
        const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
        const width = Math.max(1, Math.round(source.width * scale));
        const height = Math.max(1, Math.round(source.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(source, 0, 0, width, height);
        source.close?.();
        return new Promise((resolve) => {
            canvas.toBlob(
                (out) => resolve(out || blob),
                String(blob.type || "").includes("png") ? "image/png" : "image/jpeg",
                quality
            );
        });
    } catch (_) {
        return blob;
    }
}

async function fetchImageAsBlob(url, { timeoutMs = 12000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal, mode: "cors" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!String(blob.type || "").startsWith("image/")) {
            if (!blob.size) throw new Error("Empty image response");
        }
        return blob;
    } finally {
        clearTimeout(timer);
    }
}

/** Upload a photo blob to R2 and return { path, photoKey }. */
async function putOfflineMedia({ divisionId, kind = "player", id, blob, mimeType }) {
    if (!blob) throw new Error("Missing media blob.");
    const code = String(id || "").trim();
    if (!code) throw new Error("Missing player code.");
    requireSaasMedia();
    const file = new File([blob], `${code}.jpg`, {
        type: mimeType || blob.type || "image/jpeg"
    });
    const uploaded = await window.SaasAuth.uploadMedia(file, kind === "player" ? "player-photo" : kind);
    return {
        path: uploaded.publicUrl || "",
        photoKey: uploaded.objectKey || null
    };
}

function applyMediaResult(player, media) {
    if (!player || !media) return player;
    const path = typeof media === "string" ? media : media.path || "";
    const photoKey = typeof media === "object" ? media.photoKey || null : null;
    player.photo = path;
    if (photoKey) player.photoKey = photoKey;
    else if (typeof media === "object") delete player.photoKey;
    return path;
}

async function deleteDivisionOfflineMedia(divisionId) {
    const id = String(divisionId || "").trim();
    if (!id) return;

    // Best-effort: also clear legacy IndexedDB for this division
    try {
        const db = await openOfflineDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(OFFLINE_MEDIA_STORE, "readwrite");
            const store = tx.objectStore(OFFLINE_MEDIA_STORE);
            const index = store.index("divisionId");
            const req = index.openCursor(IDBKeyRange.only(id));
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) return;
                revokeOfflineObjectUrl(cursor.value.key);
                cursor.delete();
                cursor.continue();
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (_) {
        // ignore legacy cleanup failures
    }

    const ready = await checkAssetsApiReady();
    if (!ready) return;

    const response = await fetch(`/api/photos/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Could not delete photos for ${id}.`);
    }
}

async function deleteAllDivisionPhotoFolders() {
    const ready = await checkAssetsApiReady({ force: true });
    if (!ready) return;
    const response = await fetch("/api/photos", { method: "DELETE" });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not wipe photo folders.");
    }
}

async function deletePlayerPhotoFile(divisionId, code, photoRef = "", photoKey = "") {
    const key = String(photoKey || "").trim();
    if (key && window.SaasAuth?.deleteMedia) {
        await window.SaasAuth.deleteMedia(key).catch(() => {});
        return true;
    }
    if (
        typeof usesTournamentDb === "function" &&
        usesTournamentDb() &&
        /^https?:\/\//i.test(String(photoRef || ""))
    ) {
        // Remote R2 URL without key — nothing local to delete.
        return true;
    }
    const id = String(divisionId || "").trim();
    let playerCode = String(code || "").trim();
    if (!playerCode && photoRef) {
        const base = String(photoRef).split(/[\\/]/).pop() || "";
        playerCode = base.replace(/\.[^.]+$/, "").trim();
    }
    if (!id || !playerCode) return false;
    const ready = await checkAssetsApiReady();
    if (!ready) return false;
    const response = await fetch(
        `/api/photos/${encodeURIComponent(id)}/${encodeURIComponent(playerCode)}`,
        { method: "DELETE" }
    );
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Could not delete photo for ${playerCode}.`);
    }
    return true;
}

async function listDivisionOfflineMedia(divisionId) {
    // Used by pack export: build media entries from disk paths on players, or API status + fetch
    const ready = await checkAssetsApiReady();
    if (!ready) return [];

    const response = await fetch(`/api/photos/${encodeURIComponent(divisionId)}/status`, {
        cache: "no-store"
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({ files: [] }));
    const media = [];
    for (const file of payload.files || []) {
        try {
            const blob = await fetchImageAsBlob(`/${file.path}`);
            const dataUrl = await blobToDataUrl(blob);
            const id = String(file.file || "").replace(/\.[^.]+$/, "");
            media.push({
                kind: "player",
                id,
                mimeType: blob.type || "image/jpeg",
                dataUrl,
                path: file.path
            });
        } catch (_) {
            // skip unreadable files
        }
    }
    return media;
}

/**
 * Resolve a photo field to a displayable URL (may be async for legacy idb: refs).
 */
async function resolvePlayerPhotoSrc(
    photo,
    { divisionId = "div_1", fromPrefix = "", photoIndex = null, verifyLocal = false } = {}
) {
    const placeholder = `${fromPrefix}assets/placeholder.png`;
    const value = String(photo || "").trim();
    if (!value) return placeholder;
    if (value.startsWith("data:")) return value;
    if (isIdbPhotoRef(value)) {
        const parsed = parseIdbPhotoRef(value, divisionId);
        if (!parsed) return placeholder;
        const url = await getOfflineMediaObjectUrl(parsed.divisionId || divisionId, parsed.kind, parsed.id);
        return url || placeholder;
    }
    if (/^https?:\/\//i.test(value)) return value;

    const looksLocal =
        value.startsWith("assets/") ||
        value.startsWith("data-project/") ||
        value.startsWith("../assets/") ||
        value.startsWith("../data-project/") ||
        value.startsWith("/assets/") ||
        value.startsWith("/data-project/");

    if (looksLocal && (verifyLocal || photoIndex)) {
        const index = photoIndex || (await fetchDivisionPhotoIndex(divisionId));
        if (!photoRefExistsInIndex(value, divisionId, index)) {
            return placeholder;
        }
    }

    if (value.startsWith("../") || value.startsWith("/")) return value;
    if (value.startsWith("assets/") || value.startsWith("data-project/")) {
        return `${fromPrefix}${value}`;
    }
    return value;
}

function applyResolvedPhoto(imgEl, src) {
    if (!imgEl) return;
    imgEl.src = src || "assets/placeholder.png";
}

async function hydratePhotoElements(root = document, { divisionId = "div_1", fromPrefix = "" } = {}) {
    const nodes = root.querySelectorAll("[data-photo-ref]");
    const photoIndex = await fetchDivisionPhotoIndex(divisionId);
    await Promise.all(
        [...nodes].map(async (img) => {
            const ref = img.getAttribute("data-photo-ref");
            const src = await resolvePlayerPhotoSrc(ref, {
                divisionId,
                fromPrefix,
                photoIndex,
                verifyLocal: true
            });
            applyResolvedPhoto(img, src);
            img.onerror = () => {
                img.onerror = null;
                img.src = `${fromPrefix}assets/placeholder.png`;
            };
        })
    );
}

/**
 * Download/copy one player's photo into assets/. Returns updated photo path.
 */
async function cachePlayerPhoto(player, divisionId, { assetPrefix = "", photoIndex = null } = {}) {
    if (!player) return "";
    const id = String(player.code || player.id || "").trim();
    if (!id) return player.photo || "";

    const current = String(player.photo || "").trim();
    // SaaS: store a copy in R2 for this tournament (do not rely on local disk).
    if (usesSaasMedia()) {
        const alreadyOurs =
            player.photoKey &&
            String(player.photoKey).startsWith("org/") &&
            /^https?:\/\//i.test(current);
        if (alreadyOurs) return current;

        let blob = null;
        if (current.startsWith("data:image/")) {
            blob = dataUrlToBlob(current);
        } else if (/^https?:\/\//i.test(current)) {
            if (!navigator.onLine) return current;
            try {
                blob = await fetchImageAsBlob(current);
            } catch (_) {
                return current;
            }
        }
        if (!blob) return current || "";
        // Skip placeholders — nothing useful to store.
        if (/placeholder\.png/i.test(current)) return current;

        if (player.photoKey && window.SaasAuth?.deleteMedia) {
            await window.SaasAuth.deleteMedia(player.photoKey).catch(() => {});
        }
        const resized = await resizeImageBlob(blob);
        return applyMediaResult(
            player,
            await putOfflineMedia({
                divisionId,
                kind: "player",
                id,
                blob: resized,
                mimeType: resized.type
            })
        );
    }
    if (isDivisionAssetsPhotoPath(current, divisionId)) {
        const index = photoIndex || (await fetchDivisionPhotoIndex(divisionId));
        if (photoRefExistsInIndex(current, divisionId, index)) {
            return current.replace(/^\.\.\//, "");
        }
        // Path claims a local file that is missing (e.g. after a partial reset).
        // Keep going only if we can fetch from somewhere else; otherwise leave path.
    }

    if (current.startsWith("data:image/")) {
        const blob = dataUrlToBlob(current);
        const resized = await resizeImageBlob(blob);
        const media = await putOfflineMedia({
            divisionId,
            kind: "player",
            id,
            blob: resized,
            mimeType: resized.type
        });
        return applyMediaResult(player, media);
    }

    let fetchUrl = "";
    if (/^https?:\/\//i.test(current)) {
        fetchUrl = current;
    } else if (current.startsWith("assets/")) {
        // Already on disk elsewhere — copy into this division folder
        fetchUrl = `${assetPrefix}${current}`;
    } else if (current && !isIdbPhotoRef(current)) {
        fetchUrl = current.startsWith("../") ? current : `${assetPrefix}${current}`;
    }

    if (!fetchUrl) {
        return current || "assets/placeholder.png";
    }
    if (!navigator.onLine && /^https?:\/\//i.test(fetchUrl)) {
        return current || "assets/placeholder.png";
    }

    try {
        const blob = await fetchImageAsBlob(fetchUrl);
        const resized = await resizeImageBlob(blob);
        const media = await putOfflineMedia({
            divisionId,
            kind: "player",
            id,
            blob: resized,
            mimeType: resized.type
        });
        return applyMediaResult(player, media);
    } catch (_) {
        return current || "assets/placeholder.png";
    }
}

async function cachePlayersPhotos(players, divisionId, { assetPrefix = "", onProgress } = {}) {
    const saas = usesSaasMedia();
    if (!saas) await requireAssetsApi();
    const list = players || [];
    let photoIndex = saas ? { files: [] } : await fetchDivisionPhotoIndex(divisionId);
    let cached = 0;
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
        const before = String(list[i].photo || "");
        const hadKey = Boolean(list[i].photoKey);
        try {
            list[i].photo = await cachePlayerPhoto(list[i], divisionId, {
                assetPrefix,
                photoIndex
            });
            if (saas) {
                if (list[i].photoKey && /^https?:\/\//i.test(String(list[i].photo || ""))) {
                    cached += 1;
                } else if (String(list[i].photo || "").trim()) {
                    // Kept a usable URL but could not store a key
                    failed += 1;
                } else if (before) {
                    failed += 1;
                }
            } else {
                const nowLocal = isDivisionAssetsPhotoPath(list[i].photo, divisionId);
                const existedBefore = photoRefExistsInIndex(before, divisionId, photoIndex);
                if (nowLocal && !existedBefore) {
                    photoIndex = await fetchDivisionPhotoIndex(divisionId);
                    if (photoRefExistsInIndex(list[i].photo, divisionId, photoIndex)) cached += 1;
                    else failed += 1;
                } else if (!nowLocal && /^https?:\/\//i.test(before)) {
                    failed += 1;
                } else if (nowLocal && hadKey === false && existedBefore) {
                    // already on disk
                }
            }
        } catch (_) {
            failed += 1;
        }
        if (typeof onProgress === "function") onProgress(i + 1, list.length, cached, failed);
    }
    return { players: list, cached, failed, total: list.length, mode: saas ? "r2" : "disk" };
}

async function importPhotoFilesForDivision(files, players, divisionId) {
    if (!usesSaasMedia()) await requireAssetsApi();
    const list = (players || []).slice();
    const byCode = new Map();
    list.forEach((player) => {
        const code = String(player.code || "").trim().toLowerCase();
        const id = String(player.id || "").trim().toLowerCase();
        if (code) byCode.set(code, player);
        if (id) byCode.set(id, player);
        const base = code.replace(/\.[^.]+$/, "");
        if (base) byCode.set(base, player);
    });

    let matched = 0;
    for (const file of files || []) {
        if (!file || !String(file.type || "").startsWith("image/")) continue;
        const name = String(file.name || "").replace(/\.[^.]+$/, "").trim().toLowerCase();
        const player = byCode.get(name);
        if (!player) continue;
        const id = String(player.code || player.id);
        const resized = await resizeImageBlob(file);
        applyMediaResult(
            player,
            await putOfflineMedia({
                divisionId,
                kind: "player",
                id,
                blob: resized,
                mimeType: resized.type
            })
        );
        matched += 1;
    }
    return { players: list, matched };
}

async function countCachedPlayerPhotos(players, divisionId) {
    const index = await fetchDivisionPhotoIndex(divisionId);
    let cached = 0;
    for (const player of players || []) {
        const photo = String(player?.photo || "").trim();
        if (!photo) continue;
        if (player?.photoKey || /^https?:\/\//i.test(photo) || photo.startsWith("data:image/")) {
            cached += 1;
            continue;
        }
        if (isDivisionAssetsPhotoPath(photo, divisionId) || photo.includes("/photos/")) {
            if (photoRefExistsInIndex(photo, divisionId, index)) {
                cached += 1;
                continue;
            }
            continue;
        }
        // Legacy idb refs still count if blob exists
        if (!isIdbPhotoRef(photo)) continue;
        const parsed = parseIdbPhotoRef(photo, divisionId);
        if (!parsed) continue;
        try {
            const record = await getOfflineMediaRecord(divisionId, parsed.kind, parsed.id);
            if (record?.blob) cached += 1;
        } catch (_) {
            // ignore
        }
    }
    return cached;
}

async function fetchBlobAsDataUrl(url, { timeoutMs = 60000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.size) throw new Error("Empty media response");
        return {
            dataUrl: await blobToDataUrl(blob),
            mimeType: blob.type || "application/octet-stream"
        };
    } finally {
        clearTimeout(timer);
    }
}

async function loadDivisionPlayersFromProject(divisionId) {
    try {
        if (typeof fetchProjectSnapshot === "function") {
            const snapshot = await fetchProjectSnapshot();
            const match = (snapshot.divisions || []).find((item) => item.id === divisionId);
            if (Array.isArray(match?.players)) return match.players;
        }
    } catch (_) {
        // fall through
    }
    const playersKey =
        typeof getDivisionPlayersKey === "function"
            ? getDivisionPlayersKey(divisionId)
            : `auctionPlayers:${divisionId}`;
    try {
        return JSON.parse(localStorage.getItem(playersKey) || "[]") || [];
    } catch (_) {
        return [];
    }
}

async function loadDivisionAuctionFromProject(divisionId) {
    try {
        if (typeof fetchProjectSnapshot === "function") {
            const snapshot = await fetchProjectSnapshot();
            const match = (snapshot.divisions || []).find((item) => item.id === divisionId);
            if (match?.auction) return match.auction;
        }
    } catch (_) {
        // fall through
    }
    const dataKey =
        typeof getDivisionAuctionDataKey === "function"
            ? getDivisionAuctionDataKey(divisionId)
            : `auctionData:${divisionId}`;
    try {
        return JSON.parse(localStorage.getItem(dataKey) || "null");
    } catch (_) {
        return null;
    }
}

async function embedTeamsForPack(teams, divisionId) {
    const list = JSON.parse(JSON.stringify(Array.isArray(teams) ? teams : []));
    const teamMedia = [];

    for (const team of list) {
        const logo = String(team.logo || "").trim();
        if (logo && !logo.startsWith("data:")) {
            try {
                const src = logo.startsWith("/") || logo.startsWith("http") ? logo : `/${logo}`;
                const embedded = await fetchBlobAsDataUrl(src);
                team.logo = embedded.dataUrl;
            } catch (_) {
                // keep original path if embed fails
            }
        }

        const video = String(team.video || "").trim();
        if (!video) continue;
        try {
            const src = video.startsWith("/") || video.startsWith("http") ? video : `/${video}`;
            const embedded = await fetchBlobAsDataUrl(src, { timeoutMs: 120000 });
            teamMedia.push({
                kind: "team-video",
                teamId: team.team_id,
                divisionId,
                mimeType: embedded.mimeType,
                dataUrl: embedded.dataUrl,
                path: video
            });
        } catch (_) {
            // skip unreadable video
        }
    }

    return { teams: list, teamMedia };
}

async function buildDivisionPackPayload(sourceDivision, normalizedConfig = null) {
    const divisionId = sourceDivision?.id;
    if (!divisionId) throw new Error("Division not found.");

    const players = await loadDivisionPlayersFromProject(divisionId);
    const auctionData = await loadDivisionAuctionFromProject(divisionId);
    const { teams, teamMedia } = await embedTeamsForPack(sourceDivision.teams || [], divisionId);
    const division = {
        ...JSON.parse(JSON.stringify(sourceDivision)),
        teams
    };

    const mediaRecords = await listDivisionOfflineMedia(divisionId);
    const media = mediaRecords.map((record) => ({
        kind: record.kind || "player",
        id: record.id,
        mimeType: record.mimeType,
        dataUrl: record.dataUrl,
        path: record.path
    }));

    return {
        division,
        players,
        auctionData,
        media,
        teamMedia,
        tournament: normalizedConfig?.tournament || null
    };
}

async function embedTournamentForPack(tournament) {
    const next = JSON.parse(JSON.stringify(tournament || {}));
    const logo = String(next.logo || "").trim();
    if (logo && !logo.startsWith("data:")) {
        try {
            const src = logo.startsWith("/") || logo.startsWith("http") ? logo : `/${logo}`;
            const embedded = await fetchBlobAsDataUrl(src);
            next.logo = embedded.dataUrl;
        } catch (_) {
            // keep path
        }
    }
    return next;
}

async function exportPartnersForPack() {
    try {
        const response = await fetch("/api/partners", { cache: "no-store" });
        if (!response.ok) return [];
        const payload = await response.json().catch(() => ({}));
        const list = Array.isArray(payload.partners) ? payload.partners : Array.isArray(payload) ? payload : [];
        const embedded = [];
        for (const partner of list) {
            const item = JSON.parse(JSON.stringify(partner || {}));
            for (const field of ["logo", "video"]) {
                const value = String(item[field] || "").trim();
                if (!value || value.startsWith("data:")) continue;
                try {
                    const src = value.startsWith("/") || value.startsWith("http") ? value : `/${value}`;
                    const media = await fetchBlobAsDataUrl(src, {
                        timeoutMs: field === "video" ? 120000 : 60000
                    });
                    item[field] = media.dataUrl;
                    if (field === "video") item.videoMimeType = media.mimeType;
                } catch (_) {
                    // keep original
                }
            }
            embedded.push(item);
        }
        return embedded;
    } catch (_) {
        return [];
    }
}

async function exportDivisionPack(divisionId) {
    const config = typeof getAuctionConfig === "function" ? await getAuctionConfig() : null;
    const normalized = typeof normalizeConfig === "function" ? normalizeConfig(config || {}) : config;
    const sourceDivision =
        (normalized?.divisions || []).find((item) => item.id === divisionId) ||
        (typeof getActiveDivision === "function" ? getActiveDivision(normalized) : null);

    if (!sourceDivision) throw new Error("Division not found.");

    const payload = await buildDivisionPackPayload(sourceDivision, normalized);
    const tournament = await embedTournamentForPack(payload.tournament);

    return {
        version: 3,
        type: "cricket-auction-division-pack",
        exportedAt: new Date().toISOString(),
        division: payload.division,
        tournament,
        shared: {
            tournament,
            teams: payload.division.teams || []
        },
        players: payload.players,
        auctionData: payload.auctionData,
        media: payload.media,
        teamMedia: payload.teamMedia
    };
}

async function exportProjectPack() {
    const config = typeof getAuctionConfig === "function" ? await getAuctionConfig() : null;
    const normalized = typeof normalizeConfig === "function" ? normalizeConfig(config || {}) : config;
    if (!normalized?.divisions?.length) throw new Error("No divisions to export.");

    const tournament = await embedTournamentForPack(normalized.tournament);
    const divisions = [];
    for (const sourceDivision of normalized.divisions) {
        const payload = await buildDivisionPackPayload(sourceDivision, normalized);
        divisions.push({
            division: payload.division,
            players: payload.players,
            auctionData: payload.auctionData,
            media: payload.media,
            teamMedia: payload.teamMedia
        });
    }

    const partners = await exportPartnersForPack();

    return {
        version: 1,
        type: "cricket-auction-project-pack",
        exportedAt: new Date().toISOString(),
        tournament,
        activeDivisionId: normalized.activeDivisionId,
        divisions,
        partners
    };
}

async function uploadTeamVideoFromDataUrl(divisionId, teamId, dataUrl, mimeType) {
    const blob = dataUrlToBlob(dataUrl);
    const response = await fetch(
        `/api/teams/video?id=${encodeURIComponent(teamId)}&division=${encodeURIComponent(divisionId)}`,
        {
            method: "POST",
            headers: {
                "Content-Type": mimeType || blob.type || "video/mp4",
                "X-Team-Id": String(teamId),
                "X-Division-Id": String(divisionId)
            },
            body: blob
        }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not import team video.");
    return payload.path;
}

function readAuctionConfigFromLocalCache() {
    // Never hydrate from disk here — mid-import disk can still be blank/stale while
    // localStorage already holds the pack being applied.
    let config = null;
    try {
        const key = typeof AUCTION_CONFIG_KEY === "string" ? AUCTION_CONFIG_KEY : "auctionConfig";
        const saved = localStorage.getItem(key);
        if (saved) config = JSON.parse(saved);
    } catch (_) {
        config = null;
    }
    return typeof normalizeConfig === "function" ? normalizeConfig(config || {}) : config || {};
}

async function persistImportedConfig(config) {
    if (typeof persistConfigToProjectFolder === "function") {
        await persistConfigToProjectFolder(config);
        return;
    }
    if (typeof putProjectConfig === "function") {
        await putProjectConfig(config);
    }
}

async function importDivisionPack(
    pack,
    { replacePlayers = true, replaceAuctionData = true, replaceTournament = false } = {}
) {
    if (!pack || pack.type !== "cricket-auction-division-pack") {
        throw new Error("Not a valid auction division pack.");
    }

    let config = readAuctionConfigFromLocalCache();

    let division = JSON.parse(JSON.stringify(pack.division || {}));
    if (!division?.id && !division?.name) throw new Error("Pack is missing division info.");

    // Prefer pack teams on the division; fall back to legacy shared.teams
    if (!Array.isArray(division.teams) || !division.teams.length) {
        if (Array.isArray(pack.shared?.teams)) division.teams = pack.shared.teams;
    }

    const existing = (config.divisions || []).find((item) => item.id === division.id);
    if (!existing) {
        if ((config.divisions || []).length >= (typeof MAX_AUCTION_DIVISIONS === "number" ? MAX_AUCTION_DIVISIONS : 3)) {
            if (typeof addDivision === "function") {
                config = addDivision(config, division.name || "Imported Division");
                const created = config.divisions[config.divisions.length - 1];
                division = { ...division, id: created.id };
            } else {
                throw new Error("No free division slot. Remove one division first.");
            }
        } else {
            if (!division.id) {
                division.id =
                    typeof createDivisionId === "function"
                        ? createDivisionId(config.divisions)
                        : `div_${(config.divisions || []).length + 1}`;
            }
            config.divisions = [...(config.divisions || []), division];
        }
    } else {
        // Full replace of this division from the pack (teams, kitty, categories, …)
        const index = config.divisions.findIndex((item) => item.id === division.id);
        config.divisions[index] = {
            ...division,
            id: existing.id
        };
        division = config.divisions[index];
    }

    config.activeDivisionId = division.id;
    if (replaceTournament) {
        const tournament = pack.tournament || pack.shared?.tournament;
        if (tournament) config.tournament = tournament;
    }

    // Wipe old photos for this division, then write pack media
    if (typeof deleteDivisionOfflineMedia === "function") {
        await deleteDivisionOfflineMedia(division.id).catch(() => {});
    }

    let players = Array.isArray(pack.players) ? pack.players.slice() : [];
    let mediaCount = 0;

    if ((pack.media || []).length) {
        await requireAssetsApi();
        const photoById = new Map();
        for (const item of pack.media || []) {
            if (!item?.dataUrl || !item?.id) continue;
            try {
                const blob = dataUrlToBlob(item.dataUrl);
                const media = await putOfflineMedia({
                    divisionId: division.id,
                    kind: item.kind || "player",
                    id: item.id,
                    blob,
                    mimeType: item.mimeType || blob.type
                });
                photoById.set(String(item.id).toLowerCase(), media);
                mediaCount += 1;
            } catch (_) {
                // skip bad media entries
            }
        }
        players = players.map((player) => {
            const code = String(player.code || player.id || "").toLowerCase();
            const media = photoById.get(code);
            if (!media) return player;
            const next = { ...player, photo: media.path || "" };
            if (media.photoKey) next.photoKey = media.photoKey;
            return next;
        });
    }

    // Restore team celebration videos into data-project
    if ((pack.teamMedia || []).length) {
        const teams = Array.isArray(division.teams) ? division.teams : [];
        for (const item of pack.teamMedia || []) {
            if (item?.kind !== "team-video" || !item?.dataUrl || item.teamId == null) continue;
            try {
                const path = await uploadTeamVideoFromDataUrl(
                    division.id,
                    item.teamId,
                    item.dataUrl,
                    item.mimeType
                );
                const team = teams.find((entry) => Number(entry.team_id) === Number(item.teamId));
                if (team) team.video = path;
                mediaCount += 1;
            } catch (_) {
                // skip bad video
            }
        }
        division.teams = teams;
        const index = config.divisions.findIndex((item) => item.id === division.id);
        if (index >= 0) config.divisions[index] = division;
    }

    if (typeof saveAuctionConfig === "function") {
        config = saveAuctionConfig(config);
    } else {
        try {
            const key = typeof AUCTION_CONFIG_KEY === "string" ? AUCTION_CONFIG_KEY : "auctionConfig";
            localStorage.setItem(key, JSON.stringify(config));
        } catch (_) {
            // ignore
        }
    }
    // Await disk write so the next division import cannot hydrate a stale blank project
    await persistImportedConfig(config).catch((error) => {
        console.warn("Division pack config sync:", error?.message || error);
    });

    const playersKey =
        typeof getDivisionPlayersKey === "function"
            ? getDivisionPlayersKey(division.id)
            : `auctionPlayers:${division.id}`;
    const dataKey =
        typeof getDivisionAuctionDataKey === "function"
            ? getDivisionAuctionDataKey(division.id)
            : `auctionData:${division.id}`;

    if (replacePlayers) {
        const list = Array.isArray(pack.players) ? players : [];
        localStorage.setItem(playersKey, JSON.stringify(list));
        if (typeof persistPlayersToProjectFolder === "function") {
            await persistPlayersToProjectFolder(division.id, list);
        }
    }

    if (replaceAuctionData) {
        if (pack.auctionData) {
            localStorage.setItem(dataKey, JSON.stringify(pack.auctionData));
            if (typeof persistAuctionToProjectFolder === "function") {
                await persistAuctionToProjectFolder(division.id, pack.auctionData);
            }
        } else {
            localStorage.removeItem(dataKey);
            if (typeof persistAuctionToProjectFolder === "function") {
                await persistAuctionToProjectFolder(division.id, null);
            } else if (typeof deleteDivisionAuction === "function") {
                await deleteDivisionAuction(division.id).catch(() => {});
            }
        }
    }

    return {
        config,
        divisionId: division.id,
        mediaCount,
        teamCount: Array.isArray(division.teams) ? division.teams.length : 0,
        playerCount: replacePlayers ? (Array.isArray(pack.players) ? players.length : 0) : null
    };
}

async function importPartnersFromPack(partners) {
    if (!Array.isArray(partners) || !partners.length) return 0;
    try {
        const response = await fetch("/api/partners", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partners })
        });
        if (!response.ok) {
            // Fallback: try POST each if bulk PUT unsupported
            return 0;
        }
        return partners.length;
    } catch (_) {
        return 0;
    }
}

/**
 * Replace the entire project from a project pack (all divisions + media).
 */
async function importProjectPack(pack) {
    if (!pack || pack.type !== "cricket-auction-project-pack") {
        throw new Error("Not a valid auction project pack.");
    }
    if (!Array.isArray(pack.divisions) || !pack.divisions.length) {
        throw new Error("Project pack has no divisions.");
    }

    // Drop any in-flight browser→disk PUTs before wipe/import
    if (typeof bumpProjectPersistGeneration === "function") {
        bumpProjectPersistGeneration();
    }

    // Start from a blank disk project so leftover divisions/photos cannot remain
    if (typeof resetProjectFolderOnDisk === "function") {
        await resetProjectFolderOnDisk();
    }
    if (typeof clearAuctionLocalStorageCaches === "function") {
        clearAuctionLocalStorageCaches();
    }
    // Import must not treat a prior "force blank" boot as still active
    try {
        sessionStorage.removeItem("auctionForceBlank");
    } catch (_) {
        // ignore
    }

    const blank =
        typeof buildBlankProjectConfig === "function"
            ? buildBlankProjectConfig()
            : { tournament: pack.tournament || {}, divisions: [], activeDivisionId: "div_1" };

    const divisionEntries = pack.divisions.slice(0, typeof MAX_AUCTION_DIVISIONS === "number" ? MAX_AUCTION_DIVISIONS : 3);
    blank.tournament = pack.tournament || blank.tournament;
    blank.divisions = divisionEntries.map((entry, index) => {
        const division = JSON.parse(JSON.stringify(entry.division || {}));
        if (!division.id) division.id = `div_${index + 1}`;
        if (!division.name) division.name = `Division ${index + 1}`;
        if (!Array.isArray(division.teams)) division.teams = [];
        return division;
    });
    blank.activeDivisionId =
        pack.activeDivisionId && blank.divisions.some((d) => d.id === pack.activeDivisionId)
            ? pack.activeDivisionId
            : blank.divisions[0].id;

    let seeded =
        typeof saveAuctionConfig === "function" ? saveAuctionConfig(blank) : blank;
    // Flush seeded config to disk before media import so hydrate cannot wipe teams
    await persistImportedConfig(seeded).catch((error) => {
        console.warn("Project pack config sync:", error?.message || error);
    });

    let totalMedia = 0;
    let totalPlayers = 0;
    let totalTeams = 0;

    for (const entry of divisionEntries) {
        const divisionPack = {
            type: "cricket-auction-division-pack",
            version: 3,
            division: entry.division,
            players: entry.players || [],
            auctionData: entry.auctionData || null,
            media: entry.media || [],
            teamMedia: entry.teamMedia || [],
            tournament: pack.tournament || null,
            shared: {
                tournament: pack.tournament || null,
                teams: entry.division?.teams || []
            }
        };
        const result = await importDivisionPack(divisionPack, {
            replacePlayers: true,
            replaceAuctionData: true,
            replaceTournament: false
        });
        totalMedia += result.mediaCount || 0;
        totalPlayers += result.playerCount || 0;
        totalTeams += result.teamCount || 0;
    }

    const partnerCount = await importPartnersFromPack(pack.partners || []);

    if (typeof flushProjectPersistQueue === "function") {
        await flushProjectPersistQueue();
    }

    if (typeof hydrateLocalStorageFromProjectFolder === "function") {
        await hydrateLocalStorageFromProjectFolder().catch(() => {});
    }

    return {
        divisionCount: divisionEntries.length,
        teamCount: totalTeams,
        playerCount: totalPlayers,
        mediaCount: totalMedia,
        partnerCount
    };
}

function downloadJsonFile(filename, data) {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Auction desk must not run from stale PWA/cache when server.js is down.
 * Unregister any old service workers and wipe Cache Storage.
 * Briefly registers the killer sw.js so older installs get replaced, then unregisters.
 */
async function registerAuctionServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    try {
        if (window.caches && typeof caches.keys === "function") {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
        }
    } catch (_) {
        // ignore
    }

    try {
        const regs = await navigator.serviceWorker.getRegistrations();
        // Install updated sw once so activate handler clears old shell caches
        const swUrl = `${window.location.origin}/sw.js?v=disabled1`;
        try {
            await navigator.serviceWorker.register(swUrl, { scope: "/" });
        } catch (_) {
            // ignore
        }
        await Promise.all(regs.map((reg) => reg.unregister()));
        const after = await navigator.serviceWorker.getRegistrations();
        await Promise.all(after.map((reg) => reg.unregister()));
    } catch (_) {
        // ignore registration failures (file:// etc.)
    }
}
