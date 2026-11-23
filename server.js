/**
 * Local auction desk server.
 * - Serves the app
 * - Persists WhatsApp-style project folder: data-project/
 * - Player photos: data-project/divisions/<id>/photos/
 *
 * Usage: node server.js
 * Open:  http://localhost:3000
 */

const http = require("http");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const PROJECT_ROOT = path.join(ROOT, "data-project");
const LEGACY_PHOTOS_ROOT = path.join(ROOT, "assets", "players-photo");

const BLANK_PROJECT = {
    tournament: { name: "New Auction", year: String(new Date().getFullYear()) },
    teams: [],
    activeDivisionId: "div_1",
    divisions: [
        {
            id: "div_1",
            name: "Main Auction",
            teams: [],
            teamKitty: 10000000,
            useCategoryBasePrices: true,
            auctionOrder: "SEQUENCE",
            shuffleWithinCategory: true,
            playerWheelEnabled: true,
            categorySequence: ["RISING STAR", "KEY PLAYERS", "EVERGREEN"],
            categories: {
                "RISING STAR": { basePrice: 500000, maxPlayers: 3 },
                "KEY PLAYERS": { basePrice: 1000000, maxPlayers: 4 },
                EVERGREEN: { basePrice: 2000000, maxPlayers: 4 }
            }
        }
    ]
};

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime"
};

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(payload);
}

function readBody(req, limit = 12 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error("Request body too large."));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

function sanitizeDivisionId(value) {
    const id = String(value || "").trim();
    if (!/^div_\d+$/i.test(id)) return "";
    return id.toLowerCase();
}

function sanitizeCode(value) {
    const code = String(value || "").trim();
    if (!code || code.includes("..") || code.includes("/") || code.includes("\\")) return "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(code)) return "";
    return code;
}

function extForMime(mimeType) {
    const mime = String(mimeType || "").toLowerCase();
    if (mime.includes("png")) return ".png";
    if (mime.includes("webp")) return ".webp";
    if (mime.includes("gif")) return ".gif";
    return ".jpg";
}

function extForVideoMime(mimeType, fallbackName = "") {
    const mime = String(mimeType || "").toLowerCase();
    const name = String(fallbackName || "").toLowerCase();
    if (mime.includes("webm") || name.endsWith(".webm")) return ".webm";
    if (mime.includes("quicktime") || mime.includes("mov") || name.endsWith(".mov")) return ".mov";
    return ".mp4";
}

async function ensureDir(dir) {
    await fsp.mkdir(dir, { recursive: true });
}

async function removePathSafe(target) {
    await fsp.rm(target, { recursive: true, force: true });
}

async function readJsonFile(filePath, fallback = null) {
    try {
        const raw = await fsp.readFile(filePath, "utf8");
        return JSON.parse(raw);
    } catch (error) {
        if (error && (error.code === "ENOENT" || error instanceof SyntaxError)) return fallback;
        throw error;
    }
}

async function writeJsonFile(filePath, data) {
    await ensureDir(path.dirname(filePath));
    await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function projectConfigPath() {
    return path.join(PROJECT_ROOT, "project.json");
}

function divisionRoot(divisionId) {
    return path.join(PROJECT_ROOT, "divisions", divisionId);
}

function divisionPlayersPath(divisionId) {
    return path.join(divisionRoot(divisionId), "players.json");
}

function divisionAuctionPath(divisionId) {
    return path.join(divisionRoot(divisionId), "auction.json");
}

function divisionPhotosDir(divisionId) {
    return path.join(divisionRoot(divisionId), "photos");
}

function photoRelPath(divisionId, code, ext) {
    return path.posix.join("data-project", "divisions", divisionId, "photos", `${code}${ext}`);
}

function partnersJsonPath() {
    return path.join(PROJECT_ROOT, "partners.json");
}

function partnersLogosDir() {
    return path.join(PROJECT_ROOT, "partners", "logos");
}

function partnersVideosDir() {
    return path.join(PROJECT_ROOT, "partners", "videos");
}

function partnerLogoRelPath(partnerId, ext) {
    return path.posix.join("data-project", "partners", "logos", `${partnerId}${ext}`);
}

function partnerVideoRelPath(partnerId, ext) {
    return path.posix.join("data-project", "partners", "videos", `${partnerId}${ext}`);
}

function sanitizePartnerId(value) {
    const id = String(value || "").trim();
    if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) return "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,64}$/.test(id)) return "";
    return id;
}

function normalizePartnerRecord(raw, index = 0) {
    const source = raw && typeof raw === "object" ? raw : {};
    const id = sanitizePartnerId(source.id) || `p_${index + 1}`;
    const tierRaw = String(source.tier || "partner").trim().toLowerCase();
    const tier = ["title", "presented", "partner"].includes(tierRaw) ? tierRaw : "partner";
    return {
        id,
        name: String(source.name || "").trim() || "Partner",
        tier,
        logo: String(source.logo || "").trim(),
        video: String(source.video || "").trim(),
        url: String(source.url || "").trim(),
        tagline: String(source.tagline || "").trim(),
        highlight: Boolean(source.highlight),
        order: Number.isFinite(Number(source.order)) ? Number(source.order) : index + 1
    };
}

async function readPartnersFile() {
    const data = await readJsonFile(partnersJsonPath(), { partners: [] });
    const list = Array.isArray(data?.partners) ? data.partners : Array.isArray(data) ? data : [];
    return list.map((item, index) => normalizePartnerRecord(item, index));
}

async function writePartnersFile(partners) {
    const list = (Array.isArray(partners) ? partners : []).map((item, index) =>
        normalizePartnerRecord(item, index)
    );
    await ensureDir(partnersLogosDir());
    await ensureDir(partnersVideosDir());
    await writeJsonFile(partnersJsonPath(), { partners: list });
    return list;
}

function sanitizeDivisionFolderId(value) {
    const id = String(value || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) return "";
    return id;
}

function teamsVideosDir(divisionId) {
    const safeDivision = sanitizeDivisionFolderId(divisionId);
    if (safeDivision) return path.join(PROJECT_ROOT, "teams", "videos", safeDivision);
    return path.join(PROJECT_ROOT, "teams", "videos");
}

function teamVideoRelPath(teamId, ext, divisionId) {
    const safeDivision = sanitizeDivisionFolderId(divisionId);
    if (safeDivision) {
        return path.posix.join("data-project", "teams", "videos", safeDivision, `team_${teamId}${ext}`);
    }
    return path.posix.join("data-project", "teams", "videos", `team_${teamId}${ext}`);
}

function sanitizeTeamId(value) {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0 || id > 9999) return 0;
    return Math.floor(id);
}

async function ensureBlankProject() {
    await ensureDir(PROJECT_ROOT);
    await ensureDir(path.join(PROJECT_ROOT, "divisions", "div_1", "photos"));
    await ensureDir(partnersLogosDir());
    await ensureDir(partnersVideosDir());
    await ensureDir(teamsVideosDir());
    const configPath = projectConfigPath();
    try {
        await fsp.access(configPath);
    } catch (_) {
        await writeJsonFile(configPath, BLANK_PROJECT);
    }
    try {
        await fsp.access(divisionPlayersPath("div_1"));
    } catch (_) {
        await writeJsonFile(divisionPlayersPath("div_1"), []);
    }
    try {
        await fsp.access(partnersJsonPath());
    } catch (_) {
        await writeJsonFile(partnersJsonPath(), { partners: [] });
    }
}

async function wipeLegacyPhotoFolders() {
    await removePathSafe(LEGACY_PHOTOS_ROOT);
}

async function migrateLegacyPhotosIntoProject() {
    try {
        const entries = await fsp.readdir(LEGACY_PHOTOS_ROOT, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory() || !/^div_\d+$/i.test(entry.name)) continue;
            const divisionId = entry.name.toLowerCase();
            const fromDir = path.join(LEGACY_PHOTOS_ROOT, entry.name);
            const toDir = divisionPhotosDir(divisionId);
            await ensureDir(toDir);
            const files = await fsp.readdir(fromDir);
            for (const file of files) {
                const dest = path.join(toDir, file);
                try {
                    await fsp.access(dest);
                } catch (_) {
                    await fsp.copyFile(path.join(fromDir, file), dest);
                }
            }
            // One-time move: remove legacy copy so reset cannot resurrect photos
            await removePathSafe(fromDir);
        }
    } catch (error) {
        if (!(error && error.code === "ENOENT")) throw error;
    }
}

async function listDivisionIdsFromDisk() {
    const ids = new Set(["div_1"]);
    try {
        const config = await readJsonFile(projectConfigPath(), null);
        (config?.divisions || []).forEach((d) => d?.id && ids.add(String(d.id)));
    } catch (_) {
        // ignore
    }
    try {
        const entries = await fsp.readdir(path.join(PROJECT_ROOT, "divisions"), { withFileTypes: true });
        entries
            .filter((entry) => entry.isDirectory() && /^div_\d+$/i.test(entry.name))
            .forEach((entry) => ids.add(entry.name.toLowerCase()));
    } catch (_) {
        // ignore
    }
    return [...ids];
}

async function countDivisionPhotos(divisionId) {
    const dir = divisionPhotosDir(divisionId);
    try {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        return entries.filter((entry) => entry.isFile()).length;
    } catch (error) {
        if (error && error.code === "ENOENT") return 0;
        throw error;
    }
}

async function listDivisionPhotoFiles(divisionId) {
    const dir = divisionPhotosDir(divisionId);
    try {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => ({
                file: entry.name,
                path: path.posix.join("data-project", "divisions", divisionId, "photos", entry.name)
            }));
    } catch (error) {
        if (error && error.code === "ENOENT") return [];
        throw error;
    }
}

async function buildProjectSnapshot() {
    const project = await readJsonFile(projectConfigPath(), BLANK_PROJECT);
    const ids = await listDivisionIdsFromDisk();
    const divisions = [];
    for (const id of ids) {
        const players = await readJsonFile(divisionPlayersPath(id), []);
        const auction = await readJsonFile(divisionAuctionPath(id), null);
        divisions.push({
            id,
            players: Array.isArray(players) ? players : [],
            auction
        });
    }
    return {
        ok: true,
        root: "data-project",
        project,
        divisions
    };
}

async function handleProjectApi(req, res, url) {
    const parts = url.pathname.replace(/^\/api\/project\/?/, "").split("/").filter(Boolean);

    if (req.method === "GET" && parts[0] === "health") {
        sendJson(res, 200, { ok: true, mode: "project-folder", root: "data-project" });
        return;
    }

    // GET /api/project
    if (req.method === "GET" && parts.length === 0) {
        sendJson(res, 200, await buildProjectSnapshot());
        return;
    }

    // PUT /api/project/config
    if (req.method === "PUT" && parts.length === 1 && parts[0] === "config") {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw.toString("utf8") || "{}");
        } catch (_) {
            sendJson(res, 400, { error: "Invalid JSON body." });
            return;
        }
        const config = body.config || body;
        if (!config || typeof config !== "object") {
            sendJson(res, 400, { error: "Missing config object." });
            return;
        }
        await writeJsonFile(projectConfigPath(), config);
        const ids = Array.isArray(config.divisions)
            ? config.divisions.map((d) => sanitizeDivisionId(d.id)).filter(Boolean)
            : ["div_1"];
        const keep = new Set(ids.length ? ids : ["div_1"]);
        for (const divisionId of keep) {
            await ensureDir(divisionPhotosDir(divisionId));
            try {
                await fsp.access(divisionPlayersPath(divisionId));
            } catch (_) {
                await writeJsonFile(divisionPlayersPath(divisionId), []);
            }
        }
        // Remove leftover division folders not in this config (e.g. empty div_3)
        try {
            const entries = await fsp.readdir(path.join(PROJECT_ROOT, "divisions"), {
                withFileTypes: true
            });
            for (const entry of entries) {
                if (!entry.isDirectory() || !/^div_\d+$/i.test(entry.name)) continue;
                const divisionId = entry.name.toLowerCase();
                if (!keep.has(divisionId)) {
                    await removePathSafe(divisionRoot(divisionId));
                }
            }
        } catch (_) {
            // ignore
        }
        sendJson(res, 200, { ok: true, config });
        return;
    }

    // PUT /api/project/divisions/:id/players
    if (req.method === "PUT" && parts[0] === "divisions" && parts[2] === "players" && parts.length === 3) {
        const divisionId = sanitizeDivisionId(parts[1]);
        if (!divisionId) {
            sendJson(res, 400, { error: "Invalid division id." });
            return;
        }
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw.toString("utf8") || "{}");
        } catch (_) {
            sendJson(res, 400, { error: "Invalid JSON body." });
            return;
        }
        const players = Array.isArray(body.players) ? body.players : [];
        await writeJsonFile(divisionPlayersPath(divisionId), players);
        await ensureDir(divisionPhotosDir(divisionId));
        sendJson(res, 200, { ok: true, divisionId, players });
        return;
    }

    // PUT /api/project/divisions/:id/auction
    if (req.method === "PUT" && parts[0] === "divisions" && parts[2] === "auction" && parts.length === 3) {
        const divisionId = sanitizeDivisionId(parts[1]);
        if (!divisionId) {
            sendJson(res, 400, { error: "Invalid division id." });
            return;
        }
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw.toString("utf8") || "{}");
        } catch (_) {
            sendJson(res, 400, { error: "Invalid JSON body." });
            return;
        }
        const auction = body.auction ?? null;
        if (auction == null) {
            await removePathSafe(divisionAuctionPath(divisionId));
            sendJson(res, 200, { ok: true, divisionId, auction: null });
            return;
        }
        await writeJsonFile(divisionAuctionPath(divisionId), auction);
        sendJson(res, 200, { ok: true, divisionId, auction });
        return;
    }

    // DELETE /api/project/divisions/:id/auction
    if (req.method === "DELETE" && parts[0] === "divisions" && parts[2] === "auction" && parts.length === 3) {
        const divisionId = sanitizeDivisionId(parts[1]);
        if (!divisionId) {
            sendJson(res, 400, { error: "Invalid division id." });
            return;
        }
        await removePathSafe(divisionAuctionPath(divisionId));
        sendJson(res, 200, { ok: true, divisionId });
        return;
    }

    // DELETE /api/project — wipe and recreate blank project
    if (req.method === "DELETE" && parts.length === 0) {
        await removePathSafe(PROJECT_ROOT);
        await wipeLegacyPhotoFolders();
        await ensureBlankProject();
        sendJson(res, 200, { ok: true, reset: true, project: BLANK_PROJECT });
        return;
    }

    sendJson(res, 404, { error: "Unknown project API route." });
}

async function handlePhotoApi(req, res, url) {
    const parts = url.pathname.replace(/^\/api\/photos\/?/, "").split("/").filter(Boolean);

    if (req.method === "GET" && parts[0] === "health") {
        sendJson(res, 200, { ok: true, mode: "project-folder", root: "data-project" });
        return;
    }

    if (req.method === "GET" && parts.length === 2 && parts[1] === "status") {
        const divisionId = sanitizeDivisionId(parts[0]);
        if (!divisionId) {
            sendJson(res, 400, { error: "Invalid division id." });
            return;
        }
        const count = await countDivisionPhotos(divisionId);
        const files = await listDivisionPhotoFiles(divisionId);
        sendJson(res, 200, { divisionId, count, files });
        return;
    }

    if (req.method === "POST" && parts.length === 0) {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw.toString("utf8") || "{}");
        } catch (_) {
            sendJson(res, 400, { error: "Invalid JSON body." });
            return;
        }

        const divisionId = sanitizeDivisionId(body.divisionId);
        const code = sanitizeCode(body.code);
        if (!divisionId || !code) {
            sendJson(res, 400, { error: "divisionId and code are required." });
            return;
        }

        const dataBase64 = String(body.dataBase64 || "").replace(/^data:[^;]+;base64,/, "");
        if (!dataBase64) {
            sendJson(res, 400, { error: "Missing image data." });
            return;
        }

        let buffer;
        try {
            buffer = Buffer.from(dataBase64, "base64");
        } catch (_) {
            sendJson(res, 400, { error: "Invalid base64 image data." });
            return;
        }
        if (!buffer.length) {
            sendJson(res, 400, { error: "Empty image data." });
            return;
        }

        const ext = extForMime(body.mimeType);
        const dir = divisionPhotosDir(divisionId);
        await ensureDir(dir);

        try {
            const existing = await fsp.readdir(dir);
            await Promise.all(
                existing
                    .filter((name) => name.toLowerCase().startsWith(`${code.toLowerCase()}.`))
                    .map((name) => removePathSafe(path.join(dir, name)))
            );
        } catch (_) {
            // ignore
        }

        const abs = path.join(dir, `${code}${ext}`);
        await fsp.writeFile(abs, buffer);
        const rel = photoRelPath(divisionId, code, ext);
        sendJson(res, 200, { ok: true, path: rel, divisionId, code });
        return;
    }

    if (req.method === "DELETE" && parts.length === 0) {
        const ids = await listDivisionIdsFromDisk();
        await Promise.all(ids.map((id) => removePathSafe(divisionPhotosDir(id))));
        for (const id of ids) await ensureDir(divisionPhotosDir(id));
        await wipeLegacyPhotoFolders();
        sendJson(res, 200, { ok: true, wiped: "all" });
        return;
    }

    if (req.method === "DELETE" && parts.length === 1) {
        const divisionId = sanitizeDivisionId(parts[0]);
        if (!divisionId) {
            sendJson(res, 400, { error: "Invalid division id." });
            return;
        }
        await removePathSafe(divisionPhotosDir(divisionId));
        await ensureDir(divisionPhotosDir(divisionId));
        await removePathSafe(path.join(LEGACY_PHOTOS_ROOT, divisionId));
        sendJson(res, 200, { ok: true, divisionId });
        return;
    }

    if (req.method === "DELETE" && parts.length === 2) {
        const divisionId = sanitizeDivisionId(parts[0]);
        const code = sanitizeCode(parts[1]);
        if (!divisionId || !code) {
            sendJson(res, 400, { error: "Invalid division id or code." });
            return;
        }
        const dir = divisionPhotosDir(divisionId);
        try {
            const existing = await fsp.readdir(dir);
            await Promise.all(
                existing
                    .filter((name) => name.toLowerCase().startsWith(`${code.toLowerCase()}.`))
                    .map((name) => removePathSafe(path.join(dir, name)))
            );
        } catch (error) {
            if (!(error && error.code === "ENOENT")) throw error;
        }
        sendJson(res, 200, { ok: true, divisionId, code });
        return;
    }

    sendJson(res, 404, { error: "Unknown photos API route." });
}

async function handlePartnersApi(req, res, url) {
    const parts = url.pathname.replace(/^\/api\/partners\/?/, "").split("/").filter(Boolean);

    if (req.method === "GET" && parts[0] === "health") {
        sendJson(res, 200, { ok: true, mode: "partners", root: "data-project/partners" });
        return;
    }

    // GET /api/partners
    if (req.method === "GET" && parts.length === 0) {
        const partners = await readPartnersFile();
        sendJson(res, 200, { ok: true, partners });
        return;
    }

    // PUT /api/partners — replace full list
    if (req.method === "PUT" && parts.length === 0) {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw.toString("utf8") || "{}");
        } catch (_) {
            sendJson(res, 400, { error: "Invalid JSON body." });
            return;
        }
        const incoming = Array.isArray(body.partners) ? body.partners : Array.isArray(body) ? body : null;
        if (!incoming) {
            sendJson(res, 400, { error: "Missing partners array." });
            return;
        }
        const partners = await writePartnersFile(incoming);
        sendJson(res, 200, { ok: true, partners });
        return;
    }

    // POST /api/partners/logo — upload logo for partner id
    if (req.method === "POST" && parts.length === 1 && parts[0] === "logo") {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw.toString("utf8") || "{}");
        } catch (_) {
            sendJson(res, 400, { error: "Invalid JSON body." });
            return;
        }

        const partnerId = sanitizePartnerId(body.id);
        if (!partnerId) {
            sendJson(res, 400, { error: "Valid partner id is required." });
            return;
        }

        const dataBase64 = String(body.dataBase64 || "").replace(/^data:[^;]+;base64,/, "");
        if (!dataBase64) {
            sendJson(res, 400, { error: "Missing image data." });
            return;
        }

        let buffer;
        try {
            buffer = Buffer.from(dataBase64, "base64");
        } catch (_) {
            sendJson(res, 400, { error: "Invalid base64 image data." });
            return;
        }
        if (!buffer.length) {
            sendJson(res, 400, { error: "Empty image data." });
            return;
        }

        const ext = extForMime(body.mimeType);
        const dir = partnersLogosDir();
        await ensureDir(dir);

        try {
            const existing = await fsp.readdir(dir);
            await Promise.all(
                existing
                    .filter((name) => name.toLowerCase().startsWith(`${partnerId.toLowerCase()}.`))
                    .map((name) => removePathSafe(path.join(dir, name)))
            );
        } catch (_) {
            // ignore
        }

        const abs = path.join(dir, `${partnerId}${ext}`);
        await fsp.writeFile(abs, buffer);
        const rel = partnerLogoRelPath(partnerId, ext);
        sendJson(res, 200, { ok: true, path: rel, id: partnerId });
        return;
    }

    // DELETE /api/partners/logo/:id
    if (req.method === "DELETE" && parts[0] === "logo" && parts.length === 2) {
        const partnerId = sanitizePartnerId(parts[1]);
        if (!partnerId) {
            sendJson(res, 400, { error: "Invalid partner id." });
            return;
        }
        const dir = partnersLogosDir();
        try {
            const existing = await fsp.readdir(dir);
            await Promise.all(
                existing
                    .filter((name) => name.toLowerCase().startsWith(`${partnerId.toLowerCase()}.`))
                    .map((name) => removePathSafe(path.join(dir, name)))
            );
        } catch (error) {
            if (!(error && error.code === "ENOENT")) throw error;
        }
        sendJson(res, 200, { ok: true, id: partnerId });
        return;
    }

    // POST /api/partners/video?id=... — raw video body (mp4/webm/mov)
    if (req.method === "POST" && parts.length === 1 && parts[0] === "video") {
        const partnerId = sanitizePartnerId(url.searchParams.get("id") || req.headers["x-partner-id"]);
        if (!partnerId) {
            sendJson(res, 400, { error: "Valid partner id is required (?id=)." });
            return;
        }

        const mimeType = String(req.headers["content-type"] || "video/mp4");
        if (!/video\//i.test(mimeType) && !/octet-stream/i.test(mimeType)) {
            sendJson(res, 400, { error: "Content-Type must be a video type." });
            return;
        }

        let buffer;
        try {
            buffer = await readBody(req, 80 * 1024 * 1024);
        } catch (error) {
            sendJson(res, 400, { error: error.message || "Video too large (max ~80MB)." });
            return;
        }
        if (!buffer.length) {
            sendJson(res, 400, { error: "Empty video data." });
            return;
        }

        const ext = extForVideoMime(mimeType);
        const dir = partnersVideosDir();
        await ensureDir(dir);
        try {
            const existing = await fsp.readdir(dir);
            await Promise.all(
                existing
                    .filter((name) => name.toLowerCase().startsWith(`${partnerId.toLowerCase()}.`))
                    .map((name) => removePathSafe(path.join(dir, name)))
            );
        } catch (_) {
            // ignore
        }

        const abs = path.join(dir, `${partnerId}${ext}`);
        await fsp.writeFile(abs, buffer);
        const rel = partnerVideoRelPath(partnerId, ext);
        sendJson(res, 200, { ok: true, path: rel, id: partnerId });
        return;
    }

    // DELETE /api/partners/video/:id
    if (req.method === "DELETE" && parts[0] === "video" && parts.length === 2) {
        const partnerId = sanitizePartnerId(parts[1]);
        if (!partnerId) {
            sendJson(res, 400, { error: "Invalid partner id." });
            return;
        }
        const dir = partnersVideosDir();
        try {
            const existing = await fsp.readdir(dir);
            await Promise.all(
                existing
                    .filter((name) => name.toLowerCase().startsWith(`${partnerId.toLowerCase()}.`))
                    .map((name) => removePathSafe(path.join(dir, name)))
            );
        } catch (error) {
            if (!(error && error.code === "ENOENT")) throw error;
        }
        sendJson(res, 200, { ok: true, id: partnerId });
        return;
    }

    sendJson(res, 404, { error: "Unknown partners API route." });
}

async function handleTeamsApi(req, res, url) {
    const parts = url.pathname.replace(/^\/api\/teams\/?/, "").split("/").filter(Boolean);

    if (req.method === "GET" && parts[0] === "health") {
        sendJson(res, 200, { ok: true, mode: "teams", root: "data-project/teams" });
        return;
    }

    // POST /api/teams/video?id=1&division=div_1 — raw video body
    if (req.method === "POST" && parts.length === 1 && parts[0] === "video") {
        const teamId = sanitizeTeamId(url.searchParams.get("id") || req.headers["x-team-id"]);
        if (!teamId) {
            sendJson(res, 400, { error: "Valid team id is required (?id=)." });
            return;
        }
        const divisionId =
            sanitizeDivisionFolderId(url.searchParams.get("division") || req.headers["x-division-id"]) ||
            "div_1";

        const mimeType = String(req.headers["content-type"] || "video/mp4");
        if (!/video\//i.test(mimeType) && !/octet-stream/i.test(mimeType)) {
            sendJson(res, 400, { error: "Content-Type must be a video type." });
            return;
        }

        let buffer;
        try {
            buffer = await readBody(req, 80 * 1024 * 1024);
        } catch (error) {
            sendJson(res, 400, { error: error.message || "Video too large (max ~80MB)." });
            return;
        }
        if (!buffer.length) {
            sendJson(res, 400, { error: "Empty video data." });
            return;
        }

        const ext = extForVideoMime(mimeType);
        const dir = teamsVideosDir(divisionId);
        await ensureDir(dir);
        const prefix = `team_${teamId}.`.toLowerCase();
        try {
            const existing = await fsp.readdir(dir);
            await Promise.all(
                existing
                    .filter((name) => name.toLowerCase().startsWith(prefix))
                    .map((name) => removePathSafe(path.join(dir, name)))
            );
        } catch (_) {
            // ignore
        }

        const abs = path.join(dir, `team_${teamId}${ext}`);
        await fsp.writeFile(abs, buffer);
        const rel = teamVideoRelPath(teamId, ext, divisionId);
        sendJson(res, 200, { ok: true, path: rel, teamId, divisionId });
        return;
    }

    // DELETE /api/teams/video/:id?division=div_1
    if (req.method === "DELETE" && parts[0] === "video" && parts.length === 2) {
        const teamId = sanitizeTeamId(parts[1]);
        if (!teamId) {
            sendJson(res, 400, { error: "Invalid team id." });
            return;
        }
        const divisionId =
            sanitizeDivisionFolderId(url.searchParams.get("division") || req.headers["x-division-id"]) ||
            "div_1";
        const dir = teamsVideosDir(divisionId);
        const prefix = `team_${teamId}.`.toLowerCase();
        try {
            const existing = await fsp.readdir(dir);
            await Promise.all(
                existing
                    .filter((name) => name.toLowerCase().startsWith(prefix))
                    .map((name) => removePathSafe(path.join(dir, name)))
            );
        } catch (error) {
            if (!(error && error.code === "ENOENT")) throw error;
        }
        sendJson(res, 200, { ok: true, teamId, divisionId });
        return;
    }

    sendJson(res, 404, { error: "Unknown teams API route." });
}

function contentTypeFor(filePath) {
    return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function serveStatic(req, res, urlPath) {
    let pathname = decodeURIComponent(urlPath.split("?")[0] || "/");
    if (pathname.includes("\0")) {
        res.writeHead(400).end("Bad path");
        return;
    }

    let abs = path.normalize(path.join(ROOT, pathname));
    if (!abs.startsWith(ROOT)) {
        res.writeHead(403).end("Forbidden");
        return;
    }

    let stat;
    try {
        stat = await fsp.stat(abs);
    } catch (_) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        return;
    }

    if (stat.isDirectory()) {
        if (!pathname.endsWith("/")) {
            res.writeHead(301, { Location: `${pathname}/` });
            res.end();
            return;
        }
        abs = path.join(abs, "index.html");
        try {
            stat = await fsp.stat(abs);
        } catch (_) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
            return;
        }
    }

    if (!stat.isFile()) {
        res.writeHead(404).end("Not found");
        return;
    }

    const data = await fsp.readFile(abs);
    const cacheable =
        pathname.startsWith("/assets/") || pathname.startsWith("/data-project/");
    res.writeHead(200, {
        "Content-Type": contentTypeFor(abs),
        "Cache-Control": cacheable ? "public, max-age=3600" : "no-cache"
    });
    res.end(data);
}

async function tryPrettyHtml(req, res, urlPath) {
    const pathname = decodeURIComponent(urlPath.split("?")[0] || "/");
    if (pathname.endsWith("/") || path.extname(pathname)) return false;
    const htmlPath = path.normalize(path.join(ROOT, `${pathname}.html`));
    if (!htmlPath.startsWith(ROOT)) return false;
    try {
        const stat = await fsp.stat(htmlPath);
        if (!stat.isFile()) return false;
        const data = await fsp.readFile(htmlPath);
        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache"
        });
        res.end(data);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Handle legacy desk file APIs (data-project). Returns true if the request was handled.
 * Used by both local `node server.js` and the SaaS server so the auction UI can boot online.
 */
async function handleLegacyDeskApi(req, res, url) {
    if (url.pathname === "/api/project" || url.pathname.startsWith("/api/project/")) {
        await handleProjectApi(req, res, url);
        return true;
    }
    if (url.pathname === "/api/photos" || url.pathname.startsWith("/api/photos/")) {
        await handlePhotoApi(req, res, url);
        return true;
    }
    if (url.pathname === "/api/partners" || url.pathname.startsWith("/api/partners/")) {
        await handlePartnersApi(req, res, url);
        return true;
    }
    if (url.pathname === "/api/teams" || url.pathname.startsWith("/api/teams/")) {
        await handleTeamsApi(req, res, url);
        return true;
    }
    return false;
}

async function prepareProjectFolder() {
    await ensureBlankProject();
    await migrateLegacyPhotosIntoProject();
}

module.exports = {
    handleLegacyDeskApi,
    prepareProjectFolder,
    tryPrettyHtml,
    serveStatic
};

if (require.main === module) {
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

            if (await handleLegacyDeskApi(req, res, url)) return;
            if (await tryPrettyHtml(req, res, url.pathname)) return;
            await serveStatic(req, res, url.pathname);
        } catch (error) {
            console.error(error);
            if (!res.headersSent) {
                sendJson(res, 500, { error: error.message || "Server error" });
            }
        }
    });

    prepareProjectFolder()
        .then(() => {
            server.listen(PORT, () => {
                console.log(`Cricket Auction desk: http://localhost:${PORT}`);
                console.log(`Project folder: data-project/`);
                console.log(`Photos: data-project/divisions/<divisionId>/photos/`);
                console.log(`Partners: data-project/partners.json + logos/ + videos/`);
                console.log("Stop with Ctrl+C");
            });
        })
        .catch((error) => {
            console.error("Failed to start server:", error);
            process.exit(1);
        });
}