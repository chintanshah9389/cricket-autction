const AUCTION_CONFIG_KEY = "auctionConfig";
const LEGACY_AUCTION_PLAYERS_KEY = "auctionPlayers";
const LEGACY_AUCTION_DATA_KEY = "auctionData";
const MAX_AUCTION_DIVISIONS = 3;

const DEFAULT_CATEGORY_SEQUENCE = ["RISING STAR", "KEY PLAYERS", "EVERGREEN"];

const DEFAULT_TEAM_COLORS = [
    "#e74c3c", "#3498db", "#27ae60", "#9b59b6", "#f39c12", "#16a085",
    "#d35400", "#2c3e50", "#0f766e", "#4338ca", "#9a3412", "#9f1239",
    "#0369a1", "#15803d", "#a21caf", "#b45309", "#0e7490", "#1d4ed8"
];

const DEFAULT_TOURNAMENT = {
    name: "New Auction",
    year: "2026",
    logo: "",
    maxBidderDevices: 2,
    viewerEnabled: true,
    viewerAccessKey: ""
};

/**
 * Per-division player field policy (auction desk + players form).
 * Always-on fields (code, name, category) are not listed here.
 */
const PLAYER_FIELD_DEFS = [
    { key: "role", label: "Role / Skill", auction: true, form: true, defaultVisible: true, defaultRequired: false },
    { key: "currentClub", label: "Location / Club", auction: true, form: true, defaultVisible: true, defaultRequired: false },
    { key: "mobile", label: "Mobile", auction: true, form: true, defaultVisible: true, defaultRequired: false },
    { key: "age", label: "Age", auction: true, form: true, defaultVisible: false, defaultRequired: false },
    { key: "ageCategory", label: "Age category", auction: true, form: true, defaultVisible: false, defaultRequired: false },
    { key: "battingStyle", label: "Batting", auction: true, form: true, defaultVisible: false, defaultRequired: false },
    { key: "bowlingStyle", label: "Bowling", auction: true, form: true, defaultVisible: false, defaultRequired: false },
    { key: "basePrice", label: "Base price", auction: true, form: true, defaultVisible: true, defaultRequired: false },
    { key: "photo", label: "Photo", auction: true, form: true, defaultVisible: true, defaultRequired: false }
];

function buildDefaultPlayerFields() {
    const fields = {};
    PLAYER_FIELD_DEFS.forEach((def) => {
        fields[def.key] = {
            visible: def.defaultVisible !== false,
            required: def.defaultRequired === true
        };
    });
    return fields;
}

function humanizePlayerFieldKey(key) {
    return String(key || "")
        .replace(/^x_/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (ch) => ch.toUpperCase())
        .trim() || "Field";
}

function normalizePlayerFields(raw) {
    const defaults = buildDefaultPlayerFields();
    const source = raw && typeof raw === "object" ? raw : {};
    const fields = {};
    PLAYER_FIELD_DEFS.forEach((def) => {
        const entry = source[def.key];
        // Honor explicit false from DB; only fall back to defaults when missing.
        const visible =
            entry && Object.prototype.hasOwnProperty.call(entry, "visible")
                ? entry.visible !== false
                : defaults[def.key].visible;
        let required = entry?.required === true;
        if (!visible) required = false;
        fields[def.key] = { visible, required };
    });
    // Preserve Excel-driven custom fields (Gender, Seat, …) — never internal keys.
    Object.keys(source).forEach((key) => {
        if (fields[key]) return;
        if (typeof isInternalPlayerFieldKey === "function" && isInternalPlayerFieldKey(key)) return;
        const entry = source[key];
        if (!entry || typeof entry !== "object") return;
        if (!(entry.custom === true || String(key).startsWith("x_"))) return;
        // Drop leftover typo category custom fields
        const compact =
            typeof compactHeaderKey === "function"
                ? compactHeaderKey(String(key).replace(/^x_/i, ""))
                : String(key).toLowerCase().replace(/\s+/g, "");
        if (compact === "catagory" || compact === "category" || compact === "cata gory") return;
        const visible = entry.visible !== false;
        fields[key] = {
            visible,
            required: visible && entry.required === true,
            label: entry.label || humanizePlayerFieldKey(key),
            custom: true
        };
    });
    return fields;
}

function listPlayerFieldDefs(playerFields = null) {
    const fields = normalizePlayerFields(playerFields);
    const defs = PLAYER_FIELD_DEFS.map((def) => ({ ...def }));
    Object.keys(fields).forEach((key) => {
        if (defs.some((def) => def.key === key)) return;
        if (!fields[key]?.custom && !String(key).startsWith("x_")) return;
        defs.push({
            key,
            label: fields[key].label || humanizePlayerFieldKey(key),
            auction: true,
            form: false,
            custom: true,
            defaultVisible: true,
            defaultRequired: false
        });
    });
    return defs;
}

function isPlayerFieldVisible(configOrDivision, fieldKey) {
    const fields =
        configOrDivision?.playerFields ||
        getActiveDivision?.(configOrDivision)?.playerFields ||
        buildDefaultPlayerFields();
    if (!fields[fieldKey]) return true;
    return fields[fieldKey].visible !== false;
}

function isPlayerFieldRequired(configOrDivision, fieldKey) {
    const fields =
        configOrDivision?.playerFields ||
        getActiveDivision?.(configOrDivision)?.playerFields ||
        buildDefaultPlayerFields();
    if (!fields[fieldKey]) return false;
    return fields[fieldKey].visible !== false && fields[fieldKey].required === true;
}

const DEFAULT_ICON_CAPTION = {
    enabled: false,
    iconFee: 0,
    captionFee: 0,
    countTowardCategoryQuota: true
};

const DEFAULT_DIVISION_SETTINGS = {
    teamKitty: 10000000,
    useCategoryBasePrices: true,
    auctionOrder: "SEQUENCE",
    shuffleWithinCategory: true,
    playerWheelEnabled: true,
    playerFields: buildDefaultPlayerFields(),
    iconCaption: { ...DEFAULT_ICON_CAPTION },
    categorySequence: DEFAULT_CATEGORY_SEQUENCE.slice(),
    categories: {
        "RISING STAR": { basePrice: 500000, maxPlayers: 3 },
        "KEY PLAYERS": { basePrice: 1000000, maxPlayers: 4 },
        "EVERGREEN": { basePrice: 2000000, maxPlayers: 4 }
    }
};

const DEFAULT_AUCTION_CONFIG = {
    ...DEFAULT_DIVISION_SETTINGS,
    teams: [],
    tournament: { ...DEFAULT_TOURNAMENT },
    activeDivisionId: "div_1",
    divisions: [
        {
            id: "div_1",
            name: "Main Auction",
            ...DEFAULT_DIVISION_SETTINGS,
            teams: [],
            categorySequence: DEFAULT_CATEGORY_SEQUENCE.slice(),
            categories: {
                "RISING STAR": { basePrice: 500000, maxPlayers: 3 },
                "KEY PLAYERS": { basePrice: 1000000, maxPlayers: 4 },
                "EVERGREEN": { basePrice: 2000000, maxPlayers: 4 }
            }
        }
    ]
};

function getDivisionPlayersKey(divisionId) {
    return `auctionPlayers:${divisionId || "div_1"}`;
}

function getDivisionAuctionDataKey(divisionId) {
    return `auctionData:${divisionId || "div_1"}`;
}

function buildBlankProjectConfig() {
    const categories = {
        "RISING STAR": { basePrice: 500000, maxPlayers: 3 },
        "KEY PLAYERS": { basePrice: 1000000, maxPlayers: 4 },
        "EVERGREEN": { basePrice: 2000000, maxPlayers: 4 }
    };
    return normalizeConfig({
        tournament: {
            name: "New Auction",
            year: String(new Date().getFullYear())
        },
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
                categorySequence: DEFAULT_CATEGORY_SEQUENCE.slice(),
                categories
            }
        ]
    });
}

/**
 * Wipe every auction/local offline key and restore a blank project config.
 */
async function resetEntireProject() {
    // Stop boot hydrate from pushing old browser cache back onto a wiped disk
    try {
        sessionStorage.setItem("auctionForceBlank", "1");
    } catch (_) {
        // ignore
    }

    // Wipe disk first (config + players + photos together). Do NOT delete photos
    // alone beforehand — that left player records pointing at missing image files.
    if (typeof resetProjectFolderOnDisk === "function") {
        await resetProjectFolderOnDisk();
    } else {
        if (typeof deleteAllDivisionPhotoFolders === "function") {
            await deleteAllDivisionPhotoFolders();
        }
        const blankDisk = buildBlankProjectConfig();
        if (typeof persistConfigToProjectFolder === "function") {
            await persistConfigToProjectFolder(blankDisk);
        }
        if (typeof persistPlayersToProjectFolder === "function") {
            await persistPlayersToProjectFolder("div_1", []);
        }
    }

    if (typeof clearAuctionLocalStorageCaches === "function") {
        clearAuctionLocalStorageCaches();
    } else {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (
                key === AUCTION_CONFIG_KEY ||
                key === LEGACY_AUCTION_PLAYERS_KEY ||
                key === LEGACY_AUCTION_DATA_KEY ||
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

    if ("indexedDB" in window) {
        await new Promise((resolve) => {
            const req = indexedDB.deleteDatabase("cricket-auction-offline");
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
        });
    }

    const blank = buildBlankProjectConfig();
    localStorage.setItem(AUCTION_CONFIG_KEY, JSON.stringify(blank));
    localStorage.setItem(getDivisionPlayersKey(blank.activeDivisionId), JSON.stringify([]));
    return blank;
}

function createDivisionId(existing = []) {
    const used = new Set((existing || []).map((item) => String(item?.id || "")));
    let n = 1;
    while (used.has(`div_${n}`)) n += 1;
    return `div_${n}`;
}

const LEGACY_CATEGORY_MAP = {
    A: "EVERGREEN",
    B: "KEY PLAYERS",
    C: "RISING STAR",
    "RISING STAR": "RISING STAR",
    "RISINGSTARS": "RISING STAR",
    "RISING STARS": "RISING STAR",
    RS: "RISING STAR",
    "KEY PLAYER": "KEY PLAYERS",
    "KEY PLAYERS": "KEY PLAYERS",
    "KEYPLAYER": "KEY PLAYERS",
    "KEYPLAYERS": "KEY PLAYERS",
    KP: "KEY PLAYERS",
    EVERGREEN: "EVERGREEN",
    "EVER GREEN": "EVERGREEN",
    "EVER-GREEN": "EVERGREEN",
    EG: "EVERGREEN"
};

function normalizeCategoryName(rawCategory) {
    const key = String(rawCategory || "")
        .trim()
        .toUpperCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");
    if (LEGACY_CATEGORY_MAP[key]) return LEGACY_CATEGORY_MAP[key];
    // Soft match: "RISING STAR PLAYER" → RISING STAR, etc.
    if (key.includes("RISING")) return "RISING STAR";
    if (key.includes("KEY") && key.includes("PLAYER")) return "KEY PLAYERS";
    if (key.includes("EVER") && key.includes("GREEN")) return "EVERGREEN";
    return key;
}

function displayCategoryName(categoryName) {
    const name = normalizeCategoryName(categoryName);
    if (name === "KEY PLAYERS") return "KEY PLAYER";
    return name;
}

function getPlayerDisplayCode(player) {
    if (!player) return "—";
    const code = String(player.code || "").trim();
    // Prefer spreadsheet codes like CPL-R-01; ignore numeric-only "codes"
    if (code && !/^\d+$/.test(code)) return code;

    const id = Number(player.id);
    if (Number.isFinite(id)) {
        if (id >= 1000 && id < 2000) return `CPL-R-${String(id - 1000).padStart(2, "0")}`;
        if (id >= 2000 && id < 3000) return `CPL-K-${id - 2000}`;
        if (id >= 3000 && id < 4000) return `CPL-E-${id - 3000}`;
    }
    return code || String(player.id ?? "—");
}

/**
 * Resolve asset paths for pages outside the site root (e.g. /squads/).
 * fromPrefix: "../" for squads/, "../../" for squads/roster/
 */
function resolveAssetUrl(path, fromPrefix = "../") {
    const value = String(path || "").trim();
    if (!value) return `${fromPrefix}assets/placeholder.png`;
    if (/^https?:\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) {
        return value;
    }
    if (value.startsWith("/") || value.startsWith("../")) return value;
    if (value.startsWith("assets/") || value.startsWith("data-project/")) {
        return `${fromPrefix}${value}`;
    }
    return value;
}

function buildCategoriesFromRaw(raw) {
    const categories = {};
    const source = raw?.categories && typeof raw.categories === "object" ? raw.categories : {};
    const hasSavedCategories = Object.keys(source).length > 0;

    if (hasSavedCategories) {
        Object.keys(source).forEach((rawName) => {
            const name = normalizeCategoryName(rawName);
            if (categories[name]) return;
            categories[name] = {
                basePrice: Number(source[rawName]?.basePrice) || 500000,
                maxPlayers: Number(source[rawName]?.maxPlayers) || 1
            };
        });
        return categories;
    }

    // Fresh install / legacy configs without categories object
    DEFAULT_CATEGORY_SEQUENCE.forEach((name) => {
        const legacyKey = Object.keys(LEGACY_CATEGORY_MAP).find(
            (code) => LEGACY_CATEGORY_MAP[code] === name && raw?.basePrices?.[code] != null
        );
        const legacyMax = raw?.maxPlayers?.[name] ?? raw?.maxPlayers?.[legacyKey];

        categories[name] = {
            basePrice:
                Number(raw?.basePrices?.[name]) ||
                Number(legacyKey != null ? raw?.basePrices?.[legacyKey] : NaN) ||
                DEFAULT_AUCTION_CONFIG.categories[name].basePrice,
            maxPlayers:
                Number(legacyMax) ||
                DEFAULT_AUCTION_CONFIG.categories[name].maxPlayers
        };
    });

    return categories;
}

function normalizeAuctionOrder(rawOrder) {
    const value = String(rawOrder || "").trim().toUpperCase();
    if (value === "RANDOM") return "RANDOM";
    return "SEQUENCE";
}

function normalizeCategorySequence(rawSequence, categories) {
    const categoryNames = Object.keys(categories);
    const seen = new Set();
    const sequence = [];

    (Array.isArray(rawSequence) ? rawSequence : []).forEach((item) => {
        const name = normalizeCategoryName(item);
        if (!categories[name] || seen.has(name)) return;
        seen.add(name);
        sequence.push(name);
    });

    categoryNames.forEach((name) => {
        if (!seen.has(name)) sequence.push(name);
    });

    return sequence.length ? sequence : DEFAULT_CATEGORY_SEQUENCE.slice();
}

function normalizeTeamLogo(rawLogo) {
    const logo = String(rawLogo || "").trim();
    if (!logo) return "";
    if (logo.startsWith("data:image/")) return logo;
    if (/^https?:\/\//i.test(logo)) return logo;
    if (logo.startsWith("/") || logo.startsWith("assets/") || logo.startsWith("data-project/")) {
        return logo;
    }
    return "";
}

function normalizeTeamVideo(rawVideo) {
    const video = String(rawVideo || "").trim();
    if (!video) return "";
    if (/^https?:\/\//i.test(video)) return video;
    if (video.startsWith("data-project/teams/videos/")) return video;
    if (video.startsWith("/data-project/teams/videos/")) return video.slice(1);
    if (video.startsWith("blob:")) return video;
    return "";
}

function cloneTeamsList(teams) {
    return normalizeTeams(JSON.parse(JSON.stringify(Array.isArray(teams) ? teams : [])));
}

/** Teams for the active division (root `teams` is a mirror for compatibility). */
function getConfigTeams(config) {
    const normalized = config?.divisions ? config : normalizeConfig(config || {});
    const active = getActiveDivision(normalized);
    if (Array.isArray(active?.teams)) return normalizeTeams(active.teams);
    return normalizeTeams(normalized.teams);
}

function getTeamLogoSrc(team, assetsPrefix = "assets/teams-logo") {
    const uploaded = normalizeTeamLogo(team?.logo);
    if (uploaded) return uploaded;
    const teamId = Number(team?.team_id);
    if (!Number.isFinite(teamId)) return "";
    return `${assetsPrefix}/team_${teamId}.png`;
}

function getTeamVideoSrc(team, fromPrefix = "") {
    const video = normalizeTeamVideo(team?.video);
    if (!video) return "";
    if (video.startsWith("/") || video.startsWith("http")) return video;
    return `${fromPrefix}${video}`;
}

function clampMaxBidderDevices(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 2;
    return Math.min(20, Math.max(1, Math.round(n)));
}

function normalizeTournament(raw) {
    const name =
        String(raw?.name ?? DEFAULT_TOURNAMENT.name).trim() || DEFAULT_TOURNAMENT.name;
    const year =
        String(raw?.year ?? DEFAULT_TOURNAMENT.year).trim() || DEFAULT_TOURNAMENT.year;
    const logo = normalizeTeamLogo(raw?.logo);
    const logoKey = String(raw?.logoKey || raw?.logo_key || "").trim() || null;
    const maxBidderDevices = clampMaxBidderDevices(
        raw?.maxBidderDevices ?? raw?.max_bidder_devices ?? DEFAULT_TOURNAMENT.maxBidderDevices
    );
    const viewerEnabled = raw?.viewerEnabled !== false && raw?.viewer_enabled !== false;
    const viewerAccessKey = String(
        raw?.viewerAccessKey || raw?.viewer_access_key || ""
    ).trim();
    return {
        name,
        year,
        maxBidderDevices,
        viewerEnabled,
        ...(viewerAccessKey ? { viewerAccessKey } : {}),
        ...(logo ? { logo } : {}),
        ...(logoKey ? { logoKey } : {})
    };
}

function getTournamentTitle(tournament) {
    const normalized = normalizeTournament(tournament);
    if (!normalized.year) return normalized.name;
    return `${normalized.name} - ${normalized.year}`;
}

function getTournamentLogoSrc(tournament, defaultPath = "assets/tournament-logo.svg") {
    const uploaded = normalizeTeamLogo(tournament?.logo);
    if (uploaded) return uploaded;
    return defaultPath;
}

function buildTournamentState(config, existing = null) {
    const tournament = normalizeTournament(config?.tournament || existing);
    return {
        ...(existing && typeof existing === "object" ? existing : {}),
        name: tournament.name,
        year: tournament.year,
        logo: tournament.logo || "assets/tournament-logo.svg"
    };
}

function normalizeTeams(rawTeams) {
    if (!Array.isArray(rawTeams)) return [];
    const usedIds = new Set();
    return rawTeams
        .map((team, index) => {
            let teamId = Number(team?.team_id ?? team?.id);
            if (!Number.isFinite(teamId) || teamId <= 0 || usedIds.has(teamId)) {
                teamId = index + 1;
                while (usedIds.has(teamId)) teamId += 1;
            }
            usedIds.add(teamId);
            const teamName = String(team?.team_name || team?.teamName || `Team ${index + 1}`).trim();
            const color =
                String(team?.color || "").trim() ||
                DEFAULT_TEAM_COLORS[index % DEFAULT_TEAM_COLORS.length];
            const logo = normalizeTeamLogo(team?.logo);
            const video = normalizeTeamVideo(team?.video);
            const logoKey = String(team?.logoKey || team?.logo_key || "").trim() || null;
            const videoKey = String(team?.videoKey || team?.video_key || "").trim() || null;
            const iconPlayerId = normalizeAssignablePlayerId(team?.iconPlayerId);
            const captionPlayerId = normalizeAssignablePlayerId(team?.captionPlayerId);
            const bidderCode = String(team?.bidderCode || team?.bidder_code || "").trim();
            const bidderPin = String(team?.bidderPin || team?.bidder_pin || "").trim();
            return {
                team_id: teamId,
                team_name: teamName || `Team ${index + 1}`,
                color,
                ...(logo ? { logo } : {}),
                ...(video ? { video } : {}),
                ...(logoKey ? { logoKey } : {}),
                ...(videoKey ? { videoKey } : {}),
                ...(iconPlayerId != null ? { iconPlayerId } : {}),
                ...(captionPlayerId != null ? { captionPlayerId } : {}),
                bidderEnabled: Boolean(team?.bidderEnabled),
                ...(bidderCode ? { bidderCode } : {}),
                ...(bidderPin ? { bidderPin } : {}),
                bidderPinSet: Boolean(team?.bidderPinSet) || Boolean(bidderPin)
            };
        })
        .filter((team) => team.team_name);
}

function normalizeAssignablePlayerId(value) {
    if (value == null || value === "") return null;
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const asText = String(value).trim();
    return asText || null;
}

function normalizeIconCaptionSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
        enabled: Boolean(source.enabled),
        iconFee: Math.max(0, Number(source.iconFee) || 0),
        captionFee: Math.max(0, Number(source.captionFee) || 0),
        countTowardCategoryQuota: source.countTowardCategoryQuota !== false
    };
}

function nextAvailableTeamId(teams) {
    const used = new Set((teams || []).map((team) => Number(team.team_id)));
    let id = (teams || []).length ? 1 : 1;
    while (used.has(id)) id += 1;
    return id;
}

function buildDivisionSettingsFromRaw(raw) {
    const categories = buildCategoriesFromRaw(raw || {});
    return {
        teamKitty: Number(raw?.teamKitty) || DEFAULT_DIVISION_SETTINGS.teamKitty,
        useCategoryBasePrices: raw?.useCategoryBasePrices !== false,
        auctionOrder: normalizeAuctionOrder(raw?.auctionOrder),
        shuffleWithinCategory: raw?.shuffleWithinCategory !== false,
        playerWheelEnabled: raw?.playerWheelEnabled !== false,
        playerFields: normalizePlayerFields(raw?.playerFields),
        iconCaption: normalizeIconCaptionSettings(raw?.iconCaption),
        categories,
        categorySequence: normalizeCategorySequence(raw?.categorySequence, categories)
    };
}

function teamsSignature(teams) {
    return JSON.stringify(
        (Array.isArray(teams) ? teams : []).map((team) => [
            Number(team?.team_id) || 0,
            String(team?.team_name || "").trim().toLowerCase(),
            String(team?.color || "").trim().toLowerCase()
        ])
    );
}

function normalizeDivision(raw, index = 0, fallbackName = null, legacyTeams = null) {
    const settings = buildDivisionSettingsFromRaw(raw || {});
    const id =
        String(raw?.id || "").trim() ||
        `div_${index + 1}`;
    const name =
        String(raw?.name || fallbackName || `Division ${index + 1}`).trim() ||
        `Division ${index + 1}`;

    let teams = [];
    if (Array.isArray(raw?.teams)) {
        teams = normalizeTeams(raw.teams);
    } else if (Array.isArray(legacyTeams)) {
        // Legacy shared root teams belong only to Main / first division
        teams = cloneTeamsList(legacyTeams);
    }

    return {
        id,
        name,
        teams,
        ...settings
    };
}

function flattenActiveDivision(config) {
    const active = getActiveDivision(config);
    return {
        ...config,
        teams: normalizeTeams(active.teams),
        teamKitty: active.teamKitty,
        useCategoryBasePrices: active.useCategoryBasePrices,
        auctionOrder: active.auctionOrder,
        shuffleWithinCategory: active.shuffleWithinCategory,
        playerWheelEnabled: active.playerWheelEnabled,
        playerFields: normalizePlayerFields(active.playerFields),
        iconCaption: normalizeIconCaptionSettings(active.iconCaption),
        categories: active.categories,
        categorySequence: active.categorySequence
    };
}

function normalizeConfig(raw) {
    const source = raw || {};
    const legacySharedTeams = Array.isArray(source.teams) ? source.teams : null;
    const tournament = normalizeTournament(source.tournament);

    let divisions = [];
    if (Array.isArray(source.divisions) && source.divisions.length) {
        divisions = source.divisions.slice(0, MAX_AUCTION_DIVISIONS).map((item, index) => {
            // Only seed Main/first division from old shared root teams.
            // Other divisions start empty so Female / Div 2 are not clones of Main.
            const canInheritLegacy =
                !Array.isArray(item?.teams) &&
                (index === 0 || String(item?.id || "") === "div_1");
            return normalizeDivision(
                item,
                index,
                null,
                canInheritLegacy ? legacySharedTeams : null
            );
        });

        // Repair older saves where secondary divisions still hold an exact copy of Main's roster
        if (divisions.length > 1) {
            const primarySig = teamsSignature(divisions[0].teams);
            if (primarySig !== "[]") {
                divisions = divisions.map((division, index) => {
                    if (index === 0) return division;
                    if (teamsSignature(division.teams) !== primarySig) return division;
                    return { ...division, teams: [] };
                });
            }
        }
    } else {
        // Legacy flat config → one "Main Auction" division
        divisions = [
            normalizeDivision(
                {
                    id: "div_1",
                    name: "Main Auction",
                    teams: legacySharedTeams || [],
                    teamKitty: source.teamKitty,
                    useCategoryBasePrices: source.useCategoryBasePrices,
                    auctionOrder: source.auctionOrder,
                    shuffleWithinCategory: source.shuffleWithinCategory,
                    playerWheelEnabled: source.playerWheelEnabled,
                    playerFields: source.playerFields,
                    iconCaption: source.iconCaption,
                    categorySequence: source.categorySequence,
                    categories: source.categories,
                    basePrices: source.basePrices,
                    maxPlayers: source.maxPlayers
                },
                0,
                "Main Auction",
                null
            )
        ];
    }

    // Ensure unique ids
    const usedIds = new Set();
    divisions = divisions.map((division, index) => {
        let id = String(division.id || "").trim();
        if (!id || usedIds.has(id)) {
            let n = index + 1;
            id = `div_${n}`;
            while (usedIds.has(id)) {
                n += 1;
                id = `div_${n}`;
            }
        }
        usedIds.add(id);
        return { ...division, id };
    });

    let activeDivisionId = String(source.activeDivisionId || "").trim();
    if (!divisions.some((division) => division.id === activeDivisionId)) {
        activeDivisionId = divisions[0].id;
    }

    return flattenActiveDivision({
        tournament,
        divisions,
        activeDivisionId
    });
}

function getActiveDivision(config) {
    const normalized = config?.divisions
        ? config
        : normalizeConfig(config || {});
    const divisions = normalized.divisions || [];
    return (
        divisions.find((division) => division.id === normalized.activeDivisionId) ||
        divisions[0] ||
        normalizeDivision({ id: "div_1", name: "Main Auction" }, 0, "Main Auction")
    );
}

function listDivisions(config) {
    return (normalizeConfig(config || {}).divisions || []).slice();
}

function setActiveDivisionId(config, divisionId) {
    const normalized = normalizeConfig(config || {});
    if (!normalized.divisions.some((division) => division.id === divisionId)) {
        return normalized;
    }
    normalized.activeDivisionId = divisionId;
    return flattenActiveDivision(normalized);
}

function patchActiveDivision(config, patch = {}) {
    const normalized = normalizeConfig(config || {});
    const index = normalized.divisions.findIndex(
        (division) => division.id === normalized.activeDivisionId
    );
    if (index < 0) return normalized;

    const nextDivision = normalizeDivision(
        {
            ...normalized.divisions[index],
            ...patch,
            id: normalized.divisions[index].id
        },
        index,
        normalized.divisions[index].name
    );
    normalized.divisions[index] = nextDivision;
    return flattenActiveDivision(normalized);
}

function addDivision(config, name = "") {
    const normalized = normalizeConfig(config || {});
    if (normalized.divisions.length >= MAX_AUCTION_DIVISIONS) {
        throw new Error(`You can have at most ${MAX_AUCTION_DIVISIONS} auction divisions.`);
    }
    const active = getActiveDivision(normalized);
    const id = createDivisionId(normalized.divisions);
    const label = String(name || "").trim() || `Division ${normalized.divisions.length + 1}`;
    const division = normalizeDivision(
        {
            id,
            name: label,
            // New divisions start with their own empty team list
            teams: [],
            teamKitty: active.teamKitty,
            useCategoryBasePrices: active.useCategoryBasePrices,
            auctionOrder: active.auctionOrder,
            shuffleWithinCategory: active.shuffleWithinCategory,
            playerWheelEnabled: active.playerWheelEnabled,
            playerFields: JSON.parse(JSON.stringify(normalizePlayerFields(active.playerFields))),
            iconCaption: { ...normalizeIconCaptionSettings(active.iconCaption), enabled: false },
            categorySequence: active.categorySequence,
            categories: JSON.parse(JSON.stringify(active.categories))
        },
        normalized.divisions.length,
        label,
        null
    );
    normalized.divisions.push(division);
    normalized.activeDivisionId = division.id;
    return flattenActiveDivision(normalized);
}

function renameDivision(config, divisionId, name) {
    const normalized = normalizeConfig(config || {});
    const label = String(name || "").trim();
    if (!label) throw new Error("Enter a division name.");
    const index = normalized.divisions.findIndex((division) => division.id === divisionId);
    if (index < 0) throw new Error("Division not found.");
    normalized.divisions[index] = {
        ...normalized.divisions[index],
        name: label
    };
    return flattenActiveDivision(normalized);
}

function removeDivision(config, divisionId) {
    const normalized = normalizeConfig(config || {});
    if (normalized.divisions.length <= 1) {
        throw new Error("Keep at least one auction division.");
    }
    const next = normalized.divisions.filter((division) => division.id !== divisionId);
    if (next.length === normalized.divisions.length) {
        throw new Error("Division not found.");
    }
    normalized.divisions = next;
    if (normalized.activeDivisionId === divisionId) {
        normalized.activeDivisionId = next[0].id;
    }
    return flattenActiveDivision(normalized);
}

function purgeRemovedDivisionStorage(previousConfig, nextConfig) {
    try {
        const prevIds = new Set((previousConfig?.divisions || []).map((d) => d.id));
        const nextIds = new Set((nextConfig?.divisions || []).map((d) => d.id));
        prevIds.forEach((id) => {
            if (nextIds.has(id)) return;
            localStorage.removeItem(getDivisionPlayersKey(id));
            localStorage.removeItem(getDivisionAuctionDataKey(id));
            if (id === "div_1") {
                localStorage.removeItem(LEGACY_AUCTION_PLAYERS_KEY);
                localStorage.removeItem(LEGACY_AUCTION_DATA_KEY);
            }
            if (typeof deleteDivisionOfflineMedia === "function") {
                deleteDivisionOfflineMedia(id).catch(() => {});
            }
            // persist* helpers already enqueue — call once (nested enqueue deadlocks).
            if (typeof persistPlayersToProjectFolder === "function") {
                persistPlayersToProjectFolder(id, []);
            }
            if (typeof persistAuctionToProjectFolder === "function") {
                persistAuctionToProjectFolder(id, null);
            }
        });
    } catch (_) {
        // ignore
    }
}

function migrateLegacyDivisionStorage(divisionId) {
    // Unscoped legacy keys belong only to the original Main Auction (div_1).
    // Never copy them into div_2 / div_3 — that made every division look the same.
    const id = divisionId || "div_1";
    if (id !== "div_1") return;

    const playersKey = getDivisionPlayersKey(id);
    const dataKey = getDivisionAuctionDataKey(id);

    try {
        if (!localStorage.getItem(playersKey) && localStorage.getItem(LEGACY_AUCTION_PLAYERS_KEY)) {
            localStorage.setItem(playersKey, localStorage.getItem(LEGACY_AUCTION_PLAYERS_KEY));
        }
        if (!localStorage.getItem(dataKey) && localStorage.getItem(LEGACY_AUCTION_DATA_KEY)) {
            localStorage.setItem(dataKey, localStorage.getItem(LEGACY_AUCTION_DATA_KEY));
        }
        if (localStorage.getItem(playersKey) || localStorage.getItem(dataKey)) {
            localStorage.removeItem(LEGACY_AUCTION_PLAYERS_KEY);
            localStorage.removeItem(LEGACY_AUCTION_DATA_KEY);
        }
    } catch (_) {
        // ignore
    }
}

async function loadDefaultTeamsFile() {
    const candidates = ["data/teams.json", "../data/teams.json", "/data/teams.json"];
    for (const path of candidates) {
        try {
            const response = await fetch(path);
            if (!response.ok) continue;
            return normalizeTeams(await response.json());
        } catch (_) {
            // try next path
        }
    }
    return [];
}

async function loadDefaultTournamentFile() {
    const candidates = [
        "data/tournament.json",
        "../data/tournament.json",
        "/data/tournament.json"
    ];
    for (const path of candidates) {
        try {
            const response = await fetch(path);
            if (!response.ok) continue;
            const data = await response.json();
            return normalizeTournament({
                name: data?.name,
                year: data?.year
            });
        } catch (_) {
            // try next path
        }
    }
    return normalizeTournament(DEFAULT_TOURNAMENT);
}

async function ensureConfigTeams(config) {
    const raw = config || {};
    const hadExplicitTeams =
        Array.isArray(raw.teams) ||
        (Array.isArray(raw.divisions) &&
            raw.divisions.some((division) => Array.isArray(division?.teams)));
    const normalized = normalizeConfig(raw);
    // Respect explicit teams (including empty). Only fill from file when omitted entirely.
    if (hadExplicitTeams) return normalized;
    const defaults = await loadDefaultTeamsFile();
    if (!defaults.length) return normalized;
    normalized.divisions = normalized.divisions.map((division) => ({
        ...division,
        teams: cloneTeamsList(defaults)
    }));
    return flattenActiveDivision(normalized);
}

async function ensureConfigBranding(config) {
    const raw = config || {};
    const normalized = await ensureConfigTeams(raw);
    const hasSavedTournament =
        raw.tournament &&
        (raw.tournament.name != null ||
            raw.tournament.year != null ||
            normalizeTeamLogo(raw.tournament.logo));
    if (!hasSavedTournament) {
        const fromFile = await loadDefaultTournamentFile();
        normalized.tournament = normalizeTournament({
            ...fromFile,
            logo: normalizeTeamLogo(raw.tournament?.logo)
        });
    }
    return normalized;
}

function buildFreshTeamsFromConfig(config) {
    const normalized = normalizeConfig(config || {});
    const active = getActiveDivision(normalized);
    const kitty = active.teamKitty;
    return getConfigTeams(normalized).map((team) => ({
        team_id: team.team_id,
        team_name: team.team_name,
        color: team.color,
        ...(team.logo ? { logo: team.logo } : {}),
        ...(team.video ? { video: team.video } : {}),
        ...(team.iconPlayerId != null ? { iconPlayerId: team.iconPlayerId } : {}),
        ...(team.captionPlayerId != null ? { captionPlayerId: team.captionPlayerId } : {}),
        team_budget: kitty,
        remaining_budget: kitty,
        player_bought: 0,
        total_cost: 0,
        players: []
    }));
}

/** Keep uploaded media (logo/video) from config on live auction team objects. */
function syncTeamMediaFromConfig(state, config) {
    if (!state?.teams?.length) return state;
    const byId = new Map(getConfigTeams(config).map((team) => [team.team_id, team]));
    state.teams.forEach((team) => {
        const source = byId.get(Number(team.team_id));
        if (!source) return;
        if (source.logo) team.logo = source.logo;
        else delete team.logo;
        if (source.video) team.video = source.video;
        else delete team.video;
    });
    return state;
}

/**
 * Align live auction teams with the active division's config roster.
 * Keeps sold players / spend for matching team_ids; drops removed teams; adds new ones.
 */
function reconcileAuctionTeamsFromConfig(state, config) {
    if (!state) return state;
    let working = normalizeConfig(config || state.config || {});
    if (
        state.divisionId &&
        (working.divisions || []).some((division) => division.id === state.divisionId)
    ) {
        working = setActiveDivisionId(working, state.divisionId);
    }
    const active = getActiveDivision(working);
    const kitty = active.teamKitty;
    const configTeams = getConfigTeams(working);
    const previousById = new Map(
        (Array.isArray(state.teams) ? state.teams : []).map((team) => [Number(team.team_id), team])
    );

    state.teams = configTeams.map((team) => {
        const prev = previousById.get(Number(team.team_id));
        if (prev) {
            const spent = Number(prev.total_cost) || 0;
            const next = {
                ...prev,
                team_id: team.team_id,
                team_name: team.team_name,
                color: team.color,
                team_budget: kitty,
                remaining_budget: kitty - spent
            };
            if (team.logo) next.logo = team.logo;
            else delete next.logo;
            if (team.video) next.video = team.video;
            else delete next.video;
            if (team.iconPlayerId != null) next.iconPlayerId = team.iconPlayerId;
            else delete next.iconPlayerId;
            if (team.captionPlayerId != null) next.captionPlayerId = team.captionPlayerId;
            else delete next.captionPlayerId;
            return next;
        }
        return {
            team_id: team.team_id,
            team_name: team.team_name,
            color: team.color,
            ...(team.logo ? { logo: team.logo } : {}),
            ...(team.video ? { video: team.video } : {}),
            ...(team.iconPlayerId != null ? { iconPlayerId: team.iconPlayerId } : {}),
            ...(team.captionPlayerId != null ? { captionPlayerId: team.captionPlayerId } : {}),
            team_budget: kitty,
            remaining_budget: kitty,
            player_bought: 0,
            total_cost: 0,
            players: []
        };
    });
    return state;
}

function readImageFileAsDataUrl(file, maxSize = 256, quality = 0.82) {
    return new Promise((resolve, reject) => {
        if (!file || !String(file.type || "").startsWith("image/")) {
            reject(new Error("Choose an image file (PNG, JPG, WEBP, or GIF)."));
            return;
        }
        if (file.size > 4 * 1024 * 1024) {
            reject(new Error("Image is too large. Use a file under 4 MB."));
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that image."));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error("Could not load that image."));
            image.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
                const width = Math.max(1, Math.round(image.width * scale));
                const height = Math.max(1, Math.round(image.height * scale));
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(image, 0, 0, width, height);
                try {
                    resolve(canvas.toDataURL("image/png"));
                } catch (_) {
                    resolve(canvas.toDataURL("image/jpeg", quality));
                }
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function shuffleList(items) {
    const list = items.slice();
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = list[i];
        list[i] = list[j];
        list[j] = temp;
    }
    return list;
}

function getCategorySequence(config) {
    const normalized = normalizeConfig(config || {});
    return normalized.categorySequence.slice();
}

function orderPlayersForAuction(players, config) {
    const normalized = normalizeConfig(config || {});
    // Keep the same player object references so allPlayers stays in sync
    const list = (players || []).slice();
    list.forEach((player) => {
        player.category = normalizeCategoryName(player.category);
    });

    if (normalized.auctionOrder === "RANDOM") {
        return shuffleList(list);
    }

    const sequence = normalized.categorySequence.map((name) => normalizeCategoryName(name));
    const ordered = [];
    sequence.forEach((categoryName) => {
        let group = list.filter(
            (player) => normalizeCategoryName(player.category) === categoryName
        );
        if (normalized.shuffleWithinCategory) {
            group = shuffleList(group);
        }
        ordered.push(...group);
    });

    const leftovers = list.filter(
        (player) => !sequence.includes(normalizeCategoryName(player.category))
    );
    ordered.push(...(normalized.shuffleWithinCategory ? shuffleList(leftovers) : leftovers));
    return ordered;
}

/**
 * Keep finished players in place; re-queue everyone from auctionCount onward
 * by category sequence so Rising Star cannot mix with later categories.
 * Never reshuffle the current player away — bidder/viewer read the DB snapshot
 * and must keep seeing the same person the desk is auctioning.
 */
function reorderRemainingPlayersByCategory(state, config) {
    if (!state || !Array.isArray(state.players)) return state;
    const normalized = normalizeConfig(config || state.config || {});
    if (normalized.auctionOrder === "RANDOM") return state;

    const index = Math.max(0, Number(state.auctionCount) || 0);
    const current = state.players[index] || null;
    const currentKey = current
        ? String(current.code || current.id || "").trim()
        : "";
    const completed = state.players.slice(0, index);
    const remaining = state.players.slice(index);
    // Stable order only — shuffling here swaps the live player under phone clients.
    const orderedRemaining = orderPlayersForAuction(remaining, {
        ...normalized,
        shuffleWithinCategory: false
    });
    if (currentKey) {
        const at = orderedRemaining.findIndex(
            (player) => String(player?.code || player?.id || "").trim() === currentKey
        );
        if (at > 0) {
            const [player] = orderedRemaining.splice(at, 1);
            orderedRemaining.unshift(player);
        } else if (at < 0 && current) {
            orderedRemaining.unshift(current);
        }
    }
    state.players = completed.concat(orderedRemaining);
    return state;
}

async function fetchConfigFrom(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return normalizeConfig(await response.json());
}

async function loadDefaultConfigFile() {
    const candidates = ["data/config.json", "../data/config.json", "/data/config.json"];
    for (const path of candidates) {
        try {
            return await fetchConfigFrom(path);
        } catch (_) {
            // try next path
        }
    }
    return normalizeConfig(DEFAULT_AUCTION_CONFIG);
}

async function getAuctionConfig() {
    const saasMode =
        typeof usesTournamentDb === "function" ? usesTournamentDb() : Boolean(window.SaasAuth?.api);

    // SaaS: Postgres snapshot is mandatory. Never silently fall back to empty defaults.
    if (saasMode) {
        if (typeof reloadTournamentFromDb === "function") {
            await reloadTournamentFromDb();
        } else if (typeof hydrateLocalStorageFromProjectFolder === "function") {
            const hydrated = await hydrateLocalStorageFromProjectFolder();
            if (!hydrated?.ok) {
                throw new Error(
                    hydrated?.reason === "saas-required"
                        ? "Select a tournament first from the dashboard."
                        : "Could not load configuration from database."
                );
            }
        } else {
            throw new Error("Database sync is unavailable on this page.");
        }
    } else if (typeof hydrateLocalStorageFromProjectFolder === "function") {
        try {
            await hydrateLocalStorageFromProjectFolder();
        } catch (_) {
            // legacy offline path only
        }
    }

    const saved = localStorage.getItem(AUCTION_CONFIG_KEY);
    let config;
    if (saved) {
        try {
            config = await ensureConfigBranding(JSON.parse(saved));
        } catch (error) {
            if (saasMode) throw error;
            config = await ensureConfigBranding(await loadDefaultConfigFile());
        }
    } else if (saasMode) {
        throw new Error("No tournament configuration found in database. Open Config and click Save.");
    } else {
        config = await ensureConfigBranding(await loadDefaultConfigFile());
    }

    migrateLegacyDivisionStorage(config.activeDivisionId);

    // Keep local cache in sync after hydrate/normalize — do NOT write back to DB here.
    try {
        localStorage.setItem(AUCTION_CONFIG_KEY, JSON.stringify(config));
    } catch (_) {
        // ignore
    }

    return config;
}

function saveAuctionConfig(config, options = {}) {
    let incoming = config || {};

    // If caller sends a flat form (no divisions), merge into existing active division
    if (!Array.isArray(incoming.divisions) || !incoming.divisions.length) {
        let existing = normalizeConfig(DEFAULT_AUCTION_CONFIG);
        try {
            const saved = localStorage.getItem(AUCTION_CONFIG_KEY);
            if (saved) existing = normalizeConfig(JSON.parse(saved));
        } catch (_) {
            // ignore
        }

        incoming = patchActiveDivision(
            {
                ...existing,
                tournament: incoming.tournament != null ? incoming.tournament : existing.tournament,
                activeDivisionId: incoming.activeDivisionId || existing.activeDivisionId
            },
            {
                name: getActiveDivision(existing).name,
                teams:
                    incoming.teams != null
                        ? incoming.teams
                        : getActiveDivision(existing).teams,
                teamKitty: incoming.teamKitty,
                useCategoryBasePrices: incoming.useCategoryBasePrices,
                auctionOrder: incoming.auctionOrder,
                shuffleWithinCategory: incoming.shuffleWithinCategory,
                playerWheelEnabled: incoming.playerWheelEnabled,
                playerFields: incoming.playerFields,
                categorySequence: incoming.categorySequence,
                categories: incoming.categories
            }
        );
    }

    let previous = null;
    try {
        const saved = localStorage.getItem(AUCTION_CONFIG_KEY);
        if (saved) previous = normalizeConfig(JSON.parse(saved));
    } catch (_) {
        previous = null;
    }

    const normalized = normalizeConfig(incoming);
    if (!normalized.divisions.length) {
        throw new Error("Keep at least one auction division.");
    }
    migrateLegacyDivisionStorage(normalized.activeDivisionId);
    if (previous) purgeRemovedDivisionStorage(previous, normalized);
    localStorage.setItem(AUCTION_CONFIG_KEY, JSON.stringify(normalized));
    syncIconCaptionIdsIntoLiveAuctions(normalized);
    if (typeof persistConfigToProjectFolder === "function") {
        const persistPromise = persistConfigToProjectFolder(normalized);
        if (options.awaitDisk === true) {
            return Promise.resolve(persistPromise).then((ok) => {
                if (ok === false) {
                    throw new Error("Configuration was not written to the database.");
                }
                return normalized;
            });
        }
    } else if (options.awaitDisk === true) {
        return Promise.reject(new Error("Database sync is unavailable on this page."));
    }
    return normalized;
}

async function saveAuctionConfigToDisk(config) {
    return saveAuctionConfig(config, { awaitDisk: true });
}

/**
 * Keep live auction team icon/caption IDs aligned with saved config.
 * Clearing Caption in Config + Save must drop stale IDs from auction state too.
 */
function syncIconCaptionIdsIntoLiveAuctions(config) {
    const normalized = normalizeConfig(config || {});
    const saasMode =
        typeof usesTournamentDb === "function" ? usesTournamentDb() : Boolean(window.SaasAuth?.api);

    const patchPayload = (division, payload) => {
        const state = payload?.auctionState;
        if (!state || !Array.isArray(state.teams)) return null;

        const configTeams = Array.isArray(division.teams) ? division.teams : [];
        const byId = new Map(configTeams.map((team) => [Number(team.team_id), team]));
        const assigned = new Map();

        state.teams.forEach((team) => {
            const source = byId.get(Number(team.team_id));
            if (!source) {
                delete team.iconPlayerId;
                delete team.captionPlayerId;
                return;
            }
            if (source.iconPlayerId != null) {
                team.iconPlayerId = source.iconPlayerId;
                assigned.set(String(source.iconPlayerId), "icon");
            } else {
                delete team.iconPlayerId;
            }
            if (source.captionPlayerId != null) {
                team.captionPlayerId = source.captionPlayerId;
                assigned.set(String(source.captionPlayerId), "caption");
            } else {
                delete team.captionPlayerId;
            }
        });

        const master = Array.isArray(state.allPlayers)
            ? state.allPlayers
            : Array.isArray(state.players)
              ? state.players
              : [];
        master.forEach((player) => {
            const role = String(player?.preAssignRole || "").toLowerCase();
            if (role !== "icon" && role !== "caption") return;
            const expected = assigned.get(String(player.id));
            if (expected !== role) delete player.preAssignRole;
        });

        if (payload.config && typeof payload.config === "object") {
            payload.config = normalized;
        }
        payload.auctionState = state;
        return payload;
    };

    (normalized.divisions || []).forEach((division) => {
        if (!division?.id) return;

        if (saasMode && typeof fetchDivisionAuction === "function") {
            Promise.resolve(fetchDivisionAuction(division.id))
                .then((remote) => {
                    if (!remote?.auction) return;
                    if (
                        typeof isMeaningfulAuctionSnapshot === "function" &&
                        !isMeaningfulAuctionSnapshot(remote.auction)
                    ) {
                        return;
                    }
                    const payload = patchPayload(division, remote.auction);
                    if (!payload) return;
                    if (typeof persistAuctionToProjectFolder === "function") {
                        persistAuctionToProjectFolder(division.id, payload);
                    }
                })
                .catch(() => {});
            return;
        }

        const dataKey =
            typeof getDivisionAuctionDataKey === "function"
                ? getDivisionAuctionDataKey(division.id)
                : `auctionData:${division.id}`;
        let raw = null;
        try {
            raw = localStorage.getItem(dataKey);
        } catch (_) {
            raw = null;
        }
        if (!raw) return;

        let payload = null;
        try {
            payload = JSON.parse(raw);
        } catch (_) {
            return;
        }
        payload = patchPayload(division, payload);
        if (!payload) return;

        try {
            localStorage.setItem(dataKey, JSON.stringify(payload));
        } catch (_) {
            // ignore quota errors
        }
        if (typeof persistAuctionToProjectFolder === "function") {
            persistAuctionToProjectFolder(division.id, payload);
        }
    });
}

function getActiveConfig(state) {
    let config = null;
    if (state?.config?.categories || state?.config?.divisions) {
        config = normalizeConfig(state.config);
    } else {
        const saved = localStorage.getItem(AUCTION_CONFIG_KEY);
        if (saved) {
            try {
                config = normalizeConfig(JSON.parse(saved));
            } catch (_) {
                config = null;
            }
        }
    }
    if (!config) config = normalizeConfig(DEFAULT_AUCTION_CONFIG);

    // Prefer the live desk/squads division over whatever is marked active in config
    if (
        state?.divisionId &&
        (config.divisions || []).some((division) => division.id === state.divisionId)
    ) {
        return setActiveDivisionId(config, state.divisionId);
    }
    return config;
}

function getCategoryConfig(config, categoryName) {
    const name = normalizeCategoryName(categoryName);
    return {
        name,
        ...(config?.categories?.[name] || DEFAULT_AUCTION_CONFIG.categories[name] || {
            basePrice: 0,
            maxPlayers: 0
        })
    };
}

function sameAssignablePlayerId(a, b) {
    if (a == null || b == null || a === "" || b === "") return false;
    if (String(a) === String(b)) return true;
    const na = Number(a);
    const nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

function findPlayerByAssignableId(list, playerId) {
    if (playerId == null || playerId === "") return null;
    const needle = String(playerId).trim();
    if (!needle) return null;
    const needleNum = Number(needle);
    const needleIsNumeric = Number.isFinite(needleNum) && /^\d+$/.test(needle);
    const codeToId =
        typeof codeToNumericId === "function" && !needleIsNumeric
            ? codeToNumericId(needle)
            : null;
    return (
        (list || []).find((player) => {
            if (!player) return false;
            if (sameAssignablePlayerId(player.id, playerId)) return true;
            if (sameAssignablePlayerId(player.code, playerId)) return true;
            const code = String(player.code || "").trim();
            if (code && code.toLowerCase() === needle.toLowerCase()) return true;
            // Icon pick 2009 ↔ roster code CPL-K-9 (and the reverse)
            if (typeof codeToNumericId === "function" && code) {
                const fromCode = codeToNumericId(code);
                if (needleIsNumeric && fromCode === needleNum) return true;
                if (codeToId != null && sameAssignablePlayerId(player.id, codeToId)) return true;
            }
            return false;
        }) || null
    );
}

function isIconCaptionPreAssignedPlayer(player) {
    const role = String(player?.preAssignRole || "").toLowerCase();
    return role === "icon" || role === "caption";
}

/** True when Config has at least one Icon/Caption player picked on a team. */
function divisionHasIconCaptionAssignments(division) {
    return (division?.teams || []).some(
        (team) =>
            (team?.iconPlayerId != null && team.iconPlayerId !== "") ||
            (team?.captionPlayerId != null && team.captionPlayerId !== "")
    );
}

function resolveIconCaptionSettings(division) {
    const settings = normalizeIconCaptionSettings(division?.iconCaption);
    // Recover when teams still have picks but the enabled flag was lost in a save/reload.
    if (!settings.enabled && divisionHasIconCaptionAssignments(division)) {
        return { ...settings, enabled: true };
    }
    return settings;
}

function syncIconCaptionPlayerCopy(target, source) {
    if (!target || !source) return;
    target.status = source.status;
    target.team = source.team;
    target.finalPrice = source.finalPrice;
    target.bids = Array.isArray(source.bids) ? source.bids.slice() : [];
    if (source.preAssignRole) target.preAssignRole = source.preAssignRole;
    else delete target.preAssignRole;
}

function countTeamPlayersInCategory(state, teamId, categoryName) {
    const name = normalizeCategoryName(categoryName);
    const team = (state.teams || []).find(
        (entry) => Number(entry.team_id) === Number(teamId)
    );
    if (!team) return 0;

    const config = getActiveConfig(state);
    const activeDivision = getActiveDivision(config);
    const iconCaption = resolveIconCaptionSettings(activeDivision);
    // Default ON: Icon/Caption fill a category slot (Rising max 3 → 1 Rising Icon leaves 2)
    const countPreAssign = iconCaption.countTowardCategoryQuota !== false;
    const master = state.allPlayers || state.players || [];
    const counted = new Set();
    let count = 0;

    const consider = (player) => {
        if (!player) return;
        const key = String(player.id ?? player.code ?? "");
        if (!key || counted.has(key)) return;
        if (!countPreAssign && isIconCaptionPreAssignedPlayer(player)) return;
        if (normalizeCategoryName(player.category) !== name) return;
        counted.add(key);
        count += 1;
    };

    // 1) Everyone already on the team roster
    (team.players || []).forEach((playerId) => {
        consider(findPlayerByAssignableId(master, playerId));
    });

    // 2) Icon / Caption picks on the team object (covers id/code mismatch on roster)
    if (countPreAssign) {
        consider(findPlayerByAssignableId(master, team.iconPlayerId));
        consider(findPlayerByAssignableId(master, team.captionPlayerId));

        // 3) Any pre-assigned player sold to this team in this category
        master.forEach((player) => {
            if (!isIconCaptionPreAssignedPlayer(player)) return;
            if (
                Number(player.team) !== Number(teamId) &&
                !sameAssignablePlayerId(player.team, teamId)
            ) {
                return;
            }
            consider(player);
        });
    }

    return count;
}

/**
 * Pre-assign Icon / Caption players to teams: mark sold, deduct fee, drop from queue.
 * Called from applyConfigToAuctionState on Start New Auction / Reset.
 */
function applyIconCaptionAssignments(state, config) {
    if (!state) return state;
    const normalized = normalizeConfig(config || state.config || {});
    const division = getActiveDivision(normalized);
    const settings = resolveIconCaptionSettings(division);
    const master = Array.isArray(state.allPlayers) && state.allPlayers.length
        ? state.allPlayers
        : Array.isArray(state.players)
          ? state.players
          : [];

    // Clear previous pre-assign marks so re-apply is clean
    master.forEach((player) => {
        if (!isIconCaptionPreAssignedPlayer(player)) return;
        delete player.preAssignRole;
    });

    if (!settings.enabled) {
        state.config = normalized;
        return state;
    }

    if (!Array.isArray(state.teams)) state.teams = buildFreshTeamsFromConfig(normalized);
    if (!Array.isArray(state.soldPlayers)) state.soldPlayers = [];

    // Fresh apply: reset team rosters/budgets then assign Icons/Captions only
    const kitty = Number(division.teamKitty) || 0;
    state.teams.forEach((team) => {
        team.players = [];
        team.player_bought = 0;
        team.total_cost = 0;
        team.team_budget = kitty || Number(team.team_budget) || 0;
        team.remaining_budget = team.team_budget;
    });
    state.soldPlayers = [];
    state.soldCount = 0;

    const usedPlayerIds = new Set();

    const assignRole = (team, playerId, role, fee) => {
        if (playerId == null || playerId === "") return;
        if ([...usedPlayerIds].some((id) => sameAssignablePlayerId(id, playerId))) {
            console.warn(`Icon/Caption: player ${playerId} already assigned; skipping ${role} for ${team.team_name}`);
            return;
        }
        const player = findPlayerByAssignableId(master, playerId);
        if (!player) {
            console.warn(`Icon/Caption: player ${playerId} not found for ${team.team_name} ${role}`);
            return;
        }

        const amount = Math.max(0, Number(fee) || 0);
        player.status = "sold";
        player.team = team.team_id;
        player.finalPrice = amount;
        player.bids = [{ team: team.team_id, amount }];
        player.preAssignRole = role;

        if (!Array.isArray(team.players)) team.players = [];
        const alreadyOnTeam = team.players.some((id) => sameAssignablePlayerId(id, player.id));
        if (!alreadyOnTeam) {
            team.players.push(player.id);
            team.player_bought = (Number(team.player_bought) || 0) + 1;
            team.total_cost = (Number(team.total_cost) || 0) + amount;
            team.remaining_budget = (Number(team.team_budget) || 0) - (Number(team.total_cost) || 0);
        }

        if (!state.soldPlayers.some((id) => sameAssignablePlayerId(id, player.id))) {
            state.soldPlayers.push(player.id);
        }
        state.soldCount = state.soldPlayers.length;
        usedPlayerIds.add(player.id);
        if (player.code) usedPlayerIds.add(player.code);
    };

    state.teams.forEach((team) => {
        const configTeam =
            getConfigTeams(normalized).find((entry) => Number(entry.team_id) === Number(team.team_id)) ||
            team;
        if (configTeam.iconPlayerId != null) team.iconPlayerId = configTeam.iconPlayerId;
        else delete team.iconPlayerId;
        if (configTeam.captionPlayerId != null) team.captionPlayerId = configTeam.captionPlayerId;
        else delete team.captionPlayerId;
        assignRole(team, configTeam.iconPlayerId, "icon", settings.iconFee);
        assignRole(team, configTeam.captionPlayerId, "caption", settings.captionFee);
    });

    // Live queue: only unsettled players (pre-assigned are sold)
    if (master.length) {
        state.allPlayers = master;
        const remaining = master.filter((player) => {
            const status = String(player.status || "").toLowerCase();
            return status !== "sold" && status !== "unsold" && status !== "skipped";
        });
        state.players = orderPlayersForAuction(remaining, normalized);
        state.auctionCount = 0;
    }

    // Keep division iconCaption enabled in live config when assignments exist
    if (settings.enabled) {
        const idx = (normalized.divisions || []).findIndex((item) => item.id === division.id);
        if (idx >= 0) {
            normalized.divisions[idx].iconCaption = {
                ...normalizeIconCaptionSettings(normalized.divisions[idx].iconCaption),
                enabled: true
            };
        }
        normalized.iconCaption = {
            ...normalizeIconCaptionSettings(normalized.iconCaption),
            enabled: true
        };
    }

    state.config = normalized;
    return state;
}

/**
 * Resume-safe Icon / Caption restore from saved Config (DB).
 * Restores preAssignRole + sold/on-team marks without resetting auction progress,
 * so category max still respects countTowardCategoryQuota after reload.
 */
function ensureIconCaptionAssignments(state, config) {
    if (!state) return state;
    const normalized = normalizeConfig(config || state.config || {});
    const division = getActiveDivision(normalized);
    const settings = resolveIconCaptionSettings(division);
    state.config = normalized;

    const master = Array.isArray(state.allPlayers) && state.allPlayers.length
        ? state.allPlayers
        : Array.isArray(state.players)
          ? state.players
          : [];
    if (!master.length) return state;

    const expected = new Map();
    if (settings.enabled && Array.isArray(state.teams)) {
        state.teams.forEach((team) => {
            const configTeam =
                getConfigTeams(normalized).find((entry) => Number(entry.team_id) === Number(team.team_id)) ||
                team;
            if (configTeam.iconPlayerId != null && configTeam.iconPlayerId !== "") {
                expected.set(`icon:${String(configTeam.iconPlayerId)}`, {
                    team,
                    role: "icon",
                    fee: settings.iconFee,
                    playerId: configTeam.iconPlayerId
                });
            }
            if (configTeam.captionPlayerId != null && configTeam.captionPlayerId !== "") {
                expected.set(`caption:${String(configTeam.captionPlayerId)}`, {
                    team,
                    role: "caption",
                    fee: settings.captionFee,
                    playerId: configTeam.captionPlayerId
                });
            }
            if (configTeam.iconPlayerId != null) team.iconPlayerId = configTeam.iconPlayerId;
            else delete team.iconPlayerId;
            if (configTeam.captionPlayerId != null) team.captionPlayerId = configTeam.captionPlayerId;
            else delete team.captionPlayerId;
        });
    }

    // Drop stale pre-assign marks that are no longer in Config
    master.forEach((player) => {
        if (!isIconCaptionPreAssignedPlayer(player)) return;
        const stillExpected = [...expected.values()].some(
            (entry) =>
                sameAssignablePlayerId(entry.playerId, player.id) ||
                sameAssignablePlayerId(entry.playerId, player.code)
        );
        if (!stillExpected) delete player.preAssignRole;
    });

    if (!settings.enabled) return state;

    const assignedIds = new Set();
    const used = new Set();
    expected.forEach((entry) => {
        if ([...used].some((id) => sameAssignablePlayerId(id, entry.playerId))) return;
        const player = findPlayerByAssignableId(master, entry.playerId);
        if (!player) {
            console.warn(
                `Icon/Caption resume: player ${entry.playerId} not found for ${entry.team?.team_name} ${entry.role}`
            );
            return;
        }
        const team = entry.team;
        const amount = Math.max(0, Number(entry.fee) || 0);
        const alreadyOnTeam =
            Array.isArray(team.players) &&
            team.players.some(
                (id) =>
                    sameAssignablePlayerId(id, player.id) || sameAssignablePlayerId(id, player.code)
            );

        player.preAssignRole = entry.role;
        player.status = "sold";
        player.team = team.team_id;
        if (!Array.isArray(player.bids) || !player.bids.length) {
            player.finalPrice = amount;
            player.bids = [{ team: team.team_id, amount }];
        } else if (player.finalPrice == null) {
            player.finalPrice = amount;
        }

        if (!Array.isArray(team.players)) team.players = [];
        if (!alreadyOnTeam) {
            team.players.push(player.id);
            team.player_bought = (Number(team.player_bought) || 0) + 1;
            team.total_cost = (Number(team.total_cost) || 0) + amount;
            team.remaining_budget = (Number(team.team_budget) || 0) - (Number(team.total_cost) || 0);
        }

        if (!Array.isArray(state.soldPlayers)) state.soldPlayers = [];
        if (!state.soldPlayers.some((id) => sameAssignablePlayerId(id, player.id))) {
            state.soldPlayers.push(player.id);
        }
        state.soldCount = state.soldPlayers.length;
        used.add(player.id);
        if (player.code) used.add(player.code);
        assignedIds.add(String(player.id));
        if (player.code) assignedIds.add(String(player.code));
    });

    // Resume snapshots keep separate object copies in players[] vs allPlayers[].
    // Mirror sold/preAssign marks onto the live queue, then strip by id/code.
    if (Array.isArray(state.players) && state.players.length) {
        state.players.forEach((queuePlayer) => {
            const source = findPlayerByAssignableId(master, queuePlayer.id) ||
                findPlayerByAssignableId(master, queuePlayer.code);
            if (source && isIconCaptionPreAssignedPlayer(source)) {
                syncIconCaptionPlayerCopy(queuePlayer, source);
            }
        });
        const before = Math.max(0, Number(state.auctionCount) || 0);
        const isAssignedQueuePlayer = (player) =>
            isIconCaptionPreAssignedPlayer(player) ||
            assignedIds.has(String(player?.id)) ||
            (player?.code != null && assignedIds.has(String(player.code)));
        const removedBefore = state.players
            .slice(0, before)
            .filter((player) => isAssignedQueuePlayer(player)).length;
        state.players = state.players.filter((player) => !isAssignedQueuePlayer(player));
        state.auctionCount = Math.max(0, Math.min(before - removedBefore, state.players.length));
    }

    state.allPlayers = master;
    return state;
}

function getCategoryQuotaStatus(state, teamId, categoryName) {
    const config = getActiveConfig(state);
    const category = getCategoryConfig(config, categoryName);
    const owned = countTeamPlayersInCategory(state, teamId, category.name);
    return {
        name: category.name,
        owned,
        max: category.maxPlayers,
        remaining: Math.max(0, category.maxPlayers - owned),
        isFull: owned >= category.maxPlayers
    };
}

function canTeamBuyCategory(state, teamId, categoryName) {
    return !getCategoryQuotaStatus(state, teamId, categoryName).isFull;
}

/**
 * Kitty that must stay reserved so the team can still fill remaining category
 * slots at each category's base price.
 * When fillingCategory is set, that category's remaining need is reduced by 1
 * (this purchase would fill one slot).
 */
function getTeamCategoryReserve(state, teamId, options = {}) {
    const config = getActiveConfig(state);
    const fillingCategory = options.fillingCategory
        ? normalizeCategoryName(options.fillingCategory)
        : null;
    const sequence = getCategorySequence(config);
    const names = sequence.length
        ? sequence.map((name) => normalizeCategoryName(name))
        : Object.keys(config.categories || {}).map((name) => normalizeCategoryName(name));

    let reserve = 0;
    let remainingSlots = 0;
    const breakdown = [];

    names.forEach((name) => {
        const category = getCategoryConfig(config, name);
        const maxPlayers = Number(category.maxPlayers) || 0;
        if (maxPlayers <= 0) return;

        const owned = countTeamPlayersInCategory(state, teamId, name);
        let need = Math.max(0, maxPlayers - owned);
        if (fillingCategory && name === fillingCategory) {
            need = Math.max(0, need - 1);
        }
        const basePrice = Number(category.basePrice) || 0;
        const amount = need * basePrice;
        reserve += amount;
        remainingSlots += need;
        if (need > 0) {
            breakdown.push({
                name,
                need,
                basePrice,
                amount
            });
        }
    });

    return {
        reserve,
        remainingSlots,
        breakdown
    };
}

function getTeamSpendableBudget(state, teamId, options = {}) {
    const team = state?.teams?.find((item) => Number(item.team_id) === Number(teamId));
    const purse = Number(team?.remaining_budget) || 0;
    const { reserve, remainingSlots, breakdown } = getTeamCategoryReserve(state, teamId, options);
    const spendable = Math.max(0, purse - reserve);
    return {
        purse,
        reserve,
        spendable,
        remainingSlots,
        breakdown
    };
}

function canTeamAffordBid(state, teamId, amount, options = {}) {
    const bidAmount = Number(amount) || 0;
    const info = getTeamSpendableBudget(state, teamId, options);
    return {
        ...info,
        amount: bidAmount,
        ok: bidAmount > 0 && bidAmount <= info.spendable
    };
}

/**
 * Keep live auction player photos aligned with the current roster (DB).
 * Desk + phone bidder + viewer must show the same image for the same player.
 */
function syncLiveAuctionPhotosFromRoster(state, roster) {
    if (!state || !Array.isArray(roster) || !roster.length) return state;
    const byCode = new Map();
    const byId = new Map();
    roster.forEach((player) => {
        if (!player) return;
        const photo = String(player.photo || "").trim();
        const photoKey = player.photoKey || player.photo_key || null;
        if (!photo && !photoKey) return;
        const meta = { photo, photoKey };
        const code = String(player.code || "").trim();
        const id = String(player.id || "").trim();
        if (code) byCode.set(code, meta);
        if (id) byId.set(id, meta);
    });

    const apply = (player) => {
        if (!player || typeof player !== "object") return;
        const meta =
            byCode.get(String(player.code || "").trim()) ||
            byId.get(String(player.id || "").trim()) ||
            null;
        if (!meta) return;
        if (meta.photoKey) player.photoKey = meta.photoKey;
        if (meta.photo) {
            player.photo = meta.photo;
        } else if (
            meta.photoKey &&
            String(player.photo || "").trim() &&
            !String(player.photo).includes(String(meta.photoKey))
        ) {
            // Stale URL that does not match the current key — rebuild from key.
            const baseMatch = String(player.photo).match(/^(https?:\/\/[^/]+)\//i);
            if (baseMatch) {
                player.photo = `${baseMatch[1]}/${String(meta.photoKey).replace(/^\//, "")}`;
            }
        }
    };

    ["players", "allPlayers", "soldPlayers", "unsoldPlayers", "skippedPlayers"].forEach((key) => {
        if (!Array.isArray(state[key])) return;
        state[key].forEach(apply);
    });
    (state.teams || []).forEach((team) => {
        ["players", "squad"].forEach((listKey) => {
            if (!Array.isArray(team?.[listKey])) return;
            // team.players is often id list; only patch object entries
            team[listKey].forEach((entry) => {
                if (entry && typeof entry === "object") apply(entry);
            });
        });
    });
    return state;
}

/**
 * Re-apply category base prices from the latest Config (DB) onto the live roster.
 * Resume / Config edits must not keep stale baked prices (e.g. default Evergreen 20L).
 */
function syncLiveAuctionPricingFromConfig(state, config) {
    if (!state) return state;
    let normalized = normalizeConfig(config || state.config || {});
    if (
        state.divisionId &&
        (normalized.divisions || []).some((division) => division.id === state.divisionId)
    ) {
        normalized = setActiveDivisionId(normalized, state.divisionId);
    }
    const division = getActiveDivision(normalized);
    state.config = normalized;

    const applyCategory = (player) => {
        if (!player) return;
        player.category = normalizeCategoryName(player.category);
        if (division.useCategoryBasePrices === false) return;
        const category = division.categories?.[player.category];
        if (!category || category.basePrice == null) return;
        player.basePrice = Number(category.basePrice) || 0;
    };

    if (Array.isArray(state.players)) state.players.forEach(applyCategory);
    if (Array.isArray(state.allPlayers)) state.allPlayers.forEach(applyCategory);
    return state;
}

function applyConfigToAuctionState(state, config) {
    if (!state || !config) return state;
    const normalized = normalizeConfig(config);
    const division = getActiveDivision(normalized);

    state.tournament = buildTournamentState(normalized, state.tournament);
    state.divisionId = division.id;
    state.divisionName = division.name;

    if (getConfigTeams(normalized).length) {
        state.teams = buildFreshTeamsFromConfig(normalized);
    } else if (Array.isArray(state.teams)) {
        state.teams.forEach((team) => {
            const spent = Number(team.total_cost) || 0;
            team.team_budget = division.teamKitty;
            team.remaining_budget = division.teamKitty - spent;
        });
    }

    // Keep a master copy, then set the live auction queue from the chosen order
    if (Array.isArray(state.players)) {
        if (!Array.isArray(state.allPlayers) || state.allPlayers.length === 0) {
            state.allPlayers = state.players.slice();
        }
        state.players = orderPlayersForAuction(state.allPlayers, normalized);
        state.auctionCount = 0;
    }

    state.config = normalized;
    syncLiveAuctionPricingFromConfig(state, normalized);
    applyIconCaptionAssignments(state, normalized);
    const first = (state.players || []).find(
        (player) =>
            String(player?.status || "").toLowerCase() !== "sold" &&
            String(player?.status || "").toLowerCase() !== "unsold" &&
            String(player?.status || "").toLowerCase() !== "skipped"
    );
    state.activeAuctionCategory = normalizeCategoryName(
        first?.category || getCategorySequence(normalized)[0] || ""
    );
    return state;
}
