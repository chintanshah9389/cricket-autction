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

let draftCategories = {};
let draftSequence = [];
let draftTeams = [];
let draftTournament = { name: "ABCD Super League", year: "2025" };

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
    if (draftTeams.length <= 1) {
        saveStatus.textContent = "Keep at least one team.";
        return;
    }
    const removed = draftTeams[index];
    draftTeams.splice(index, 1);
    saveStatus.textContent = `Removed ${removed?.team_name || "team"}. Click Save to keep this change.`;
    renderTeamCards();
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
            </div>
            <button type="button" class="link-danger" data-remove-team="${index}" ${draftTeams.length <= 1 ? "disabled" : ""}>Remove</button>
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
    saveStatus.textContent = `Added ${name}. Click Save to keep this change.`;
    renderTeamCards();
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
    renderTeamCards();
    renderSequenceEditor();
    renderCategoryCards();
    refreshOrderUI();
}

function readFormConfig() {
    syncDraftFromCards();
    syncDraftFromTeamCards();
    refreshTournamentPreview();
    return {
        teamKitty: parseMoneyInput(teamKittyInput.value),
        useCategoryBasePrices: useCategoryPrices.checked,
        auctionOrder: getSelectedAuctionOrder(),
        shuffleWithinCategory: shuffleWithinCategory.checked,
        playerWheelEnabled: playerWheelEnabled.checked,
        categorySequence: draftSequence.slice(),
        categories: JSON.parse(JSON.stringify(draftCategories)),
        teams: JSON.parse(JSON.stringify(draftTeams)),
        tournament: JSON.parse(JSON.stringify(draftTournament))
    };
}

async function loadForm() {
    const config = await getAuctionConfig();
    setInputFromRupees(teamKittyInput, config.teamKitty);
    useCategoryPrices.checked = config.useCategoryBasePrices;
    shuffleWithinCategory.checked = config.shuffleWithinCategory;
    playerWheelEnabled.checked = config.playerWheelEnabled !== false;
    draftCategories = JSON.parse(JSON.stringify(config.categories));
    draftSequence = config.categorySequence.slice();
    draftTeams = JSON.parse(JSON.stringify(config.teams || []));
    draftTournament = JSON.parse(JSON.stringify(config.tournament || DEFAULT_TOURNAMENT));
    tournamentNameInput.value = draftTournament.name || "";
    tournamentYearInput.value = draftTournament.year || "";
    setAuctionOrder(config.auctionOrder);
    refreshKittyPreview();
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
    if (!Number.isFinite(draft.teamKitty) || draft.teamKitty <= 0) {
        saveStatus.textContent = "Enter a valid team kitty amount.";
        return;
    }
    if (!draft.teams.length) {
        saveStatus.textContent = "Keep at least one team.";
        return;
    }
    if (draft.teams.some((team) => !String(team.team_name || "").trim())) {
        saveStatus.textContent = "Every team needs a name.";
        return;
    }

    for (const [name, category] of Object.entries(draft.categories)) {
        if (!Number.isFinite(category.basePrice) || category.basePrice < 0) {
            saveStatus.textContent = `Enter a valid base price for ${displayCategoryName(name)}.`;
            return;
        }
        if (!Number.isFinite(category.maxPlayers) || category.maxPlayers < 0) {
            saveStatus.textContent = `Enter a valid max players value for ${displayCategoryName(name)}.`;
            return;
        }
    }

    try {
        const saved = saveAuctionConfig(draft);
        const orderLabel =
            saved.auctionOrder === "RANDOM"
                ? "Random"
                : saved.categorySequence.map((name, index) => `${index + 1}. ${displayCategoryName(name)}`).join(" → ");
        saveStatus.textContent = `Saved. ${getTournamentTitle(saved.tournament)}. ${saved.teams.length} teams. Order: ${orderLabel}. Kitty ${formatMoney(saved.teamKitty)}. Reload auction to apply branding.`;
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
newTeamName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        addTeam();
    }
});
saveButton.addEventListener("click", saveForm);
document.addEventListener("DOMContentLoaded", loadForm);
