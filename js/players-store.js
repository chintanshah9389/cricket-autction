const AUCTION_PLAYERS_KEY = "auctionPlayers";

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
    category: ["category", "catagory", "player category", "group"],
    ageCategory: ["age-category", "age category", "age_category", "age group"],
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

function pickRowValue(row, aliases) {
    const map = {};
    Object.keys(row || {}).forEach((key) => {
        map[normalizeHeaderKey(key)] = row[key];
    });
    for (const alias of aliases) {
        const value = map[normalizeHeaderKey(alias)];
        if (value != null && String(value).trim() !== "") return value;
    }
    return "";
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
    const category = normalizeCategoryName(
        pickRowValue(source, PLAYER_FIELD_ALIASES.category) || source.category || "RISING STAR"
    );
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
        status: source.status || "not-auctioned",
        bids: Array.isArray(source.bids) ? source.bids : [],
        finalPrice: source.finalPrice ?? null,
        team: source.team ?? null
    };
}

function loadStoredPlayers() {
    try {
        const raw = JSON.parse(localStorage.getItem(AUCTION_PLAYERS_KEY) || "null");
        if (!Array.isArray(raw)) return null;
        return raw.map((player, index) => normalizePlayerRecord(player, index));
    } catch (_) {
        return null;
    }
}

function saveStoredPlayers(players) {
    const list = (players || []).map((player, index) => normalizePlayerRecord(player, index));
    localStorage.setItem(AUCTION_PLAYERS_KEY, JSON.stringify(list));
    return list;
}

function clearStoredPlayers() {
    localStorage.removeItem(AUCTION_PLAYERS_KEY);
}

function hasStoredPlayers() {
    const list = loadStoredPlayers();
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

function importPlayerRows(rows, { mode = "replace", config = null } = {}) {
    const incoming = (rows || [])
        .map((row, index) => normalizePlayerRecord(row, index, config))
        .filter((player) => player.name && player.name !== "—");

    if (!incoming.length) {
        throw new Error("No valid players found in the file.");
    }

    let next = incoming;
    if (mode === "merge") {
        const existing = loadStoredPlayers() || [];
        const byKey = new Map();
        existing.forEach((player) => {
            byKey.set(String(player.code || player.id), player);
        });
        incoming.forEach((player) => {
            byKey.set(String(player.code || player.id), player);
        });
        next = [...byKey.values()];
    }

    return saveStoredPlayers(next);
}

function upsertStoredPlayer(player) {
    const list = loadStoredPlayers() || [];
    const normalized = normalizePlayerRecord(player, list.length);
    const index = list.findIndex(
        (item) => String(item.id) === String(normalized.id) || String(item.code) === String(normalized.code)
    );
    if (index >= 0) list[index] = { ...list[index], ...normalized };
    else list.push(normalized);
    return saveStoredPlayers(list);
}

function deleteStoredPlayer(playerIdOrCode) {
    const key = String(playerIdOrCode);
    const list = (loadStoredPlayers() || []).filter(
        (player) => String(player.id) !== key && String(player.code) !== key
    );
    return saveStoredPlayers(list);
}

function getPlayersTemplateCsv() {
    return [
        "ID,Skill,Player,Mobile,Age,Location,Player photo,CATEGORY,AGE-CATEGORY",
        "CPL-R-01,All Rounder,Sample Rising Star,9000000001,22,Kandivali - West,assets/placeholder.png,RISING STAR,15-23",
        "CPL-K-01,Batsman,Sample Key Player,9000000002,28,Borivali - West,assets/placeholder.png,KEY PLAYERS,24-36",
        "CPL-E-01,Bowler,Sample Evergreen,9000000003,40,Malad - East,assets/placeholder.png,EVER GREEN,37-55"
    ].join("\n");
}

async function resolveAuctionPlayers(fallbackLoader) {
    const stored = loadStoredPlayers();
    if (stored && stored.length) return stored;
    if (typeof fallbackLoader === "function") {
        const fallback = await fallbackLoader();
        return (fallback || []).map((player, index) => normalizePlayerRecord(player, index));
    }
    return [];
}
