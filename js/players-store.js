const AUCTION_PLAYERS_KEY = "auctionPlayers";

function resolvePlayersStorageKey(divisionId) {
    if (divisionId && typeof getDivisionPlayersKey === "function") {
        return getDivisionPlayersKey(divisionId);
    }
    if (divisionId) return `auctionPlayers:${divisionId}`;
    return AUCTION_PLAYERS_KEY;
}

function getActivePlayersDivisionId() {
    try {
        const saved = JSON.parse(localStorage.getItem("auctionConfig") || "null");
        if (saved?.activeDivisionId) return saved.activeDivisionId;
        if (Array.isArray(saved?.divisions) && saved.divisions[0]?.id) return saved.divisions[0].id;
    } catch (_) {
        // ignore
    }
    return "div_1";
}

const ROLE_ALIASES = {
    BATTER: "Batter",
    BATSMAN: "Batter",
    BATTING: "Batter",
    BOWLER: "Bowler",
    BOWLING: "Bowler",
    "ALL ROUNDER": "All-Rounder",
    "ALL-ROUNDER": "All-Rounder",
    ALLROUNDER: "All-Rounder",
    "WICKET KEEPER": "Wicket-Keeper",
    "WICKET-KEEPER": "Wicket-Keeper",
    WK: "Wicket-Keeper",
    KEEPER: "Wicket-Keeper"
};

const PLAYER_FIELD_ALIASES = {
    id: ["id", "player id", "player_id", "code", "player code"],
    name: ["name", "player", "player name", "player_name", "full name"],
    role: ["role", "skill", "speciality", "specialty", "type"],
    photo: ["photo", "player photo", "player_photo", "image", "photo url", "image url", "url"],
    category: [
        "category",
        "catagory",
        "categories",
        "player category",
        "auction category",
        "auction catagory",
        "bid category",
        "pool",
        "tier",
        "group"
    ],
    ageCategory: ["age-category", "age category", "age_category", "age group", "age-catagory"],
    currentClub: ["currentclub", "current club", "club", "location", "area", "city"],
    mobile: ["mobile", "phone", "contact", "mobile no", "mobile number"],
    age: ["age"],
    battingStyle: ["battingstyle", "batting style", "batting"],
    bowlingStyle: ["bowlingstyle", "bowling style", "bowling"],
    basePrice: ["baseprice", "base price", "base_price", "price"]
};

function normalizeHeaderKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[_\-]+/g, " ")
        .replace(/\s+/g, " ");
}

function normalizeRoleName(rawRole) {
    const key = String(rawRole || "")
        .trim()
        .toUpperCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");
    return ROLE_ALIASES[key] || (rawRole ? String(rawRole).trim() : "Batter");
}

function parseLooseNumber(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const cleaned = String(value).replace(/,/g, "").trim();
    if (!cleaned) return null;
    if (typeof parseMoneyInput === "function") {
        const money = parseMoneyInput(cleaned);
        if (Number.isFinite(money) && money > 0) return money;
    }
    const asNumber = Number(cleaned);
    return Number.isFinite(asNumber) ? asNumber : null;
}

function hashStringToId(text) {
    let hash = 0;
    const input = String(text || "");
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 900000 + 100000;
}

function codeToNumericId(code, fallbackIndex) {
    const text = String(code || "").trim();
    const digits = text.match(/(\d+)$/);
    if (/^CPL-R-/i.test(text) && digits) return 1000 + parseInt(digits[1], 10);
    if (/^CPL-K-/i.test(text) && digits) return 2000 + parseInt(digits[1], 10);
    if (/^CPL-E-/i.test(text) && digits) return 3000 + parseInt(digits[1], 10);
    if (/^\d+$/.test(text)) return parseInt(text, 10);
    if (text) return hashStringToId(text);
    return 4000 + Number(fallbackIndex || 0);
}

function pickRowValue(row, aliases, { skipKeys = [] } = {}) {
    const map = {};
    const skip = new Set((skipKeys || []).map((key) => normalizeHeaderKey(key)));
    Object.keys(row || {}).forEach((key) => {
        const normalized = normalizeHeaderKey(key);
        if (skip.has(normalized)) return;
        map[normalized] = row[key];
    });
    for (const alias of aliases) {
        const value = map[normalizeHeaderKey(alias)];
        if (value != null && String(value).trim() !== "") return value;
    }
    return "";
}

function pickCategoryValue(row) {
    // Never read Age-Category / age group as the auction CATEGORY
    return pickRowValue(row, PLAYER_FIELD_ALIASES.category, {
        skipKeys: PLAYER_FIELD_ALIASES.ageCategory
    });
}

function createEmptyPlayerDraft(overrides = {}) {
    return {
        id: null,
        code: "",
        name: "",
        photo: "assets/placeholder.png",
        role: "Batter",
        battingStyle: "N/A",
        bowlingStyle: "N/A",
        currentClub: "",
        category: "RISING STAR",
        ageCategory: "",
        mobile: "",
        age: null,
        basePrice: null,
        customFields: {},
        status: "not-auctioned",
        bids: [],
        finalPrice: null,
        team: null,
        ...overrides
    };
}

function looksLikePlayerCode(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    // Pure numbers are internal ids, not display codes like CPL-R-01
    if (/^\d+$/.test(text)) return false;
    return true;
}

function numericIdToDisplayCode(id) {
    const n = Number(id);
    if (!Number.isFinite(n)) return "";
    if (n >= 1000 && n < 2000) return `CPL-R-${String(n - 1000).padStart(2, "0")}`;
    if (n >= 2000 && n < 3000) return `CPL-K-${n - 2000}`;
    if (n >= 3000 && n < 4000) return `CPL-E-${n - 3000}`;
    return "";
}

/**
 * Sheet CATEGORY wins when present.
 * If CATEGORY is blank, fall back to ID prefix: CPL-R → Rising, CPL-K → Key, CPL-E → Evergreen.
 */
function categoryFromPlayerCode(code) {
    const text = String(code || "").trim().toUpperCase();
    if (!text) return "";
    if (/^CPL-R\b/i.test(text) || /^R[-_]?\d/i.test(text)) return "RISING STAR";
    if (/^CPL-K\b/i.test(text) || /^K[-_]?\d/i.test(text)) return "KEY PLAYERS";
    if (/^CPL-E\b/i.test(text) || /^E[-_]?\d/i.test(text)) return "EVERGREEN";
    return "";
}

function resolvePlayerCategory(rawCategory, code = "", { forceFromCode = false } = {}) {
    const fromCode = categoryFromPlayerCode(code);
    if (forceFromCode && fromCode) return fromCode;

    const fromSheet = String(rawCategory || "").trim();
    if (fromSheet) {
        return typeof normalizeCategoryName === "function"
            ? normalizeCategoryName(fromSheet)
            : fromSheet.toUpperCase();
    }
    if (fromCode) return fromCode;
    return "RISING STAR";
}

function rowHasCategoryColumn(row) {
    if (!row || typeof row !== "object") return false;
    const keys = Object.keys(row).map((key) => normalizeHeaderKey(key));
    const aliases = PLAYER_FIELD_ALIASES.category.map((alias) => normalizeHeaderKey(alias));
    return aliases.some((alias) => keys.includes(alias));
}

const RESERVED_PLAYER_KEYS = new Set([
    "id",
    "code",
    "name",
    "photo",
    "role",
    "battingstyle",
    "bowlingstyle",
    "currentclub",
    "category",
    "agecategory",
    "mobile",
    "age",
    "baseprice",
    "status",
    "bids",
    "finalprice",
    "team",
    "teamname",
    "soldfor",
    "customfields"
]);

function toCustomFieldKey(header) {
    const base = normalizeHeaderKey(header)
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return `x_${base || "field"}`;
}

function isKnownSpreadsheetHeader(header) {
    const normalized = normalizeHeaderKey(header);
    if (!normalized) return true;
    if (RESERVED_PLAYER_KEYS.has(normalized.replace(/\s+/g, ""))) return true;
    return Object.values(PLAYER_FIELD_ALIASES).some((aliases) =>
        aliases.some((alias) => normalizeHeaderKey(alias) === normalized)
    );
}

function extractCustomFields(source = {}) {
    const custom = {};
    const existing =
        source.customFields && typeof source.customFields === "object" ? source.customFields : {};
    Object.keys(existing).forEach((key) => {
        const value = existing[key];
        if (value == null || String(value).trim() === "") return;
        custom[key] = String(value).trim();
    });
    Object.keys(source).forEach((header) => {
        if (header === "customFields") return;
        if (isKnownSpreadsheetHeader(header)) return;
        const value = source[header];
        if (value == null || String(value).trim() === "") return;
        const key = String(header).startsWith("x_") ? header : toCustomFieldKey(header);
        custom[key] = String(value).trim();
    });
    return custom;
}

function detectCustomFieldLabelsFromRows(rows = []) {
    const labels = new Map();
    rows.forEach((row) => {
        if (!row || typeof row !== "object") return;
        Object.keys(row).forEach((header) => {
            if (header === "customFields") return;
            if (isKnownSpreadsheetHeader(header)) return;
            const key = String(header).startsWith("x_") ? header : toCustomFieldKey(header);
            if (!labels.has(key)) labels.set(key, String(header).trim() || key);
        });
    });
    return labels;
}

function normalizePlayerRecord(raw, index = 0, config = null) {
    const source = raw && typeof raw === "object" ? raw : {};
    const rawIdField = String(
        pickRowValue(source, PLAYER_FIELD_ALIASES.id) || source.id || ""
    ).trim();
    const explicitCode = String(source.code || "").trim();
    // Prefer real codes (CPL-R-01). Never treat numeric id as the display code.
    const code = looksLikePlayerCode(explicitCode)
        ? explicitCode
        : looksLikePlayerCode(rawIdField)
            ? rawIdField
            : numericIdToDisplayCode(source.id) || "";
    const name = String(
        pickRowValue(source, PLAYER_FIELD_ALIASES.name) || source.name || `Player ${index + 1}`
    ).trim();
    const category = resolvePlayerCategory(pickCategoryValue(source) || source.category || "", code);
    const role = normalizeRoleName(
        pickRowValue(source, PLAYER_FIELD_ALIASES.role) || source.role || "Batter"
    );
    const photoRaw = String(
        pickRowValue(source, PLAYER_FIELD_ALIASES.photo) || source.photo || ""
    ).trim();
    const club = String(
        pickRowValue(source, PLAYER_FIELD_ALIASES.currentClub) || source.currentClub || ""
    ).trim();
    const ageCategory = String(
        pickRowValue(source, PLAYER_FIELD_ALIASES.ageCategory) || source.ageCategory || ""
    ).trim();
    const mobile = String(
        pickRowValue(source, PLAYER_FIELD_ALIASES.mobile) || source.mobile || ""
    ).trim();
    const ageValue = parseLooseNumber(
        pickRowValue(source, PLAYER_FIELD_ALIASES.age) || source.age
    );
    const explicitBase = parseLooseNumber(
        pickRowValue(source, PLAYER_FIELD_ALIASES.basePrice) || source.basePrice
    );
    const activeConfig = config || (typeof getActiveConfig === "function" ? getActiveConfig({}) : null);
    const categoryBase =
        activeConfig && typeof getCategoryConfig === "function"
            ? getCategoryConfig(activeConfig, category).basePrice
            : null;

    const numericId = Number.isFinite(Number(source.id)) && /^\d+$/.test(String(source.id).trim())
        ? Number(source.id)
        : codeToNumericId(code || rawIdField, index);

    const customFields = extractCustomFields(source);

    return {
        id: numericId,
        code: code || numericIdToDisplayCode(numericId) || String(numericId),
        name,
        photo: photoRaw || "assets/placeholder.png",
        role,
        battingStyle: String(
            pickRowValue(source, PLAYER_FIELD_ALIASES.battingStyle) || source.battingStyle || "N/A"
        ).trim() || "N/A",
        bowlingStyle: String(
            pickRowValue(source, PLAYER_FIELD_ALIASES.bowlingStyle) || source.bowlingStyle || "N/A"
        ).trim() || "N/A",
        currentClub: club || "—",
        category,
        ageCategory,
        mobile,
        age: ageValue,
        basePrice: explicitBase != null ? explicitBase : categoryBase,
        customFields,
        status: source.status || "not-auctioned",
        bids: Array.isArray(source.bids) ? source.bids : [],
        finalPrice: source.finalPrice ?? null,
        team: source.team ?? null
    };
}

function loadStoredPlayers(divisionId = getActivePlayersDivisionId()) {
    try {
        if (typeof migrateLegacyDivisionStorage === "function") {
            migrateLegacyDivisionStorage(divisionId);
        }
        const raw = JSON.parse(localStorage.getItem(resolvePlayersStorageKey(divisionId)) || "null");
        if (!Array.isArray(raw)) return null;
        return raw.map((player, index) => normalizePlayerRecord(player, index));
    } catch (_) {
        return null;
    }
}

/**
 * Schedule a disk write. persistPlayers/AuctionToProjectFolder already enqueue —
 * do NOT wrap those again (nested enqueue deadlocks and deletes never hit disk).
 */
function enqueuePlayersPersist(task) {
    if (typeof voidProjectPersist === "function") {
        voidProjectPersist(task);
        return;
    }
    if (typeof enqueueProjectPersist === "function") {
        enqueueProjectPersist(task);
    }
}

/** Drop frozen auction progress so the desk reloads the latest roster after Excel upload. */
function invalidateDivisionAuctionProgress(divisionId = getActivePlayersDivisionId()) {
    const id = divisionId || "div_1";
    try {
        const key =
            typeof getDivisionAuctionDataKey === "function"
                ? getDivisionAuctionDataKey(id)
                : `auctionData:${id}`;
        localStorage.removeItem(key);
        if (id === "div_1") localStorage.removeItem("auctionData");
    } catch (_) {
        // ignore
    }
    // Call persist* directly — each already uses enqueueProjectPersist once.
    if (typeof persistAuctionToProjectFolder === "function") {
        persistAuctionToProjectFolder(id, null);
    } else if (typeof deleteDivisionAuction === "function") {
        enqueuePlayersPersist(() => deleteDivisionAuction(id).catch(() => {}));
    }
}

/**
 * Which optional auction fields have at least one non-empty value in the sheet.
 * Used to turn on matching Player fields after Excel import.
 */
function detectPlayerFieldPresenceFromRows(rows) {
    const fieldKeys = [
        "role",
        "currentClub",
        "mobile",
        "age",
        "ageCategory",
        "battingStyle",
        "bowlingStyle",
        "basePrice",
        "photo"
    ];
    const present = Object.fromEntries(fieldKeys.map((key) => [key, false]));
    (rows || []).forEach((row) => {
        fieldKeys.forEach((key) => {
            if (present[key]) return;
            const aliases = PLAYER_FIELD_ALIASES[key];
            if (!aliases) return;
            const value = pickRowValue(row, aliases);
            if (value != null && String(value).trim() !== "") present[key] = true;
        });
    });
    const customLabels = detectCustomFieldLabelsFromRows(rows);
    customLabels.forEach((label, key) => {
        present[key] = true;
        present[`__label:${key}`] = label;
    });
    return present;
}

const PLAYER_FIELD_OPTIONAL_KEYS = [
    "role",
    "currentClub",
    "mobile",
    "age",
    "ageCategory",
    "battingStyle",
    "bowlingStyle",
    "basePrice",
    "photo"
];

/**
 * Sync division playerFields from Excel/CSV columns.
 * Present columns → Show on auction ON; missing optional columns → OFF.
 * Also creates toggles for extra Excel columns (Gender, Seat, …).
 */
function applyPlayerFieldsFromSpreadsheet(config, divisionId, presence) {
    if (!config || !presence) return config;
    const normalized = typeof normalizeConfig === "function" ? normalizeConfig(config) : config;
    const divisions = Array.isArray(normalized.divisions) ? normalized.divisions : [];
    const division = divisions.find((item) => item.id === divisionId) || divisions[0];
    if (!division) return normalized;

    const fields =
        typeof normalizePlayerFields === "function"
            ? normalizePlayerFields(division.playerFields)
            : { ...(division.playerFields || {}) };

    PLAYER_FIELD_OPTIONAL_KEYS.forEach((key) => {
        const inSheet = presence[key] === true;
        fields[key] = {
            visible: inSheet,
            required: inSheet && fields[key]?.required === true
        };
    });

    // Extra Excel columns → custom config fields
    Object.keys(presence).forEach((key) => {
        if (!String(key).startsWith("x_")) return;
        const inSheet = presence[key] === true;
        const label = presence[`__label:${key}`] || fields[key]?.label || humanizePlayerFieldKey?.(key) || key;
        fields[key] = {
            visible: inSheet,
            required: inSheet && fields[key]?.required === true,
            label,
            custom: true
        };
    });

    // Turn off previously known custom fields missing from this sheet
    Object.keys(fields).forEach((key) => {
        if (!String(key).startsWith("x_") && !fields[key]?.custom) return;
        if (presence[key] === true) return;
        fields[key] = {
            ...fields[key],
            visible: false,
            required: false,
            custom: true
        };
    });

    division.playerFields = typeof normalizePlayerFields === "function" ? normalizePlayerFields(fields) : fields;
    return normalized;
}

function getPlayerFieldDisplayValue(player, fieldKey) {
    if (!player || !fieldKey) return "";
    if (Object.prototype.hasOwnProperty.call(player, fieldKey) && player[fieldKey] != null) {
        return player[fieldKey];
    }
    const custom = player.customFields && typeof player.customFields === "object" ? player.customFields : {};
    if (Object.prototype.hasOwnProperty.call(custom, fieldKey)) return custom[fieldKey];
    return "";
}

function playerRecordHasFieldValue(player, fieldKey) {
    if (!player) return false;
    const value = getPlayerFieldDisplayValue(player, fieldKey);
    if (value == null) return false;
    const text = String(value).trim();
    if (!text || text === "—" || text.toUpperCase() === "N/A") return false;
    if (fieldKey === "photo" && /placeholder\.png/i.test(text)) return false;
    return true;
}

/** Build Show-on-auction presence from roster values and optional Excel headers. */
function buildPlayerFieldPresenceFromRoster(players, excelHeaders = []) {
    const excelKeys = new Set();
    const aliases =
        typeof PLAYER_FIELD_ALIASES === "object" && PLAYER_FIELD_ALIASES ? PLAYER_FIELD_ALIASES : {};
    (excelHeaders || []).forEach((header) => {
        const normalized =
            typeof normalizeHeaderKey === "function"
                ? normalizeHeaderKey(header)
                : String(header || "")
                      .trim()
                      .toLowerCase();
        if (!isKnownSpreadsheetHeader(header)) {
            const key = String(header).startsWith("x_") ? header : toCustomFieldKey(header);
            excelKeys.add(key);
            return;
        }
        Object.keys(aliases).forEach((fieldKey) => {
            if ((aliases[fieldKey] || []).some((alias) => normalizeHeaderKey(alias) === normalized)) {
                excelKeys.add(fieldKey);
            }
        });
    });

    const presence = {};
    PLAYER_FIELD_OPTIONAL_KEYS.forEach((key) => {
        presence[key] =
            excelKeys.has(key) ||
            (players || []).some((player) => playerRecordHasFieldValue(player, key));
    });

    const customLabels = new Map();
    (excelHeaders || []).forEach((header) => {
        if (isKnownSpreadsheetHeader(header)) return;
        const key = String(header).startsWith("x_") ? header : toCustomFieldKey(header);
        customLabels.set(key, String(header).trim() || key);
    });
    (players || []).forEach((player) => {
        const custom = player?.customFields || {};
        Object.keys(custom).forEach((key) => {
            if (!playerRecordHasFieldValue(player, key)) return;
            presence[key] = true;
            if (!customLabels.has(key)) {
                customLabels.set(
                    key,
                    typeof humanizePlayerFieldKey === "function"
                        ? humanizePlayerFieldKey(key)
                        : key
                );
            }
        });
    });
    excelKeys.forEach((key) => {
        if (!String(key).startsWith("x_")) return;
        presence[key] = true;
        if (!customLabels.has(key)) {
            customLabels.set(
                key,
                typeof humanizePlayerFieldKey === "function" ? humanizePlayerFieldKey(key) : key
            );
        }
    });
    customLabels.forEach((label, key) => {
        presence[`__label:${key}`] = label;
    });
    return presence;
}

function saveStoredPlayers(players, divisionId = getActivePlayersDivisionId(), options = {}) {
    const list = (players || []).map((player, index) => normalizePlayerRecord(player, index));
    localStorage.setItem(resolvePlayersStorageKey(divisionId), JSON.stringify(list));
    // persistPlayersToProjectFolder already enqueues — call it once, never nest.
    if (typeof persistPlayersToProjectFolder === "function") {
        persistPlayersToProjectFolder(divisionId, list);
    }
    if (options.resetAuction) {
        invalidateDivisionAuctionProgress(divisionId);
    }
    return list;
}

/** Save roster and wait until data-project/divisions/<id>/players.json is written. */
async function saveStoredPlayersToDisk(players, divisionId = getActivePlayersDivisionId(), options = {}) {
    const list = (players || []).map((player, index) => normalizePlayerRecord(player, index));
    localStorage.setItem(resolvePlayersStorageKey(divisionId), JSON.stringify(list));
    if (typeof persistPlayersToProjectFolder === "function") {
        await persistPlayersToProjectFolder(divisionId, list);
    }
    if (options.resetAuction) {
        invalidateDivisionAuctionProgress(divisionId);
        if (typeof flushProjectPersistQueue === "function") {
            await flushProjectPersistQueue();
        }
    }
    return list;
}

function clearStoredPlayers(divisionId = getActivePlayersDivisionId()) {
    localStorage.removeItem(resolvePlayersStorageKey(divisionId));
    if (typeof persistPlayersToProjectFolder === "function") {
        persistPlayersToProjectFolder(divisionId, []);
    }
    invalidateDivisionAuctionProgress(divisionId);
}

async function clearStoredPlayersFromDisk(divisionId = getActivePlayersDivisionId()) {
    localStorage.removeItem(resolvePlayersStorageKey(divisionId));
    if (typeof persistPlayersToProjectFolder === "function") {
        await persistPlayersToProjectFolder(divisionId, []);
    }
    invalidateDivisionAuctionProgress(divisionId);
    if (typeof flushProjectPersistQueue === "function") {
        await flushProjectPersistQueue();
    }
}

function hasStoredPlayers(divisionId = getActivePlayersDivisionId()) {
    const list = loadStoredPlayers(divisionId);
    return Array.isArray(list) && list.length > 0;
}

function parseCsvText(text) {
    const input = String(text || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        const next = input[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            row.push(cell);
            cell = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && next === "\n") i += 1;
            row.push(cell);
            if (row.some((value) => String(value).trim() !== "")) rows.push(row);
            row = [];
            cell = "";
            continue;
        }

        cell += char;
    }

    if (cell.length || row.length) {
        row.push(cell);
        if (row.some((value) => String(value).trim() !== "")) rows.push(row);
    }

    if (!rows.length) return [];

    const headers = rows[0].map((header) => String(header || "").trim());
    return rows.slice(1).map((values) => {
        const record = {};
        headers.forEach((header, index) => {
            if (!header) return;
            record[header] = values[index] != null ? String(values[index]).trim() : "";
        });
        return record;
    });
}

function sheetRowsToObjects(matrix) {
    if (!Array.isArray(matrix) || !matrix.length) return [];
    const headers = (matrix[0] || []).map((header) => String(header || "").trim());
    return matrix.slice(1).map((values) => {
        const record = {};
        headers.forEach((header, index) => {
            if (!header) return;
            const value = values[index];
            record[header] = value == null ? "" : String(value).trim();
        });
        return record;
    }).filter((row) => Object.values(row).some((value) => String(value).trim() !== ""));
}

async function parseSpreadsheetFile(file) {
    if (!file) throw new Error("No file selected.");
    const name = String(file.name || "").toLowerCase();

    if (name.endsWith(".json")) {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error("JSON must be an array of players.");
        return data;
    }

    if (name.endsWith(".csv") || name.endsWith(".txt")) {
        return parseCsvText(await file.text());
    }

    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        if (typeof XLSX === "undefined") {
            throw new Error("Excel support is not loaded. Refresh the Players page and try again.");
        }
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) throw new Error("Excel file has no sheets.");
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
            header: 1,
            defval: "",
            raw: false
        });
        return sheetRowsToObjects(matrix);
    }

    throw new Error("Unsupported file type. Use CSV, Excel (.xlsx), or JSON.");
}

function importPlayerRows(rows, { mode = "replace", config = null, divisionId = getActivePlayersDivisionId() } = {}) {
    const incoming = (rows || [])
        .map((row, index) => normalizePlayerRecord(row, index, config))
        .filter((player) => player.name && player.name !== "—");

    if (!incoming.length) {
        throw new Error("No valid players found in the file.");
    }

    let next = incoming;
    if (mode === "merge") {
        const existing = loadStoredPlayers(divisionId) || [];
        const byKey = new Map();
        existing.forEach((player) => {
            byKey.set(String(player.code || player.id), player);
        });
        incoming.forEach((player) => {
            byKey.set(String(player.code || player.id), player);
        });
        next = [...byKey.values()];
    }

    return saveStoredPlayers(next, divisionId, { resetAuction: true });
}

function upsertStoredPlayer(player, divisionId = getActivePlayersDivisionId()) {
    const list = loadStoredPlayers(divisionId) || [];
    const normalized = normalizePlayerRecord(player, list.length);
    const index = list.findIndex(
        (item) => String(item.id) === String(normalized.id) || String(item.code) === String(normalized.code)
    );
    if (index >= 0) list[index] = { ...list[index], ...normalized };
    else list.push(normalized);
    return saveStoredPlayers(list, divisionId);
}

function deleteStoredPlayer(playerIdOrCode, divisionId = getActivePlayersDivisionId()) {
    const key = String(playerIdOrCode);
    const list = (loadStoredPlayers(divisionId) || []).filter(
        (player) => String(player.id) !== key && String(player.code) !== key
    );
    return saveStoredPlayers(list, divisionId, { resetAuction: true });
}

/** Preferred Excel/CSV header labels per player field key */
const PLAYER_FIELD_EXPORT_HEADERS = {
    id: "ID",
    name: "Player",
    role: "Skill",
    category: "CATEGORY",
    currentClub: "Location",
    mobile: "Mobile",
    age: "Age",
    ageCategory: "AGE-CATEGORY",
    battingStyle: "Batting",
    bowlingStyle: "Bowling",
    basePrice: "Base price",
    photo: "Player photo"
};

function getVisiblePlayerFieldKeys(configOrFields) {
    const fields =
        configOrFields && !configOrFields.divisions
            ? typeof normalizePlayerFields === "function"
                ? normalizePlayerFields(configOrFields)
                : configOrFields
            : typeof normalizePlayerFields === "function"
              ? normalizePlayerFields(
                    getActiveDivision?.(configOrFields)?.playerFields || configOrFields?.playerFields
                )
              : buildDefaultPlayerFields?.() || {};
    const optional = [
        "role",
        "currentClub",
        "mobile",
        "age",
        "ageCategory",
        "battingStyle",
        "bowlingStyle",
        "basePrice",
        "photo"
    ];
    const keys = optional.filter((key) => fields?.[key]?.visible !== false);
    Object.keys(fields || {}).forEach((key) => {
        if (keys.includes(key)) return;
        if (!(fields[key]?.custom === true || String(key).startsWith("x_"))) return;
        if (fields[key]?.visible === false) return;
        keys.push(key);
    });
    return keys;
}

function getPlayerFieldLabel(fieldKey, fields = null) {
    if (PLAYER_FIELD_EXPORT_HEADERS[fieldKey]) return PLAYER_FIELD_EXPORT_HEADERS[fieldKey];
    if (fields?.[fieldKey]?.label) return fields[fieldKey].label;
    if (typeof listPlayerFieldDefs === "function") {
        const def = listPlayerFieldDefs(fields).find((item) => item.key === fieldKey);
        if (def?.label) return def.label;
    }
    return typeof humanizePlayerFieldKey === "function" ? humanizePlayerFieldKey(fieldKey) : fieldKey;
}

/** Column hint list for the active division (always includes ID / Player / CATEGORY). */
function getExpectedSpreadsheetColumns(configOrFields) {
    const fields =
        configOrFields && !configOrFields.divisions
            ? configOrFields
            : getActiveDivision?.(configOrFields)?.playerFields || configOrFields?.playerFields;
    const headers = ["ID", "Player", "CATEGORY"];
    getVisiblePlayerFieldKeys(configOrFields).forEach((key) => {
        const label = getPlayerFieldLabel(key, fields);
        if (label && !headers.includes(label)) headers.push(label);
    });
    return headers;
}

/** Headers found in an imported sheet/JSON array of row objects. */
function getDetectedSpreadsheetColumns(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const first = rows.find((row) => row && typeof row === "object") || {};
    return Object.keys(first).filter((key) => String(key || "").trim() !== "");
}

function getPlayersTemplateCsv(config = null) {
    const fields =
        config && !config.divisions
            ? config
            : getActiveDivision?.(config)?.playerFields || config?.playerFields;
    const keys = ["id", "name", "category", ...getVisiblePlayerFieldKeys(config)];
    // Keep a stable, readable order
    const order = [
        "id",
        "role",
        "name",
        "mobile",
        "age",
        "currentClub",
        "photo",
        "category",
        "ageCategory",
        "battingStyle",
        "bowlingStyle",
        "basePrice"
    ];
    const ordered = [
        ...order.filter((key) => keys.includes(key)),
        ...keys.filter((key) => !order.includes(key))
    ];
    const headers = ordered.map((key) => getPlayerFieldLabel(key, fields));

    const samples = [
        {
            id: "CPL-R-01",
            role: "All Rounder",
            name: "Sample Rising Star",
            mobile: "9000000001",
            age: "22",
            currentClub: "Kandivali - West",
            photo: "assets/placeholder.png",
            category: "RISING STAR",
            ageCategory: "15-23",
            battingStyle: "Right Handed Bat",
            bowlingStyle: "Right Arm Medium",
            basePrice: "300000"
        },
        {
            id: "CPL-K-01",
            role: "Batsman",
            name: "Sample Key Player",
            mobile: "9000000002",
            age: "28",
            currentClub: "Borivali - West",
            photo: "assets/placeholder.png",
            category: "KEY PLAYERS",
            ageCategory: "24-36",
            battingStyle: "Right Handed Bat",
            bowlingStyle: "N/A",
            basePrice: "500000"
        },
        {
            id: "CPL-E-01",
            role: "Bowler",
            name: "Sample Evergreen",
            mobile: "9000000003",
            age: "40",
            currentClub: "Malad - East",
            photo: "assets/placeholder.png",
            category: "EVER GREEN",
            ageCategory: "37-55",
            battingStyle: "N/A",
            bowlingStyle: "Right Arm Medium",
            basePrice: "1000000"
        }
    ];

    const lines = [headers.join(",")];
    samples.forEach((sample) => {
        lines.push(ordered.map((key) => String(sample[key] ?? "")).join(","));
    });
    return lines.join("\n");
}

async function resolveAuctionPlayers(fallbackLoader, divisionId = getActivePlayersDivisionId()) {
    const id = divisionId || getActivePlayersDivisionId();
    let stored = loadStoredPlayers(id);

    // Disk fallback when browser cache is missing (hydrate missed / other tab wrote players.json)
    if (!Array.isArray(stored) && typeof fetchProjectSnapshot === "function") {
        try {
            const ready =
                typeof checkProjectApiReady === "function" ? await checkProjectApiReady() : true;
            if (ready) {
                const snapshot = await fetchProjectSnapshot();
                const division = (snapshot.divisions || []).find((item) => item.id === id);
                if (Array.isArray(division?.players)) {
                    localStorage.setItem(
                        resolvePlayersStorageKey(id),
                        JSON.stringify(division.players)
                    );
                    stored = division.players.map((player, index) =>
                        normalizePlayerRecord(player, index)
                    );
                }
            }
        } catch (_) {
            // keep going with local/fallback
        }
    }

    // Empty array means this division intentionally has no players — do not borrow another pool
    if (Array.isArray(stored)) return stored;
    if (typeof fallbackLoader === "function") {
        const fallback = await fallbackLoader();
        return (fallback || []).map((player, index) => normalizePlayerRecord(player, index));
    }
    return [];
}
