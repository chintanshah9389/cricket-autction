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

let playersCache = [];
let editingKey = "";
let teamLookup = new Map(); // team_id -> { name, color }

function setStatus(message, isError = false) {
    if (!importStatus) return;
    importStatus.textContent = message || "";
    importStatus.style.color = isError ? "#b42318" : "";
}

function loadAuctionTeamLookup() {
    const map = new Map();
    try {
        const saved = JSON.parse(localStorage.getItem("auctionData") || "null");
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
            (config?.teams || []).forEach((team) => {
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
        const saved = JSON.parse(localStorage.getItem("auctionData") || "null");
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
    if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
    if (value.startsWith("../")) return value;
    if (value.startsWith("assets/")) return `../${value}`;
    return value;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
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

function renderPlayersTable() {
    const filtered = getFilteredPlayers();
    playersCount.textContent =
        `${playersCache.length} player${playersCache.length === 1 ? "" : "s"}` +
        (filtered.length !== playersCache.length ? ` · showing ${filtered.length}` : "");

    if (!filtered.length) {
        playersTableBody.innerHTML = `
            <tr>
                <td colspan="16" style="text-align:center;color:#73849a;padding:28px;white-space:normal;">
                    No players found. Reload data/players.json, upload CSV/Excel, or add a player.
                </td>
            </tr>
        `;
        return;
    }

    playersTableBody.innerHTML = filtered.map((player) => {
        const key = player.code || player.id;
        const isEditing = String(key) === String(editingKey);
        const baseText = player.basePrice != null && typeof showAmount === "function"
            ? showAmount(player.basePrice)
            : (player.basePrice ?? "—");
        const soldText = player.soldFor != null && typeof showAmount === "function"
            ? showAmount(player.soldFor)
            : (player.soldFor != null ? String(player.soldFor) : "—");
        const teamName = player.teamName || (player.status === "sold" ? getTeamName(player.team) : "");
        const teamColor = getTeamColor(player.team);
        const status = player.status || "not-auctioned";
        return `
            <tr class="${isEditing ? "is-editing" : ""}" data-row-key="${escapeHtml(key)}">
                <td><img src="${resolvePhotoSrc(player.photo)}" alt="" onerror="this.src='../assets/placeholder.png'"></td>
                <td>${escapeHtml(player.code || player.id)}</td>
                <td class="player-cell"><strong>${escapeHtml(player.name)}</strong></td>
                <td>${escapeHtml(player.role || "—")}</td>
                <td>${escapeHtml(displayCategoryName(player.category))}</td>
                <td>${escapeHtml(player.age ?? "—")}</td>
                <td>${escapeHtml(player.ageCategory || "—")}</td>
                <td>${escapeHtml(player.mobile || "—")}</td>
                <td>${escapeHtml(player.currentClub || "—")}</td>
                <td>${escapeHtml(baseText)}</td>
                <td>${escapeHtml(player.battingStyle || "—")}</td>
                <td>${escapeHtml(player.bowlingStyle || "—")}</td>
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
}

function persistAndRefresh(list, message) {
    const saved = saveStoredPlayers(list);
    playersCache = enrichPlayers(saved);
    updateFilterOptions();
    renderPlayersTable();
    if (message) setStatus(message);
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
        if (preferFile) {
            const filePlayers = await fetchFilePlayers();
            persistAndRefresh(filePlayers, `Loaded ${filePlayers.length} players from data/players.json`);
            resetForm();
            return;
        }

        const stored = loadStoredPlayers();
        if (stored && stored.length) {
            playersCache = enrichPlayers(stored);
            updateFilterOptions();
            renderPlayersTable();
            const soldCount = playersCache.filter((p) => p.status === "sold").length;
            setStatus(`Editing ${stored.length} players (browser copy)${soldCount ? ` · ${soldCount} sold in live auction` : ""}.`);
            return;
        }

        const filePlayers = await fetchFilePlayers();
        persistAndRefresh(filePlayers, `Loaded ${filePlayers.length} players from data/players.json into the editor.`);
    } catch (error) {
        console.error(error);
        playersCache = [];
        updateFilterOptions();
        renderPlayersTable();
        setStatus(error.message || "Could not load players.", true);
    }
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
        const config = await getAuctionConfig();
        const saved = importPlayerRows(rows, { mode, config });
        playersCache = enrichPlayers(saved);
        updateFilterOptions();
        renderPlayersTable();
        resetForm();
        setStatus(`Imported ${saved.length} players (${mode}). Use Start New Auction to apply on the desk.`);
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
    const headers = [
        "ID", "Skill", "Player", "Mobile", "Age", "Location",
        "Player photo", "CATEGORY", "AGE-CATEGORY", "Batting", "Bowling", "Base price", "Status"
    ];
    const lines = [headers.join(",")];
    list.forEach((player) => {
        lines.push([
            player.code || player.id,
            player.role,
            player.name,
            player.mobile,
            player.age,
            player.currentClub,
            player.photo,
            player.category,
            player.ageCategory,
            player.battingStyle,
            player.bowlingStyle,
            player.basePrice,
            player.status
        ].map(toCsvValue).join(","));
    });
    downloadTextFile("players-export.csv", lines.join("\n"), "text/csv");
}

function findPlayer(key) {
    return playersCache.find(
        (item) => String(item.code) === String(key) || String(item.id) === String(key)
    );
}

function deletePlayerByKey(key) {
    const next = playersCache.filter(
        (player) => String(player.code) !== String(key) && String(player.id) !== String(key)
    );
    persistAndRefresh(next, "Player deleted.");
    if (String(editingKey) === String(key)) resetForm();
}

importReplaceBtn.addEventListener("click", () => runImport("replace"));
importMergeBtn.addEventListener("click", () => runImport("merge"));
reloadFileBtn.addEventListener("click", () => {
    if (playersCache.length && !confirm("Replace the current editor list with data/players.json?")) return;
    refreshPlayers({ preferFile: true });
});

downloadTemplateBtn.addEventListener("click", () => {
    downloadTextFile("players-template.csv", getPlayersTemplateCsv(), "text/csv");
});

exportJsonBtn.addEventListener("click", () => {
    downloadTextFile("players.json", JSON.stringify(playersCache, null, 2), "application/json");
});

exportCsvBtn.addEventListener("click", () => {
    exportPlayersCsv(playersCache);
});

clearPlayersBtn.addEventListener("click", () => {
    if (!playersCache.length) {
        setStatus("Player list is already empty.");
        return;
    }
    if (!confirm("Clear all players from the editor? Auction will fall back to data/players.json until you import again.")) {
        return;
    }
    clearStoredPlayers();
    playersCache = [];
    updateFilterOptions();
    renderPlayersTable();
    resetForm();
    setStatus("Player list cleared.");
});

playersSearch.addEventListener("input", renderPlayersTable);
categoryFilter.addEventListener("change", renderPlayersTable);
roleFilter.addEventListener("change", renderPlayersTable);
statusFilter?.addEventListener("change", renderPlayersTable);
teamFilter?.addEventListener("change", renderPlayersTable);

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

refreshPlayers();
