let state;

let selectedTeam;

const TEAM_HOTKEYS = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=",
    "q", "w", "e", "r", "t", "y", "o", "a", "d", "f", "g", "h",
    "j", "k", "l", "z", "x", "c", "v", "n", "m", "b", "p"
];

function teamFromHotkey(key) {
    const index = TEAM_HOTKEYS.indexOf(key);
    if (index < 0 || index >= state.teams.length) return null;
    return state.teams[index];
}

//DOM: Team Header
const header = document.getElementById("header");

//Team Data Section
const playersSigned = document.getElementById("players-signed");
const spendBudget = document.getElementById("budget-spend");
const remainingBudget = document.getElementById("budget-remaining");
//Print Button
const printButton = document.getElementById("print-box");

//Players Section
const batterSection = document.getElementById("batter-section");
const bowlerSection = document.getElementById("bowler-section");
const allrounderSection = document.getElementById("allrounder-section");
const wkSection = document.getElementById("wk-section");

//Player count
const batterCount = document.getElementById("batter-count");
const bowlerCount = document.getElementById("bowler-count");
const allrounderCount = document.getElementById("allrounder-count");
const wkCount = document.getElementById("wk-count");


function renderTeamsData() {
    for(let i = 0; i < state.teams.length; i++){
        let teamID = state.teams[i].team_id;

        //Create new team card for header
        let newTeam = document.createElement("div");
        newTeam.classList.add("team-container");
        newTeam.style.backgroundColor = state.teams[i].color;
        newTeam.id = "team-" + teamID;

        newTeam.innerHTML = `
            ${TEAM_HOTKEYS[i] ? `<span class="team-hotkey">${TEAM_HOTKEYS[i]}</span>` : ""}
            <div class="logo-container"><img src="${getTeamLogoSrc(state.teams[i], "../assets/teams-logo")}" class="logo-img" id="logo-${teamID}" onerror="this.style.visibility='hidden'"></div>
            <div class="name-container" id="name-container-${teamID}"><span id="team-name-${teamID}">${state.teams[i].team_name}</span></div>
            `;

        //Add element inside the header
        header.append(newTeam);

        //Add click event for new team
        newTeam.addEventListener("click", () => {
            selectedTeam = teamID;
            showPlayers(selectedTeam);
        });
    }
}

// showAmount / formatMoney come from ../js/money.js

function showPlayers(teamId) {
    // This updates the URL in the browser bar (e.g., to "?team=11")
    history.pushState({ teamId: teamId }, "", `?team=${teamId}`);

    let team = state.teams.find(t => t.team_id === teamId);
    //If team not found, select the first team by default
    if(!team){
        team = state.teams[0];
    }

    //Clear the previously rendered team roaster
    batterSection.innerHTML = ``;
    bowlerSection.innerHTML = ``;
    allrounderSection.innerHTML = ``;
    wkSection.innerHTML = ``;

    //Set all teams background colors to their default
    for(let i = 0; i < state.teams.length; i++){
        const teamCard = document.getElementById(`name-container-${state.teams[i].team_id}`);
        teamCard.style.backgroundColor = state.teams[i].color;
        teamCard.style.color = "white";
    }

    //Get all players for the selected team
    const teamPlayers = team.players.map(playerId => state.allPlayers.find(p => p.id == playerId));
    
    //Group players by role
    const batters = teamPlayers.filter(p => p && p.role == "Batter");
    const bowlers = teamPlayers.filter(p => p && p.role == "Bowler");
    const allrounders = teamPlayers.filter(p => p && p.role == "All-Rounder");
    const wks = teamPlayers.filter(p => p && p.role == "Wicket-Keeper");

    //Update players count
    batterCount.innerText = batters.length;
    bowlerCount.innerText = bowlers.length;
    allrounderCount.innerText = allrounders.length;
    wkCount.innerText = wks.length;
    
    //Set the selected teams background color to different
    const selectedTeamCard = document.getElementById(`name-container-${teamId}`);
    selectedTeamCard.style.color = team.color;
    selectedTeamCard.style.backgroundColor = "#e8f3ec";

    //Team Data Update
    playersSigned.innerText = team.players.length;
    spendBudget.innerText = showAmount(team.total_cost);
    remainingBudget.innerText = showAmount(team.remaining_budget);

    //Create Teams Player Card
    const createCardHTML = (player) => `
        <div class="player-card" id="player-${player.id}">
            <div class="image-box"><img src="${player.photo}" alt="${player.name}" class="player-photo"></div>
            <div class="player-name"><span>${player.name}</span></div>
            <div class="batting-style"><span>${player.battingStyle}</span></div>
            <div class="bowling-style"><span>${player.bowlingStyle || "N/A"}</span></div>
            <div class="final-price">Rs <span>${showAmount(player.finalPrice)}</span></div>
        </div>`;
        
    batters.forEach(p => batterSection.innerHTML += createCardHTML(p));
    bowlers.forEach(p => bowlerSection.innerHTML += createCardHTML(p));
    allrounders.forEach(p => allrounderSection.innerHTML += createCardHTML(p));
    wks.forEach(p => wkSection.innerHTML += createCardHTML(p));

    //If there is no player to show
    const showNoPlayer = (role, section) => {
        if(role.length !== 0){
            return;
        } else {
            section.innerHTML = `<div class="no-players">No player to show.</div>`;
        }
    }

    showNoPlayer(batters, batterSection);
    showNoPlayer(bowlers, bowlerSection);
    showNoPlayer(allrounders, allrounderSection);
    showNoPlayer(wks, wkSection);
}

function runSquadsPage() {
    // Get the team ID from the URL (e.g., ?team=11)
    const urlParams = new URLSearchParams(window.location.search);
    let selectedTeam = parseInt(urlParams.get('team')); // Get the ID and convert to a number

    

    const savedDataJSON = localStorage.getItem('auctionData');

    if (savedDataJSON) {
        // Load state and show squads
        const savedData = JSON.parse(savedDataJSON);
        state = savedData.auctionState;
        console.log('Data loaded successfully.');
    } else {
        // Replace all content with the message
        document.querySelector(".king-container").innerHTML = `
            <div class="no-data">AUCTION HAS NOT STARTED</div>
            <style>
                
                .no-data {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-size: 5rem;
                    font-weight: bold;
                    background: #fff;
                    z-index: 1;
                    color: white;
                    background: linear-gradient(90deg, rgba(2, 0, 36, 1) 0%, rgba(9, 9, 121, 1) 46%, rgba(219, 169, 68, 1) 100%);
                }
            </style>
        `;

        return;
    }

    // Fallback: If no team was selected in the URL (or it's invalid),
    // default to the first team in the list.
    if (!selectedTeam || isNaN(selectedTeam) || !state.teams.find(t => t.team_id === selectedTeam)) {
        selectedTeam = state.teams[0].team_id;
    }

    // Apply configurable tournament branding when available
    (async () => {
        try {
            const auctionConfig = await getAuctionConfig();
            state.tournament = buildTournamentState(auctionConfig, state.tournament);
        } catch (_) {
            // keep existing tournament from auction save
        }
        const logoEl = document.querySelector(".tournament-logo");
        if (logoEl) {
            logoEl.src = getTournamentLogoSrc(state.tournament, "../assets/tournament-logo.png");
            logoEl.onerror = () => {
                logoEl.src = "../assets/tournament-logo.png";
            };
        }
    })();

    //Render teams data
    renderTeamsData();

    //Show Team's players list
    showPlayers(selectedTeam);

    printButton.style.cursor = "pointer";
    printButton.addEventListener('click', () => {
        // 1. Read the CURRENT URL from the browser bar
        const currentParams = new URLSearchParams(window.location.search);
        // 2. Get the 'team' ID from that URL
        const currentTeamId = parseInt(currentParams.get('team'));
        
        if (currentTeamId) {
            window.open(`teamsheet/?team=${currentTeamId}`, '_blank');
        } else {
            // Fallback just in case
            window.open(`teamsheet/?team=${state.teams[0].team_id}`, '_blank');
        }
    });

    // --- COMBINED KEYBOARD LISTENER ---
    window.addEventListener("keydown", function(event) {
        // Stop shortcuts if user is in an input
        const targetTag = event.target.tagName;
        if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') {
            return;
        }

        // --- P for Print ---
        if(event.key.toLowerCase() === "p"){
            // Trigger the button's click logic to get the current team ID
            printButton.click();
            return;
        }

        const selected = teamFromHotkey(event.key);
        if (selected) {
            showPlayers(selected.team_id);
        }
    });

    const logoBtn = document.getElementById('logo-section');
    if (logoBtn) {
        logoBtn.style.cursor = 'pointer';
        logoBtn.addEventListener('click', () => {
            window.open('roster/', '_blank'); // 'roster/' is relative to the squads/ folder
        });
    }
}

document.addEventListener("DOMContentLoaded", runSquadsPage);
