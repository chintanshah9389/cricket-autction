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
const playerFieldsGrid = document.getElementById("player-fields-grid");
const playerFieldsHeading = document.getElementById("player-fields-heading");
const playerFieldsHelp = document.getElementById("player-fields-help");
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
const iconCaptionEnabled = document.getElementById("icon-caption-enabled");
const iconCaptionSettings = document.getElementById("icon-caption-settings");
const iconFeeInput = document.getElementById("icon-fee");
const iconFeePreview = document.getElementById("icon-fee-preview");
const captionFeeInput = document.getElementById("caption-fee");
const captionFeePreview = document.getElementById("caption-fee-preview");
const iconCaptionCountQuota = document.getElementById("icon-caption-count-quota");
const iconCaptionTeamList = document.getElementById("icon-caption-team-list");
const iconCaptionHeading = document.getElementById("icon-caption-heading");
const iconCaptionHelp = document.getElementById("icon-caption-help");

let draftCategories = {};
let draftSequence = [];
let draftTeams = [];
let draftTournament = { name: "ABCD Super League", year: "2025" };
let draftDivisionPlayers = [];
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
    syncIconCaptionAssignmentsFromForm();
    const active = getDraftActiveDivision();
    if (!active) return;

    active.iconCaption = readIconCaptionFromForm(active.iconCaption);
    active.teams = JSON.parse(JSON.stringify(draftTeams));
    active.teamKitty = parseMoneyInput(teamKittyInput.value);
    active.useCategoryBasePrices = useCategoryPrices.checked;
    active.auctionOrder = getSelectedAuctionOrder();
    active.shuffleWithinCategory = shuffleWithinCategory.checked;
    active.playerWheelEnabled = playerWheelEnabled.checked;
    active.playerFields = readPlayerFieldsFromForm(active.playerFields);
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
    applyIconCaptionToForm(division.iconCaption);
    renderPlayerFieldsEditor(division);
    void refreshIconCaptionPlayersAndRender();
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
    if (iconCaptionHeading) iconCaptionHeading.textContent = `Icon & Caption — ${name}`;
    if (iconCaptionHelp) {
        iconCaptionHelp.innerHTML = `Optional for <strong>${name}</strong>. Turn on only if you want Icon / Caption. Each team can take Icon, Caption, both, or neither. Fees deduct on Start New Auction.`;
    }
    if (categoriesHeading) {
        categoriesHeading.textContent = `Auction Categories — ${name} (${categoryCount})`;
    }
    if (playerFieldsHeading) {
        playerFieldsHeading.textContent = `Player fields — ${name}`;
    }
    if (playerFieldsHelp) {
        playerFieldsHelp.innerHTML = `For <strong>${name}</strong> only: check what shows on the auction desk and what is required when adding/editing players. Name, ID, and Category stay on. Your checkboxes are saved to the database when you click Save — they load again on the next visit. Excel import can suggest fields once; after that Config Save is the source of truth.`;
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

async function switchDraftDivision(divisionId) {
    if (divisionId === draftActiveDivisionId) return;
    captureDivisionFieldsFromForm();
    draftActiveDivisionId = divisionId;
    // Keep this division's saved Player field toggles from DB — do not re-derive from roster.
    applyDivisionFieldsToForm(getDraftActiveDivision());
    renderAll();
    const active = getDraftActiveDivision();
    if (saveStatus && active) {
        saveStatus.textContent = `Switched to ${active.name}: ${getDivisionTeamCount(active)} teams, kitty ${formatDivisionKitty(getDivisionKitty(active))}. Player field checkboxes are loaded from the database for this division. Edit then Save.`;
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

function getPlayerFieldDefs(playerFields = null) {
    if (typeof listPlayerFieldDefs === "function") {
        return listPlayerFieldDefs(playerFields);
    }
    return typeof PLAYER_FIELD_DEFS !== "undefined" && Array.isArray(PLAYER_FIELD_DEFS)
        ? PLAYER_FIELD_DEFS
        : [];
}

function readPlayerFieldsFromForm(existingFields = null) {
    const previous =
        typeof normalizePlayerFields === "function"
            ? normalizePlayerFields(existingFields || {})
            : existingFields || {};
    const fields = {};
    getPlayerFieldDefs(previous).forEach((def) => {
        const visibleEl = document.getElementById(`pf-visible-${def.key}`);
        const requiredEl = document.getElementById(`pf-required-${def.key}`);
        const visible = visibleEl ? visibleEl.checked : true;
        const required = visible && requiredEl ? requiredEl.checked : false;
        const entry = { visible, required };
        if (def.custom || String(def.key).startsWith("x_")) {
            entry.custom = true;
            entry.label = previous[def.key]?.label || def.label;
        }
        fields[def.key] = entry;
    });
    return typeof normalizePlayerFields === "function" ? normalizePlayerFields(fields) : fields;
}

function renderPlayerFieldsEditor(division) {
    if (!playerFieldsGrid) return;
    const fields =
        typeof normalizePlayerFields === "function"
            ? normalizePlayerFields(division?.playerFields)
            : division?.playerFields || {};
    playerFieldsGrid.innerHTML = getPlayerFieldDefs(fields)
        .map((def) => {
            const entry = fields[def.key] || { visible: true, required: false };
            const visible = entry.visible !== false;
            const required = visible && entry.required === true;
            return `
                <article class="player-field-card" data-field="${def.key}">
                    <strong>${def.label}</strong>
                    <div class="player-field-toggles">
                        <label>
                            <input type="checkbox" id="pf-visible-${def.key}" data-pf-visible="${def.key}" ${visible ? "checked" : ""}>
                            <span>Show on auction</span>
                        </label>
                        <label>
                            <input type="checkbox" id="pf-required-${def.key}" data-pf-required="${def.key}" ${required ? "checked" : ""} ${visible ? "" : "disabled"}>
                            <span>Required</span>
                        </label>
                    </div>
                </article>
            `;
        })
        .join("");

    playerFieldsGrid.querySelectorAll("[data-pf-visible]").forEach((input) => {
        input.addEventListener("change", () => {
            const key = input.dataset.pfVisible;
            const requiredEl = document.getElementById(`pf-required-${key}`);
            if (requiredEl) {
                requiredEl.disabled = !input.checked;
                if (!input.checked) requiredEl.checked = false;
            }
            const active = getDraftActiveDivision();
            if (active) active.playerFields = readPlayerFieldsFromForm(active.playerFields);
        });
    });
    playerFieldsGrid.querySelectorAll("[data-pf-required]").forEach((input) => {
        input.addEventListener("change", () => {
            const active = getDraftActiveDivision();
            if (active) active.playerFields = readPlayerFieldsFromForm(active.playerFields);
        });
    });
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

        const enabled = card.querySelector(".team-bidder-enabled");
        const codeInput = card.querySelector(".team-bidder-code");
        const pinInput = card.querySelector(".team-bidder-pin");
        draftTeams[index].bidderEnabled = Boolean(enabled?.checked);
        const code = String(codeInput?.value || "").trim();
        if (code) draftTeams[index].bidderCode = code;
        else delete draftTeams[index].bidderCode;
        const pin = String(pinInput?.value || "").trim();
        if (pin) draftTeams[index].bidderPin = pin;
        else delete draftTeams[index].bidderPin;
    });
}

function randomBidderCode() {
    return Math.random().toString(16).slice(2, 8).toUpperCase();
}

function randomBidderPin() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

function bidderPortalLink(divisionId) {
    const origin = window.location.origin || "";
    const div = encodeURIComponent(divisionId || draftActiveDivisionId || "div_1");
    return `${origin}/bidder/?div=${div}`;
}

function refreshBidderPortalBanner() {
    const input = document.getElementById("bidder-portal-url");
    const link = bidderPortalLink(draftActiveDivisionId);
    if (input) input.value = link;
}

document.getElementById("copy-bidder-portal-url-btn")?.addEventListener("click", async () => {
    const input = document.getElementById("bidder-portal-url");
    const link = input?.value || bidderPortalLink(draftActiveDivisionId);
    try {
        await navigator.clipboard.writeText(link);
        if (input) {
            input.focus();
            input.select();
        }
        if (saveStatus) saveStatus.textContent = `Copied bidder URL: ${link}`;
    } catch (_) {
        if (input) {
            input.focus();
            input.select();
        }
        if (saveStatus) saveStatus.textContent = `Select and copy this bidder URL: ${link}`;
    }
});

function removeTeam(index) {
    syncDraftFromTeamCards();
    const removed = draftTeams[index];
    draftTeams.splice(index, 1);
    saveStatus.textContent = `Removed ${removed?.team_name || "team"}. Click Save to keep this change.`;
    renderTeamCards();
    renderIconCaptionAssignments();
    renderDivisionTabs();
}

function renderTeamCards() {
    if (!teamList) return;
    try {
        refreshBidderPortalBanner();
    } catch (error) {
        console.warn("Bidder URL banner:", error);
    }
    teamList.innerHTML = "";
    const portalUrl = bidderPortalLink(draftActiveDivisionId);
    draftTeams.forEach((team, index) => {
        const logoSrc = getTeamLogoSrc(team, "../assets/teams-logo");
        const hasUpload = Boolean(team.logo);
        const card = document.createElement("article");
        card.className = "team-config-card";
        card.innerHTML = `
            <div class="team-config-badge">
                <img class="team-logo-preview ${hasUpload ? "" : "is-empty"}" src="${logoSrc}" alt="${team.team_name} logo" onerror="this.classList.add('is-empty'); this.removeAttribute('src');">
                <span class="team-config-id">#${team.team_id}</span>
            </div>
            <div class="team-config-main">
                <input class="team-name-input" type="text" value="${team.team_name}" aria-label="Team name">
                <input class="team-color-input" type="color" value="${team.color || "#3498db"}" title="Team color">
                <div class="team-config-logo-row">
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
                <div class="team-bidder-box">
                    <label class="team-bidder-toggle">
                        <input type="checkbox" class="team-bidder-enabled" ${team.bidderEnabled ? "checked" : ""}>
                        <span>Bidder phone login</span>
                    </label>
                    <div class="team-bidder-fields">
                        <input class="team-bidder-code" type="text" placeholder="Code" value="${team.bidderCode || ""}" aria-label="Bidder code" autocomplete="off">
                        <input class="team-bidder-pin" type="text" placeholder="${team.bidderPinSet ? "PIN set — type to change" : "PIN"}" value="" aria-label="Bidder PIN" autocomplete="off">
                        <button type="button" class="secondary-btn" data-generate-bidder="${index}">Generate</button>
                        <button type="button" class="ghost-btn" data-copy-bidder-link="${index}">Copy link</button>
                    </div>
                    <label class="team-bidder-url-label">
                        Bidder URL (share this link)
                        <div class="team-bidder-url-row">
                            <input class="team-bidder-url" type="text" readonly value="${portalUrl}" aria-label="Bidder login URL">
                            <button type="button" class="ghost-btn" data-copy-bidder-link="${index}">Copy</button>
                        </div>
                    </label>
                    <p class="help tight">Optional. Share the URL + this team code/PIN. Team opens the link, logs in, and can bid from their phone.</p>
                </div>
            </div>
            <button type="button" class="link-danger" data-remove-team="${index}">Remove</button>
        `;
        teamList.appendChild(card);
    });

    teamList.querySelectorAll("[data-generate-bidder]").forEach((button) => {
        button.addEventListener("click", () => {
            const index = parseInt(button.dataset.generateBidder, 10);
            if (!draftTeams[index]) return;
            syncDraftFromTeamCards();
            draftTeams[index].bidderEnabled = true;
            draftTeams[index].bidderCode = randomBidderCode();
            draftTeams[index].bidderPin = randomBidderPin();
            draftTeams[index].bidderPinSet = false;
            saveStatus.textContent = `Generated bidder login for ${draftTeams[index].team_name}: code ${draftTeams[index].bidderCode}, PIN ${draftTeams[index].bidderPin}. Click Save.`;
            renderTeamCards();
            const card = teamList.querySelectorAll(".team-config-card")[index];
            const pinInput = card?.querySelector(".team-bidder-pin");
            if (pinInput) pinInput.value = draftTeams[index].bidderPin;
        });
    });

    teamList.querySelectorAll("[data-copy-bidder-link]").forEach((button) => {
        button.addEventListener("click", async () => {
            const card = button.closest(".team-config-card");
            const urlInput = card?.querySelector(".team-bidder-url");
            const link = urlInput?.value || bidderPortalLink(draftActiveDivisionId);
            try {
                await navigator.clipboard.writeText(link);
                if (urlInput) {
                    urlInput.focus();
                    urlInput.select();
                }
                saveStatus.textContent = `Copied bidder link: ${link}`;
            } catch (_) {
                if (urlInput) {
                    urlInput.focus();
                    urlInput.select();
                }
                saveStatus.textContent = `Select and copy this bidder link: ${link}`;
            }
        });
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
                if (!window.SaasAuth?.uploadMedia) {
                    throw new Error("Cloud upload required. Sign in and select a tournament.");
                }
                saveStatus.textContent = `Uploading logo for ${draftTeams[index].team_name}…`;
                if (draftTeams[index].logoKey) {
                    await window.SaasAuth.deleteMedia(draftTeams[index].logoKey).catch(() => {});
                }
                const uploaded = await window.SaasAuth.uploadMedia(file, "team-logo");
                draftTeams[index].logoKey = uploaded.objectKey;
                draftTeams[index].logo = uploaded.publicUrl || "";
                saveStatus.textContent = `Logo updated for ${draftTeams[index].team_name}. Click Save to keep this change.`;
                renderTeamCards();
            } catch (error) {
                saveStatus.textContent = error.message || "Could not upload logo.";
            }
        });
    });

    teamList.querySelectorAll("[data-clear-logo]").forEach((button) => {
        button.addEventListener("click", async () => {
            const index = parseInt(button.dataset.clearLogo, 10);
            if (!draftTeams[index]) return;
            syncDraftFromTeamCards();
            if (draftTeams[index].logoKey && window.SaasAuth?.deleteMedia) {
                await window.SaasAuth.deleteMedia(draftTeams[index].logoKey).catch(() => {});
            }
            delete draftTeams[index].logo;
            delete draftTeams[index].logoKey;
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
                if (!window.SaasAuth?.uploadMedia) {
                    throw new Error("Cloud upload required. Sign in and select a tournament.");
                }
                if (draftTeams[index].videoKey) {
                    await window.SaasAuth.deleteMedia(draftTeams[index].videoKey).catch(() => {});
                }
                const uploaded = await window.SaasAuth.uploadMedia(file, "team-video");
                draftTeams[index].videoKey = uploaded.objectKey;
                draftTeams[index].video = uploaded.publicUrl || "";
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
            if (draftTeams[index].videoKey && window.SaasAuth?.deleteMedia) {
                await window.SaasAuth.deleteMedia(draftTeams[index].videoKey).catch(() => {});
            }
            delete draftTeams[index].video;
            delete draftTeams[index].videoKey;
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
    renderIconCaptionAssignments();
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

function readIconCaptionFromForm(fallback = {}) {
    syncIconCaptionAssignmentsFromForm();
    const normalized =
        typeof normalizeIconCaptionSettings === "function"
            ? normalizeIconCaptionSettings(fallback)
            : {
                  enabled: false,
                  iconFee: 0,
                  captionFee: 0,
                  countTowardCategoryQuota: true
              };
    const hasAssignments = (draftTeams || []).some(
        (team) =>
            (team?.iconPlayerId != null && team.iconPlayerId !== "") ||
            (team?.captionPlayerId != null && team.captionPlayerId !== "")
    );
    return {
        // Keep feature on when teams already have Icon/Caption picks
        enabled: Boolean(iconCaptionEnabled?.checked) || hasAssignments,
        iconFee: parseMoneyInput(iconFeeInput?.value) || 0,
        captionFee: parseMoneyInput(captionFeeInput?.value) || 0,
        countTowardCategoryQuota: iconCaptionCountQuota ? iconCaptionCountQuota.checked : normalized.countTowardCategoryQuota !== false
    };
}

function applyIconCaptionToForm(settings) {
    const normalized =
        typeof normalizeIconCaptionSettings === "function"
            ? normalizeIconCaptionSettings(settings)
            : {
                  enabled: false,
                  iconFee: 0,
                  captionFee: 0,
                  countTowardCategoryQuota: true,
                  ...(settings || {})
              };
    if (iconCaptionEnabled) iconCaptionEnabled.checked = Boolean(normalized.enabled);
    setInputFromRupees(iconFeeInput, normalized.iconFee || 0);
    setInputFromRupees(captionFeeInput, normalized.captionFee || 0);
    if (iconCaptionCountQuota) {
        iconCaptionCountQuota.checked = normalized.countTowardCategoryQuota !== false;
    }
    refreshIconCaptionFeePreviews();
    syncIconCaptionSettingsVisibility();
}

function refreshIconCaptionFeePreviews() {
    const iconFee = parseMoneyInput(iconFeeInput?.value);
    const captionFee = parseMoneyInput(captionFeeInput?.value);
    if (iconFeePreview) {
        iconFeePreview.textContent = Number.isFinite(iconFee) ? formatMoney(iconFee) : "Invalid";
    }
    if (captionFeePreview) {
        captionFeePreview.textContent = Number.isFinite(captionFee) ? formatMoney(captionFee) : "Invalid";
    }
}

function syncIconCaptionSettingsVisibility() {
    if (!iconCaptionSettings) return;
    iconCaptionSettings.hidden = !iconCaptionEnabled?.checked;
}

function playerOptionLabel(player) {
    const code =
        typeof getPlayerDisplayCode === "function"
            ? getPlayerDisplayCode(player)
            : player?.code || player?.id || "";
    const category = displayCategoryName(player?.category || "");
    return `${player?.name || "Player"} · ${code} · ${category}`;
}

function resolveConfigPlayerPhotoSrc(photo) {
    const value = String(photo || "").trim();
    if (!value || /placeholder\.png/i.test(value)) return "../assets/placeholder.png";
    if (/^(https?:|data:|blob:)/i.test(value)) return value;
    if (value.startsWith("../") || value.startsWith("/")) return value;
    if (value.startsWith("assets/") || value.startsWith("data-project/")) return `../${value}`;
    return `../${value.replace(/^\.\//, "")}`;
}

function findDraftDivisionPlayer(playerId) {
    if (playerId == null || playerId === "") return null;
    if (typeof findPlayerByAssignableId === "function") {
        return findPlayerByAssignableId(draftDivisionPlayers || [], playerId);
    }
    return (
        (draftDivisionPlayers || []).find(
            (player) =>
                String(player.id) === String(playerId) ||
                String(player.code || "") === String(playerId)
        ) || null
    );
}

function normalizeAssignableFormId(value) {
    if (value == null || value === "") return null;
    return Number.isFinite(Number(value)) ? Number(value) : String(value);
}

function setTeamAssignableRole(teamIndex, role, playerId) {
    if (!draftTeams[teamIndex]) return;
    const key = role === "caption" ? "captionPlayerId" : "iconPlayerId";
    const normalized = normalizeAssignableFormId(playerId);
    if (normalized == null) delete draftTeams[teamIndex][key];
    else draftTeams[teamIndex][key] = normalized;
}

function syncIconCaptionAssignmentsFromForm() {
    if (!iconCaptionTeamList) return;
    iconCaptionTeamList.querySelectorAll("[data-icon-team-index]").forEach((row) => {
        const index = Number(row.dataset.iconTeamIndex);
        if (!draftTeams[index]) return;
        const iconValue = row.querySelector("[data-icon-player]")?.value || "";
        const captionValue = row.querySelector("[data-caption-player]")?.value || "";
        setTeamAssignableRole(index, "icon", iconValue);
        setTeamAssignableRole(index, "caption", captionValue);
    });
}

function getIconCaptionTakenIds(exceptTeamIndex = -1, exceptRole = "") {
    const taken = new Set();
    draftTeams.forEach((team, index) => {
        if (team.iconPlayerId != null && team.iconPlayerId !== "") {
            if (!(index === exceptTeamIndex && exceptRole === "icon")) {
                taken.add(String(team.iconPlayerId));
            }
        }
        if (team.captionPlayerId != null && team.captionPlayerId !== "") {
            if (!(index === exceptTeamIndex && exceptRole === "caption")) {
                taken.add(String(team.captionPlayerId));
            }
        }
    });
    return taken;
}

function filterDraftPlayersForPicker(query, takenIds, selectedId) {
    const needle = String(query || "").trim().toLowerCase();
    const selectedKey = selectedId == null || selectedId === "" ? "" : String(selectedId);
    return (draftDivisionPlayers || []).filter((player) => {
        const id = String(player.id);
        if (id !== selectedKey && takenIds.has(id)) return false;
        if (!needle) return true;
        const haystack = [
            player.name,
            player.code,
            typeof getPlayerDisplayCode === "function" ? getPlayerDisplayCode(player) : "",
            player.category,
            player.currentClub,
            player.role,
            player.mobile
        ]
            .map((value) => String(value || "").toLowerCase())
            .join(" ");
        return haystack.includes(needle);
    });
}

function renderPlayerSearchResults(menuEl, players, selectedId) {
    if (!menuEl) return;
    const selectedKey = selectedId == null || selectedId === "" ? "" : String(selectedId);
    if (!players.length) {
        menuEl.innerHTML = `<div class="player-search-empty">No matching players</div>`;
        return;
    }
    menuEl.innerHTML = players
        .slice(0, 60)
        .map((player) => {
            const id = String(player.id);
            const active = id === selectedKey ? "is-active" : "";
            const photo = resolveConfigPlayerPhotoSrc(player.photo);
            return `
                <button type="button" class="player-search-option ${active}" data-player-id="${id}">
                    <img src="${photo}" alt="" onerror="this.src='../assets/placeholder.png'">
                    <span>
                        <strong>${player.name || "Player"}</strong>
                        <small>${playerOptionLabel(player)}</small>
                    </span>
                </button>
            `;
        })
        .join("");
}

function closeAllPlayerSearchMenus(exceptPicker = null) {
    iconCaptionTeamList?.querySelectorAll(".player-search-picker").forEach((picker) => {
        if (exceptPicker && picker === exceptPicker) return;
        picker.classList.remove("is-open", "is-open-up");
        const menu = picker.querySelector(".player-search-menu");
        if (menu) menu.hidden = true;
    });
}

function updatePlayerSearchTrigger(picker, playerId) {
    const trigger = picker.querySelector(".player-search-trigger");
    const hidden = picker.querySelector('input[type="hidden"]');
    const img = picker.querySelector(".player-search-trigger img");
    const label = picker.querySelector(".player-search-trigger-label");
    const clearBtn = picker.querySelector(".player-search-clear");
    if (!trigger || !hidden) return;

    const player = findDraftDivisionPlayer(playerId);
    hidden.value = player ? String(player.id) : "";
    if (img) {
        img.src = player
            ? resolveConfigPlayerPhotoSrc(player.photo)
            : "../assets/placeholder.png";
    }
    if (label) {
        label.innerHTML = player
            ? `<strong>${player.name || "Player"}</strong><small>${playerOptionLabel(player)}</small>`
            : `<strong>None</strong><small>Optional — leave empty</small>`;
    }
    if (clearBtn) clearBtn.hidden = !player;
    trigger.classList.toggle("is-empty", !player);
}

function buildPlayerSearchPickerHtml({ teamIndex, role, selectedId, teamName }) {
    const player = findDraftDivisionPlayer(selectedId);
    const photo = player
        ? resolveConfigPlayerPhotoSrc(player.photo)
        : "../assets/placeholder.png";
    const title = role === "caption" ? "Caption" : "Icon";
    return `
        <div class="player-search-field">
            <span class="player-search-field-label">${title} <em>(optional)</em></span>
            <div class="player-search-picker" data-team-index="${teamIndex}" data-role="${role}">
                <input type="hidden" data-${role}-player value="${player ? String(player.id) : ""}">
                <button type="button" class="player-search-trigger ${player ? "" : "is-empty"}" aria-label="${teamName} ${title}">
                    <img src="${photo}" alt="" onerror="this.src='../assets/placeholder.png'">
                    <span class="player-search-trigger-label">
                        ${
                            player
                                ? `<strong>${player.name || "Player"}</strong><small>${playerOptionLabel(player)}</small>`
                                : `<strong>None</strong><small>Optional — leave empty</small>`
                        }
                    </span>
                </button>
                <button type="button" class="player-search-clear" title="Clear" ${player ? "" : "hidden"}>×</button>
                <div class="player-search-menu" hidden>
                    <input type="search" class="player-search-input" placeholder="Search name, ID, club..." autocomplete="off">
                    <div class="player-search-results"></div>
                </div>
            </div>
        </div>
    `;
}

function bindPlayerSearchPicker(picker) {
    const teamIndex = Number(picker.dataset.teamIndex);
    const role = picker.dataset.role;
    const trigger = picker.querySelector(".player-search-trigger");
    const clearBtn = picker.querySelector(".player-search-clear");
    const menu = picker.querySelector(".player-search-menu");
    const searchInput = picker.querySelector(".player-search-input");
    const results = picker.querySelector(".player-search-results");
    const hidden = picker.querySelector('input[type="hidden"]');
    if (!trigger || !menu || !searchInput || !results || !hidden) return;

    const refreshResults = () => {
        const taken = getIconCaptionTakenIds(teamIndex, role);
        const matches = filterDraftPlayersForPicker(searchInput.value, taken, hidden.value);
        renderPlayerSearchResults(results, matches, hidden.value);
        results.querySelectorAll("[data-player-id]").forEach((btn) => {
            btn.addEventListener("click", () => {
                setTeamAssignableRole(teamIndex, role, btn.dataset.playerId);
                updatePlayerSearchTrigger(picker, btn.dataset.playerId);
                closeAllPlayerSearchMenus();
                renderIconCaptionAssignments();
            });
        });
    };

    const positionMenu = () => {
        picker.classList.remove("is-open-up");
        menu.hidden = false;
        const rect = trigger.getBoundingClientRect();
        const menuHeight = Math.min(menu.scrollHeight || 320, 340);
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        if (spaceBelow < menuHeight + 24 && spaceAbove > spaceBelow) {
            picker.classList.add("is-open-up");
        }
    };

    const openMenu = () => {
        closeAllPlayerSearchMenus(picker);
        picker.classList.add("is-open");
        searchInput.value = "";
        refreshResults();
        positionMenu();
        setTimeout(() => searchInput.focus(), 20);
    };

    trigger.addEventListener("click", (event) => {
        event.preventDefault();
        if (picker.classList.contains("is-open")) closeAllPlayerSearchMenus();
        else openMenu();
    });

    clearBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setTeamAssignableRole(teamIndex, role, "");
        updatePlayerSearchTrigger(picker, null);
        closeAllPlayerSearchMenus();
        renderIconCaptionAssignments();
    });

    searchInput.addEventListener("input", refreshResults);
    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeAllPlayerSearchMenus();
        }
    });
}

function renderIconCaptionAssignments() {
    if (!iconCaptionTeamList) return;
    syncIconCaptionSettingsVisibility();
    if (!draftTeams.length) {
        iconCaptionTeamList.innerHTML = `<p class="help">Add teams first. Icon / Caption stays optional for each team.</p>`;
        return;
    }
    if (!(draftDivisionPlayers || []).length) {
        iconCaptionTeamList.innerHTML = `<p class="help">No players loaded for this division yet. Upload / manage players first.</p>`;
        return;
    }

    iconCaptionTeamList.innerHTML = draftTeams
        .map((team, index) => {
            return `
                <article class="icon-caption-team-card" data-icon-team-index="${index}">
                    <strong>${team.team_name}</strong>
                    <div class="icon-caption-picks">
                        ${buildPlayerSearchPickerHtml({
                            teamIndex: index,
                            role: "icon",
                            selectedId: team.iconPlayerId,
                            teamName: team.team_name
                        })}
                        ${buildPlayerSearchPickerHtml({
                            teamIndex: index,
                            role: "caption",
                            selectedId: team.captionPlayerId,
                            teamName: team.team_name
                        })}
                    </div>
                </article>
            `;
        })
        .join("");

    iconCaptionTeamList.querySelectorAll(".player-search-picker").forEach((picker) => {
        bindPlayerSearchPicker(picker);
    });
}

async function refreshIconCaptionPlayersAndRender() {
    const divisionId = draftActiveDivisionId;
    draftDivisionPlayers = await loadDivisionPlayersForFieldSync(divisionId);
    renderIconCaptionAssignments();
}

function renderAll() {
    refreshTournamentPreview();
    renderDivisionTabs();
    renderTeamCards();
    renderSequenceEditor();
    renderCategoryCards();
    renderPlayerFieldsEditor(getDraftActiveDivision());
    refreshOrderUI();
    refreshDivisionScopedLabels();
    void refreshIconCaptionPlayersAndRender();
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

async function loadDivisionPlayersForFieldSync(divisionId) {
    let players = typeof loadStoredPlayers === "function" ? loadStoredPlayers(divisionId) || [] : [];
    if (players.length) return players;
    if (typeof fetchProjectSnapshot !== "function") return [];
    try {
        const snapshot = await fetchProjectSnapshot();
        const entry = (snapshot.divisions || []).find((item) => item.id === divisionId);
        if (Array.isArray(entry?.players) && entry.players.length) {
            players = entry.players;
            try {
                localStorage.setItem(`auctionPlayers:${divisionId}`, JSON.stringify(players));
            } catch (_) {
                // ignore cache write failures
            }
        }
    } catch (_) {
        return [];
    }
    return players;
}

async function syncDraftPlayerFieldsFromRoster(divisionId = draftActiveDivisionId) {
    if (typeof applyPlayerFieldsFromSpreadsheet !== "function") return false;
    if (typeof buildPlayerFieldPresenceFromRoster !== "function") return false;
    const division = draftDivisions.find((item) => item.id === divisionId);
    if (!division) return false;
    const players = await loadDivisionPlayersForFieldSync(divisionId);
    if (!players.length) return false;
    const presence = buildPlayerFieldPresenceFromRoster(players, []);
    const before = JSON.stringify(division.playerFields || {});
    const tempConfig = {
        divisions: draftDivisions,
        activeDivisionId: divisionId
    };
    const updated = applyPlayerFieldsFromSpreadsheet(tempConfig, divisionId, presence);
    const nextDivision =
        typeof getActiveDivision === "function"
            ? getActiveDivision(setActiveDivisionId?.(updated, divisionId) || updated)
            : (updated.divisions || []).find((item) => item.id === divisionId);
    if (!nextDivision) return false;
    division.playerFields = nextDivision.playerFields;
    return before !== JSON.stringify(division.playerFields || {});
}

async function loadForm() {
    try {
        if (typeof reloadTournamentFromDb === "function") {
            await reloadTournamentFromDb();
        } else if (typeof hydrateLocalStorageFromProjectFolder === "function") {
            await hydrateLocalStorageFromProjectFolder();
        }
    } catch (error) {
        if (saveStatus) {
            saveStatus.textContent = error.message || "Could not load configuration from database.";
        }
    }
    const config = await getAuctionConfig();
    draftTournament = JSON.parse(JSON.stringify(config.tournament || DEFAULT_TOURNAMENT));
    draftDivisions = JSON.parse(JSON.stringify(config.divisions || []));
    draftActiveDivisionId = config.activeDivisionId || draftDivisions[0]?.id || "div_1";
    // Player field Show/Required checkboxes come from DB only.
    // Do NOT re-sync from roster here — that was wiping saved toggles on every refresh.
    tournamentNameInput.value = draftTournament.name || "";
    tournamentYearInput.value = draftTournament.year || "";
    applyDivisionFieldsToForm(getDraftActiveDivision());
    renderAll();
    if (saveStatus && !String(saveStatus.textContent || "").includes("Could not load")) {
        const teamCount = (getDraftActiveDivision()?.teams || []).length;
        const activeFields = getDraftActiveDivision()?.playerFields || {};
        const visibleCount = Object.values(activeFields).filter((f) => f && f.visible !== false).length;
        saveStatus.textContent = `Loaded from database: ${getTournamentTitle(draftTournament)} · ${draftDivisions.length} division(s) · ${teamCount} teams · ${visibleCount} player field(s) shown on auction.`;
    }
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

async function saveForm() {
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
        saveStatus.textContent = "Saving full configuration to database…";
        const saveFn =
            typeof saveAuctionConfigToDisk === "function" ? saveAuctionConfigToDisk : saveAuctionConfig;
        await saveFn(draft);
        // Re-fetch from Postgres so the form matches what will load next visit.
        if (typeof reloadTournamentFromDb === "function") {
            await reloadTournamentFromDb();
        }
        const saved = await getAuctionConfig();
        draftTournament = JSON.parse(JSON.stringify(saved.tournament || DEFAULT_TOURNAMENT));
        draftDivisions = JSON.parse(JSON.stringify(saved.divisions || []));
        draftActiveDivisionId = saved.activeDivisionId || draftDivisions[0]?.id || "div_1";
        tournamentNameInput.value = draftTournament.name || "";
        tournamentYearInput.value = draftTournament.year || "";
        applyDivisionFieldsToForm(getDraftActiveDivision());
        const active = getActiveDivision(saved);
        const teamCount = (active.teams || []).length;
        const iconAssigned = (active.teams || []).filter(
            (team) => team.iconPlayerId != null && team.iconPlayerId !== ""
        ).length;
        const captionAssigned = (active.teams || []).filter(
            (team) => team.captionPlayerId != null && team.captionPlayerId !== ""
        ).length;
        const orderLabel =
            active.auctionOrder === "RANDOM"
                ? "Random"
                : active.categorySequence.map((name, index) => `${index + 1}. ${displayCategoryName(name)}`).join(" → ");
        const iconNote =
            active.iconCaption?.enabled || iconAssigned || captionAssigned
                ? ` Icon/Caption on (${iconAssigned} icon, ${captionAssigned} caption).`
                : "";
        saveStatus.textContent = `Saved in database. ${getTournamentTitle(saved.tournament)}. ${saved.divisions.length} division(s). Active: ${active.name} (${teamCount} teams). Order: ${orderLabel}. Kitty ${formatMoney(active.teamKitty)}.${iconNote}`;
        renderAll();
    } catch (error) {
        saveStatus.textContent = error.message || "Could not save configuration to database.";
    }
}

teamKittyInput.addEventListener("input", refreshKittyPreview);
iconCaptionEnabled?.addEventListener("change", () => {
    syncIconCaptionSettingsVisibility();
    renderIconCaptionAssignments();
});
iconFeeInput?.addEventListener("input", refreshIconCaptionFeePreviews);
captionFeeInput?.addEventListener("input", refreshIconCaptionFeePreviews);
document.addEventListener("click", (event) => {
    if (!iconCaptionTeamList) return;
    if (event.target.closest?.(".player-search-picker")) return;
    closeAllPlayerSearchMenus();
});
tournamentNameInput.addEventListener("input", refreshTournamentPreview);
tournamentYearInput.addEventListener("input", refreshTournamentPreview);
tournamentLogoUploadBtn.addEventListener("click", () => tournamentLogoFile.click());
tournamentLogoFile.addEventListener("change", async () => {
    const file = tournamentLogoFile.files && tournamentLogoFile.files[0];
    tournamentLogoFile.value = "";
    if (!file) return;
    try {
        if (!window.SaasAuth?.uploadMedia) {
            throw new Error("Cloud upload required. Sign in and select a tournament.");
        }
        saveStatus.textContent = "Uploading project logo…";
        if (draftTournament.logoKey) {
            await window.SaasAuth.deleteMedia(draftTournament.logoKey).catch(() => {});
        }
        const uploaded = await window.SaasAuth.uploadMedia(file, "tournament-logo");
        draftTournament.logoKey = uploaded.objectKey;
        draftTournament.logo = uploaded.publicUrl || "";
        saveStatus.textContent = "Project logo updated. Click Save to keep this change.";
        refreshTournamentPreview();
    } catch (error) {
        saveStatus.textContent = error.message || "Could not upload logo.";
    }
});
tournamentLogoClearBtn.addEventListener("click", async () => {
    if (draftTournament.logoKey && window.SaasAuth?.deleteMedia) {
        await window.SaasAuth.deleteMedia(draftTournament.logoKey).catch(() => {});
    }
    delete draftTournament.logo;
    delete draftTournament.logoKey;
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
            const saveFn =
                typeof saveAuctionConfigToDisk === "function"
                    ? saveAuctionConfigToDisk
                    : saveAuctionConfig;
            await saveFn(readFormConfig());
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
    const securityKey = prompt("Enter the security key: (chintan)");
    if (securityKey !== "chintan") {
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

function initConfigAccordions() {
    const panels = Array.from(document.querySelectorAll(".config-panel[data-accordion]"));
    if (!panels.length) return;

    const setOpen = (panel, open) => {
        const toggle = panel.querySelector(".panel-toggle");
        const body = panel.querySelector(".panel-body");
        panel.classList.toggle("is-open", open);
        if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
        if (body) body.hidden = !open;
    };

    panels.forEach((panel) => {
        const toggle = panel.querySelector(".panel-toggle");
        if (!toggle) return;
        toggle.addEventListener("click", () => {
            const willOpen = !panel.classList.contains("is-open");
            panels.forEach((other) => setOpen(other, other === panel ? willOpen : false));
        });
        setOpen(panel, panel.classList.contains("is-open"));
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    initConfigAccordions();
    try {
        if (window.SaasAuth?.requireAuth) {
            const me = await window.SaasAuth.requireAuth();
            if (!me) return;
        }
        if (typeof usesTournamentDb === "function" && !usesTournamentDb()) {
            saveStatus.textContent = "Select a tournament first from the dashboard.";
            window.location.href = "/app/tournaments.html";
            return;
        }
        saveStatus.textContent = "Loading configuration from database…";
        await loadForm();
    } catch (error) {
        saveStatus.textContent = error.message || "Sign in required.";
    }
});
