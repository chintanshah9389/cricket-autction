const TOKEN_KEY = "ca_bidder_token";
const META_KEY = "ca_bidder_meta";

const token = localStorage.getItem(TOKEN_KEY);
if (!token) {
    window.location.replace("./");
}

let live = null;
let activeCategory = "";
let pollTimer = null;
let bidding = false;

const els = {
    teamTitle: document.getElementById("team-title"),
    divisionTitle: document.getElementById("division-title"),
    playerPhoto: document.getElementById("player-photo"),
    playerName: document.getElementById("player-name"),
    playerMeta: document.getElementById("player-meta"),
    currentBid: document.getElementById("current-bid"),
    leadingTeam: document.getElementById("leading-team"),
    bidBtn: document.getElementById("bid-btn"),
    bidStatus: document.getElementById("bid-status"),
    purse: document.getElementById("purse"),
    reserved: document.getElementById("reserved"),
    spendable: document.getElementById("spendable"),
    pending: document.getElementById("pending"),
    bought: document.getElementById("bought"),
    spent: document.getElementById("spent"),
    categoryTabs: document.getElementById("category-tabs"),
    categoryList: document.getElementById("category-list"),
    squadList: document.getElementById("squad-list")
};

function money(value) {
    if (typeof formatMoney === "function") return formatMoney(value);
    if (typeof showAmount === "function") return showAmount(value);
    return String(value ?? "—");
}

async function api(path, { method = "GET", body } = {}) {
    const response = await fetch(path, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { "Content-Type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(META_KEY);
        window.location.replace("./");
        throw new Error("Session expired");
    }
    if (!response.ok) {
        const error = new Error(payload.error || "Request failed");
        error.payload = payload;
        error.status = response.status;
        throw error;
    }
    return payload;
}

function renderPurse(team) {
    if (!team) return;
    els.teamTitle.textContent = team.teamName || "Team";
    els.purse.textContent = money(team.purse);
    els.reserved.textContent = money(team.reserved);
    els.spendable.textContent = money(team.spendable);
    els.pending.textContent = String(team.pending ?? "—");
    els.bought.textContent = String(team.playerBought ?? "—");
    els.spent.textContent = money(team.totalCost);
}

function renderPlayer(player) {
    if (!player) {
        els.playerName.textContent = "Waiting for auction…";
        els.playerMeta.textContent = "Auction desk has not opened a player yet";
        els.currentBid.textContent = "—";
        els.leadingTeam.textContent = "No bids yet";
        els.bidBtn.disabled = true;
        els.bidBtn.textContent = "BID";
        els.playerPhoto.src = "../assets/placeholder.png";
        return;
    }
    els.playerPhoto.src = player.photo || "../assets/placeholder.png";
    els.playerName.textContent = player.name || "—";
    els.playerMeta.textContent = [
        player.category,
        player.role,
        player.basePrice != null ? `Base ${money(player.basePrice)}` : ""
    ]
        .filter(Boolean)
        .join(" · ");
    els.currentBid.textContent = player.currentBid
        ? money(player.currentBid)
        : money(player.basePrice || 0);
    els.leadingTeam.textContent = player.leadingTeamName
        ? `Leading: ${player.leadingTeamName}`
        : "No bids yet — first bid is base price";
    const stepLabel =
        player.nextStep >= 100000 ? `+${money(player.nextStep)}` : `+${money(player.nextStep)}`;
    els.bidBtn.textContent = player.bids?.length || player.currentBid
        ? `BID ${stepLabel}`
        : `BID ${money(player.nextAmount || player.basePrice || 0)}`;
    if (!player.currentBid && player.nextAmount) {
        els.bidBtn.textContent = `BID ${money(player.nextAmount)}`;
    } else if (player.nextStep) {
        els.bidBtn.textContent = `BID +${money(player.nextStep)}`;
    }
    els.bidBtn.disabled = !player.canBid || bidding;
}

function renderCategories(categories) {
    const names = Object.keys(categories || {});
    if (!names.length) {
        els.categoryTabs.innerHTML = "";
        els.categoryList.innerHTML = `<div class="list-row"><div>No players loaded.</div></div>`;
        return;
    }
    if (!activeCategory || !categories[activeCategory]) {
        activeCategory = names[0];
    }
    els.categoryTabs.innerHTML = names
        .map(
            (name) =>
                `<button type="button" data-cat="${name}" class="${
                    name === activeCategory ? "is-active" : ""
                }">${name} (${categories[name].length})</button>`
        )
        .join("");
    els.categoryTabs.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
            activeCategory = button.dataset.cat;
            renderCategories(live?.categories || {});
        });
    });
    const rows = categories[activeCategory] || [];
    els.categoryList.innerHTML = rows
        .map((player) => {
            const badge = player.onSquad
                ? "yours"
                : String(player.status).toLowerCase() === "sold"
                  ? "sold"
                  : "";
            const badgeText = player.onSquad
                ? "Yours"
                : String(player.status).toLowerCase() === "sold"
                  ? "Sold"
                  : "Open";
            return `<div class="list-row">
                <div>
                    <strong>${player.name || "—"}</strong><br>
                    <small>${[player.role, player.currentClub, player.mobile].filter(Boolean).join(" · ") || "—"}</small>
                </div>
                <span class="badge ${badge}">${badgeText}</span>
            </div>`;
        })
        .join("");
}

function renderSquad(squad) {
    if (!squad?.length) {
        els.squadList.innerHTML = `<div class="list-row"><div>No players signed yet.</div></div>`;
        return;
    }
    els.squadList.innerHTML = squad
        .map(
            (player) => `<div class="list-row">
            <div>
                <strong>${player.name || "—"}</strong><br>
                <small>${[
                    player.category,
                    player.role,
                    player.currentClub,
                    player.mobile,
                    player.finalPrice != null ? money(player.finalPrice) : ""
                ]
                    .filter(Boolean)
                    .join(" · ")}</small>
            </div>
            <span class="badge yours">Squad</span>
        </div>`
        )
        .join("");
}

function renderAll(payload) {
    live = payload;
    try {
        const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");
        els.divisionTitle.textContent =
            payload.divisionName || meta.division?.name || payload.divisionId || "Division";
    } catch (_) {
        els.divisionTitle.textContent = payload.divisionName || "Division";
    }
    renderPurse(payload.team);
    renderPlayer(payload.currentPlayer);
    renderCategories(payload.categories || {});
    renderSquad(payload.squad || []);
}

async function refreshLive() {
    const payload = await api("/api/v1/bidder/live");
    renderAll(payload);
    return payload;
}

async function placeBid() {
    if (!live?.currentPlayer?.canBid || bidding) return;
    bidding = true;
    els.bidBtn.disabled = true;
    els.bidStatus.textContent = "Placing bid…";
    try {
        const result = await api("/api/v1/bidder/bid", {
            method: "POST",
            body: { expectedRevision: live.revision }
        });
        if (result.live) renderAll(result.live);
        else await refreshLive();
        els.bidStatus.textContent = `Bid placed: ${money(result.amount)}`;
    } catch (error) {
        els.bidStatus.textContent = error.message || "Bid failed";
        if (error.status === 409) {
            try {
                await refreshLive();
            } catch (_) {
                /* ignore */
            }
        }
    } finally {
        bidding = false;
        renderPlayer(live?.currentPlayer);
    }
}

document.getElementById("logout-btn")?.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(META_KEY);
    window.location.replace("./");
});

els.bidBtn?.addEventListener("click", placeBid);

refreshLive()
    .then(() => {
        pollTimer = setInterval(() => {
            refreshLive().catch(() => {});
        }, 1200);
    })
    .catch((error) => {
        els.bidStatus.textContent = error.message || "Could not load auction";
    });

window.addEventListener("beforeunload", () => {
    if (pollTimer) clearInterval(pollTimer);
});
