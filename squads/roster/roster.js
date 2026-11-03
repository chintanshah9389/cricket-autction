// showAmount / formatMoney come from ../../js/money.js

document.addEventListener('DOMContentLoaded', () => {

    // 1. Load all data from localStorage
    const savedDataJSON = localStorage.getItem('auctionData');
    if (!savedDataJSON) {
        document.body.innerHTML = '<h1>Error: Auction data not found.</h1>';
        return;
    }

    const savedData = JSON.parse(savedDataJSON);
    const state = savedData.auctionState;
    // Use the "master list" of all players
    const allPlayers = state.allPlayers || state.players; 
    const allTeams = state.teams;

    // 2. Populate Header from configurable branding
    (async () => {
        try {
            const auctionConfig = await getAuctionConfig();
            state.tournament = buildTournamentState(auctionConfig, state.tournament);
        } catch (_) {
            // keep saved tournament
        }

        const logoEl = document.getElementById('tournament-logo');
        const nameEl = document.getElementById('tournament-name');
        if (state.tournament) {
            if (logoEl) {
                logoEl.src = getTournamentLogoSrc(state.tournament, "../../assets/tournament-logo.png");
                logoEl.onerror = () => {
                    logoEl.src = "../../assets/tournament-logo.png";
                };
            }
            if (nameEl) {
                nameEl.textContent = getTournamentTitle(state.tournament);
            }
        } else {
            if (logoEl) logoEl.src = "../../assets/tournament-logo.png";
            if (nameEl) nameEl.textContent = "Full Player Roster";
        }
    })();

    // 3. Define Helper Functions for building the table

    // This is just the table header row
    const tableHeaderHTML = `
        <tr>
            <th class="col-id-cat">ID / Cat</th>
            <th class="col-photo">Photo</th>
            <th class="col-player">Player (Base) / Club</th>
            <th class="col-role">Role / Styles</th>
            <th class="col-status">Status (Price)</th>
        </tr>`;

    // This function creates the HTML for a single player table row
    const createPlayerRow = (player) => {
        let statusHTML = '<span class="player-subtext">Unsold</span>';
        if (player.status === 'sold') {
            const team = allTeams.find(t => t.team_id === player.team);
            statusHTML = `
                <span class="status-team">${team ? team.team_name : 'N/A'}</span>
                <span class="player-subtext">(${formatMoney(player.finalPrice)})</span>
            `;
        } else if (player.status === 'skipped') {
            statusHTML = '<span class="player-subtext">Skipped</span>';
        }

        return `
            <tr>
                <td>
                    <span class="player-name">${getPlayerDisplayCode(player)}</span>
                    <span class="player-subtext">Category: ${player.category}</span>
                </td>
                <td class="player-photo">
                    <img src="${resolveAssetUrl(player.photo, "../../")}" alt="${player.name}" onerror="this.src='../../assets/placeholder.png'">
                </td>
                <td>
                    <span class="player-name">${player.name}</span>
                    <span class="player-subtext">(${formatMoney(player.basePrice)})</span>
                    <span class="player-subtext">${player.currentClub}</span>
                </td>
                <td>
                    <span class="player-name">${player.role}</span>
                    <span class="player-subtext">Bat: ${player.battingStyle}</span>
                    <span class="player-subtext">Ball: ${player.bowlingStyle || 'N/A'}</span>
                </td>
                <td>${statusHTML}</td>
            </tr>`;
    };

    // 4. Process Data
    const sortedPlayers = allPlayers.sort((a, b) => a.id - b.id);

    const batters = sortedPlayers.filter(p => p.role === 'Batter');
    const bowlers = sortedPlayers.filter(p => p.role === 'Bowler');
    const allrounders = sortedPlayers.filter(p => p.role === 'All-Rounder');
    const wks = sortedPlayers.filter(p => p.role === 'Wicket-Keeper');

    // 5. Build Tables Correctly
    
    // Helper function to build a full table (header + rows)
    const buildTable = (tableElement, players) => {
        const thead = tableElement.querySelector('thead');
        const tbody = tableElement.querySelector('tbody');

        thead.innerHTML = tableHeaderHTML;
        tbody.innerHTML = ''; // Clear old body content

        if (players.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; font-style:italic;">No players in this role.</td></tr>';
        } else {
            tbody.innerHTML = players.map(createPlayerRow).join('');
        }
    };

    // Build all four tables
    buildTable(document.getElementById('batter-table'), batters);
    buildTable(document.getElementById('bowler-table'), bowlers);
    buildTable(document.getElementById('allrounder-table'), allrounders);
    buildTable(document.getElementById('wk-table'), wks);

    // 6. Auto-trigger print dialog
    // This will now run successfully
    window.print();
});