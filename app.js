//History stack
let history = {
        undoStack: [],
        redoStack: []
}

let state = {
        players: [],
        teams: [],
        auctionCount: 0,
        soldCount: 0,
        unsoldCount: 0,
        soldPlayers: [],
        unsoldPlayers: [],
        skippedPlayers: []
    };

const getTournamentData = async () => {
    const response = await fetch("data/tournament.json");
    // Return the fetched data directly
    return await response.json();
};

//Get the player data as array of objects from the players.json file
const getPlayersData = async () => {
    const response = await fetch("data/players.json");
    // Instead of assigning to a variable, return the data directly
    return await response.json();
};
//Get teams data
const getTeamsData = async () => {
    const response = await fetch("data/teams.json");
    // Return the data directly
    return await response.json();
};

// Keys for teams in list order. Avoids plain "s" / "u" (sold / unsold). Extra teams still clickable.
const TEAM_HOTKEYS = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=",
    "q", "w", "e", "r", "t", "y", "o", "a", "d", "f", "g", "h",
    "j", "k", "l", "z", "x", "c", "v", "n", "m", "b", "p"
];

function findTeam(teamId) {
    return state.teams.find(team => team.team_id === teamId);
}

function teamFromHotkey(key) {
    const index = TEAM_HOTKEYS.indexOf(key);
    if (index < 0 || index >= state.teams.length) return null;
    return state.teams[index];
}

//DOM for Welcome Modal
let welcomeModal = document.getElementById("welcome-modal");
let welcomeResumeBtn = document.getElementById("welcome-resume-btn");
let welcomeStartNewBtn = document.getElementById("welcome-start-new-btn");
let welcomeResetBtn = document.getElementById("welcome-reset-btn");

//Buttons for Editing Budgets
let budgetModal = document.getElementById("budget-modal");
let modalCloseBtn = document.getElementById("modal-close-btn");
let budgetEditorList = document.getElementById("budget-editor-list");

//DOM for Direct Bidding
let directBidModal = document.getElementById("direct-bid-modal");
let directBidCloseBtn = document.getElementById("direct-bid-close-btn");
let teamSelectDropdown = document.getElementById("team-select-dropdown");
let directBidAmountInput = document.getElementById("direct-bid-amount");
let submitBidBtn = document.getElementById("submit-bid-btn");
let directBidForm = document.getElementById("direct-bid-form");

//DOM for Finish Screen
let roundEndModal = document.getElementById("round-end-modal");
let restartUnsoldBtn = document.getElementById("restart-unsold-btn");
let finishAuctionBtn = document.getElementById("finish-auction-btn");
let roundSummaryText = document.getElementById("round-summary-text");

//DOM for Final Finish Screen
let finishScreenModal = document.getElementById("finish-screen-modal");
let finishModalCloseBtn = document.getElementById("finish-modal-close-btn");

//DOM Manipulation
let playerName = document.getElementById("player-name");
let playerPhoto = document.getElementById("player-image")
let playerRole = document.getElementById("player-role");
let playerBattingStyle = document.getElementById("player-batting-style");
let playerBowlingStyle = document.getElementById("player-bowling-style");
let playerClub = document.getElementById("player-club");
let playerCategory = document.getElementById("player-category");
let playerId = document.getElementById("player-id");
let playerBasePrice = document.getElementById("base-price");

let currentBidAmount = document.getElementById("current-bid");
let currentBidTeam = document.getElementById("current-bid-team");

//Button DOM's
let undoButton   = document.getElementById("undo-button");
let redoButton   = document.getElementById("redo-button");
let resetButton  = document.getElementById("reset-button");
let teamsButton  = document.getElementById("teams-button");
let skipButton   = document.getElementById("skip-button");
let spinButton   = document.getElementById("spin-button");
let unsoldButton = document.getElementById("unsold-button");
let soldButton   = document.getElementById("sold-button");
let nextButton   = document.getElementById("next-button");

//Seal DOM
unsoldSeal = document.getElementById("unsold-seal");
soldSeal = document.getElementById("sold-seal");


// showAmount / formatMoney come from js/money.js

/**
 * Hides the welcome modal and starts the main UI.
 * This is called by the button handlers.
 */
function startMainApplication(isResuming) {
    if (isResuming) {
        // Fix auction count if the last loaded player was already done
        if (state.auctionCount < state.players.length) {
            const lastPlayerStatus = state.players[state.auctionCount].status;
            if (lastPlayerStatus === "sold" || lastPlayerStatus === "unsold" || lastPlayerStatus === "skipped") {
                state.auctionCount++;
            }
        }
    }
    
    // Render the UI for the first time
    renderUI();
    updateUndoRedoButtons();
    
    // Hide the modal
    welcomeModal.style.display = 'none';
}

/**
 * Click handler for "Resume Auction" button.
 */
function handleWelcomeResume() {
    console.log("Resuming auction...");
    // Data is already pre-loaded by initApp, just start the UI
    startMainApplication(true);
}

function closeWelcomeModal() {
    welcomeModal.style.display = 'none';
}

//This Function is used to show tounament details in the screen
function showTournamentDetails() {
    // Check if tournament data exists before trying to display it
    if (!state.tournament) return;

    const logoEl = document.querySelector(".tournament-logo");
    const headline = document.querySelector(".headline");
    if (logoEl) {
        logoEl.src = getTournamentLogoSrc(state.tournament, "assets/tournament-logo.png");
        logoEl.onerror = () => {
            logoEl.src = "assets/tournament-logo.png";
        };
    }
    if (headline) {
        headline.innerText = getTournamentTitle(state.tournament);
    }
}

function triggerAnim(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
}

//this function will show specific player details in the UI
function showPlayerDetails(i) {
    triggerAnim(document.querySelector(".player-stage"), "player-swap");

    playerName.innerText = state.players[i].name;
    playerRole.innerText = state.players[i].role;
    playerPhoto.src = state.players[i].photo;
    playerPhoto.alt = state.players[i].name;
    playerBattingStyle.innerText = state.players[i].battingStyle;
    playerBowlingStyle.innerText = state.players[i].bowlingStyle;
    playerClub.innerText = state.players[i].currentClub;
    const categoryName = normalizeCategoryName(state.players[i].category);
    const categoryMeta = getCategoryConfig(getActiveConfig(state), categoryName);
    playerCategory.innerText = categoryName;
    playerCategory.title = `Max ${categoryMeta.maxPlayers} per team`;
    playerId.innerText = state.players[i].id;
    playerBasePrice.innerText = showAmount(state.players[i].basePrice);
    
    playerPhoto.onerror = function() {
        this.src = 'assets/placeholder.png'; // Add a placeholder image
    };

    updateCurrentBidPanel(state.players[i]);


    // --- 💡 NEW CONSOLIDATED UI LOGIC (Using classList) ---
    const playerStatus = state.players[i].status;
    const hasBids = state.players[i].bids.length > 0;
    const statusChip = document.getElementById("player-status-chip");

    // Use 'style.display' for buttons (this is fine)
    // Use 'classList' for seals
    if (playerStatus === "sold") {
        // Player is SOLD
        soldButton.style.display = "none";
        unsoldButton.style.display = "none";
        nextButton.style.display = "block";
        soldSeal.classList.add("show");     // Show SOLD
        unsoldSeal.classList.remove("show"); // Hide UNSOLD
        if (statusChip) {
            statusChip.dataset.status = "sold";
            statusChip.textContent = "SOLD";
        }

    } else if (playerStatus === "unsold" || playerStatus === "skipped") {
        // Player is UNSOLD or SKIPPED
        soldButton.style.display = "none";
        unsoldButton.style.display = "none";
        nextButton.style.display = "block";
        soldSeal.classList.remove("show");  // Hide SOLD
        unsoldSeal.classList.add("show"); // Show UNSOLD
        if (statusChip) {
            statusChip.dataset.status = playerStatus;
            statusChip.textContent = playerStatus === "skipped" ? "SKIPPED" : "UNSOLD";
        }

    } else { 
        // Player is "not-auctioned" (i.e., bidding is active)
        soldSeal.classList.remove("show");  // Hide SOLD
        unsoldSeal.classList.remove("show"); // Hide UNSOLD
        if (statusChip) {
            statusChip.dataset.status = "live";
            statusChip.textContent = hasBids ? "BIDDING" : "LIVE";
        }

        if (hasBids) {
            // Active with bids
            soldButton.style.display = "block";
            unsoldButton.style.display = "none";
            nextButton.style.display = "none";
        } else {
            // Active with NO bids
            soldButton.style.display = "none";
            unsoldButton.style.display = "block";
            nextButton.style.display = "none";
        }
    }
}

function getTeamSquadCapacity(auctionState = state) {
    const config = getActiveConfig(auctionState);
    return Object.values(config.categories || {}).reduce(
        (sum, category) => sum + (Number(category?.maxPlayers) || 0),
        0
    );
}

function updateCurrentBidPanel(player) {
    const bidSection = document.getElementById("current-bid-section");
    const teamPanel = document.getElementById("current-bid-team-panel");
    const teamStats = document.getElementById("current-bid-team-stats");
    const purseEl = document.getElementById("current-bid-team-purse");
    const pendingEl = document.getElementById("current-bid-team-pending");
    const slotsEl = document.getElementById("current-bid-team-slots");

    if (!player || !player.bids || player.bids.length === 0) {
        currentBidAmount.innerText = "00K";
        currentBidTeam.innerText = "NO BIDS";
        if (teamPanel) teamPanel.style.backgroundColor = "#73849a";
        if (bidSection) bidSection.dataset.hasBidder = "false";
        if (teamStats) teamStats.hidden = true;
        if (purseEl) purseEl.textContent = "—";
        if (pendingEl) pendingEl.textContent = "—";
        if (slotsEl) slotsEl.textContent = "—";
        return;
    }

    const lastBid = player.bids[player.bids.length - 1];
    const team = findTeam(lastBid.team);
    const quota = team
        ? getCategoryQuotaStatus(state, team.team_id, player.category)
        : null;
    const capacity = getTeamSquadCapacity(state);
    const bought = Number(team?.player_bought) || 0;
    const slotsLeft = Math.max(0, capacity - bought);
    // After this buy they'd use one slot; pending for category is slots still open
    const categoryPending = quota ? Math.max(0, quota.remaining) : 0;

    currentBidAmount.innerText = showAmount(lastBid.amount);
    currentBidTeam.innerText = team ? team.team_name : "UNKNOWN";
    if (teamPanel) teamPanel.style.backgroundColor = team ? team.color : "#12a39a";
    if (bidSection) bidSection.dataset.hasBidder = "true";

    if (teamStats) teamStats.hidden = !team;
    if (purseEl) {
        purseEl.textContent = team ? showAmount(team.remaining_budget) : "—";
        purseEl.title = team ? `Remaining purse: ${formatMoney(team.remaining_budget)}` : "";
    }
    if (pendingEl) {
        pendingEl.textContent = quota ? `${categoryPending}` : "—";
        pendingEl.title = quota
            ? `${quota.owned}/${quota.max} ${displayCategoryName(quota.name)} bought · ${categoryPending} pending in category`
            : "";
    }
    if (slotsEl) {
        slotsEl.textContent = `${slotsLeft}`;
        slotsEl.title = `${bought}/${capacity} squad filled · ${slotsLeft} slots left overall`;
    }
}

// Bid increments scaled for Rs auctions (Lakh / Crore).
function bidIncrement(currentBid) {
  if (currentBid >= 10000000) { // 1 Cr+
    return 500000; // +5 L
  } else if (currentBid >= 5000000) { // 50 L+
    return 200000; // +2 L
  } else if (currentBid >= 1000000) { // 10 L+
    return 100000; // +1 L
  } else if (currentBid >= 500000) { // 5 L+
    return 50000; // +50 K
  } else if (currentBid >= 200000) { // 2 L+
    return 25000; // +25 K
  } else {
    return 10000; // +10 K
  }
}

function bidPlayer(team_id) {
    if (playerWheelBusy || categoryGateBusy) return;

    let bidAmount;

    const player =  state.players[state.auctionCount];      //Take a copy of the player's object
    const team = findTeam(team_id);
    if (!player || !team) return;

    //Prevent bidding for any sold or unsold player
    if(player.status === "unsold" || player.status === "sold"){
        return;
    }

    const quota = getCategoryQuotaStatus(state, team_id, player.category);
    if (quota.isFull) {
        alert(`${team.team_name} already has ${quota.owned}/${quota.max} ${quota.name} players.`);
        return;
    }

    if(player.bids.length === 0 && team.remaining_budget >= player.basePrice){   //while there are no bids for the player accept any bid, Bidder must have more money remaining than the players base price
        bidAmount = player.basePrice; //base price become the first bid amount
        
    } else {                                                    //while there are existing  bids for the player
        let lastBid = player.bids[player.bids.length - 1];      //Last bid object of the player
        const nextAmount = lastBid.amount + bidIncrement(lastBid.amount);

        // Prevent same team from bidding twice in a row
        if (lastBid.team != team_id && team.remaining_budget >= nextAmount) {
            bidAmount = nextAmount;
        } else {
            console.log(lastBid.team == team_id ? `${team.team_name} tried to bid twice in a row. NOT ACCEPTED.` : `${team.team_name} doesn't have enough money to bid for this player.`);
            return; // Don't update UI if bid not accepted
        }
    }

    //Save history
    saveHistory();
    
    state.players[state.auctionCount].bids.push({ team: team_id, amount: bidAmount }); //Add bid to the state.players original object object
    console.log(`${state.players[state.auctionCount].name} is bidded by ${team.team_name}`);

    //Update the UI
    renderUI();
    triggerAnim(document.getElementById("current-bid"), "updated");
    triggerAnim(document.getElementById("current-bid-section"), "live-bid");
    triggerAnim(document.getElementById(`team-${team_id}`), "bid-flash");
    triggerAnim(document.getElementById(`team-rail-${team_id}`), "bid-flash");

    //save current state to local storage
    saveData();
}

function saveData() {
    let data = {
        auctionState: state,
        historyData: history 
    }
    localStorage.setItem('auctionData', JSON.stringify(data));        //Save current state
    console.log("All data saved...")
}

function unsoldPlayer() {
    //Prevent player to unsold after a bid is placed
    if(state.players[state.auctionCount].bids.length > 0){
        console.log("A player can't be unsold because atleast one bid is placed.");
        return;
    }

    const player = state.players[state.auctionCount];

    //Save history
    saveHistory();

    state.unsoldPlayers.push(player.id); // Use the new variable
    player.status = "unsold";            // Use the new variable

    const playerInMasterList = state.allPlayers.find(p => p.id === player.id);
    if (playerInMasterList) {
        playerInMasterList.status = "unsold";
    }

    state.unsoldCount++;             //Increamented the unsold count

    console.log(`${state.players[state.auctionCount].name} remains unsold.`);

    // unsoldSeal.style.display = "block"; //Show the unsold seal

    //Update Screen
    renderUI()

    //save current state to local storage
    saveData();
}

function soldPlayer() {
    //prevent player to be sold until a bid is placed
    if(state.players[state.auctionCount].bids.length === 0){
        console.log("Can't sold this player because no bid is placed");
        return;
    }

    const player = state.players[state.auctionCount];  //current_player
    const lastBid = player.bids[player.bids.length - 1];        //take the final bid of the players
    const team = findTeam(lastBid.team);
    if (!team) return;

    const quota = getCategoryQuotaStatus(state, lastBid.team, player.category);
    if (quota.isFull) {
        alert(`${team.team_name} already has the maximum ${quota.max} ${quota.name} players. Undo the bid or choose another team.`);
        return;
    }

    //Save history
    saveHistory();

    state.soldPlayers.push(player.id);       //add player id in the sold players list

    //change the status of the player at the main player object at the players array
    state.players[state.auctionCount].status = "sold";

    state.soldCount++;       //increase the sold player count

    //Update the main player object
    state.players[state.auctionCount].finalPrice = lastBid.amount;
    state.players[state.auctionCount].team = lastBid.team;

    // --- 💡 FIX: UPDATE THE MASTER LIST (state.allPlayers) ---
    const playerInMasterList = state.allPlayers.find(p => p.id === player.id);
    if (playerInMasterList) {
        playerInMasterList.status = "sold";
        playerInMasterList.finalPrice = lastBid.amount;
        playerInMasterList.team = lastBid.team;
    }

    //update the main team object
    team.players.push(player.id);       //add the player id in the state.teams' player list
    team.player_bought++;               //Increase total numbers of player
    team.total_cost += lastBid.amount;        //Update teams' total cost
    team.remaining_budget = team.team_budget - team.total_cost;        //Update teams' remaining budget

    console.log(`${player.name} is sold to ${team.team_name}`);

    //Update the UI with updated team data
    renderTeams();

    //Show the SOLD seal
    // soldSeal.style.display = "block";

    //Update Screem
    renderUI();


    //save current state to local storage
    saveData();
}

const WHEEL_COLORS = [
    "#e74c3c", "#3498db", "#27ae60", "#9b59b6", "#f39c12", "#16a085",
    "#d35400", "#1f9ad6", "#c23b8a", "#4f5bd5", "#0f766e", "#b45309"
];

let playerWheelBusy = false;
let playerWheelTimer = null;
let playerWheelSpotlightTimer = null;
let playerWheelResolve = null;
let categoryGateBusy = false;
let pendingCategoryTransition = null;

function shuffleCopy(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr;
}

function isPlayerWheelEnabled() {
    return getActiveConfig(state).playerWheelEnabled !== false;
}

function isWheelEligiblePlayer(player) {
    if (!player) return false;
    const status = String(player.status || "").toLowerCase();
    // Sold / unsold / skipped never appear on the spinner
    return status !== "sold" && status !== "unsold" && status !== "skipped";
}

function getWheelEligiblePlayers() {
    return (state.players || []).filter(isWheelEligiblePlayer);
}

function getWheelTargetPlayer() {
    const players = state.players || [];
    const current = players[state.auctionCount];
    if (isWheelEligiblePlayer(current)) return current;

    for (let i = state.auctionCount + 1; i < players.length; i++) {
        if (isWheelEligiblePlayer(players[i])) return players[i];
    }

    return getWheelEligiblePlayers()[0] || null;
}

function buildWheelCandidates(winner) {
    if (!isWheelEligiblePlayer(winner)) return [];

    // Only players still in the pool (never sold / unsold / skipped)
    const remaining = getWheelEligiblePlayers();
    const pool = shuffleCopy(remaining.filter((player) => player.id !== winner.id));
    const picks = [winner, ...pool].slice(0, 12);

    const unique = [];
    const seen = new Set();
    picks.forEach((player) => {
        if (!player || seen.has(player.id) || !isWheelEligiblePlayer(player)) return;
        seen.add(player.id);
        unique.push(player);
    });
    if (!unique.find((player) => player.id === winner.id)) unique.unshift(winner);
    return shuffleCopy(unique);
}

async function openPlayerWheelShowcase() {
    if (playerWheelBusy) return;

    const winner = getWheelTargetPlayer();
    if (!winner) {
        console.log("No remaining players available for the wheel.");
        return;
    }

    await runPlayerWheel(winner);
}

function updateWheelSpotlight(player, { finalReveal = false } = {}) {
    const photo = document.getElementById("wheel-result-photo");
    const name = document.getElementById("wheel-result-name");
    const meta = document.getElementById("wheel-result-meta");
    const label = document.getElementById("wheel-spotlight-label");
    const spotlight = document.getElementById("wheel-spotlight");
    if (!player) return;

    if (photo) {
        photo.src = player.photo || "assets/placeholder.png";
        photo.onerror = function () {
            this.src = "assets/placeholder.png";
        };
    }
    if (name) name.textContent = player.name || "—";
    if (meta) {
        const category = displayCategoryName(normalizeCategoryName(player.category));
        meta.textContent = `${player.role || "Player"} · ${category}`;
    }
    if (label) label.textContent = finalReveal ? "Selected player" : "Spinning";
    if (spotlight) spotlight.classList.toggle("is-winner", Boolean(finalReveal));
}

function closePlayerWheel() {
    const modal = document.getElementById("player-wheel-modal");
    const wheel = document.getElementById("player-wheel");
    if (playerWheelTimer) {
        clearTimeout(playerWheelTimer);
        playerWheelTimer = null;
    }
    if (playerWheelSpotlightTimer) {
        clearInterval(playerWheelSpotlightTimer);
        playerWheelSpotlightTimer = null;
    }
    if (modal) {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }
    if (wheel) {
        wheel.style.transition = "none";
        wheel.style.transform = "rotate(0deg)";
    }
    playerWheelBusy = false;
    const resolve = playerWheelResolve;
    playerWheelResolve = null;
    if (resolve) resolve();
}

function runPlayerWheel(winner) {
    return new Promise((resolve) => {
        const modal = document.getElementById("player-wheel-modal");
        const wheel = document.getElementById("player-wheel");
        const skipBtn = document.getElementById("wheel-skip-btn");
        if (!modal || !wheel || !isWheelEligiblePlayer(winner)) {
            resolve();
            return;
        }

        const candidates = buildWheelCandidates(winner);
        if (!candidates.length) {
            resolve();
            return;
        }

        playerWheelBusy = true;
        playerWheelResolve = resolve;

        const subtitle = modal.querySelector(".wheel-subtitle");
        if (subtitle) {
            subtitle.textContent = `Spinning ${candidates.length} remaining player${candidates.length === 1 ? "" : "s"}…`;
        }

        const sliceAngle = 360 / candidates.length;
        const winnerIndex = Math.max(
            0,
            candidates.findIndex((player) => player.id === winner.id)
        );

        const conic = candidates
            .map((player, index) => {
                const color = WHEEL_COLORS[index % WHEEL_COLORS.length];
                const start = index * sliceAngle;
                const end = (index + 1) * sliceAngle;
                return `${color} ${start}deg ${end}deg`;
            })
            .join(", ");

        wheel.innerHTML = "";
        wheel.style.background = `conic-gradient(from -90deg, ${conic})`;

        candidates.forEach((player, index) => {
            const label = document.createElement("div");
            label.className = "wheel-label";
            const angle = -90 + index * sliceAngle + sliceAngle / 2;
            label.style.setProperty("--wheel-angle", `${angle}deg`);
            label.innerHTML = `
                <div class="wheel-label-card">
                    <img src="${player.photo || "assets/placeholder.png"}" alt="" onerror="this.src='assets/placeholder.png'">
                    <span>${player.name}</span>
                </div>
            `;
            wheel.appendChild(label);
        });

        const spotlight = document.getElementById("wheel-spotlight");
        if (spotlight) spotlight.classList.remove("is-winner");
        updateWheelSpotlight(candidates[0], { finalReveal: false });

        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");

        // Pointer sits at top. Segments start from -90deg (top) going clockwise.
        const winnerCenterFromTop = winnerIndex * sliceAngle + sliceAngle / 2;
        const targetRotation = 360 * 6 + (360 - winnerCenterFromTop);

        wheel.style.transition = "none";
        wheel.style.transform = "rotate(0deg)";
        void wheel.offsetWidth;
        wheel.style.transition = "transform 4.2s cubic-bezier(0.12, 0.75, 0.12, 1)";
        wheel.style.transform = `rotate(${targetRotation}deg)`;

        let tick = 0;
        playerWheelSpotlightTimer = setInterval(() => {
            tick += 1;
            const preview = candidates[tick % candidates.length];
            updateWheelSpotlight(preview, { finalReveal: false });
        }, 120);

        const finish = () => {
            if (playerWheelSpotlightTimer) {
                clearInterval(playerWheelSpotlightTimer);
                playerWheelSpotlightTimer = null;
            }
            updateWheelSpotlight(winner, { finalReveal: true });
            playerWheelTimer = setTimeout(() => {
                closePlayerWheel();
            }, 900);
        };

        playerWheelTimer = setTimeout(finish, 4300);

        if (skipBtn) {
            skipBtn.onclick = () => {
                updateWheelSpotlight(winner, { finalReveal: true });
                closePlayerWheel();
            };
        }
    });
}

async function revealPlayerAtCount(index, { useWheel = true } = {}) {
    if (index >= state.players.length) {
        renderUI();
        return;
    }

    const shouldSpin = useWheel && isPlayerWheelEnabled() && !playerWheelBusy;
    if (shouldSpin) {
        await runPlayerWheel(state.players[index]);
    }
    renderUI();
    console.log(`${state.players[index].name}'s data loaded`);
}

function getCategoryRoundStats(categoryName) {
    const name = normalizeCategoryName(categoryName);
    const inCategory = (state.players || []).filter(
        (player) => normalizeCategoryName(player.category) === name
    );
    return {
        total: inCategory.length,
        sold: inCategory.filter((player) => player.status === "sold").length,
        unsold: inCategory.filter((player) => player.status === "unsold").length,
        skipped: inCategory.filter((player) => player.status === "skipped").length
    };
}

function findCategoryCompletion(fromIndex) {
    const players = state.players || [];
    const current = players[fromIndex];
    if (!current) return null;

    const fromCategory = normalizeCategoryName(current.category);
    const remaining = players.slice(fromIndex + 1);
    if (!remaining.length) return null;

    const hasMoreInCategory = remaining.some(
        (player) => normalizeCategoryName(player.category) === fromCategory
    );
    if (hasMoreInCategory) return null;

    const nextPlayerInQueue = remaining[0];
    if (!nextPlayerInQueue) return null;

    const toCategory = normalizeCategoryName(nextPlayerInQueue.category);
    if (!toCategory || toCategory === fromCategory) return null;

    return {
        fromIndex,
        toIndex: fromIndex + 1,
        fromCategory,
        toCategory,
        stats: getCategoryRoundStats(fromCategory)
    };
}

function closeCategoryCompleteModal() {
    const modal = document.getElementById("category-complete-modal");
    if (modal) {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }
    categoryGateBusy = false;
    pendingCategoryTransition = null;
}

function openCategoryCompleteModal(transition) {
    const modal = document.getElementById("category-complete-modal");
    const title = document.getElementById("category-complete-title");
    const text = document.getElementById("category-complete-text");
    const statsEl = document.getElementById("category-complete-stats");
    if (!modal || !transition) return;

    categoryGateBusy = true;
    pendingCategoryTransition = transition;

    const fromLabel = displayCategoryName(transition.fromCategory);
    const toLabel = displayCategoryName(transition.toCategory);
    const { sold, unsold, skipped, total } = transition.stats || {};

    if (title) title.textContent = `${fromLabel} complete`;
    if (text) {
        text.textContent = `All ${fromLabel} players are done. Do you want to continue to ${toLabel}?`;
    }
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="stat-pill"><em>Sold</em><strong>${sold || 0}</strong></div>
            <div class="stat-pill"><em>Unsold</em><strong>${unsold || 0}</strong></div>
            <div class="stat-pill"><em>Total</em><strong>${total || 0}</strong></div>
        `;
        statsEl.title = skipped ? `${skipped} skipped in this category` : "";
    }

    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
}

function continueToNextCategory() {
    if (!pendingCategoryTransition) {
        closeCategoryCompleteModal();
        return;
    }
    closeCategoryCompleteModal();
    advanceToNextPlayer({ useWheel: true });
}

function stayOnCompletedCategory() {
    closeCategoryCompleteModal();
    renderUI();
}

function advanceToNextPlayer({ useWheel = true } = {}) {
    state.auctionCount++;
    revealPlayerAtCount(state.auctionCount, { useWheel });
    saveData();
}

function nextPlayer() {
    if (playerWheelBusy || categoryGateBusy) return;

    const transition = findCategoryCompletion(state.auctionCount);
    if (transition) {
        openCategoryCompleteModal(transition);
        return;
    }

    advanceToNextPlayer({ useWheel: true });
}

function skipPlayer() {
    //Save history
    saveHistory();

    //Prevent skipping a player once Bidded
    if(state.players[state.auctionCount].bids.length != 0) {
        console.log("Can't skip this player because bid is placed.");
        return;
    }

    const player = state.players[state.auctionCount]; // Get player
    player.status = "skipped";           //Change the player status to "skipped"
    console.log(`${player.name} is skipped`);

    state.skippedPlayers.push(player.id);        //add players id to skipped players list

    // --- 💡 FIX: UPDATE THE MASTER LIST (state.allPlayers) ---
    const playerInMasterList = state.allPlayers.find(p => p.id === player.id);
    if (playerInMasterList) {
        playerInMasterList.status = "skipped";
    }
    // --- END OF FIX ---

    //Load Next Player's Data
    nextPlayer();

    //save current state to local storage
    saveData();
}

const TEAMS_DRAWER_KEY = "teamsDrawerPrefs";

function getTeamsDrawerPrefs() {
    try {
        return JSON.parse(localStorage.getItem(TEAMS_DRAWER_KEY) || "{}");
    } catch (_) {
        return {};
    }
}

function saveTeamsDrawerPrefs(prefs) {
    localStorage.setItem(TEAMS_DRAWER_KEY, JSON.stringify(prefs));
}

function syncTeamsDrawerUI() {
    const drawer = document.getElementById("teams-drawer");
    const backdrop = document.getElementById("teams-backdrop");
    const lockBtn = document.getElementById("teams-lock-btn");
    if (!drawer) return;

    const open = drawer.dataset.open === "true";
    const locked = drawer.dataset.locked === "true";
    document.body.classList.toggle("teams-drawer-open", open);
    document.body.classList.toggle("teams-drawer-locked", locked && open);

    if (backdrop) {
        backdrop.hidden = !open || locked;
    }
    if (lockBtn) {
        lockBtn.textContent = locked ? "Unlock" : "Lock";
        lockBtn.classList.toggle("is-active", locked);
        lockBtn.title = locked ? "Unlock drawer" : "Lock drawer open";
    }
}

function setTeamsDrawerOpen(open, { persist = true } = {}) {
    const drawer = document.getElementById("teams-drawer");
    if (!drawer) return;
    const locked = drawer.dataset.locked === "true";
    if (!open && locked) return;
    drawer.dataset.open = open ? "true" : "false";
    syncTeamsDrawerUI();
    if (persist) {
        const prefs = getTeamsDrawerPrefs();
        prefs.open = open;
        saveTeamsDrawerPrefs(prefs);
    }
}

function setTeamsDrawerLocked(locked) {
    const drawer = document.getElementById("teams-drawer");
    if (!drawer) return;
    drawer.dataset.locked = locked ? "true" : "false";
    if (locked) drawer.dataset.open = "true";
    syncTeamsDrawerUI();
    const prefs = getTeamsDrawerPrefs();
    prefs.locked = locked;
    prefs.open = drawer.dataset.open === "true";
    saveTeamsDrawerPrefs(prefs);
}

function toggleTeamsDrawer() {
    const drawer = document.getElementById("teams-drawer");
    if (!drawer) return;
    const open = drawer.dataset.open === "true";
    setTeamsDrawerOpen(!open);
}

function initTeamsDrawer() {
    const drawer = document.getElementById("teams-drawer");
    const prefs = getTeamsDrawerPrefs();
    if (!drawer) return;

    drawer.dataset.locked = prefs.locked ? "true" : "false";
    // First visit defaults to open so the drawer is discoverable
    drawer.dataset.open = prefs.locked || prefs.open !== false ? "true" : "false";
    syncTeamsDrawerUI();

    document.getElementById("teams-lock-btn")?.addEventListener("click", () => {
        setTeamsDrawerLocked(drawer.dataset.locked !== "true");
    });
    document.getElementById("teams-close-btn")?.addEventListener("click", () => {
        if (drawer.dataset.locked === "true") setTeamsDrawerLocked(false);
        setTeamsDrawerOpen(false);
    });
    document.getElementById("teams-backdrop")?.addEventListener("click", () => {
        setTeamsDrawerOpen(false);
    });
    document.getElementById("teams-rail-open")?.addEventListener("click", () => {
        toggleTeamsDrawer();
    });
    document.getElementById("teams-filter")?.addEventListener("input", (event) => {
        const query = String(event.target.value || "").trim().toLowerCase();
        document.querySelectorAll("#teams-data-section .team-container").forEach((card) => {
            const name = card.dataset.teamName || "";
            card.hidden = query ? !name.includes(query) : false;
        });
        document.querySelectorAll("#teams-rail .team-rail-btn").forEach((btn) => {
            const name = btn.dataset.teamName || "";
            btn.hidden = query ? !name.includes(query) : false;
        });
    });
}

function renderTeams() {
    const container = document.getElementById("teams-data-section");
    const rail = document.getElementById("teams-rail");
    if (!container) return;

    container.innerHTML = "";
    if (rail) {
        rail.querySelectorAll(".team-rail-btn").forEach((btn) => btn.remove());
    }

    const teamCount = Math.max(1, state.teams.length);
    container.style.setProperty("--team-rows", String(teamCount));

    state.teams.forEach((team, index) => {
        const teamId = team.team_id;
        const hotkey = TEAM_HOTKEYS[index] || "";
        const accent = team.color || "#16325c";
        const logoSrc = getTeamLogoSrc(team);

        const teamElement = document.createElement("button");
        teamElement.type = "button";
        teamElement.className = "team-container";
        teamElement.id = `team-${teamId}`;
        teamElement.dataset.teamName = String(team.team_name || "").toLowerCase();
        teamElement.style.setProperty("--team-accent", accent);
        teamElement.setAttribute("aria-label", `Bid with ${team.team_name}`);

        teamElement.innerHTML = `
            <div class="logo-container">
                <img src="${logoSrc}" class="logo-img" id="logo-${teamId}" onerror="this.style.visibility='hidden'" alt="">
            </div>
            <div class="team-copy">
                <div class="name-container" id="name-container-${teamId}">
                    <span id="team-name-${teamId}">${team.team_name}</span>
                </div>
                <div class="team-data-container">
                    <div class="taken-player" title="Players bought">
                        <span id="taken-player-${teamId}">${team.player_bought}</span>
                        <span class="stat-label">players</span>
                    </div>
                    ${hotkey ? `<span class="team-hotkey" title="Hotkey">${hotkey}</span>` : ""}
                </div>
            </div>
            <div class="money-remaining" title="Remaining budget">
                <span class="stat-label">Purse</span>
                <span id="money-remaining-${teamId}">${showAmount(team.remaining_budget)}</span>
            </div>
        `;
        teamElement.addEventListener("click", makeBidHandler(teamId));
        container.appendChild(teamElement);

        if (rail) {
            const railBtn = document.createElement("button");
            railBtn.type = "button";
            railBtn.className = "team-rail-btn";
            railBtn.id = `team-rail-${teamId}`;
            railBtn.dataset.teamName = String(team.team_name || "").toLowerCase();
            railBtn.style.setProperty("--team-accent", accent);
            railBtn.title = `${team.team_name} (${hotkey || "click"})`;
            railBtn.setAttribute("aria-label", `Quick bid ${team.team_name}`);
            railBtn.innerHTML = `
                <img src="${logoSrc}" alt="" onerror="this.style.visibility='hidden'">
                <span>${hotkey || "•"}</span>
            `;
            railBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                bidPlayer(teamId);
            });
            railBtn.addEventListener("dblclick", (event) => {
                event.preventDefault();
                setTeamsDrawerOpen(true);
            });
            rail.appendChild(railBtn);
        }
    });
}




//Add event lister to every teams button
//We save the references because when we need to remove the event listener then we can
function makeBidHandler(teamId) {
    return function (event) { // Add 'event' as an argument
        if (event.ctrlKey) {
            // Ctrl+click opens the squad page
            window.open(`squads/?team=${teamId}`, '_blank');
        } else if (event.shiftKey) {
            // Shift+click opens custom bid for that team
            openDirectBidModal(teamId);
        } else {
            // Otherwise, place the next automatic bid
            bidPlayer(teamId);
        }
    }
}


    
// for (let i = 0; i < state.teams.length; i++) {
//     const teamElement = document.getElementById(`team-${i + 1}`);
//     const handler = makeBidHandler(i + 11); // create the handler for this team
//     handlers.push(handler);                 // save the reference
//     teamElement.addEventListener("click", handler);
    
// }

function renderUI() {
    if (state.auctionCount >= state.players.length) {
        // alert("The auction is finished!");
        // state.auctionCount = 0;
        // showPlayerDetails(0);
        // renderTeams();
        // endAuction();

        openRoundEndModal();
        return;
    }
    
    showPlayerDetails(state.auctionCount);
    renderTeams();
}

function resetAll() {
    const securityKey = prompt("Enter the security key to reset: (rezwan19)");

    if(securityKey === "rezwan19"){
        //remove all saved data from localStorage
        localStorage.removeItem('auctionData');

        //reload the page
        window.location.reload();
    } else {
        alert("Wrong security key!")
    }
    //initApp function is already designed to start a fresh auction if it can't find any saved data
}


//Functions for UNDO-REDO buttons visibility
function updateUndoRedoButtons() {
    undoButton.disabled = history.undoStack.length === 0;
    redoButton.disabled = history.redoStack.length === 0;
}

//UNDO-REDO Functionality
function saveHistory() {
    //Clear the redostack
    history.redoStack = [];

    //Add a snapshot (deep copy) in the undoStack
    history.undoStack.push(JSON.parse(JSON.stringify(state)));

    //clear oldest history (Optional)
    if(history.undoStack.length > 20) {
        history.undoStack.shift();
    }

    updateUndoRedoButtons();
}

function undoChange() {
    //If the undoStack is empty then we have nothing to do
    if(history.undoStack.length == 0){
        console.log("Error: There is nothing to undo.");
        return;
    }

    //Save current state to redoStack
    history.redoStack.push(JSON.parse(JSON.stringify(state)));

    //delete last state from from the undoStack
    const lastState = history.undoStack.pop();
    state = lastState;

    console.log("Undone changes.");

    //update UI
    renderUI();

    //Save the current state
    saveData();

    const currentPlayer = state.players[state.auctionCount];
    if (currentPlayer.status === "sold") {
        soldSeal.classList.add("show");
        unsoldSeal.classList.remove("show");
    } else if (currentPlayer.status === "unsold" || currentPlayer.status === "skipped") {
        unsoldSeal.classList.add("show");
        soldSeal.classList.remove("show");
    } else {
        soldSeal.classList.remove("show");
        unsoldSeal.classList.remove("show");
    }

    updateUndoRedoButtons();

}

function redoChange() {
    //If the redoStack is empty then we have nothing to do
    if(history.redoStack.length == 0){
        console.log("Error: There is nothing to redo.");
        return;
    }

    //Save current state to redoStack
    history.undoStack.push(JSON.parse(JSON.stringify(state)));

    console.log("Redone changes.");

    //delete last state from from the undoStack
    const nextState = history.redoStack.pop();
    state = nextState;

    //update UI
    renderUI();

    //Save the current state
    saveData();

    const currentPlayer = state.players[state.auctionCount];
    if (currentPlayer.status === "sold") {
        soldSeal.classList.add("show");
        unsoldSeal.classList.remove("show");
    } else if (currentPlayer.status === "unsold" || currentPlayer.status === "skipped") {
        unsoldSeal.classList.add("show");
        soldSeal.classList.remove("show");
    } else {
        soldSeal.classList.remove("show");
        unsoldSeal.classList.remove("show");
    }

    updateUndoRedoButtons();

}

function requestEndAuction({ force = false } = {}) {
    const unsoldCount = getUnsoldPlayers().length;
    if (!force && unsoldCount > 0 && isRequireAllPlayersSoldEnabled()) {
        openFinishConfirmModal();
        return;
    }
    endAuction();
}

function endAuction() {
    closeRoundEndModal();
    closeFinishConfirmModal();
    closeUnsoldPoolModal();

    console.log("All players have been auctioned. The auction is now closed.");

    soldButton.disabled = true;
    unsoldButton.disabled = true;
    skipButton.disabled = true;
    nextButton.disabled = true;
    undoButton.disabled = true;
    redoButton.disabled = true;

    document.querySelectorAll(".team-container").forEach((el) => {
        el.style.pointerEvents = "none";
        el.style.opacity = "0.7";
    });

    saveData();
    showFinishScreen();
}


//====== BUDGETING =============================================
/**
 * Opens the budget editor modal and populates it with team data.
 */
function openBudgetModal() {
    budgetEditorList.innerHTML = ''; // Clear old list
    
    state.teams.forEach(team => {
        const row = document.createElement('div');
        row.className = 'budget-row';
        
        row.innerHTML = `
            <label for="budget-input-${team.team_id}">${team.team_name}</label>
            <input type="number" id="budget-input-${team.team_id}" value="${team.team_budget}" step="50000">
            <div class="budget-controls">
                <button data-team="${team.team_id}" data-action="subtract">-</button>
                <button data-team="${team.team_id}" data-action="add">+</button>
            </div>
        `;
        budgetEditorList.appendChild(row);
    });
    
    budgetModal.style.display = 'flex';
}

function closeBudgetModal() {
    budgetModal.style.display = 'none';
}

/**
 * Adjusts a team's total budget and recalculates their remaining budget.
 * Used for the +/- buttons.
 */
function adjustTeamBudget(teamId, amount) {
    saveHistory();
    const team = state.teams.find(t => t.team_id === teamId);
    if (!team) return;
    
    team.team_budget += amount;
    team.remaining_budget += amount;

    // Update the input field in the modal to show the new value
    const inputField = document.getElementById(`budget-input-${teamId}`);
    if (inputField) inputField.value = team.team_budget;
    
    renderUI();
    saveData();
}

/**
 * Sets a team's total budget to a new value from the input field.
 */
function setTeamBudget(teamId, newTotalBudget) {
    saveHistory();
    const team = state.teams.find(t => t.team_id === teamId);
    if (!team || isNaN(newTotalBudget)) return;

    // Calculate the *difference* and apply it to the remaining budget
    const budgetChange = newTotalBudget - team.team_budget;
    team.team_budget = newTotalBudget;
    team.remaining_budget += budgetChange;
    
    renderUI();
    saveData();
}


/**
 * Opens the Direct Bid modal.
 * Optional teamId pre-selects that team in the dropdown.
 */
function openDirectBidModal(teamId = null) {
    if (state.auctionCount >= state.players.length) return;

    const player = state.players[state.auctionCount];
    
    // Don't open if auction is over or player is already sold
    if (!player || player.status === "sold" || player.status === "unsold" || player.status === "skipped") return;

    // Populate team dropdown
    teamSelectDropdown.innerHTML = ''; // Clear old options
    state.teams.forEach(team => {
        const quota = getCategoryQuotaStatus(state, team.team_id, player.category);
        const option = document.createElement('option');
        option.value = team.team_id;
        option.textContent = `${team.team_name} (${formatMoney(team.remaining_budget)}) · ${quota.owned}/${quota.max} ${quota.name}`;
        if (quota.isFull) {
            option.disabled = true;
            option.textContent += " · FULL";
        }
        teamSelectDropdown.appendChild(option);
    });

    if (teamId && findTeam(teamId)) {
        teamSelectDropdown.value = String(teamId);
    }

    // Set a suggested bid amount
    let suggestedAmount = player.basePrice;
    if (player.bids.length > 0) {
        const lastBid = player.bids[player.bids.length - 1];
        suggestedAmount = lastBid.amount + bidIncrement(lastBid.amount);
    }
    directBidAmountInput.value = suggestedAmount;
    updateDirectBidPreview();

    directBidModal.style.display = 'flex';
    setTimeout(() => {
        directBidAmountInput.focus();
        directBidAmountInput.select();
    }, 0);
}

function updateDirectBidPreview() {
    const preview = document.getElementById("direct-bid-preview");
    if (!preview) return;

    const amount = parseInt(directBidAmountInput.value, 10);
    if (isNaN(amount) || amount <= 0) {
        preview.textContent = "Enter amount in full rupees";
        return;
    }
    preview.textContent = `Will show as ${formatMoney(amount)}`;
}

function closeDirectBidModal() {
    directBidModal.style.display = 'none';
}

/**
 * Handles the logic for a custom "Direct Bid"
 */
function handleDirectBidSubmit(event) {
    event.preventDefault(); // Stop the form from reloading the page
    
    // 1. Get values from the form
    const teamId = parseInt(teamSelectDropdown.value);
    const amount = parseInt(directBidAmountInput.value);
    
    const player = state.players[state.auctionCount];
    const team = state.teams.find(t => t.team_id === teamId);

    // 2. --- Validation ---
    if (!team || isNaN(amount) || amount <= 0) {
        alert("Invalid input. Please check the team and amount.");
        return;
    }
    if (team.remaining_budget < amount) {
        alert(`${team.team_name} does not have enough budget for this bid!`);
        return;
    }
    const quota = getCategoryQuotaStatus(state, teamId, player.category);
    if (quota.isFull) {
        alert(`${team.team_name} already has ${quota.owned}/${quota.max} ${quota.name} players.`);
        return;
    }
    if (player.bids.length === 0 && amount < player.basePrice) {
        alert(`The bid must be at least the base price of ${formatMoney(player.basePrice)}.`);
        return;
    }
    if (player.bids.length > 0) {
        const lastBid = player.bids[player.bids.length - 1];
        if (amount <= lastBid.amount) {
            alert(`The bid must be higher than the current bid of ${formatMoney(lastBid.amount)}.`);
            return;
        }
        if (lastBid.team === teamId) {
            alert(`${team.team_name} cannot bid twice in a row.`);
            return;
        }
    }

    // 3. --- Process the Bid ---
    saveHistory(); // Save for undo
    state.players[state.auctionCount].bids.push({ team: teamId, amount: amount });
    console.log(`DIRECT BID: ${player.name} bidded by ${team.team_name} for ${formatMoney(amount)}`);
    
    renderUI(); // Update the main screen
    triggerAnim(document.getElementById("current-bid"), "updated");
    triggerAnim(document.getElementById("current-bid-section"), "live-bid");
    triggerAnim(document.getElementById(`team-${teamId}`), "bid-flash");
    triggerAnim(document.getElementById(`team-rail-${teamId}`), "bid-flash");
    saveData(); // Save to localStorage
    closeDirectBidModal(); // Close the pop-up
}

const AUCTION_DESK_PREFS_KEY = "auctionDeskPrefs";

function getAuctionDeskPrefs() {
    try {
        return JSON.parse(localStorage.getItem(AUCTION_DESK_PREFS_KEY) || "{}");
    } catch (_) {
        return {};
    }
}

function saveAuctionDeskPrefs(prefs) {
    localStorage.setItem(AUCTION_DESK_PREFS_KEY, JSON.stringify(prefs || {}));
}

function isRequireAllPlayersSoldEnabled() {
    return Boolean(getAuctionDeskPrefs().requireAllPlayersSold);
}

function setRequireAllPlayersSold(enabled) {
    const prefs = getAuctionDeskPrefs();
    prefs.requireAllPlayersSold = Boolean(enabled);
    saveAuctionDeskPrefs(prefs);
}

function isUnsoldLikeStatus(status) {
    const value = String(status || "").toLowerCase();
    return value === "unsold" || value === "skipped";
}

function getUnsoldPlayers({ categoryName = null } = {}) {
    const wanted = categoryName ? normalizeCategoryName(categoryName) : null;
    return (state.allPlayers || []).filter((player) => {
        if (!isUnsoldLikeStatus(player.status)) return false;
        if (!wanted) return true;
        return normalizeCategoryName(player.category) === wanted;
    });
}

function getUnsoldPlayersByCategory() {
    const config = getActiveConfig(state);
    const sequence = getCategorySequence(config);
    const grouped = new Map();

    getUnsoldPlayers().forEach((player) => {
        const name = normalizeCategoryName(player.category) || "OTHER";
        if (!grouped.has(name)) grouped.set(name, []);
        grouped.get(name).push(player);
    });

    const orderedNames = [
        ...sequence.filter((name) => grouped.has(name)),
        ...[...grouped.keys()].filter((name) => !sequence.includes(name))
    ];

    return orderedNames.map((name) => ({
        category: name,
        label: displayCategoryName(name),
        players: grouped.get(name) || []
    }));
}

/**
 * Opens the new modal when a round ends.
 */
function openRoundEndModal() {
    const groups = getUnsoldPlayersByCategory();
    const unsoldCount = groups.reduce((sum, group) => sum + group.players.length, 0);
    const breakdown = document.getElementById("round-unsold-breakdown");
    const viewBtn = document.getElementById("round-view-unsold-btn");

    if (unsoldCount > 0) {
        roundSummaryText.innerText = `Round complete. ${unsoldCount} player${unsoldCount === 1 ? "" : "s"} still need a team.`;
        restartUnsoldBtn.style.display = "block";
        if (viewBtn) viewBtn.style.display = "block";
    } else {
        roundSummaryText.innerText = "All players have been sold. The auction is complete.";
        restartUnsoldBtn.style.display = "none";
        if (viewBtn) viewBtn.style.display = "none";
    }

    if (breakdown) {
        if (!groups.length) {
            breakdown.innerHTML = "";
        } else {
            breakdown.innerHTML = groups.map((group) => `
                <div class="round-cat-row">
                    <span><strong>${group.label}</strong> · ${group.players.length} unsold</span>
                    <button type="button" data-reauction-category="${group.category}">Re-auction</button>
                </div>
            `).join("");
            breakdown.querySelectorAll("[data-reauction-category]").forEach((btn) => {
                btn.addEventListener("click", () => {
                    restartAuctionForUnsold({ categoryName: btn.dataset.reauctionCategory });
                });
            });
        }
    }

    roundEndModal.style.display = "flex";
}

function closeRoundEndModal() {
    roundEndModal.style.display = "none";
}

function renderUnsoldPoolModal() {
    const list = document.getElementById("unsold-pool-list");
    const summary = document.getElementById("unsold-pool-summary");
    const reauctionAllBtn = document.getElementById("unsold-reauction-all-btn");
    const pref = document.getElementById("require-all-sold-pref");
    const groups = getUnsoldPlayersByCategory();
    const total = groups.reduce((sum, group) => sum + group.players.length, 0);

    if (pref) pref.checked = isRequireAllPlayersSoldEnabled();

    if (summary) {
        summary.textContent = total
            ? `${total} player${total === 1 ? "" : "s"} still need a team across ${groups.length} categor${groups.length === 1 ? "y" : "ies"}.`
            : "No unsold or skipped players right now.";
    }

    if (reauctionAllBtn) {
        reauctionAllBtn.disabled = total === 0;
        reauctionAllBtn.style.opacity = total ? "1" : "0.55";
    }

    if (!list) return;

    if (!groups.length) {
        list.innerHTML = `<div class="unsold-pool-empty">Pool is clear — every listed player has a team.</div>`;
        return;
    }

    list.innerHTML = groups.map((group) => `
        <section class="unsold-category-card">
            <div class="unsold-category-head">
                <div>
                    <strong>${group.label}</strong>
                    <span>${group.players.length} player${group.players.length === 1 ? "" : "s"}</span>
                </div>
                <button type="button" class="reauction-category-btn" data-reauction-category="${group.category}">
                    Re-auction
                </button>
            </div>
            <div class="unsold-player-rows">
                ${group.players.map((player) => `
                    <div class="unsold-player-row">
                        <img src="${player.photo || "assets/placeholder.png"}" alt="" onerror="this.src='assets/placeholder.png'">
                        <div>
                            <strong>${player.name || "Player"}</strong>
                            <em>${player.role || "—"} · #${player.id ?? "—"}</em>
                        </div>
                        <span class="status-tag ${player.status === "skipped" ? "skipped" : ""}">${player.status || "unsold"}</span>
                    </div>
                `).join("")}
            </div>
        </section>
    `).join("");

    list.querySelectorAll("[data-reauction-category]").forEach((btn) => {
        btn.addEventListener("click", () => {
            restartAuctionForUnsold({ categoryName: btn.dataset.reauctionCategory });
        });
    });
}

function openUnsoldPoolModal() {
    const modal = document.getElementById("unsold-pool-modal");
    if (!modal) return;
    renderUnsoldPoolModal();
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
}

function closeUnsoldPoolModal() {
    const modal = document.getElementById("unsold-pool-modal");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
}

function openFinishConfirmModal() {
    const modal = document.getElementById("finish-confirm-modal");
    const title = document.getElementById("finish-confirm-title");
    const text = document.getElementById("finish-confirm-text");
    const groups = getUnsoldPlayersByCategory();
    const total = groups.reduce((sum, group) => sum + group.players.length, 0);
    if (!modal || total === 0) return;

    const categoryBits = groups.map((group) => `${group.label} (${group.players.length})`).join(", ");
    if (title) title.textContent = `${total} player${total === 1 ? "" : "s"} still unsold`;
    if (text) {
        text.textContent = isRequireAllPlayersSoldEnabled()
            ? `You asked to confirm that every player joins a team. Still open: ${categoryBits}. Re-auction them, or finish anyway.`
            : `Still open: ${categoryBits}. You can re-auction by category, or finish anyway.`;
    }

    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
}

function closeFinishConfirmModal() {
    const modal = document.getElementById("finish-confirm-modal");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
}

/**
 * Start a fresh round with unsold/skipped players.
 * Pass categoryName to re-auction only that category.
 */
function restartAuctionForUnsold({ categoryName = null } = {}) {
    const pool = getUnsoldPlayers({ categoryName });

    if (pool.length === 0) {
        alert(
            categoryName
                ? `No unsold players left in ${displayCategoryName(categoryName)}.`
                : "There are no unsold or skipped players to re-auction."
        );
        return;
    }

    const label = categoryName
        ? displayCategoryName(categoryName)
        : "all unsold categories";
    const ok = confirm(
        `Re-auction ${pool.length} player${pool.length === 1 ? "" : "s"} from ${label}?\n\nThis starts a new round with only those players.`
    );
    if (!ok) return;

    saveHistory();

    pool.forEach((player) => {
        player.status = "not-auctioned";
        player.bids = [];
        player.finalPrice = null;
        player.team = null;
    });

    const config = getActiveConfig(state);
    state.players = orderPlayersForAuction(pool, config);
    state.auctionCount = 0;
    state.soldPlayers = [];
    state.unsoldPlayers = [];
    state.skippedPlayers = [];

    closeRoundEndModal();
    closeUnsoldPoolModal();
    closeFinishConfirmModal();
    renderUI();
    saveData();
    revealPlayerAtCount(0, { useWheel: isPlayerWheelEnabled() });
}

/**
 * Closes the final summary screen.
 */
function closeFinishScreen() {
    finishScreenModal.style.display = "none";
}

/**
 * Calculates insights and shows the final summary screen.
 */
function showFinishScreen() {
    // 1. --- Calculate Insights ---
    let totalSpent = 0;
    const soldPlayers = state.allPlayers.filter(p => p.status === 'sold');
    
    soldPlayers.forEach(player => {
        totalSpent += player.finalPrice;
    });

    // Sort sold players by price (highest first)
    soldPlayers.sort((a, b) => b.finalPrice - a.finalPrice);
    
    // Get the top 3
    const top3Buys = soldPlayers.slice(0, 3);

    
    // 2. --- Populate Modal Content ---
    
    // Header
    document.getElementById('finish-tournament-logo').src = state.tournament
        ? getTournamentLogoSrc(state.tournament, "assets/tournament-logo.png")
        : "assets/tournament-logo.png";
    document.getElementById('finish-tournament-name').textContent = state.tournament
        ? getTournamentTitle(state.tournament)
        : "Auction Complete";
    
    // Simple Insights List
    const insightsList = document.getElementById('finish-insights-list');
    insightsList.innerHTML = `
        <li>Total Players Sold: <strong>${soldPlayers.length}</strong></li>
        <li>Total Money Spent: <strong>${formatMoney(totalSpent)}</strong></li>
    `;

    // Top 3 Buys
    const topBuysContainer = document.getElementById('finish-top-buys');
    topBuysContainer.innerHTML = ''; // Clear old cards
    
    for (const player of top3Buys) {
        const team = state.teams.find(t => t.team_id === player.team);
        const teamName = team ? team.team_name : 'N/A';
        const teamColor = team ? team.color : '#555';

        const cardHTML = `
            <div class="top-buy-card">
                <img src="${player.photo}" alt="${player.name}">
                <div class="card-info">
                    <div class="card-name">${player.name}</div>
                    <div class="card-price">${formatMoney(player.finalPrice)}</div>
                    <div class="card-team" style="background-color: ${teamColor};">
                        ${teamName}
                    </div>
                </div>
            </div>
        `;
        topBuysContainer.innerHTML += cardHTML;
    }
    
    // Team Logos
    const teamLogosContainer = document.getElementById('finish-team-logos');
    teamLogosContainer.innerHTML = ''; // Clear old logos
    state.teams.forEach(team => {
        teamLogosContainer.innerHTML += `<img src="${getTeamLogoSrc(team)}" alt="${team.team_name}" onerror="this.style.visibility='hidden'">`;
    });

    // Organizer (You can fill this in)
    // document.getElementById('finish-organizer-name').textContent = state.tournament.organizer;
    
    // **NOTE:** Make sure you have "organizer-photo.png" and "developer-photo.png"
    // in your "assets" folder, or change the src path in the HTML.

    // 3. --- Show the Modal ---
    finishScreenModal.style.display = 'flex';
}

// Main App Logic
const initApp = async () => {
    // Fallback tournament file, then overlay configurable branding.
    try {
        state.tournament = await getTournamentData();
    } catch (error) {
        console.error("Could not load tournament data:", error);
        state.tournament = buildTournamentState(DEFAULT_AUCTION_CONFIG);
    }

    //check localStorage for saved data
    const savedDataJSON = localStorage.getItem('auctionData');
    const auctionConfig = await getAuctionConfig();

    if (savedDataJSON) {
        welcomeResumeBtn.style.display = 'flex';
        welcomeResetBtn.style.display = 'flex';

        // Logic for loading a SAVED game
        let savedData = JSON.parse(savedDataJSON);
        state = savedData.auctionState;
        history = savedData.historyData;
 
        // Add this 'if' block to support old save files
        if (!state.allPlayers) {
            state.allPlayers = state.players.slice();
        }

        // Keep category names, branding, and max rules in sync with the latest config
        state.config = auctionConfig;
        state.tournament = buildTournamentState(auctionConfig, state.tournament);
        const normalizeSavedPlayer = (player) => {
            if (player) player.category = normalizeCategoryName(player.category);
        };
        state.players.forEach(normalizeSavedPlayer);
        state.allPlayers.forEach(normalizeSavedPlayer);

        console.log("Loaded saved state from localStorage.");


        // Check the status of the player at the loaded auction count
        if (state.auctionCount < state.players.length) {
            // This block now only runs if the player at auctionCount actually exists
            const lastPlayerStatus = state.players[state.auctionCount].status;
            if (lastPlayerStatus === "sold" || lastPlayerStatus === "unsold" || lastPlayerStatus === "skipped") {
                // If the last player's turn was over, increment the count.
                state.auctionCount++;
            }
        }

    } else {
        welcomeStartNewBtn.style.display = 'flex';

        // Logic for starting a NEW game
        console.log("No saved state found. Starting a new auction.");
        state.players = await getPlayersData();

        // Add this line to create the master list
        state.allPlayers = state.players.slice();

        applyConfigToAuctionState(state, auctionConfig);
        if (!state.teams?.length) {
            state.teams = await getTeamsData();
        }
        console.log(`Applied config: ${state.teams.length} teams, kitty ${formatMoney(auctionConfig.teamKitty)}`);
    }

    showTournamentDetails();

    // This block runs for BOTH new and loaded states, ensuring UI is always in sync.
    renderUI();
    updateUndoRedoButtons(); 

    // --- ADD LISTENERS FOR THE MODAL ---
    modalCloseBtn.addEventListener('click', closeBudgetModal);

    //--- DIRECT BIDDING -------
    directBidCloseBtn.addEventListener('click', closeDirectBidModal);
    directBidForm.addEventListener('submit', handleDirectBidSubmit);
    directBidAmountInput.addEventListener('input', updateDirectBidPreview);

    const customBidButton = document.getElementById("custom-bid-button");
    const currentBidSection = document.getElementById("current-bid-section");
    if (customBidButton) {
        customBidButton.addEventListener("click", (event) => {
            event.stopPropagation();
            openDirectBidModal();
        });
    }
    if (currentBidSection) {
        currentBidSection.addEventListener("click", (event) => {
            if (event.target.closest("#custom-bid-button")) return;
            openDirectBidModal();
        });
        currentBidSection.title = "Click to enter a custom bid amount";
        currentBidSection.style.cursor = "pointer";
    }

    // Use event delegation for the dynamic buttons
    budgetEditorList.addEventListener('click', (event) => {
        const target = event.target;
        if (target.tagName !== 'BUTTON') return;
        
        const action = target.dataset.action;
        const teamId = parseInt(target.dataset.team);
        let amount = 0;
        
        if (action === 'add') amount = 50000;
        if (action === 'subtract') amount = -50000;
        
        if (amount !== 0) {
            adjustTeamBudget(teamId, amount);
        }
    });

    // Use event delegation for the dynamic input fields
    budgetEditorList.addEventListener('change', (event) => {
        const target = event.target;
        if (target.tagName !== 'INPUT' || target.type !== 'number') return;
        
        const teamId = parseInt(target.id.split('-')[2]);
        const newValue = parseInt(target.value);
        
        setTeamBudget(teamId, newValue);
    });



    // Add Welcome Modal Listeners
    welcomeResumeBtn.addEventListener('click', closeWelcomeModal);
    welcomeStartNewBtn.addEventListener('click', closeWelcomeModal);
    welcomeResetBtn.addEventListener('click', resetAll); // Calls your existing reset function

    // Show the modal
    welcomeModal.style.display = 'flex';
     
    //Click event for Buttons
    unsoldButton.addEventListener("click", () => unsoldPlayer());
    nextButton.addEventListener("click", () => nextPlayer());
    soldButton.addEventListener("click", () => soldPlayer());
    skipButton.addEventListener("click", () => skipPlayer());
    if (spinButton) {
        spinButton.addEventListener("click", () => openPlayerWheelShowcase());
    }
    document.getElementById("unsold-pool-button")?.addEventListener("click", () => openUnsoldPoolModal());
    document.getElementById("unsold-pool-close-btn")?.addEventListener("click", closeUnsoldPoolModal);
    document.getElementById("unsold-pool-done-btn")?.addEventListener("click", closeUnsoldPoolModal);
    document.getElementById("unsold-reauction-all-btn")?.addEventListener("click", () => {
        restartAuctionForUnsold();
    });
    document.getElementById("require-all-sold-pref")?.addEventListener("change", (event) => {
        setRequireAllPlayersSold(event.target.checked);
    });
    document.getElementById("round-view-unsold-btn")?.addEventListener("click", () => {
        closeRoundEndModal();
        openUnsoldPoolModal();
    });
    document.getElementById("finish-view-unsold-btn")?.addEventListener("click", () => {
        closeFinishConfirmModal();
        openUnsoldPoolModal();
    });
    document.getElementById("finish-reauction-btn")?.addEventListener("click", () => {
        restartAuctionForUnsold();
    });
    document.getElementById("finish-anyway-btn")?.addEventListener("click", () => {
        requestEndAuction({ force: true });
    });

    initTeamsDrawer();

    teamsButton.addEventListener("click", (event) => {
        if (event.shiftKey) {
            window.open("squads/", "_blank");
            return;
        }
        toggleTeamsDrawer();
    });
    teamsButton.title = "Toggle teams drawer (Shift+click opens squads)";

    const configButton = document.getElementById("config-button");
    if (configButton) {
        configButton.addEventListener("click", () => {
            window.open("config/", "_blank");
        });
    }

    resetButton.addEventListener("click", () => resetAll());
    undoButton.addEventListener("click", () => undoChange());
    redoButton.addEventListener("click", () => redoChange());

    // --- LISTENERS FOR FINISH AUCTION ---
    restartUnsoldBtn.addEventListener("click", () => restartAuctionForUnsold());
    finishAuctionBtn.addEventListener("click", () => requestEndAuction());

    document.getElementById("category-continue-btn")?.addEventListener("click", continueToNextCategory);
    document.getElementById("category-stay-btn")?.addEventListener("click", stayOnCompletedCategory);

    // --- LISTENERS FOR FINAL SUMMARY ---
    finishModalCloseBtn.addEventListener('click', closeFinishScreen);

    //Add keyboard command for sold unsold next
    // A single, efficient listener for all keyboard shortcuts
    window.addEventListener("keydown", function(event){
        // Check if the user is currently typing in an input, select, or textarea
        const targetTag = event.target.tagName;
            if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') {
                return; // If so, do nothing and just let them type.
        }

        if (playerWheelBusy) {
            if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const skipBtn = document.getElementById("wheel-skip-btn");
                if (skipBtn) skipBtn.click();
            }
            return;
        }

        if (categoryGateBusy) {
            if (event.key === "Enter") {
                event.preventDefault();
                continueToNextCategory();
            } else if (event.key === "Escape") {
                event.preventDefault();
                stayOnCompletedCategory();
            }
            return;
        }

        // Bid for the team mapped to this hotkey (list order)
        const biddingTeam = teamFromHotkey(event.key);
        if (biddingTeam) {
            bidPlayer(biddingTeam.team_id);
            return;
        }

        // Handle other letter-based shortcuts
        switch(event.key.toLowerCase()){
            case "escape":
                setTeamsDrawerOpen(false);
                break;
            case "t":
                if (event.shiftKey) {
                    event.preventDefault();
                    toggleTeamsDrawer();
                }
                break;
            case "u":
                unsoldPlayer();
                break;
            case "s":
                soldPlayer();
                break;
            case "w":
                openPlayerWheelShowcase();
                break;
            case "enter":
                nextPlayer();
                break;
            case "z":
                if(event.ctrlKey && event.shiftKey) {
                    redoChange()
                } else if (event.ctrlKey) {
                    undoChange();
                }
                break;
            case "m":
                if (event.ctrlKey) {
                    event.preventDefault(); // Stop browser's default action
                    if (budgetModal.style.display === 'none') {
                        openBudgetModal();
                    } else {
                        closeBudgetModal();
                    }
                }
                break;
            case "b":
                if (event.ctrlKey) {
                    event.preventDefault(); // Stop browser's default action
                    openDirectBidModal();
                }
                break;
            case "p":
                if (event.shiftKey) {
                    event.preventDefault();
                    window.open('squads/roster/', '_blank');
                }
                break;
        }
    });
};

// 🔷 Make sure to run when DOM is loaded
document.addEventListener("DOMContentLoaded", initApp);
