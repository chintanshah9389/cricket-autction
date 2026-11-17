const teamKittyInput = document.getElementById("team-kitty");
const teamKittyPreview = document.getElementById("team-kitty-preview");
const tournamentNameInput = document.getElementById("tournament-name");
const tournamentYearInput = document.getElementById("tournament-year");
const tournamentTitlePreview = document.getElementById("tournament-title-preview");
const tournamentLogoPreview = document.getElementById("tournament-logo-preview");
const tournamentLogoUploadBtn = document.getElementById("tournament-logo-upload-btn");
const tournamentLogoFile = document.getElementById("tournament-logo-file");
const tournamentLogoClearBtn = document.getElementById("tournament-logo-clear-btn");
const useCategoryPrices = document.getElementById("use-category-prices");
const shuffleWithinCategory = document.getElementById("shuffle-within-category");
const playerWheelEnabled = document.getElementById("player-wheel-enabled");
const shuffleWithinWrap = document.getElementById("shuffle-within-wrap");
const sequenceEditorWrap = document.getElementById("sequence-editor-wrap");
const sequenceEditor = document.getElementById("sequence-editor");
const categoryGrid = document.getElementById("category-config-grid");
const teamList = document.getElementById("team-config-list");
const newCategoryName = document.getElementById("new-category-name");
const newCategoryBase = document.getElementById("new-category-base");
const newCategoryMax = document.getElementById("new-category-max");
const addCategoryBtn = document.getElementById("add-category-btn");
const newTeamName = document.getElementById("new-team-name");
const newTeamColor = document.getElementById("new-team-color");
const addTeamBtn = document.getElementById("add-team-btn");
const saveButton = document.getElementById("save-config");
const saveStatus = document.getElementById("save-status");
const divisionTabs = document.getElementById("division-tabs");
const activeDivisionLabel = document.getElementById("active-division-label");
const divisionSummary = document.getElementById("division-summary");
const teamKittyHeading = document.getElementById("team-kitty-heading");
const teamKittyHelp = document.getElementById("team-kitty-help");
const teamsHeading = document.getElementById("teams-heading");
const teamsHelp = document.getElementById("teams-help");
const teamEmptyHint = document.getElementById("team-empty-hint");
const auctionOrderHeading = document.getElementById("auction-order-heading");
const auctionOrderHelp = document.getElementById("auction-order-help");
const categoriesHeading = document.getElementById("categories-heading");
const addDivisionBtn = document.getElementById("add-division-btn");
const renameDivisionBtn = document.getElementById("rename-division-btn");
const removeDivisionBtn = document.getElementById("remove-division-btn");
const exportDivisionPackBtn = document.getElementById("export-division-pack-btn");
const importDivisionPackBtn = document.getElementById("import-division-pack-btn");
const divisionPackFile = document.getElementById("division-pack-file");
const exportProjectPackBtn = document.getElementById("export-project-pack-btn");
const importProjectPackBtn = document.getElementById("import-project-pack-btn");
const projectPackFile = document.getElementById("project-pack-file");
const divisionPackStatus = document.getElementById("division-pack-status");

let draftCategories = {};
let draftSequence = [];
let draftTeams = [];
let draftTournament = { name: "ABCD Super League", year: "2025" };
let draftDivisions = [];
let draftActiveDivisionId = "div_1";

function getDraftActiveDivision() {
    return (
        draftDivisions.find((division) => division.id === draftActiveDivisionId) ||
        draftDivisions[0] ||
        null
    );
}

function captureDivisionFieldsFromForm() {
    syncDraftFromCards();
    syncDraftFromTeamCards();
    const active = getDraftActiveDivision();
    if (!active) return;

    active.teams = JSON.parse(JSON.stringify(draftTeams));
    active.teamKitty = parseMoneyInput(teamKittyInput.value);
    active.useCategoryBasePrices = useCategoryPrices.checked;
    active.auctionOrder = getSelectedAuctionOrder();
    active.shuffleWithinCategory = shuffleWithinCategory.checked;
    active.playerWheelEnabled = playerWheelEnabled.checked;
    active.categorySequence = draftSequence.slice();
    active.categories = JSON.parse(JSON.stringify(draftCategories));
}

function applyDivisionFieldsToForm(division) {
    if (!division) return;
    draftTeams = JSON.parse(JSON.stringify(division.teams || []));
    setInputFromRupees(teamKittyInput, division.teamKitty);
    useCategoryPrices.checked = division.useCategoryBasePrices !== false;
    shuffleWithinCategory.checked = division.shuffleWithinCategory !== false;
    playerWheelEnabled.checked = division.playerWheelEnabled !== false;
    draftCategories = JSON.parse(JSON.stringify(division.categories || {}));
    draftSequence = (division.categorySequence || Object.keys(draftCategories)).slice();
    setAuctionOrder(division.auctionOrder);
    refreshKittyPreview();
}

function getDivisionTeamCount(division) {
    if (!division) return 0;
    if (division.id === draftActiveDivisionId) return draftTeams.length;
    return Array.isArray(division.teams) ? division.teams.length : 0;
}

function getDivisionCategoryCount(division) {
    if (!division) return 0;
    if (division.id === draftActiveDivisionId) return Object.keys(draftCategories || {}).length;
    return Object.keys(division.categories || {}).length;
}

function getDivisionKitty(division) {
    if (!division) return 0;
    if (division.id === draftActiveDivisionId) {
        return parseMoneyInput(teamKittyInput?.value) || Number(division.teamKitty) || 0;
    }
    return Number(division.teamKitty) || 0;
}

function formatDivisionKitty(amount) {
    return typeof formatMoney === "function" ? formatMoney(amount) : `Rs ${amount || 0}`;
}

function refreshDivisionScopedLabels() {
    const active = getDraftActiveDivision();
    const name = active?.name || "—";
    const teamCount = getDivisionTeamCount(active);
    const categoryCount = getDivisionCategoryCount(active);
    const kittyLabel = formatDivisionKitty(getDivisionKitty(active));

    if (activeDivisionLabel) {
        activeDivisionLabel.textContent = `Editing: ${name}`;
    }
    if (divisionSummary) {
        divisionSummary.innerHTML = `
            <div class="division-summary-card">
                <span class="division-summary-name">${name}</span>
                <div class="division-summary-stats">
                    <span><strong>${teamCount}</strong> teams</span>
                    <span><strong>${categoryCount}</strong> categories</span>
                    <span>Kitty <strong>${kittyLabel}</strong></span>
                </div>
            </div>
        `;
    }
    if (teamKittyHeading) teamKittyHeading.textContent = `Team Kitty — ${name}`;
    if (teamKittyHelp) {
        teamKittyHelp.innerHTML = `Budget for <strong>${name}</strong> only. Example: type <strong>1cr</strong> or <strong>10000000</strong> for 1 Crore.`;
    }
    if (teamsHeading) teamsHeading.textContent = `Teams — ${name} (${teamCount})`;
    if (teamsHelp) {
        teamsHelp.innerHTML = `Roster for <strong>${name}</strong> only. Switch division tabs above to edit another roster.`;
    }
    if (teamEmptyHint) {
        teamEmptyHint.hidden = teamCount > 0;
        teamEmptyHint.textContent = `No teams in ${name} yet. Add teams below.`;
    }
    if (auctionOrderHeading) auctionOrderHeading.textContent = `Auction Order — ${name}`;
    if (auctionOrderHelp) {
        auctionOrderHelp.textContent = `Choose random order, or set the exact category sequence for ${name}.`;
    }
    if (categoriesHeading) {
        categoriesHeading.textContent = `Auction Categories — ${name} (${categoryCount})`;
    }
}

function renderDivisionTabs() {
    if (!divisionTabs) return;
    divisionTabs.innerHTML = "";
    draftDivisions.forEach((division) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `division-tab${division.id === draftActiveDivisionId ? " is-active" : ""}`;
        const count = getDivisionTeamCount(division);
        const cats = getDivisionCategoryCount(division);
        const kitty = formatDivisionKitty(getDivisionKitty(division));
        button.innerHTML = `<span class="division-tab-name">${division.name}</span><span class="division-tab-count">${count} teams · ${cats} cats · ${kitty}</span>`;
        button.dataset.divisionId = division.id;
        button.title = `${division.name}: ${count} teams, ${cats} categories, kitty ${kitty}`;
        button.addEventListener("click", () => switchDraftDivision(division.id));
        divisionTabs.appendChild(button);
    });

    refreshDivisionScopedLabels();
    if (addDivisionBtn) {
        addDivisionBtn.disabled = draftDivisions.length >= MAX_AUCTION_DIVISIONS;
    }
    if (removeDivisionBtn) {
        removeDivisionBtn.disabled = draftDivisions.length <= 1;
    }
}

function switchDraftDivision(divisionId) {
    if (divisionId === draftActiveDivisionId) return;
    captureDivisionFieldsFromForm();
    draftActiveDivisionId = divisionId;
    applyDivisionFieldsToForm(getDraftActiveDivision());
    renderAll();
    const active = getDraftActiveDivision();
    if (saveStatus && active) {
        saveStatus.textContent = `Switched to ${active.name}: ${getDivisionTeamCount(active)} teams, kitty ${formatDivisionKitty(getDivisionKitty(active))}. Edit then Save.`;
    }
}

function handleAddDivision() {
    try {
        captureDivisionFieldsFromForm();
        const name = prompt("New division name:", `Division ${draftDivisions.length + 1}`);
        if (name == null) return;
        const label = String(name).trim();
        if (!label) {
            saveStatus.textContent = "Enter a division name.";
            return;
        }
        const temp = {
            tournament: draftTournament,
            divisions: draftDivisions,
            activeDivisionId: draftActiveDivisionId
        };
        const next = addDivision(temp, label);
        draftDivisions = next.divisions;
        draftActiveDivisionId = next.activeDivisionId;
        applyDivisionFieldsToForm(getDraftActiveDivision());
        saveStatus.textContent = `Added ${label} with its own empty team list. Add teams for this division, then Save.`;
        renderAll();
    } catch (error) {
        saveStatus.textContent = error.message || "Could not add division.";
    }
}

function handleRenameDivision() {
    const active = getDraftActiveDivision();
    if (!active) return;
    const name = prompt("Rename division:", active.name);
    if (name == null) return;
    try {
        captureDivisionFieldsFromForm();
        const next = renameDivision(
            {
                tournament: draftTournament,
                divisions: draftDivisions,
                activeDivisionId: draftActiveDivisionId
            },
            active.id,
            name
        );
        draftDivisions = next.divisions;
        draftActiveDivisionId = next.activeDivisionId;
        saveStatus.textContent = `Renamed to ${getDraftActiveDivision()?.name}. Click Save to keep this change.`;
        renderAll();
    } catch (error) {
        saveStatus.textContent = error.message || "Could not rename division.";
    }
}

function handleRemoveDivision() {
    const active = getDraftActiveDivision();
    if (!active) return;
    if (draftDivisions.length <= 1) {
        saveStatus.textContent = "Keep at least one auction division.";
        return;
    }
    const confirmed = confirm(
        `Remove division "${active.name}"?\nIts players and auction progress will also be cleared after Save.`
    );
    if (!confirmed) return;
    try {
        captureDivisionFieldsFromForm();
        const next = removeDivision(
            {
                tournament: draftTournament,
                divisions: draftDivisions,
                activeDivisionId: draftActiveDivisionId
            },
            active.id
        );
        draftDivisions = next.divisions;
        draftActiveDivisionId = next.activeDivisionId;
        applyDivisionFieldsToForm(getDraftActiveDivision());
        saveStatus.textContent = `Removed ${active.name}. Click Save to keep this change.`;
        renderAll();
    } catch (error) {
        saveStatus.textContent = error.message || "Could not remove division.";
    }
}

function refreshTournamentPreview() {
    draftTournament.name = String(tournamentNameInput.value || "").trim() || "ABCD Super League";
    draftTournament.year = String(tournamentYearInput.value || "").trim();
    tournamentTitlePreview.textContent = getTournamentTitle(draftTournament);

    const logoSrc = getTournamentLogoSrc(draftTournament, "../assets/tournament-logo.png");
    tournamentLogoPreview.src = logoSrc;
    tournamentLogoPreview.classList.toggle("is-empty", !draftTournament.logo);
    tournamentLogoClearBtn.disabled = !draftTournament.logo;
}

function setInputFromRupees(input, amount) {
    input.value = String(amount);
}

function getSelectedAuctionOrder() {
    const selected = document.querySelector('input[name="auction-order"]:checked');
    return selected ? selected.value : "SEQUENCE";
}

function setAuctionOrder(order) {
    const value = order === "RANDOM" ? "RANDOM" : "SEQUENCE";
    const input = document.querySelector(`input[name="auction-order"][value="${value}"]`);
    if (input) input.checked = true;
    refreshOrderUI();
}

function refreshOrderUI() {
    const order = getSelectedAuctionOrder();
    const isSequence = order === "SEQUENCE";
    sequenceEditorWrap.style.opacity = isSequence ? "1" : "0.45";
    shuffleWithinWrap.style.opacity = isSequence ? "1" : "0.45";
    shuffleWithinCategory.disabled = !isSequence;
    sequenceEditor.querySelectorAll("button").forEach((button) => {
        button.disabled = !isSequence;
    });
}

function refreshKittyPreview() {
    const kitty = parseMoneyInput(teamKittyInput.value);
    teamKittyPreview.textContent = Number.isFinite(kitty) ? formatMoney(kitty) : "Invalid";
    const active = getDraftActiveDivision();
    if (active && active.id === draftActiveDivisionId && Number.isFinite(kitty)) {
        active.teamKitty = kitty;
    }
    refreshDivisionScopedLabels();
}

function moveCategory(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= draftSequence.length) return;
    const temp = draftSequence[index];
    draftSequence[index] = draftSequence[target];
    draftSequence[target] = temp;
    renderSequenceEditor();
    refreshOrderUI();
}

function removeCategory(name) {
    if (draftSequence.length <= 1) {
        saveStatus.textContent = "Keep at least one auction category.";
        return;
    }
    delete draftCategories[name];
    draftSequence = draftSequence.filter((item) => item !== name);
    saveStatus.textContent = `Removed ${displayCategoryName(name)}. Click Save to keep this change.`;
    renderAll();
}

function syncDraftFromTeamCards() {
    const cards = teamList.querySelectorAll(".team-config-card");
    cards.forEach((card, index) => {
        if (!draftTeams[index]) return;
        const nameInput = card.querySelector(".team-name-input");
        const colorInput = card.querySelector(".team-color-input");
        const name = String(nameInput?.value || "").trim();
        if (name) draftTeams[index].team_name = name;
        if (colorInput?.value) draftTeams[index].color = colorInput.value;
    });
}

function removeTeam(index) {
    syncDraftFromTeamCards();
    const removed = draftTeams[index];
    draftTeams.splice(index, 1);
    saveStatus.textContent = `Removed ${removed?.team_name || "team"}. Click Save to keep this change.`;
    renderTeamCards();
    renderDivisionTabs();
}

function renderTeamCards() {
    teamList.innerHTML = "";
    draftTeams.forEach((team, index) => {
        const logoSrc = getTeamLogoSrc(team, "../assets/teams-logo");
        const hasUpload = Boolean(team.logo);
        const card = document.createElement("article");
        card.className = "team-config-card";
        card.innerHTML = `
            <span class="team-config-id">#${team.team_id}</span>
            <div class="team-config-main">
                <input class="team-name-input" type="text" value="${team.team_name}" aria-label="Team name">
                <input class="team-color-input" type="color" value="${team.color || "#3498db"}" title="Team color">
                <div class="team-config-logo-row">
                    <img class="team-logo-preview ${hasUpload ? "" : "is-empty"}" src="${logoSrc}" alt="${team.team_name} logo" onerror="this.classList.add('is-empty'); this.removeAttribute('src');">
                    <button type="button" class="team-logo-upload-btn" data-upload-logo="${index}">Upload logo</button>
                    <input class="team-logo-file" type="file" accept="image/*" data-logo-file="${index}">
                    <button type="button" class="team-logo-clear-btn" data-clear-logo="${index}" ${hasUpload ? "" : "disabled"}>Clear logo</button>
                </div>
                <div class="team-config-video-row">
                    <button type="button" class="team-logo-upload-btn" data-upload-video="${index}">Upload video (optional)</button>
                    <input class="team-logo-file" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" data-video-file="${index}">
                    <button type="button" class="team-logo-clear-btn" data-clear-video="${index}" ${team.video ? "" : "disabled"}>Clear video</button>
                    <span class="help team-video-status">${team.video ? "Video attached" : "No video"}</span>
                </div>
            </div>
            <button type="button" class="link-danger" data-remove-team="${index}">Remove</button>
        `;
        teamList.appendChild(card);
    });

    teamList.querySelectorAll("[data-remove-team]").forEach((button) => {
        button.addEventListener("click", () => {
            removeTeam(parseInt(button.dataset.removeTeam, 10));
        });
    });

    teamList.querySelectorAll("[data-upload-logo]").forEach((button) => {
        button.addEventListener("click", () => {
            const index = parseInt(button.dataset.uploadLogo, 10);
            const fileInput = teamList.querySelector(`[data-logo-file="${index}"]`);
            if (fileInput) fileInput.click();
        });
    });

    teamList.querySelectorAll("[data-logo-file]").forEach((input) => {
        input.addEventListener("change", async () => {
            const index = parseInt(input.dataset.logoFile, 10);
            const file = input.files && input.files[0];
            input.value = "";
            if (!file || !draftTeams[index]) return;
            try {
                syncDraftFromTeamCards();
                draftTeams[index].logo = await readImageFileAsDataUrl(file);
                saveStatus.textContent = `Logo updated for ${draftTeams[index].team_name}. Click Save to keep this change.`;
                renderTeamCards();
            } catch (error) {
                saveStatus.textContent = error.message || "Could not upload logo.";
            }
        });
    });

    teamList.querySelectorAll("[data-clear-logo]").forEach((button) => {
        button.addEventListener("click", () => {
            const index = parseInt(button.dataset.clearLogo, 10);
            if (!draftTeams[index]) return;
            syncDraftFromTeamCards();
            delete draftTeams[index].logo;
            saveStatus.textContent = `Cleared logo for ${draftTeams[index].team_name}. Click Save to keep this change.`;
            renderTeamCards();
        });
    });

    teamList.querySelectorAll("[data-upload-video]").forEach((button) => {
        button.addEventListener("click", () => {
            const index = parseInt(button.dataset.uploadVideo, 10);
            const fileInput = teamList.querySelector(`[data-video-file="${index}"]`);
            if (fileInput) fileInput.click();
        });
    });

    teamList.querySelectorAll("[data-video-file]").forEach((input) => {
        input.addEventListener("change", async () => {
            const index = parseInt(input.dataset.videoFile, 10);
            const file = input.files && input.files[0];
            input.value = "";
            if (!file || !draftTeams[index]) return;
            if (file.size > 80 * 1024 * 1024) {
                saveStatus.textContent = "Video is too large (max ~80MB).";
                return;
            }
            try {
                syncDraftFromTeamCards();
                saveStatus.textContent = `Uploading video for ${draftTeams[index].team_name}…`;
                const teamId = draftTeams[index].team_id;
                const divisionId = draftActiveDivisionId || "div_1";
                const response = await fetch(
                    `/api/teams/video?id=${encodeURIComponent(teamId)}&division=${encodeURIComponent(divisionId)}`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": file.type || "video/mp4",
                            "X-Team-Id": String(teamId),
                            "X-Division-Id": String(divisionId)
                        },
                        body: file
                    }
                );
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.error || "Could not upload team video.");
                draftTeams[index].video = payload.path;
                saveStatus.textContent = `Video updated for ${draftTeams[index].team_name}. Click Save to keep this change.`;
                renderTeamCards();
            } catch (error) {
                saveStatus.textContent = error.message || "Could not upload team video.";
            }
        });
    });

    teamList.querySelectorAll("[data-clear-video]").forEach((button) => {
        button.addEventListener("click", async () => {
            const index = parseInt(button.dataset.clearVideo, 10);
            if (!draftTeams[index]) return;
            syncDraftFromTeamCards();
            const teamId = draftTeams[index].team_id;
            const divisionId = draftActiveDivisionId || "div_1";
            await fetch(
                `/api/teams/video/${encodeURIComponent(teamId)}?division=${encodeURIComponent(divisionId)}`,
                { method: "DELETE" }
            ).catch(() => {});
            delete draftTeams[index].video;
            saveStatus.textContent = `Cleared video for ${draftTeams[index].team_name}. Click Save to keep this change.`;
            renderTeamCards();
        });
    });
}

function addTeam() {
    syncDraftFromTeamCards();
    const name = String(newTeamName.value || "").trim();
    if (!name) {
        saveStatus.textContent = "Enter a team name.";
        return;
    }
    if (draftTeams.some((team) => team.team_name.toLowerCase() === name.toLowerCase())) {
        saveStatus.textContent = `${name} already exists.`;
        return;
    }

    const color = newTeamColor.value || DEFAULT_TEAM_COLORS[draftTeams.length % DEFAULT_TEAM_COLORS.length];
    draftTeams.push({
        team_id: nextAvailableTeamId(draftTeams),
        team_name: name,
        color
    });
    newTeamName.value = "";
    newTeamColor.value = DEFAULT_TEAM_COLORS[draftTeams.length % DEFAULT_TEAM_COLORS.length];
    saveStatus.textContent = `Added ${name} to ${getDraftActiveDivision()?.name || "this division"}. Click Save to keep this change.`;
    renderTeamCards();
    renderDivisionTabs();
}

function renderSequenceEditor() {
    sequenceEditor.innerHTML = "";
    draftSequence.forEach((name, index) => {
        const item = document.createElement("li");
        item.className = "sequence-item";
        item.innerHTML = `
            <span class="sequence-rank">${index + 1}</span>
            <span class="sequence-name">${displayCategoryName(name)}</span>
            <div class="sequence-actions">
                <button type="button" data-move="up" data-index="${index}" aria-label="Move up">↑</button>
                <button type="button" data-move="down" data-index="${index}" aria-label="Move down">↓</button>
            </div>
        `;
        sequenceEditor.appendChild(item);
    });

    sequenceEditor.querySelectorAll("[data-move]").forEach((button) => {
        button.addEventListener("click", () => {
            const index = parseInt(button.dataset.index, 10);
            const direction = button.dataset.move === "up" ? -1 : 1;
            moveCategory(index, direction);
        });
    });
}

function renderCategoryCards() {
    categoryGrid.innerHTML = "";
    draftSequence.forEach((name) => {
        const category = draftCategories[name] || { basePrice: 500000, maxPlayers: 1 };
        const card = document.createElement("article");
        card.className = "category-config-card";
        card.dataset.category = name;
        card.innerHTML = `
            <div class="category-card-header">
                <h3>${displayCategoryName(name)}</h3>
                <button type="button" class="link-danger" data-remove="${name}" ${draftSequence.length <= 1 ? "disabled" : ""}>Remove</button>
            </div>
            <label>Base price (Rs)</label>
            <input class="category-base" type="text" value="${category.basePrice}" data-category="${name}">
            <span class="preview category-base-preview" data-category="${name}">${formatMoney(category.basePrice)}</span>
            <label>Max players per team</label>
            <input class="category-max" type="number" min="0" step="1" value="${category.maxPlayers}" data-category="${name}">
        `;
        categoryGrid.appendChild(card);
    });

    categoryGrid.querySelectorAll(".category-base").forEach((input) => {
        input.addEventListener("input", () => {
            const name = input.dataset.category;
            const amount = parseMoneyInput(input.value);
            if (Number.isFinite(amount)) {
                draftCategories[name].basePrice = amount;
            }
            const preview = categoryGrid.querySelector(`.category-base-preview[data-category="${name}"]`);
            if (preview) {
                preview.textContent = Number.isFinite(amount) ? formatMoney(amount) : "Invalid";
            }
        });
    });

    categoryGrid.querySelectorAll(".category-max").forEach((input) => {
        input.addEventListener("change", () => {
            const name = input.dataset.category;
            draftCategories[name].maxPlayers = parseInt(input.value, 10) || 0;
        });
    });

    categoryGrid.querySelectorAll("[data-remove]").forEach((button) => {
        button.addEventListener("click", () => removeCategory(button.dataset.remove));
    });
}

function syncDraftFromCards() {
    categoryGrid.querySelectorAll(".category-base").forEach((input) => {
        const name = input.dataset.category;
        const amount = parseMoneyInput(input.value);
        if (!draftCategories[name]) {
            draftCategories[name] = { basePrice: 500000, maxPlayers: 1 };
        }
        if (Number.isFinite(amount)) {
            draftCategories[name].basePrice = amount;
        }
    });
    categoryGrid.querySelectorAll(".category-max").forEach((input) => {
        const name = input.dataset.category;
        if (!draftCategories[name]) {
            draftCategories[name] = { basePrice: 500000, maxPlayers: 1 };
        }
        draftCategories[name].maxPlayers = parseInt(input.value, 10) || 0;
    });
}

function renderAll() {
    refreshTournamentPreview();
    renderDivisionTabs();
    renderTeamCards();
    renderSequenceEditor();
    renderCategoryCards();
    refreshOrderUI();
    refreshDivisionScopedLabels();
}

function readFormConfig() {
    syncDraftFromTeamCards();
    refreshTournamentPreview();
    captureDivisionFieldsFromForm();
    return {
        tournament: JSON.parse(JSON.stringify(draftTournament)),
        divisions: JSON.parse(JSON.stringify(draftDivisions)),
        activeDivisionId: draftActiveDivisionId
    };
}

async function loadForm() {
    const config = await getAuctionConfig();
    draftTournament = JSON.parse(JSON.stringify(config.tournament || DEFAULT_TOURNAMENT));
    draftDivisions = JSON.parse(JSON.stringify(config.divisions || []));
    draftActiveDivisionId = config.activeDivisionId || draftDivisions[0]?.id || "div_1";
    tournamentNameInput.value = draftTournament.name || "";
    tournamentYearInput.value = draftTournament.year || "";
    applyDivisionFieldsToForm(getDraftActiveDivision());
    renderAll();
}

function addCategory() {
    syncDraftFromCards();
    const name = normalizeCategoryName(newCategoryName.value);
    if (!name) {
        saveStatus.textContent = "Enter a category name.";
        return;
    }
    if (draftCategories[name]) {
        saveStatus.textContent = `${displayCategoryName(name)} already exists.`;
        return;
    }

    const basePrice = parseMoneyInput(newCategoryBase.value || "500000");
    const maxPlayers = parseInt(newCategoryMax.value, 10);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
        saveStatus.textContent = "Enter a valid base price for the new category.";
        return;
    }
    if (!Number.isFinite(maxPlayers) || maxPlayers < 0) {
        saveStatus.textContent = "Enter a valid max players value.";
        return;
    }

    draftCategories[name] = { basePrice, maxPlayers };
    draftSequence.push(name);
    newCategoryName.value = "";
    newCategoryBase.value = "";
    newCategoryMax.value = "2";
    saveStatus.textContent = `Added ${displayCategoryName(name)}. Move it in the sequence if needed, then Save.`;
    renderAll();
}

function saveForm() {
    const draft = readFormConfig();
    if (!String(draft.tournament?.name || "").trim()) {
        saveStatus.textContent = "Enter a tournament name.";
        return;
    }
    if (!draft.divisions?.length) {
        saveStatus.textContent = "Keep at least one auction division.";
        return;
    }
    for (const division of draft.divisions) {
        if (!String(division.name || "").trim()) {
            saveStatus.textContent = "Every division needs a name.";
            return;
        }
        if ((division.teams || []).some((team) => !String(team.team_name || "").trim())) {
            saveStatus.textContent = `Every team in ${division.name} needs a name.`;
            return;
        }
        if (!Number.isFinite(division.teamKitty) || division.teamKitty <= 0) {
            saveStatus.textContent = `Enter a valid team kitty for ${division.name}.`;
            return;
        }
        for (const [name, category] of Object.entries(division.categories || {})) {
            if (!Number.isFinite(category.basePrice) || category.basePrice < 0) {
                saveStatus.textContent = `Enter a valid base price for ${displayCategoryName(name)} in ${division.name}.`;
                return;
            }
            if (!Number.isFinite(category.maxPlayers) || category.maxPlayers < 0) {
                saveStatus.textContent = `Enter a valid max players value for ${displayCategoryName(name)} in ${division.name}.`;
                return;
            }
        }
    }

    try {
        const saved = saveAuctionConfig(draft);
        draftDivisions = JSON.parse(JSON.stringify(saved.divisions || []));
        draftActiveDivisionId = saved.activeDivisionId;
        applyDivisionFieldsToForm(getDraftActiveDivision());
        const active = getActiveDivision(saved);
        const teamCount = (active.teams || []).length;
        const orderLabel =
            active.auctionOrder === "RANDOM"
                ? "Random"
                : active.categorySequence.map((name, index) => `${index + 1}. ${displayCategoryName(name)}`).join(" → ");
        saveStatus.textContent = `Saved. ${getTournamentTitle(saved.tournament)}. ${saved.divisions.length} division(s). Active: ${active.name} (${teamCount} teams). Order: ${orderLabel}. Kitty ${formatMoney(active.teamKitty)}.`;
        renderAll();
    } catch (error) {
        saveStatus.textContent = error.message || "Could not save configuration.";
    }
}

teamKittyInput.addEventListener("input", refreshKittyPreview);
tournamentNameInput.addEventListener("input", refreshTournamentPreview);
tournamentYearInput.addEventListener("input", refreshTournamentPreview);
tournamentLogoUploadBtn.addEventListener("click", () => tournamentLogoFile.click());
tournamentLogoFile.addEventListener("change", async () => {
    const file = tournamentLogoFile.files && tournamentLogoFile.files[0];
    tournamentLogoFile.value = "";
    if (!file) return;
    try {
        draftTournament.logo = await readImageFileAsDataUrl(file, 512);
        saveStatus.textContent = "Project logo updated. Click Save to keep this change.";
        refreshTournamentPreview();
    } catch (error) {
        saveStatus.textContent = error.message || "Could not upload logo.";
    }
});
tournamentLogoClearBtn.addEventListener("click", () => {
    delete draftTournament.logo;
    saveStatus.textContent = "Cleared project logo. Click Save to keep this change.";
    refreshTournamentPreview();
});
tournamentLogoPreview.addEventListener("error", () => {
    tournamentLogoPreview.classList.add("is-empty");
});

document.querySelectorAll('input[name="auction-order"]').forEach((input) => {
    input.addEventListener("change", refreshOrderUI);
});

document.querySelectorAll("[data-kitty]").forEach((button) => {
    button.addEventListener("click", () => {
        teamKittyInput.value = button.dataset.kitty;
        refreshKittyPreview();
    });
});

addCategoryBtn.addEventListener("click", addCategory);
addTeamBtn.addEventListener("click", addTeam);
addDivisionBtn?.addEventListener("click", handleAddDivision);
renameDivisionBtn?.addEventListener("click", handleRenameDivision);
removeDivisionBtn?.addEventListener("click", handleRemoveDivision);

async function handleExportDivisionPack() {
    try {
        captureDivisionFieldsFromForm();
        if (typeof exportDivisionPack !== "function") {
            throw new Error("Offline pack helper is not loaded.");
        }
        if (divisionPackStatus) divisionPackStatus.textContent = "Building division pack…";
        const pack = await exportDivisionPack(draftActiveDivisionId);
        const safeName = String(pack.division?.name || draftActiveDivisionId)
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 40);
        downloadJsonFile(`${safeName || "division"}-pack.json`, pack);
        if (divisionPackStatus) {
            const teamCount = pack.division?.teams?.length || 0;
            const mediaCount = (pack.media?.length || 0) + (pack.teamMedia?.length || 0);
            divisionPackStatus.textContent = `Division pack exported: ${teamCount} teams, ${pack.players?.length || 0} players, ${mediaCount} media.`;
        }
    } catch (error) {
        if (divisionPackStatus) {
            divisionPackStatus.textContent = error.message || "Could not export division pack.";
        }
    }
}

async function handleImportDivisionPack(file) {
    try {
        if (!file) return;
        if (typeof importDivisionPack !== "function") {
            throw new Error("Offline pack helper is not loaded.");
        }
        if (divisionPackStatus) divisionPackStatus.textContent = `Reading ${file.name}…`;
        const pack = JSON.parse(await file.text());
        if (pack.type === "cricket-auction-project-pack") {
            throw new Error("That file is a full project pack. Use Import project pack.");
        }
        const result = await importDivisionPack(pack, {
            replacePlayers: true,
            replaceAuctionData: true,
            replaceTournament: false
        });
        await loadForm();
        if (divisionPackStatus) {
            divisionPackStatus.textContent = `Division replaced: ${result.teamCount || 0} teams, ${result.playerCount || 0} players, ${result.mediaCount || 0} media.`;
        }
    } catch (error) {
        if (divisionPackStatus) {
            divisionPackStatus.textContent = error.message || "Could not import division pack.";
        }
    }
}

async function handleExportProjectPack() {
    try {
        captureDivisionFieldsFromForm();
        // Persist current form before packaging so disk matches what you see
        try {
            saveAuctionConfig(readFormConfig());
        } catch (_) {
            // still export whatever is on disk/config
        }
        if (typeof exportProjectPack !== "function") {
            throw new Error("Project pack helper is not loaded.");
        }
        if (divisionPackStatus) {
            divisionPackStatus.textContent = "Building entire project pack (this can take a while)…";
        }
        const pack = await exportProjectPack();
        const safeName = String(pack.tournament?.name || "project")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 40);
        downloadJsonFile(`${safeName || "project"}-full-pack.json`, pack);
        if (divisionPackStatus) {
            const divCount = pack.divisions?.length || 0;
            const players = (pack.divisions || []).reduce((sum, d) => sum + (d.players?.length || 0), 0);
            const media = (pack.divisions || []).reduce(
                (sum, d) => sum + (d.media?.length || 0) + (d.teamMedia?.length || 0),
                0
            );
            divisionPackStatus.textContent = `Project pack exported: ${divCount} division(s), ${players} players, ${media} media, ${pack.partners?.length || 0} partners.`;
        }
    } catch (error) {
        if (divisionPackStatus) {
            divisionPackStatus.textContent = error.message || "Could not export project pack.";
        }
    }
}

async function handleImportProjectPack(file) {
    try {
        if (!file) return;
        if (typeof importProjectPack !== "function") {
            throw new Error("Project pack helper is not loaded.");
        }
        const confirmed = confirm(
            "Import ENTIRE project pack?\n\nThis replaces all divisions, teams, players, photos, and partners with the pack contents."
        );
        if (!confirmed) return;
        if (divisionPackStatus) divisionPackStatus.textContent = `Importing project pack ${file.name}…`;
        const pack = JSON.parse(await file.text());
        if (pack.type === "cricket-auction-division-pack") {
            throw new Error("That file is a division pack. Use Import division pack.");
        }
        const result = await importProjectPack(pack);
        await loadForm();
        if (divisionPackStatus) {
            divisionPackStatus.textContent = `Project replaced: ${result.divisionCount} division(s), ${result.teamCount} teams, ${result.playerCount} players, ${result.mediaCount} media, ${result.partnerCount} partners.`;
        }
    } catch (error) {
        if (divisionPackStatus) {
            divisionPackStatus.textContent = error.message || "Could not import project pack.";
        }
    }
}

exportDivisionPackBtn?.addEventListener("click", handleExportDivisionPack);
importDivisionPackBtn?.addEventListener("click", () => divisionPackFile?.click());
divisionPackFile?.addEventListener("change", async () => {
    const file = divisionPackFile.files && divisionPackFile.files[0];
    divisionPackFile.value = "";
    await handleImportDivisionPack(file);
});
exportProjectPackBtn?.addEventListener("click", handleExportProjectPack);
importProjectPackBtn?.addEventListener("click", () => projectPackFile?.click());
projectPackFile?.addEventListener("change", async () => {
    const file = projectPackFile.files && projectPackFile.files[0];
    projectPackFile.value = "";
    await handleImportProjectPack(file);
});
newTeamName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        addTeam();
    }
});
saveButton.addEventListener("click", saveForm);

document.getElementById("reset-project-btn")?.addEventListener("click", async () => {
    const confirmed = confirm(
        "Reset ENTIRE project?\n\nThis clears all divisions, teams, players, auction progress, and offline photos.\nBlank project = no teams."
    );
    if (!confirmed) return;
    const securityKey = prompt("Enter the security key: (rezwan19)");
    if (securityKey !== "rezwan19") {
        saveStatus.textContent = "Wrong security key.";
        return;
    }
    try {
        saveStatus.textContent = "Resetting project…";
        try {
            sessionStorage.setItem("auctionForceBlank", "1");
        } catch (_) {
            // ignore
        }
        await resetEntireProject();
        window.location.href = `../index.html?blank=1&ts=${Date.now()}`;
    } catch (error) {
        saveStatus.textContent = error.message || "Could not reset project.";
    }
});

document.addEventListener("DOMContentLoaded", loadForm);
