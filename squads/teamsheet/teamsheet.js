document.addEventListener('DOMContentLoaded', () => {
    // showAmount / formatMoney come from ../../js/money.js

    // --- Main Logic ---
    const savedDataJSON = localStorage.getItem('auctionData');
    if (!savedDataJSON) {
        document.body.innerHTML = '<h1>Error: Auction data not found.</h1>';
        return;
    }

    const savedData = JSON.parse(savedDataJSON);
    const state = savedData.auctionState;
    
    const urlParams = new URLSearchParams(window.location.search);
    const teamId = parseInt(urlParams.get('team'));
    const team = state.teams.find(t => t.team_id === teamId);

    if (!team) {
        document.body.innerHTML = `<h1>Error: Team with ID ${teamId} not found.</h1>`;
        return;
    }

    // 1. Populate Header from configurable branding
    (async () => {
        try {
            const auctionConfig = await getAuctionConfig();
            state.tournament = buildTournamentState(auctionConfig, state.tournament);
        } catch (_) {
            // keep saved tournament
        }
        const logoEl = document.getElementById('tournament-logo');
        const nameEl = document.getElementById('tournament-name');
        if (logoEl) {
            logoEl.src = getTournamentLogoSrc(state.tournament, "../../assets/tournament-logo.png");
            logoEl.onerror = () => {
                logoEl.src = "../../assets/tournament-logo.png";
            };
        }
        if (nameEl) {
            nameEl.textContent = getTournamentTitle(state.tournament);
        }
    })();

    // 2. Populate Team Info
    document.getElementById('team-name').textContent = team.team_name;
    document.getElementById('players-signed').textContent = team.player_bought;
    document.getElementById('total-spend').textContent = formatMoney(team.total_cost);
    document.getElementById('budget-remaining').textContent = formatMoney(team.remaining_budget);
    document.getElementById('total-budget').textContent = formatMoney(team.team_budget);

    // 3. Populate Player Table
    const playerListBody = document.getElementById('player-list');
    playerListBody.innerHTML = ''; // Clear any placeholder content
    
    const teamPlayers = team.players.map(pId => state.allPlayers.find(p => p.id === pId));

    teamPlayers.forEach(player => {
        if (player) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${getPlayerDisplayCode(player)}</td>
                <td>${player.category}</td>
                <td>${player.name}</td>
                <td>${player.role}</td>
                <td>${formatMoney(player.basePrice)}</td>
                <td>${player.finalPrice == null ? 'N/A' : formatMoney(player.finalPrice)}</td>
            `;
            playerListBody.appendChild(row);
        }
    });

    if(teamPlayers.length == 0){
        const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="6"><center>No player signed.<center></td>
            `;
            playerListBody.appendChild(row);
    }

    // 4. Automatically trigger the print dialog
    window.print();
});