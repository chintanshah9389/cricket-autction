const AUCTION_CONFIG_KEY = "auctionConfig";

const DEFAULT_CATEGORY_SEQUENCE = ["RISING STAR", "KEY PLAYERS", "EVERGREEN"];

const DEFAULT_TEAM_COLORS = [
    "#e74c3c", "#3498db", "#27ae60", "#9b59b6", "#f39c12", "#16a085",
    "#d35400", "#2c3e50", "#0f766e", "#4338ca", "#9a3412", "#9f1239",
    "#0369a1", "#15803d", "#a21caf", "#b45309", "#0e7490", "#1d4ed8"
];

const DEFAULT_TOURNAMENT = {
    name: "ABCD Super League",
    year: "2025",
    logo: ""
};

const DEFAULT_AUCTION_CONFIG = {
    teamKitty: 10000000,
    useCategoryBasePrices: true,
    auctionOrder: "SEQUENCE",
    shuffleWithinCategory: true,
    playerWheelEnabled: true,
    categorySequence: DEFAULT_CATEGORY_SEQUENCE.slice(),
    categories: {
        "RISING STAR": { basePrice: 500000, maxPlayers: 3 },
        "KEY PLAYERS": { basePrice: 1000000, maxPlayers: 4 },
        "EVERGREEN": { basePrice: 2000000, maxPlayers: 4 }
    },
    teams: [],
    tournament: { ...DEFAULT_TOURNAMENT }
};

const LEGACY_CATEGORY_MAP = {
    A: "EVERGREEN",
    B: "KEY PLAYERS",
    C: "RISING STAR",
    "RISING STAR": "RISING STAR",
    "KEY PLAYER": "KEY PLAYERS",
    "KEY PLAYERS": "KEY PLAYERS",
    EVERGREEN: "EVERGREEN",
    "EVER GREEN": "EVERGREEN",
    "EVER-GREEN": "EVERGREEN"
};

function normalizeCategoryName(rawCategory) {
    const key = String(rawCategory || "").trim().toUpperCase().replace(/\s+/g, " ");
    return LEGACY_CATEGORY_MAP[key] || key;
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
    if (value.startsWith("assets/")) return `${fromPrefix}${value}`;
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
    return "";
}

function getTeamLogoSrc(team, assetsPrefix = "assets/teams-logo") {
    const uploaded = normalizeTeamLogo(team?.logo);
    if (uploaded) return uploaded;
    const teamId = Number(team?.team_id);
    if (!Number.isFinite(teamId)) return "";
    return `${assetsPrefix}/team_${teamId}.png`;
}

function normalizeTournament(raw) {
    const name =
        String(raw?.name ?? DEFAULT_TOURNAMENT.name).trim() || DEFAULT_TOURNAMENT.name;
    const year =
        String(raw?.year ?? DEFAULT_TOURNAMENT.year).trim() || DEFAULT_TOURNAMENT.year;
    const logo = normalizeTeamLogo(raw?.logo);
    return {
        name,
        year,
        ...(logo ? { logo } : {})
    };
}

function getTournamentTitle(tournament) {
    const normalized = normalizeTournament(tournament);
    if (!normalized.year) return normalized.name;
    return `${normalized.name} - ${normalized.year}`;
}

function getTournamentLogoSrc(tournament, defaultPath = "assets/tournament-logo.png") {
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
        logo: tournament.logo || "assets/tournament-logo.png"
    };
}

function normalizeTeams(rawTeams) {
    if (!Array.isArray(rawTeams)) return [];
    const usedIds = new Set();
    return rawTeams
        .map((team, index) => {
            let teamId = Number(team?.team_id);
            if (!Number.isFinite(teamId) || teamId <= 0 || usedIds.has(teamId)) {
                teamId = index + 1;
                while (usedIds.has(teamId)) teamId += 1;
            }
            usedIds.add(teamId);
            const teamName = String(team?.team_name || `Team ${index + 1}`).trim();
            const color =
                String(team?.color || "").trim() ||
                DEFAULT_TEAM_COLORS[index % DEFAULT_TEAM_COLORS.length];
            const logo = normalizeTeamLogo(team?.logo);
            return {
                team_id: teamId,
                team_name: teamName || `Team ${index + 1}`,
                color,
                ...(logo ? { logo } : {})
            };
        })
        .filter((team) => team.team_name);
}

function nextAvailableTeamId(teams) {
    const used = new Set((teams || []).map((team) => Number(team.team_id)));
    let id = 11;
    while (used.has(id)) id += 1;
    return id;
}

function normalizeConfig(raw) {
    const categories = buildCategoriesFromRaw(raw || {});
    return {
        teamKitty: Number(raw?.teamKitty) || DEFAULT_AUCTION_CONFIG.teamKitty,
        useCategoryBasePrices: raw?.useCategoryBasePrices !== false,
        auctionOrder: normalizeAuctionOrder(raw?.auctionOrder),
        shuffleWithinCategory: raw?.shuffleWithinCategory !== false,
        playerWheelEnabled: raw?.playerWheelEnabled !== false,
        categories,
        categorySequence: normalizeCategorySequence(raw?.categorySequence, categories),
        teams: normalizeTeams(raw?.teams),
        tournament: normalizeTournament(raw?.tournament)
    };
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
    const normalized = normalizeConfig(config || {});
    if (normalized.teams.length) return normalized;
    normalized.teams = await loadDefaultTeamsFile();
    return normalized;
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
    return normalized.teams.map((team) => ({
        team_id: team.team_id,
        team_name: team.team_name,
        color: team.color,
        ...(team.logo ? { logo: team.logo } : {}),
        team_budget: normalized.teamKitty,
        remaining_budget: normalized.teamKitty,
        player_bought: 0,
        total_cost: 0,
        players: []
    }));
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

    const sequence = normalized.categorySequence;
    const ordered = [];
    sequence.forEach((categoryName) => {
        let group = list.filter((player) => player.category === categoryName);
        if (normalized.shuffleWithinCategory) {
            group = shuffleList(group);
        }
        ordered.push(...group);
    });

    const leftovers = list.filter((player) => !sequence.includes(player.category));
    ordered.push(...(normalized.shuffleWithinCategory ? shuffleList(leftovers) : leftovers));
    return ordered;
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
    const saved = localStorage.getItem(AUCTION_CONFIG_KEY);
    if (saved) {
        try {
            return ensureConfigBranding(JSON.parse(saved));
        } catch (_) {
            // Fall through to file defaults
        }
    }
    return ensureConfigBranding(await loadDefaultConfigFile());
}

function saveAuctionConfig(config) {
    const normalized = normalizeConfig(config);
    if (!normalized.teams.length) {
        throw new Error("Keep at least one team in the configuration.");
    }
    localStorage.setItem(AUCTION_CONFIG_KEY, JSON.stringify(normalized));
    return normalized;
}

function getActiveConfig(state) {
    if (state?.config?.categories) {
        return normalizeConfig(state.config);
    }
    const saved = localStorage.getItem(AUCTION_CONFIG_KEY);
    if (saved) {
        try {
            return normalizeConfig(JSON.parse(saved));
        } catch (_) {
            // ignore
        }
    }
    return normalizeConfig(DEFAULT_AUCTION_CONFIG);
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

function countTeamPlayersInCategory(state, teamId, categoryName) {
    const name = normalizeCategoryName(categoryName);
    const team = state.teams.find((t) => t.team_id === teamId);
    if (!team) return 0;

    const master = state.allPlayers || state.players || [];
    return team.players.reduce((count, playerId) => {
        const player = master.find((p) => p.id === playerId);
        if (!player) return count;
        return normalizeCategoryName(player.category) === name ? count + 1 : count;
    }, 0);
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

function applyConfigToAuctionState(state, config) {
    if (!state || !config) return state;
    const normalized = normalizeConfig(config);

    state.tournament = buildTournamentState(normalized, state.tournament);

    if (normalized.teams.length) {
        state.teams = buildFreshTeamsFromConfig(normalized);
    } else if (Array.isArray(state.teams)) {
        state.teams.forEach((team) => {
            const spent = Number(team.total_cost) || 0;
            team.team_budget = normalized.teamKitty;
            team.remaining_budget = normalized.teamKitty - spent;
        });
    }

    const applyCategory = (player) => {
        if (!player) return;
        player.category = normalizeCategoryName(player.category);
        if (normalized.useCategoryBasePrices) {
            const category = normalized.categories[player.category];
            if (category) {
                player.basePrice = category.basePrice;
            }
        }
    };

    if (Array.isArray(state.players)) state.players.forEach(applyCategory);
    if (Array.isArray(state.allPlayers)) state.allPlayers.forEach(applyCategory);

    // Keep a master copy, then set the live auction queue from the chosen order
    if (Array.isArray(state.players)) {
        if (!Array.isArray(state.allPlayers) || state.allPlayers.length === 0) {
            state.allPlayers = state.players.slice();
        }
        state.players = orderPlayersForAuction(state.allPlayers, normalized);
        state.auctionCount = 0;
    }

    state.config = normalized;
    return state;
}
