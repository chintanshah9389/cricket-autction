const fileInput = document.getElementById("players-file");
const importReplaceBtn = document.getElementById("import-replace-btn");
const importMergeBtn = document.getElementById("import-merge-btn");
const reloadFileBtn = document.getElementById("reload-file-btn");
const downloadTemplateBtn = document.getElementById("download-template-btn");
const exportJsonBtn = document.getElementById("export-json-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");
const clearPlayersBtn = document.getElementById("clear-players-btn");
const importStatus = document.getElementById("import-status");
const playersCount = document.getElementById("players-count");
const playersSearch = document.getElementById("players-search");
const categoryFilter = document.getElementById("category-filter");
const roleFilter = document.getElementById("role-filter");
const statusFilter = document.getElementById("status-filter");
const teamFilter = document.getElementById("team-filter");
const playersTableBody = document.getElementById("players-table-body");
const playerForm = document.getElementById("player-form");
const resetFormBtn = document.getElementById("reset-form-btn");
const newPlayerBtn = document.getElementById("new-player-btn");
const deleteCurrentBtn = document.getElementById("delete-current-btn");
const formTitle = document.getElementById("form-title");
const formPhotoPreview = document.getElementById("form-photo-preview");
const categoryOptions = document.getElementById("category-options");

const playersDivisionTabs = document.getElementById("players-division-tabs");
const playersDivisionLabel = document.getElementById("players-division-label");
const offlineStatus = document.getElementById("offline-status");
const cachePhotosBtn = document.getElementById("cache-photos-btn");
const uploadPhotosBtn = document.getElementById("upload-photos-btn");
const photosFiles = document.getElementById("photos-files");
const fixCategoriesFromIdBtn = document.getElementById("fix-categories-from-id-btn");
const exportPackBtn = document.getElementById("export-pack-btn");
const importPackBtn = document.getElementById("import-pack-btn");
const packFile = document.getElementById("pack-file");
const bulkDeleteBtn = document.getElementById("bulk-delete-btn");
const excelColumnsHelp = document.getElementById("excel-columns-help");

let playersCache = [];
let editingKey = "";
let teamLookup = new Map(); // team_id -> { name, color }
let activeDivisionId = "div_1";
let divisionsCache = [];
let selectedPlayerKeys = new Set();
let lastDetectedExcelColumns = [];

function getActiveDivisionConfigSlice() {
    return divisionsCache.find((item) => item.id === activeDivisionId) || null;
}

function updateExcelColumnsHelp(detectedColumns = null) {
    if (!excelColumnsHelp) return;
    if (Array.isArray(detectedColumns) && detectedColumns.length) {
        lastDetectedExcelColumns = detectedColumns.slice();
    }
    const expected =
        typeof getExpectedSpreadsheetColumns === "function"
            ? getExpectedSpreadsheetColumns(getActiveDivisionConfigSlice()?.playerFields)
            : ["ID", "Player", "CATEGORY"];
    if (lastDetectedExcelColumns.length) {
        excelColumnsHelp.textContent = `Excel headers: ${lastDetectedExcelColumns.join(", ")}. Matched fields for this division: ${expected.join(", ")}.`;
    } else {
        excelColumnsHelp.textContent = `Expected columns for this division: ${expected.join(", ")}. Upload Excel to detect sheet headers automatically.`;
    }
}

function setOfflineStatus(message, isError = false) {
    if (!offlineStatus) return;
    offlineStatus.textContent = message || "";
    offlineStatus.style.color = isError ? "#b42318" : "";
}

function getAuctionDataStorageKey(divisionId = activeDivisionId) {
    return typeof getDivisionAuctionDataKey === "function"
        ? getDivisionAuctionDataKey(divisionId)
        : `auctionData:${divisionId}`;
}

/** Counts must come from that division's own storage — never reuse another tab's cache. */
function getPlayersCountForDivision(divisionId) {
    try {
        const stored =
            typeof loadStoredPlayers === "function" ? loadStoredPlayers(divisionId) : null;
        if (Array.isArray(stored)) return stored.length;
        if (divisionId === activeDivisionId && Array.isArray(playersCache)) {
            return playersCache.length;
        }
        return 0;
    } catch (_) {
        return 0;
    }
}

function getTeamsCountForDivision(divisionId) {
    const division = divisionsCache.find((item) => item.id === divisionId);
    return Array.isArray(division?.teams) ? division.teams.length : 0;
}

function renderPlayersDivisionTabs() {
    if (!playersDivisionTabs) return;
    playersDivisionTabs.innerHTML = "";
    divisionsCache.forEach((division) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `division-tab${division.id === activeDivisionId ? " is-active" : ""}`;
        const playerCount = getPlayersCountForDivision(division.id);
        const teamCount = getTeamsCountForDivision(division.id);
        button.innerHTML = `<span class="division-tab-name">${division.name}</span><span class="division-tab-count">${teamCount} teams · ${playerCount} players</span>`;
        button.title = `${division.name}: ${teamCount} teams, ${playerCount} players`;
        button.addEventListener("click", async () => {
            if (division.id === activeDivisionId) return;
            activeDivisionId = division.id;
            playersCache = [];
            selectedPlayerKeys = new Set();
            try {
                const config = await getAuctionConfig();
                const next = setActiveDivisionId(config, activeDivisionId);
                saveAuctionConfig(next);
            } catch (_) {
                // still switch local view
            }
            // Load this division first, then refresh tab counts
            lastDetectedExcelColumns = [];
            await refreshPlayers();
            renderPlayersDivisionTabs();
            updateExcelColumnsHelp();
        });
        playersDivisionTabs.appendChild(button);
    });
    const active = divisionsCache.find((division) => division.id === activeDivisionId);
    if (playersDivisionLabel) {
        const teamCount = getTeamsCountForDivision(activeDivisionId);
        const playerCount = getPlayersCountForDivision(activeDivisionId);
        playersDivisionLabel.textContent = `Active: ${active?.name || "—"} — ${teamCount} teams, ${playerCount} players`;
    }
}

function setStatus(message, isError = false) {
    if (!importStatus) return;
    importStatus.textContent = message || "";
    importStatus.style.color = isError ? "#b42318" : "";
}

function loadAuctionTeamLookup() {
    const map = new Map();
    try {
        const saved = JSON.parse(localStorage.getItem(getAuctionDataStorageKey(activeDivisionId)) || "null");
        const teams = saved?.auctionState?.teams || [];
        teams.forEach((team) => {
            map.set(String(team.team_id), {
                id: team.team_id,
                name: team.team_name || `Team ${team.team_id}`,
                color: team.color || "#16325c"
            });
        });
    } catch (_) {
        // ignore
    }

    if (!map.size) {
        try {
            const config = JSON.parse(localStorage.getItem("auctionConfig") || "null");
            const division =
                (config?.divisions || []).find((item) => item.id === activeDivisionId) ||
                (config?.divisions || [])[0];
            const teams =
                Array.isArray(division?.teams) && division.teams.length
                    ? division.teams
                    : config?.activeDivisionId === activeDivisionId
                      ? config?.teams || []
                      : [];
            teams.forEach((team) => {
                map.set(String(team.team_id), {
                    id: team.team_id,
                    name: team.team_name || `Team ${team.team_id}`,
                    color: team.color || "#16325c"
                });
            });
        } catch (_) {
            // ignore
        }
    }
    return map;
}

function loadAuctionPlayerOverlay() {
    try {
        const saved = JSON.parse(localStorage.getItem(getAuctionDataStorageKey()) || "null");
        const allPlayers = saved?.auctionState?.allPlayers || saved?.auctionState?.players || [];
        const byKey = new Map();
        allPlayers.forEach((player) => {
            if (!player) return;
            byKey.set(String(player.id), player);
            if (player.code) byKey.set(String(player.code), player);
        });
        return byKey;
    } catch (_) {
        return new Map();
    }
}

function mergeAuctionOutcome(player, overlay = null) {
    const liveMap = overlay || loadAuctionPlayerOverlay();
    const live = liveMap.get(String(player.id)) || liveMap.get(String(player.code));
    if (!live) {
        return {
            ...player,
            teamName: getTeamName(player.team),
            soldFor: player.status === "sold" ? player.finalPrice : null
        };
    }

    const status = live.status || player.status || "not-auctioned";
    const teamId = live.team ?? player.team ?? null;
    const finalPrice = live.finalPrice ?? player.finalPrice ?? null;
    return {
        ...player,
        status,
        team: teamId,
        finalPrice,
        teamName: getTeamName(teamId),
        soldFor: status === "sold" ? finalPrice : null,
        bids: Array.isArray(live.bids) ? live.bids : player.bids
    };
}

function getTeamName(teamId) {
    if (teamId == null || teamId === "") return "";
    return teamLookup.get(String(teamId))?.name || `Team ${teamId}`;
}

function getTeamColor(teamId) {
    if (teamId == null || teamId === "") return "#73849a";
    return teamLookup.get(String(teamId))?.color || "#16325c";
}

function enrichPlayers(list) {
    teamLookup = loadAuctionTeamLookup();
    const overlay = loadAuctionPlayerOverlay();
    return (list || []).map((player) => mergeAuctionOutcome(normalizePlayerRecord(player), overlay));
}

function resolvePhotoSrc(photo) {
    const value = String(photo || "").trim();
    if (!value) return "../assets/placeholder.png";
    if (typeof isIdbPhotoRef === "function" && isIdbPhotoRef(value)) {
        return "../assets/placeholder.png";
    }
    if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
    if (value.startsWith("../") || value.startsWith("/")) return value;
    // Pages under /config/ need ../ for root-relative project/asset paths
    if (value.startsWith("assets/") || value.startsWith("data-project/")) return `../${value}`;
    return value;
}

function isSaasPhotoMode() {
    return Boolean(typeof usesTournamentDb === "function" && usesTournamentDb());
}

async function refreshOfflinePhotoStatus() {
    if (typeof countCachedPlayerPhotos !== "function") return;
    try {
        const saas = isSaasPhotoMode();
        const ready = saas
            ? true
            : typeof checkAssetsApiReady === "function"
              ? await checkAssetsApiReady()
              : false;
        const cached = await countCachedPlayerPhotos(playersCache, activeDivisionId);
        const stored = playersCache.filter((player) => Boolean(player.photoKey)).length;
        const missing = Math.max(0, playersCache.length - cached);
        if (saas) {
            if (missing > 0) {
                setOfflineStatus(
                    `Photos in cloud: ${stored} stored / ${playersCache.length} players · ${missing} still need Save photos (copies into R2).`,
                    true
                );
                return;
            }
            setOfflineStatus(
                `Photos in cloud: ${stored} stored / ${playersCache.length} players · loaded from this tournament`
            );
            return;
        }
        if (!ready) {
            setOfflineStatus(
                `Photos on disk: ${cached} / ${playersCache.length} · start with node server.js to save into assets/`,
                true
            );
            return;
        }
        if (missing > 0) {
            setOfflineStatus(
                `Photos on disk: ${cached} / ${playersCache.length} · ${missing} missing. Use “Upload photo files” (name files like CPL-R-01.jpg) or re-import a pack with media.`,
                true
            );
            return;
        }
        setOfflineStatus(`Photos on disk: ${cached} / ${playersCache.length} · server ready`);
    } catch (_) {
        setOfflineStatus(
            isSaasPhotoMode()
                ? "Photo cloud store unavailable."
                : "Photo store unavailable. Start with: node server.js",
            true
        );
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function getActiveDivisionPlayerFields() {
    const division = divisionsCache.find((item) => item.id === activeDivisionId);
    if (typeof normalizePlayerFields === "function") {
        return normalizePlayerFields(division?.playerFields);
    }
    return division?.playerFields || {};
}

function applyPlayersFormFieldPolicy() {
    const fields = getActiveDivisionPlayerFields();
    const map = {
        role: "form-role",
        currentClub: "form-club",
        mobile: "form-mobile",
        age: "form-age",
        ageCategory: "form-age-category",
        battingStyle: "form-batting",
        bowlingStyle: "form-bowling",
        basePrice: "form-base-price",
        photo: "form-photo"
    };
    Object.keys(map).forEach((key) => {
        const wrap = document.querySelector(`[data-player-field="${key}"]`);
        const input = document.getElementById(map[key]);
        const visible = fields[key]?.visible !== false;
        const required = visible && fields[key]?.required === true;
        if (wrap) wrap.hidden = !visible;
        if (input) {
            if (required) input.setAttribute("required", "required");
            else input.removeAttribute("required");
        }
    });
}

function validateRequiredPlayerFields(player) {
    const fields = getActiveDivisionPlayerFields();
    const checks = [
        { key: "role", value: player.role, label: "Role" },
        { key: "currentClub", value: player.currentClub, label: "Location" },
        { key: "mobile", value: player.mobile, label: "Mobile" },
        { key: "age", value: player.age, label: "Age" },
        { key: "ageCategory", value: player.ageCategory, label: "Age category" },
        { key: "battingStyle", value: player.battingStyle, label: "Batting" },
        { key: "bowlingStyle", value: player.bowlingStyle, label: "Bowling" },
        { key: "basePrice", value: player.basePrice, label: "Base price" },
        { key: "photo", value: player.photo, label: "Photo" }
    ];
    for (const item of checks) {
        const required = fields[item.key]?.visible !== false && fields[item.key]?.required === true;
        if (!required) continue;
        const empty =
            item.value == null ||
            item.value === "" ||
            item.value === "N/A";
        if (empty) return `${item.label} is required for this division.`;
    }
    return null;
}

function getFormPlayer() {
    const code = document.getElementById("form-code").value.trim();
    const baseRaw = document.getElementById("form-base-price").value.trim();
    const basePrice = baseRaw
        ? (typeof parseMoneyInput === "function" ? parseMoneyInput(baseRaw) : Number(baseRaw))
        : null;

    return createEmptyPlayerDraft({
        code,
        id: codeToNumericId(code, playersCache.length),
        name: document.getElementById("form-name").value.trim(),
        role: document.getElementById("form-role").value,
        category: document.getElementById("form-category").value.trim(),
        currentClub: document.getElementById("form-club").value.trim(),
        mobile: document.getElementById("form-mobile").value.trim(),
        age: document.getElementById("form-age").value,
        ageCategory: document.getElementById("form-age-category").value.trim(),
        battingStyle: document.getElementById("form-batting").value.trim() || "N/A",
        bowlingStyle: document.getElementById("form-bowling").value.trim() || "N/A",
        basePrice: Number.isFinite(basePrice) ? basePrice : null,
        status: document.getElementById("form-status").value || "not-auctioned",
        photo: document.getElementById("form-photo").value.trim()
    });
}

function fillForm(player) {
    editingKey = player ? String(player.code || player.id) : "";
    document.getElementById("player-edit-key").value = editingKey;
    document.getElementById("form-code").value = player?.code || "";
    document.getElementById("form-name").value = player?.name || "";
    document.getElementById("form-role").value = normalizeRoleName(player?.role || "Batter");
    document.getElementById("form-category").value = player?.category || "RISING STAR";
    document.getElementById("form-club").value = player?.currentClub || "";
    document.getElementById("form-mobile").value = player?.mobile || "";
    document.getElementById("form-age").value = player?.age ?? "";
    document.getElementById("form-age-category").value = player?.ageCategory || "";
    document.getElementById("form-batting").value = player?.battingStyle || "N/A";
    document.getElementById("form-bowling").value = player?.bowlingStyle || "N/A";
    document.getElementById("form-base-price").value = player?.basePrice != null ? String(player.basePrice) : "";
    document.getElementById("form-status").value = player?.status || "not-auctioned";
    document.getElementById("form-team-name").value = player?.teamName || (player?.status === "sold" ? getTeamName(player.team) : "");
    document.getElementById("form-sold-for").value =
        player?.soldFor != null && typeof formatMoney === "function"
            ? formatMoney(player.soldFor)
            : (player?.soldFor != null ? String(player.soldFor) : "");
    document.getElementById("form-photo").value = player?.photo || "";
    formPhotoPreview.src = resolvePhotoSrc(player?.photo);
    if (player?.photo && typeof resolvePlayerPhotoSrc === "function") {
        resolvePlayerPhotoSrc(player.photo, { divisionId: activeDivisionId, fromPrefix: "../" })
            .then((src) => {
                formPhotoPreview.src = src;
            })
            .catch(() => {});
    }
    formPhotoPreview.onerror = function () {
        this.src = "../assets/placeholder.png";
    };

    if (formTitle) formTitle.textContent = player ? `Edit player · ${player.name}` : "Add player";
    if (deleteCurrentBtn) deleteCurrentBtn.hidden = !player;
    renderPlayersTable();
}

function resetForm() {
    fillForm(null);
    document.getElementById("form-role").value = "Batter";
    document.getElementById("form-category").value = "RISING STAR";
    document.getElementById("form-batting").value = "N/A";
    document.getElementById("form-bowling").value = "N/A";
    document.getElementById("form-status").value = "not-auctioned";
}

function updateFilterOptions() {
    const categories = [...new Set(playersCache.map((p) => normalizeCategoryName(p.category)).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    const current = categoryFilter.value;
    categoryFilter.innerHTML = `<option value="">All categories</option>` +
        categories.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(displayCategoryName(name))}</option>`).join("");
    if (categories.includes(current)) categoryFilter.value = current;

    if (categoryOptions) {
        categoryOptions.innerHTML = categories
            .map((name) => `<option value="${escapeHtml(name)}"></option>`)
            .join("");
    }

    const teams = [...teamLookup.values()].sort((a, b) => a.name.localeCompare(b.name));
    const currentTeam = teamFilter.value;
    teamFilter.innerHTML = `<option value="">All teams</option>` +
        teams.map((team) => `<option value="${escapeHtml(String(team.id))}">${escapeHtml(team.name)}</option>`).join("");
    if ([...teamLookup.keys()].includes(currentTeam)) teamFilter.value = currentTeam;
}

function getFilteredPlayers() {
    const query = String(playersSearch.value || "").trim().toLowerCase();
    const category = String(categoryFilter.value || "").trim();
    const role = String(roleFilter.value || "").trim();
    const status = String(statusFilter?.value || "").trim();
    const teamId = String(teamFilter?.value || "").trim();

    return playersCache.filter((player) => {
        if (category && normalizeCategoryName(player.category) !== normalizeCategoryName(category)) {
            return false;
        }
        if (role && normalizeRoleName(player.role) !== normalizeRoleName(role)) {
            return false;
        }
        if (status && String(player.status || "not-auctioned") !== status) {
            return false;
        }
        if (teamId && String(player.team) !== teamId) {
            return false;
        }
        if (!query) return true;
        const haystack = [
            player.name,
            player.code,
            player.id,
            player.role,
            player.category,
            player.currentClub,
            player.mobile,
            player.age,
            player.ageCategory,
            player.battingStyle,
            player.bowlingStyle,
            player.status,
            player.teamName
        ].join(" ").toLowerCase();
        return haystack.includes(query);
    });
}

function playerRowKey(player) {
    return String(player?.code || player?.id || "");
}

const PLAYERS_TABLE_DATA_COLUMNS = [
    { key: "photo", label: "Photo" },
    { key: "role", label: "Role" },
    { key: "age", label: "Age" },
    { key: "ageCategory", label: "Age cat." },
    { key: "mobile", label: "Mobile" },
    { key: "currentClub", label: "Location" },
    { key: "basePrice", label: "Base" },
    { key: "battingStyle", label: "Batting" },
    { key: "bowlingStyle", label: "Bowling" }
];

function playerFieldHasValue(player, fieldKey) {
    if (typeof playerRecordHasFieldValue === "function") {
        return playerRecordHasFieldValue(player, fieldKey);
    }
    if (!player) return false;
    const value =
        typeof getPlayerFieldDisplayValue === "function"
            ? getPlayerFieldDisplayValue(player, fieldKey)
            : player[fieldKey];
    if (value == null) return false;
    const text = String(value).trim();
    if (!text || text === "—" || text.toUpperCase() === "N/A") return false;
    if (fieldKey === "photo" && /placeholder\.png/i.test(text)) return false;
    return true;
}

function mapExcelHeadersToFieldKeys(headers) {
    const keys = new Set();
    const aliases =
        typeof PLAYER_FIELD_ALIASES === "object" && PLAYER_FIELD_ALIASES ? PLAYER_FIELD_ALIASES : {};
    (headers || []).forEach((header) => {
        const normalized =
            typeof normalizeHeaderKey === "function"
                ? normalizeHeaderKey(header)
                : String(header || "")
                      .trim()
                      .toLowerCase();
        if (typeof isKnownSpreadsheetHeader === "function" && !isKnownSpreadsheetHeader(header)) {
            const key =
                String(header).startsWith("x_")
                    ? header
                    : typeof toCustomFieldKey === "function"
                      ? toCustomFieldKey(header)
                      : header;
            keys.add(key);
            return;
        }
        Object.keys(aliases).forEach((fieldKey) => {
            const list = aliases[fieldKey] || [];
            if (list.some((alias) => normalizeHeaderKey(alias) === normalized)) {
                keys.add(fieldKey);
            }
        });
    });
    return keys;
}

/** Data columns follow Config playerFields (synced from Excel/roster), with Excel/data as fallback. */
function getDynamicPlayersDataColumns(players = playersCache) {
    const fields = getActiveDivisionPlayerFields();
    const excelKeys = mapExcelHeadersToFieldKeys(lastDetectedExcelColumns);
    const baseColumns = PLAYERS_TABLE_DATA_COLUMNS.filter(({ key }) => {
        if (fields?.[key]?.visible === true) return true;
        if (excelKeys.has(key)) return true;
        return (players || []).some((player) => playerFieldHasValue(player, key));
    });

    const knownKeys = new Set(baseColumns.map((col) => col.key));
    const customColumns = [];
    const addCustom = (key, label) => {
        if (!key || knownKeys.has(key)) return;
        knownKeys.add(key);
        customColumns.push({
            key,
            label:
                label ||
                fields?.[key]?.label ||
                (typeof getPlayerFieldLabel === "function"
                    ? getPlayerFieldLabel(key, fields)
                    : key)
        });
    };

    Object.keys(fields || {}).forEach((key) => {
        if (!(fields[key]?.custom === true || String(key).startsWith("x_"))) return;
        if (fields[key]?.visible === false && !excelKeys.has(key)) return;
        if (fields[key]?.visible === true || excelKeys.has(key) || (players || []).some((p) => playerFieldHasValue(p, key))) {
            addCustom(key, fields[key]?.label);
        }
    });
    excelKeys.forEach((key) => {
        if (!String(key).startsWith("x_")) return;
        addCustom(key);
    });
    (players || []).forEach((player) => {
        Object.keys(player?.customFields || {}).forEach((key) => {
            if (playerFieldHasValue(player, key)) addCustom(key);
        });
    });

    return [...baseColumns, ...customColumns];
}

/** Keep Config “Show on auction” toggles aligned with Excel/roster for this division. */
async function syncConfigPlayerFieldsFromRoster() {
    if (typeof applyPlayerFieldsFromSpreadsheet !== "function") return null;
    const presence =
        typeof buildPlayerFieldPresenceFromRoster === "function"
            ? buildPlayerFieldPresenceFromRoster(playersCache, lastDetectedExcelColumns)
            : null;
    if (!presence) return null;

    let config = await getAuctionConfig();
    if (typeof setActiveDivisionId === "function") {
        config = setActiveDivisionId(config, activeDivisionId);
    }
    const beforeDiv = typeof getActiveDivision === "function" ? getActiveDivision(config) : null;
    const before = JSON.stringify(beforeDiv?.playerFields || {});
    config = applyPlayerFieldsFromSpreadsheet(config, activeDivisionId, presence);
    const afterDiv = typeof getActiveDivision === "function" ? getActiveDivision(config) : null;
    const after = JSON.stringify(afterDiv?.playerFields || {});
    if (before !== after) {
        saveAuctionConfig(config);
        if (typeof flushProjectPersistQueue === "function") {
            await flushProjectPersistQueue();
        }
    }
    divisionsCache = listDivisions(config);
    return config;
}

function getPlayersTableHeadRow() {
    return document.getElementById("players-table-head-row");
}

function renderPlayersTableHeader(dataColumns) {
    const headRow = getPlayersTableHeadRow();
    if (!headRow) return;
    const dataHeads = dataColumns
        .map((col) => `<th data-col-field="${escapeHtml(col.key)}">${escapeHtml(col.label)}</th>`)
        .join("");
    headRow.innerHTML = `
        <th class="col-select">
            <input id="select-all-players" type="checkbox" title="Select all shown" aria-label="Select all shown players">
        </th>
        <th>Code</th>
        <th>Player</th>
        <th>Category</th>
        ${dataHeads}
        <th>Status</th>
        <th>Team</th>
        <th>Sold for</th>
        <th>Actions</th>
    `;
    const selectAll = document.getElementById("select-all-players");
    selectAll?.addEventListener("change", () => {
        const filtered = getFilteredPlayers();
        if (selectAll.checked) {
            filtered.forEach((player) => {
                const key = playerRowKey(player);
                if (key) selectedPlayerKeys.add(key);
            });
        } else {
            filtered.forEach((player) => selectedPlayerKeys.delete(playerRowKey(player)));
        }
        renderPlayersTable();
    });
}

function formatPlayersTableCell(player, fieldKey) {
    if (fieldKey === "photo") {
        return `<img src="${resolvePhotoSrc(player.photo)}" data-photo-ref="${escapeHtml(player.photo || "")}" alt="" onerror="this.src='../assets/placeholder.png'">`;
    }
    if (fieldKey === "basePrice") {
        if (player.basePrice != null && typeof showAmount === "function") {
            return escapeHtml(showAmount(player.basePrice));
        }
        return escapeHtml(player.basePrice ?? "—");
    }
    const value =
        typeof getPlayerFieldDisplayValue === "function"
            ? getPlayerFieldDisplayValue(player, fieldKey)
            : player?.[fieldKey];
    if (value == null || String(value).trim() === "") return "—";
    return escapeHtml(String(value));
}

function syncBulkDeleteControls(filtered = getFilteredPlayers()) {
    const visibleKeys = filtered.map(playerRowKey).filter(Boolean);
    const selectedVisible = visibleKeys.filter((key) => selectedPlayerKeys.has(key));
    const selectAllPlayersEl = document.getElementById("select-all-players");
    if (bulkDeleteBtn) {
        const count = selectedPlayerKeys.size;
        bulkDeleteBtn.disabled = count === 0;
        bulkDeleteBtn.textContent = count ? `Delete selected (${count})` : "Delete selected";
    }
    if (selectAllPlayersEl) {
        selectAllPlayersEl.checked = visibleKeys.length > 0 && selectedVisible.length === visibleKeys.length;
        selectAllPlayersEl.indeterminate =
            selectedVisible.length > 0 && selectedVisible.length < visibleKeys.length;
    }
}

function renderPlayersTable() {
    const filtered = getFilteredPlayers();
    const validKeys = new Set(playersCache.map(playerRowKey).filter(Boolean));
    selectedPlayerKeys = new Set([...selectedPlayerKeys].filter((key) => validKeys.has(key)));

    const breakdown = formatCategoryBreakdown(playersCache);
    const selectedNote = selectedPlayerKeys.size ? ` · ${selectedPlayerKeys.size} selected` : "";
    playersCount.textContent =
        `${playersCache.length} player${playersCache.length === 1 ? "" : "s"}` +
        (filtered.length !== playersCache.length ? ` · showing ${filtered.length}` : "") +
        selectedNote +
        (breakdown ? ` · ${breakdown}` : "");

    const dataColumns = getDynamicPlayersDataColumns(playersCache);
    // Fixed: select + code + player + category + status + team + sold + actions (=8)
    const colCount = 8 + dataColumns.length;
    renderPlayersTableHeader(dataColumns);

    if (!filtered.length) {
        playersTableBody.innerHTML = `
            <tr>
                <td colspan="${colCount}" style="text-align:center;color:#73849a;padding:28px;white-space:normal;">
                    No players found. Reload data/players.json, upload CSV/Excel, or add a player.
                </td>
            </tr>
        `;
        syncBulkDeleteControls(filtered);
        return;
    }

    playersTableBody.innerHTML = filtered.map((player) => {
        const key = playerRowKey(player);
        const isEditing = String(key) === String(editingKey);
        const isSelected = selectedPlayerKeys.has(key);
        const soldText = player.soldFor != null && typeof showAmount === "function"
            ? showAmount(player.soldFor)
            : (player.soldFor != null ? String(player.soldFor) : "—");
        const teamName = player.teamName || (player.status === "sold" ? getTeamName(player.team) : "");
        const teamColor = getTeamColor(player.team);
        const status = player.status || "not-auctioned";
        const dataCells = dataColumns
            .map(
                (col) =>
                    `<td data-col-field="${escapeHtml(col.key)}">${formatPlayersTableCell(player, col.key)}</td>`
            )
            .join("");
        return `
            <tr class="${isEditing ? "is-editing" : ""}${isSelected ? " is-selected" : ""}" data-row-key="${escapeHtml(key)}">
                <td class="col-select">
                    <input type="checkbox" class="row-select" data-select-key="${escapeHtml(key)}" ${isSelected ? "checked" : ""} aria-label="Select ${escapeHtml(player.name || key)}">
                </td>
                <td>${escapeHtml(player.code || player.id)}</td>
                <td class="player-cell"><strong>${escapeHtml(player.name)}</strong></td>
                <td>${escapeHtml(displayCategoryName(player.category))}</td>
                ${dataCells}
                <td><span class="status-pill" data-status="${escapeHtml(status)}">${escapeHtml(status)}</span></td>
                <td>
                    <span class="team-pill" data-empty="${teamName ? "false" : "true"}" style="${teamName ? `background:${teamColor}22;color:${teamColor}` : ""}">
                        ${escapeHtml(teamName || "—")}
                    </span>
                </td>
                <td>${escapeHtml(soldText)}</td>
                <td>
                    <div class="row-actions">
                        <button type="button" class="edit-btn" data-edit="${escapeHtml(key)}">Edit</button>
                        <button type="button" class="delete-btn" data-delete="${escapeHtml(key)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    syncBulkDeleteControls(filtered);

    if (typeof hydratePhotoElements === "function") {
        hydratePhotoElements(playersTableBody, {
            divisionId: activeDivisionId,
            fromPrefix: "../"
        }).catch(() => {});
    }
    refreshOfflinePhotoStatus();
}

function persistAndRefresh(list, message, options = {}) {
    const saved = saveStoredPlayers(list, activeDivisionId, options);
    playersCache = enrichPlayers(saved);
    updateFilterOptions();
    renderPlayersTable();
    renderPlayersDivisionTabs();
    if (message) setStatus(message);
    return saved;
}

async function persistAndRefreshToDisk(list, message, options = {}) {
    const saved =
        typeof saveStoredPlayersToDisk === "function"
            ? await saveStoredPlayersToDisk(list, activeDivisionId, options)
            : saveStoredPlayers(list, activeDivisionId, options);
    playersCache = enrichPlayers(saved);
    updateFilterOptions();
    renderPlayersTable();
    renderPlayersDivisionTabs();
    if (message) setStatus(message);
    return saved;
}

async function fetchFilePlayers() {
    const response = await fetch("../data/players.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load data/players.json");
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("players.json must be an array");
    return data.map((player, index) => normalizePlayerRecord(player, index));
}

async function refreshPlayers({ preferFile = false } = {}) {
    try {
        const config = await getAuctionConfig();
        divisionsCache = typeof listDivisions === "function" ? listDivisions(config) : config.divisions || divisionsCache;
    } catch (_) {
        // keep previous divisionsCache
    }
    const divisionName =
        divisionsCache.find((division) => division.id === activeDivisionId)?.name || "division";
    try {
        if (preferFile) {
            const filePlayers = await fetchFilePlayers();
            persistAndRefresh(
                filePlayers,
                `Loaded ${filePlayers.length} players from data/players.json into ${divisionName}`
            );
            resetForm();
            applyPlayersFormFieldPolicy();
            renderPlayersDivisionTabs();
            return;
        }

        // Always use this division's own list (including empty). Never borrow Main's file pool.
        const stored = loadStoredPlayers(activeDivisionId);
        playersCache = enrichPlayers(Array.isArray(stored) ? stored : []);
        if (playersCache.length) {
            await syncConfigPlayerFieldsFromRoster();
        }
        updateFilterOptions();
        renderPlayersTable();
        applyPlayersFormFieldPolicy();
        renderPlayersDivisionTabs();
        updateExcelColumnsHelp();
        const soldCount = playersCache.filter((p) => p.status === "sold").length;
        setStatus(
            playersCache.length
                ? `Editing ${playersCache.length} players for ${divisionName}${soldCount ? ` · ${soldCount} sold in live auction` : ""}.`
                : `No players in ${divisionName} yet. Upload CSV/Excel for this division only.`
        );
    } catch (error) {
        console.error(error);
        playersCache = [];
        updateFilterOptions();
        renderPlayersTable();
        applyPlayersFormFieldPolicy();
        renderPlayersDivisionTabs();
        setStatus(error.message || "Could not load players.", true);
    }
}

function formatCategoryBreakdown(players) {
    const counts = {};
    (players || []).forEach((player) => {
        const name =
            typeof displayCategoryName === "function"
                ? displayCategoryName(player.category)
                : String(player.category || "—");
        counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
        .map(([name, count]) => `${name}: ${count}`)
        .join(" · ");
}

async function runImport(mode) {
    const file = fileInput.files?.[0];
    if (!file) {
        setStatus("Choose a CSV or Excel file first.", true);
        return;
    }

    try {
        setStatus(`Reading ${file.name}...`);
        const rows = await parseSpreadsheetFile(file);
        const detectedColumns =
            typeof getDetectedSpreadsheetColumns === "function"
                ? getDetectedSpreadsheetColumns(rows)
                : Object.keys(rows[0] || {});
        updateExcelColumnsHelp(detectedColumns);
        const hasCategoryCol = rows.some((row) => rowHasCategoryColumn?.(row));
        let config = await getAuctionConfig();

        // Turn on auction Player fields that exist in this Excel/CSV
        if (typeof detectPlayerFieldPresenceFromRows === "function" &&
            typeof applyPlayerFieldsFromSpreadsheet === "function") {
            const presence = detectPlayerFieldPresenceFromRows(rows);
            config = applyPlayerFieldsFromSpreadsheet(config, activeDivisionId, presence);
            if (typeof setActiveDivisionId === "function") {
                config = setActiveDivisionId(config, activeDivisionId);
            }
            saveAuctionConfig(config);
            if (typeof flushProjectPersistQueue === "function") {
                await flushProjectPersistQueue();
            }
            divisionsCache = listDivisions(config);
            updateExcelColumnsHelp(detectedColumns);
            applyPlayersFormFieldPolicy();
        }

        let saved = importPlayerRows(rows, { mode, config, divisionId: activeDivisionId });
        const catSummary = formatCategoryBreakdown(saved);
        const shownFields =
            typeof getExpectedSpreadsheetColumns === "function"
                ? getExpectedSpreadsheetColumns(
                      divisionsCache.find((d) => d.id === activeDivisionId)?.playerFields
                  ).join(", ")
                : "";
        const risingCount = saved.filter(
            (player) => normalizeCategoryName(player.category) === "RISING STAR"
        ).length;
        const mostlyRising = saved.length > 0 && risingCount / saved.length >= 0.85;
        if (!hasCategoryCol || mostlyRising) {
            setStatus(
                `Imported ${saved.length} (${mode}). ${catSummary}. ` +
                    (!hasCategoryCol
                        ? "No CATEGORY column detected — almost everyone may default to Rising Star. "
                        : "Most players are Rising Star. ") +
                    "Use “Fix categories from ID (CPL-R/K/E)” if IDs encode the pool, then Start New Auction.",
                true
            );
        } else {
            setStatus(`Imported ${saved.length} players (${mode}). ${catSummary}. Saving photos…`);
        }
        if (typeof cachePlayersPhotos === "function") {
            try {
                const result = await cachePlayersPhotos(saved, activeDivisionId, {
                    assetPrefix: "../",
                    onProgress: (done, total, cached) => {
                        setOfflineStatus(`Saving photos ${done}/${total} (written ${cached})…`);
                    }
                });
                saved = saveStoredPlayers(result.players, activeDivisionId);
                const photoLabel = result.mode === "r2" ? "stored in cloud" : "saved";
                setStatus(
                    `Imported ${saved.length} players (${mode}). ${formatCategoryBreakdown(saved)}. ` +
                        `Photos ${photoLabel}: ${result.cached}` +
                        (result.failed ? `, ${result.failed} skipped` : "") +
                        `. Config “Show on auction” synced${shownFields ? ` (${shownFields})` : ""}. Start New Auction to apply on the desk.`
                );
                refreshOfflinePhotoStatus();
            } catch (photoError) {
                setStatus(
                    `Imported ${saved.length} players (${mode}). ${catSummary}. Photos not saved yet — ${
                        photoError.message ||
                        (isSaasPhotoMode()
                            ? "click Save photos to upload into cloud storage."
                            : "start node server.js and click Save photos to assets.")
                    } Config fields synced; then Start New Auction.`,
                    true
                );
            }
        } else {
            setStatus(
                `Imported ${saved.length} players (${mode}). ${catSummary}. Config “Show on auction” synced${shownFields ? ` (${shownFields})` : ""}. Start New Auction to load on the desk.`
            );
        }
        playersCache = enrichPlayers(saved);
        updateFilterOptions();
        renderPlayersTable();
        applyPlayersFormFieldPolicy();
        renderPlayersDivisionTabs();
        resetForm();
    } catch (error) {
        console.error(error);
        setStatus(error.message || "Import failed.", true);
    }
}

function downloadTextFile(filename, text, type = "text/plain") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

function toCsvValue(value) {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function exportPlayersCsv(list) {
    const fieldKeys = ["id", "name", "category", ...((typeof getVisiblePlayerFieldKeys === "function"
        ? getVisiblePlayerFieldKeys(getActiveDivisionConfigSlice()?.playerFields)
        : ["role", "mobile", "age", "currentClub", "photo", "ageCategory", "battingStyle", "bowlingStyle", "basePrice"]))];
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
    const ordered = order.filter((key) => fieldKeys.includes(key));
    const headerMap =
        typeof PLAYER_FIELD_EXPORT_HEADERS === "object" && PLAYER_FIELD_EXPORT_HEADERS
            ? PLAYER_FIELD_EXPORT_HEADERS
            : {
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
    const headers = [...ordered.map((key) => headerMap[key] || key), "Status"];
    const lines = [headers.join(",")];
    list.forEach((player) => {
        const values = ordered.map((key) => {
            if (key === "id") return player.code || player.id;
            if (key === "name") return player.name;
            if (key === "role") return player.role;
            if (key === "category") return player.category;
            if (key === "currentClub") return player.currentClub;
            if (key === "mobile") return player.mobile;
            if (key === "age") return player.age;
            if (key === "ageCategory") return player.ageCategory;
            if (key === "battingStyle") return player.battingStyle;
            if (key === "bowlingStyle") return player.bowlingStyle;
            if (key === "basePrice") return player.basePrice;
            if (key === "photo") return player.photo;
            return "";
        });
        values.push(player.status);
        lines.push(values.map(toCsvValue).join(","));
    });
    downloadTextFile("players-export.csv", lines.join("\n"), "text/csv");
}

function findPlayer(key) {
    return playersCache.find(
        (item) => String(item.code) === String(key) || String(item.id) === String(key)
    );
}

async function deletePlayerByKey(key) {
    const victim = findPlayer(key);
    const code = victim ? String(victim.code || victim.id || key) : String(key);
    try {
        if (typeof deletePlayerPhotoFile === "function") {
            await deletePlayerPhotoFile(activeDivisionId, code, victim?.photo, victim?.photoKey).catch(() => {});
        }
        const next = playersCache.filter(
            (player) => String(player.code) !== String(key) && String(player.id) !== String(key)
        );
        selectedPlayerKeys.delete(String(key));
        await persistAndRefreshToDisk(next, "Player deleted from list and disk.", {
            resetAuction: true
        });
        if (String(editingKey) === String(key)) resetForm();
        refreshOfflinePhotoStatus();
    } catch (error) {
        setStatus(error.message || "Could not delete player from disk.", true);
    }
}

async function deleteSelectedPlayers() {
    const keys = [...selectedPlayerKeys];
    if (!keys.length) {
        setStatus("Select at least one player to delete.", true);
        return;
    }
    if (
        !confirm(
            `Delete ${keys.length} selected player${keys.length === 1 ? "" : "s"} from this division and from disk (players.json + photos)?`
        )
    ) {
        return;
    }

    const keySet = new Set(keys.map(String));
    const victims = playersCache.filter(
        (player) => keySet.has(String(player.code)) || keySet.has(String(player.id))
    );

    try {
        if (typeof deletePlayerPhotoFile === "function") {
            for (const player of victims) {
                const code = String(player.code || player.id || "");
                if (!code) continue;
                await deletePlayerPhotoFile(activeDivisionId, code, player.photo, player.photoKey).catch(() => {});
            }
        }

        const next = playersCache.filter(
            (player) => !keySet.has(String(player.code)) && !keySet.has(String(player.id))
        );
        if (editingKey && keySet.has(String(editingKey))) resetForm();
        selectedPlayerKeys = new Set();
        await persistAndRefreshToDisk(
            next,
            `Deleted ${victims.length} player${victims.length === 1 ? "" : "s"} from list and disk.`,
            { resetAuction: true }
        );
        refreshOfflinePhotoStatus();
    } catch (error) {
        setStatus(error.message || "Could not delete selected players from disk.", true);
    }
}

importReplaceBtn.addEventListener("click", () => runImport("replace"));
importMergeBtn.addEventListener("click", () => runImport("merge"));
reloadFileBtn.addEventListener("click", () => {
    if (playersCache.length && !confirm("Replace the current editor list with data/players.json?")) return;
    refreshPlayers({ preferFile: true });
});

downloadTemplateBtn.addEventListener("click", () => {
    const fields = getActiveDivisionConfigSlice()?.playerFields;
    downloadTextFile(
        "players-template.csv",
        getPlayersTemplateCsv(fields),
        "text/csv"
    );
});

exportJsonBtn.addEventListener("click", () => {
    downloadTextFile("players.json", JSON.stringify(playersCache, null, 2), "application/json");
});

exportCsvBtn.addEventListener("click", () => {
    exportPlayersCsv(playersCache);
});

clearPlayersBtn.addEventListener("click", async () => {
    if (!playersCache.length) {
        setStatus("Player list is already empty.");
        return;
    }
    if (
        !confirm(
            "Clear all players for this division? Photo files under assets/players-photo for this division will also be deleted."
        )
    ) {
        return;
    }
    try {
        if (typeof deleteDivisionOfflineMedia === "function") {
            await deleteDivisionOfflineMedia(activeDivisionId);
        }
        if (typeof clearStoredPlayersFromDisk === "function") {
            await clearStoredPlayersFromDisk(activeDivisionId);
        } else {
            clearStoredPlayers(activeDivisionId);
            if (typeof flushProjectPersistQueue === "function") {
                await flushProjectPersistQueue();
            }
        }
        playersCache = [];
        selectedPlayerKeys = new Set();
        updateFilterOptions();
        renderPlayersTable();
        resetForm();
        setStatus("Player list, players.json, and division photo folder cleared on disk.");
        refreshOfflinePhotoStatus();
    } catch (error) {
        setStatus(error.message || "Could not clear players from disk.", true);
    }
});

playersSearch.addEventListener("input", renderPlayersTable);
categoryFilter.addEventListener("change", renderPlayersTable);
roleFilter.addEventListener("change", renderPlayersTable);
statusFilter?.addEventListener("change", renderPlayersTable);
teamFilter?.addEventListener("change", renderPlayersTable);

bulkDeleteBtn?.addEventListener("click", () => {
    deleteSelectedPlayers();
});

playersTableBody.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".row-select");
    if (!checkbox) return;
    const key = String(checkbox.dataset.selectKey || "");
    if (!key) return;
    if (checkbox.checked) selectedPlayerKeys.add(key);
    else selectedPlayerKeys.delete(key);
    const row = checkbox.closest("tr");
    if (row) row.classList.toggle("is-selected", checkbox.checked);
    syncBulkDeleteControls();
    const filtered = getFilteredPlayers();
    const selectedNote = selectedPlayerKeys.size ? ` · ${selectedPlayerKeys.size} selected` : "";
    const breakdown = formatCategoryBreakdown(playersCache);
    playersCount.textContent =
        `${playersCache.length} player${playersCache.length === 1 ? "" : "s"}` +
        (filtered.length !== playersCache.length ? ` · showing ${filtered.length}` : "") +
        selectedNote +
        (breakdown ? ` · ${breakdown}` : "");
});

document.getElementById("form-photo").addEventListener("input", (event) => {
    formPhotoPreview.src = resolvePhotoSrc(event.target.value);
});

newPlayerBtn.addEventListener("click", () => {
    resetForm();
    document.getElementById("player-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
});

deleteCurrentBtn.addEventListener("click", () => {
    if (!editingKey) return;
    if (!confirm("Delete this player?")) return;
    deletePlayerByKey(editingKey);
});

playersTableBody.addEventListener("click", (event) => {
    const editKey = event.target.closest("[data-edit]")?.dataset.edit;
    const deleteKey = event.target.closest("[data-delete]")?.dataset.delete;

    if (editKey) {
        const player = findPlayer(editKey);
        if (player) {
            fillForm(player);
            document.getElementById("player-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
    }

    if (deleteKey) {
        if (!confirm("Delete this player?")) return;
        deletePlayerByKey(deleteKey);
    }
});

playerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const draft = getFormPlayer();
    if (!draft.name || !draft.code) {
        setStatus("Code and player name are required.", true);
        return;
    }
    const requiredError = validateRequiredPlayerFields(draft);
    if (requiredError) {
        setStatus(requiredError, true);
        return;
    }

    // Preserve numeric id when editing the same code
    if (editingKey) {
        const existing = findPlayer(editingKey);
        if (existing) {
            draft.id = existing.id;
            if (String(existing.code) !== String(draft.code)) {
                // code changed: keep new mapped id unless collision
                const collision = playersCache.find(
                    (item) => String(item.code) === String(draft.code) && String(item.id) !== String(existing.id)
                );
                if (collision) {
                    setStatus(`Code ${draft.code} already exists.`, true);
                    return;
                }
            } else {
                draft.id = existing.id;
            }
        }
        // Remove old key if code changed
        playersCache = playersCache.filter(
            (item) => String(item.code) !== String(editingKey) && String(item.id) !== String(editingKey)
        );
    }

    const withoutDup = playersCache.filter(
        (item) => String(item.code) !== String(draft.code) && String(item.id) !== String(draft.id)
    );
    withoutDup.push(normalizePlayerRecord(draft, withoutDup.length));
    withoutDup.sort((a, b) => Number(a.id) - Number(b.id));
    persistAndRefresh(withoutDup, `Saved ${draft.name}.`);
    fillForm(findPlayer(draft.code || draft.id));
});

resetFormBtn.addEventListener("click", resetForm);

fixCategoriesFromIdBtn?.addEventListener("click", () => {
    if (!playersCache.length) {
        setStatus("No players to fix.", true);
        return;
    }
    if (typeof categoryFromPlayerCode !== "function") {
        setStatus("Category-from-ID helper is unavailable. Hard-refresh the page.", true);
        return;
    }
    let changed = 0;
    const next = playersCache.map((player) => {
        const fromCode = categoryFromPlayerCode(player.code || player.id);
        if (!fromCode || normalizeCategoryName(player.category) === fromCode) return player;
        changed += 1;
        return { ...player, category: fromCode };
    });
    if (!changed) {
        setStatus(`No changes. Categories already match IDs. ${formatCategoryBreakdown(playersCache)}`);
        return;
    }
    persistAndRefresh(
        next,
        `Updated ${changed} player categor${changed === 1 ? "y" : "ies"} from ID. ${formatCategoryBreakdown(next)}. Start New Auction to apply on the desk.`
    );
});

cachePhotosBtn?.addEventListener("click", async () => {
    if (!playersCache.length) {
        setOfflineStatus("No players to save.", true);
        return;
    }
    try {
        const saas = isSaasPhotoMode();
        setOfflineStatus(saas ? "Uploading photos to cloud storage…" : "Saving photos to assets…");
        const result = await cachePlayersPhotos(playersCache, activeDivisionId, {
            assetPrefix: "../",
            onProgress: (done, total, cached) => {
                setOfflineStatus(
                    `${saas ? "Uploading" : "Saving"} photos ${done}/${total} (stored ${cached})…`
                );
            }
        });
        persistAndRefresh(
            result.players,
            saas
                ? `Stored in cloud: ${result.cached} photos, ${result.failed} skipped.`
                : `Saved to assets: ${result.cached} new, ${result.failed} skipped.`
        );
        await refreshOfflinePhotoStatus();
    } catch (error) {
        setOfflineStatus(
            error.message ||
                (isSaasPhotoMode()
                    ? "Could not upload photos to cloud storage."
                    : "Could not save photos to assets."),
            true
        );
    }
});

uploadPhotosBtn?.addEventListener("click", () => photosFiles?.click());
photosFiles?.addEventListener("change", async () => {
    const files = [...(photosFiles.files || [])];
    photosFiles.value = "";
    if (!files.length) return;
    try {
        setOfflineStatus(`Matching ${files.length} photo file(s)…`);
        const result = await importPhotoFilesForDivision(files, playersCache, activeDivisionId);
        persistAndRefresh(result.players, `Matched and stored ${result.matched} photo file(s) offline.`);
        setOfflineStatus(`Stored ${result.matched} photo(s) for this division.`);
    } catch (error) {
        setOfflineStatus(error.message || "Could not import photos.", true);
    }
});

exportPackBtn?.addEventListener("click", async () => {
    try {
        setOfflineStatus("Building division pack…");
        const pack = await exportDivisionPack(activeDivisionId);
        const safeName = String(pack.division?.name || activeDivisionId).replace(/[^\w\-]+/g, "_").slice(0, 40);
        downloadJsonFile(`${safeName || "division"}-pack.json`, pack);
        setOfflineStatus(`Exported pack with ${pack.players?.length || 0} players and ${pack.media?.length || 0} images.`);
    } catch (error) {
        setOfflineStatus(error.message || "Could not export pack.", true);
    }
});

importPackBtn?.addEventListener("click", () => packFile?.click());
packFile?.addEventListener("change", async () => {
    const file = packFile.files && packFile.files[0];
    packFile.value = "";
    if (!file) return;
    try {
        setOfflineStatus(`Importing ${file.name}…`);
        const pack = JSON.parse(await file.text());
        const result = await importDivisionPack(pack, {
            replacePlayers: true,
            replaceAuctionData: true,
            replaceTournament: false
        });
        activeDivisionId = result.divisionId;
        const config = await getAuctionConfig();
        divisionsCache = listDivisions(config);
        await refreshPlayers();
        renderPlayersDivisionTabs();
        setOfflineStatus(
            `Pack replaced division: ${result.teamCount || 0} teams, ${result.playerCount || 0} players, ${result.mediaCount || 0} media.`
        );
        setStatus("Division fully replaced from pack. Use Start New Auction / Reset on the desk.");
    } catch (error) {
        setOfflineStatus(error.message || "Could not import pack.", true);
    }
});

(async function initPlayersPage() {
    try {
        if (typeof hydrateLocalStorageFromProjectFolder === "function") {
            await hydrateLocalStorageFromProjectFolder();
        }
    } catch (_) {
        // continue with whatever is in localStorage
    }
    try {
        const config = await getAuctionConfig();
        divisionsCache = listDivisions(config);
        activeDivisionId = config.activeDivisionId || divisionsCache[0]?.id || "div_1";
        renderPlayersDivisionTabs();
    } catch (_) {
        divisionsCache = [{ id: "div_1", name: "Main Auction" }];
        activeDivisionId = "div_1";
        renderPlayersDivisionTabs();
    }
    await refreshPlayers();
})();
