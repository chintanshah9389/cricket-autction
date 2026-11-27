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
let searchQuery = "";
let selectedBidAmount = 0;
let bidContextKey = "";

const els = {
    teamTitle: document.getElementById("team-title"),
    divisionTitle: document.getElementById("division-title"),
    playerPanel: document.getElementById("player-panel"),
    playerPhoto: document.getElementById("player-photo"),
    playerName: document.getElementById("player-name"),
    playerMeta: document.getElementById("player-meta"),
    currentBid: document.getElementById("current-bid"),
    leadingTeam: document.getElementById("leading-team"),
    leadingTeamLogo: document.getElementById("leading-team-logo"),
    soldResult: document.getElementById("sold-result"),
    soldTeamLogo: document.getElementById("sold-team-logo"),
    soldTeamName: document.getElementById("sold-team-name"),
    soldPrice: document.getElementById("sold-price"),
    livePill: document.getElementById("live-pill"),
    leadingRow: document.getElementById("leading-row"),
    quotaChip: document.getElementById("quota-chip"),
    bidStepper: document.getElementById("bid-stepper"),
    bidMinus: document.getElementById("bid-minus"),
    bidPlus: document.getElementById("bid-plus"),
    selectedBid: document.getElementById("selected-bid"),
    bidStepHint: document.getElementById("bid-step-hint"),
    bidBtn: document.getElementById("bid-btn"),
    bidStatus: document.getElementById("bid-status"),
    bidBlockBanner: document.getElementById("bid-block-banner"),
    purse: document.getElementById("purse"),
    spent: document.getElementById("spent"),
    reserved: document.getElementById("reserved"),
    spendable: document.getElementById("spendable"),
    pending: document.getElementById("pending"),
    slots: document.getElementById("slots"),
    categoryTabs: document.getElementById("category-tabs"),
    categoryList: document.getElementById("category-list"),
    squadList: document.getElementById("squad-list"),
    playerSearch: document.getElementById("player-search"),
    searchList: document.getElementById("search-list")
};

function bidIncrement(currentBid) {
    const value = Number(currentBid) || 0;
    if (value >= 10000000) return 500000;
    if (value >= 5000000) return 200000;
    if (value >= 1000000) return 100000;
    return 50000;
}

function minBidAmount(player) {
    return Math.max(0, Number(player?.nextAmount) || Number(player?.basePrice) || 0);
}

function maxBidAmount(player, team = live?.team) {
    const spendable = Number(team?.spendable);
    if (Number.isFinite(spendable) && spendable > 0) return spendable;
    return Number.MAX_SAFE_INTEGER;
}

function syncSelectedBid(player, { force = false } = {}) {
    if (!player) {
        selectedBidAmount = 0;
        bidContextKey = "";
        return;
    }
    const minAmount = minBidAmount(player);
    const key = `${player.id || player.code || ""}:${live?.revision || 0}:${minAmount}`;
    if (force || key !== bidContextKey || selectedBidAmount < minAmount) {
        selectedBidAmount = minAmount;
        bidContextKey = key;
    }
    const maxAmount = maxBidAmount(player);
    if (selectedBidAmount > maxAmount) selectedBidAmount = Math.max(minAmount, maxAmount);
}

function renderBidStepper(player) {
    if (!els.bidStepper) return;
    if (!player || player.settled) {
        els.bidStepper.hidden = true;
        return;
    }
    syncSelectedBid(player);
    const minAmount = minBidAmount(player);
    const maxAmount = maxBidAmount(player);
    const stepUp = bidIncrement(selectedBidAmount || minAmount);
    const stepDown = bidIncrement(Math.max(0, (selectedBidAmount || minAmount) - 1));
    els.bidStepper.hidden = false;
    if (els.selectedBid) els.selectedBid.textContent = money(selectedBidAmount || minAmount);
    if (els.bidStepHint) {
        els.bidStepHint.textContent =
            selectedBidAmount > minAmount
                ? `Min ${money(minAmount)} · step ${money(stepUp)}`
                : `Min bid · step ${money(stepUp)}`;
    }
    if (els.bidMinus) {
        els.bidMinus.disabled = bidding || !player.canBid || selectedBidAmount <= minAmount;
    }
    if (els.bidPlus) {
        els.bidPlus.disabled =
            bidding || !player.canBid || selectedBidAmount + stepUp > maxAmount;
    }
}

function money(value) {
    if (typeof formatMoney === "function") return formatMoney(value);
    if (typeof showAmount === "function") return showAmount(value);
    return String(value ?? "—");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function api(path, { method = "GET", body } = {}) {
    const url =
        method === "GET"
            ? `${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}`
            : path;
    const response = await fetch(url, {
        method,
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            ...(body ? { "Content-Type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(META_KEY);
        window.location.replace("./?expired=1");
        throw new Error("Session expired — log in again with your saved team code and PIN.");
    }
    if (!response.ok) {
        const error = new Error(payload.error || "Request failed");
        error.payload = payload;
        error.status = response.status;
        throw error;
    }
    return payload;
}

function allPlayersFromLive(payload = live) {
    const categories = payload?.categories || {};
    const rows = [];
    Object.keys(categories).forEach((category) => {
        (categories[category] || []).forEach((player) => {
            rows.push({ ...player, category: player.category || category });
        });
    });
    return rows;
}

function renderPurse(team, player) {
    if (!team) return;
    els.teamTitle.textContent = team.teamName || "Team";
    els.purse.textContent = money(team.purse);
    if (els.spent) {
        els.spent.textContent = money(team.totalCost || 0);
        els.spent.title = `Already spent on squad: ${money(team.totalCost || 0)}`;
    }
    els.reserved.textContent = money(team.reserved);
    els.spendable.textContent = money(team.spendable);
    els.pending.textContent = String(team.pending ?? "—");
    els.slots.textContent = String(team.slotsLeft ?? "—");
    els.purse.title = `Remaining purse: ${money(team.purse)}`;
    els.reserved.title = `Reserved for ${team.reserveSlots ?? "—"} remaining category minimums: ${money(team.reserved)}`;
    els.spendable.title = `Max bid now after reserves: ${money(team.spendable)}`;
    if (player?.category) {
        els.pending.title = `${player.categoryOwned ?? 0}/${player.categoryMax ?? "—"} ${player.category} bought · ${team.pending ?? 0} pending in category`;
    } else {
        els.pending.title = "Players still needed in the open player's category";
    }
    els.slots.title = `${team.playerBought ?? 0}/${team.squadCapacity ?? "—"} squad filled · ${team.slotsLeft ?? 0} slots left`;
}

function updateBidStatus(player) {
    const reason = player?.bidBlockReason || live?.bidBlockReason || "";
    const blocked = Boolean(reason && player && !player.canBid);
    if (els.bidBlockBanner) {
        if (blocked) {
            els.bidBlockBanner.hidden = false;
            els.bidBlockBanner.textContent = reason;
            els.bidBlockBanner.classList.toggle("is-quota", Boolean(player.quotaFull));
            els.bidBlockBanner.classList.toggle("is-purse", Boolean(player.cannotAfford));
        } else {
            els.bidBlockBanner.hidden = true;
            els.bidBlockBanner.textContent = "";
            els.bidBlockBanner.classList.remove("is-quota", "is-purse");
        }
    }
    if (!els.bidStatus) return;
    if (bidding) return;
    if (blocked) {
        els.bidStatus.textContent = reason;
        els.bidStatus.classList.add("is-blocked");
        delete els.bidStatus.dataset.sticky;
    } else if (!els.bidStatus.dataset.sticky) {
        els.bidStatus.textContent = "";
        els.bidStatus.classList.remove("is-blocked");
    }
}

function setLeadingLogo(src, alt) {
    if (!els.leadingTeamLogo) return;
    if (src) {
        els.leadingTeamLogo.hidden = false;
        els.leadingTeamLogo.src = src;
        els.leadingTeamLogo.alt = alt || "";
        els.leadingTeamLogo.onerror = () => {
            els.leadingTeamLogo.hidden = true;
        };
    } else {
        els.leadingTeamLogo.hidden = true;
        els.leadingTeamLogo.removeAttribute("src");
        els.leadingTeamLogo.alt = "";
    }
}

function renderSoldResult(player) {
    if (!els.soldResult) return;
    const status = String(player?.status || "").toLowerCase();
    const isSold =
        Boolean(player?.settled) &&
        (status === "sold" || Boolean(player?.soldTeamId) || Boolean(player?.soldTeamName));
    if (!player || !isSold) {
        els.soldResult.hidden = true;
        if (els.soldTeamLogo) {
            els.soldTeamLogo.hidden = true;
            els.soldTeamLogo.removeAttribute("src");
        }
        if (els.leadingRow) els.leadingRow.hidden = false;
        return;
    }
    const teamName = player.soldTeamName || "Winning team";
    const price =
        player.finalPrice != null
            ? money(player.finalPrice)
            : player.currentBid
              ? money(player.currentBid)
              : "";
    els.soldResult.hidden = false;
    if (els.leadingRow) els.leadingRow.hidden = true;
    if (els.soldTeamName) els.soldTeamName.textContent = teamName;
    if (els.soldPrice) els.soldPrice.textContent = price ? `For ${price}` : "";
    if (player.soldTeamColor) {
        els.soldResult.style.setProperty("--sold-team-color", player.soldTeamColor);
    }
    if (els.soldTeamLogo) {
        if (player.soldTeamLogo) {
            els.soldTeamLogo.hidden = false;
            els.soldTeamLogo.src = player.soldTeamLogo;
            els.soldTeamLogo.alt = `${teamName} logo`;
            els.soldTeamLogo.onerror = () => {
                els.soldTeamLogo.hidden = true;
            };
        } else {
            els.soldTeamLogo.hidden = true;
            els.soldTeamLogo.removeAttribute("src");
        }
    }
}

function renderPlayer(player) {
    if (!player) {
        if (els.playerPanel) els.playerPanel.dataset.status = "idle";
        els.playerName.textContent = "Waiting for auction…";
        els.playerMeta.textContent = "Auction desk has not opened a player yet";
        els.currentBid.textContent = "—";
        els.leadingTeam.textContent = "No bids yet";
        setLeadingLogo("", "");
        renderSoldResult(null);
        els.bidBtn.disabled = true;
        els.bidBtn.textContent = "BID";
        els.playerPhoto.src = "../assets/placeholder.png";
        if (els.quotaChip) {
            els.quotaChip.hidden = true;
            els.quotaChip.textContent = "";
            els.quotaChip.classList.remove("is-full");
        }
        renderBidStepper(null);
        updateBidStatus(null);
        return;
    }
    const status = String(player.status || "").toLowerCase();
    if (els.playerPanel) {
        els.playerPanel.dataset.status = player.settled
            ? status === "sold"
                ? "sold"
                : status === "unsold" || status === "skipped"
                  ? "unsold"
                  : "settled"
            : "live";
    }
    els.playerPhoto.src = player.photo || "../assets/placeholder.png";
    els.playerName.textContent = player.name || "—";
    els.playerMeta.textContent = [
        player.category,
        player.role,
        player.basePrice != null ? `Base ${money(player.basePrice)}` : "",
        player.categoryMax
            ? `Cat ${player.categoryOwned ?? 0}/${player.categoryMax}`
            : ""
    ]
        .filter(Boolean)
        .join(" · ");
    els.currentBid.textContent = player.currentBid
        ? money(player.currentBid)
        : money(player.basePrice || 0);

    if (status === "sold" || player.soldTeamName || player.soldTeamId) {
        els.leadingTeam.textContent = player.soldTeamName
            ? player.soldTeamName
            : "Winning team";
        setLeadingLogo(player.soldTeamLogo || "", player.soldTeamName || "");
    } else if (player.leadingTeamName) {
        els.leadingTeam.textContent = `Leading: ${player.leadingTeamName}`;
        setLeadingLogo(player.leadingTeamLogo || "", player.leadingTeamName);
    } else {
        els.leadingTeam.textContent = "No bids yet — first bid is base price";
        setLeadingLogo("", "");
    }
    renderSoldResult(player);

    if (els.quotaChip) {
        const owned = Number(player.categoryOwned);
        const max = Number(player.categoryMax);
        if (Number.isFinite(max) && max > 0) {
            const label = String(player.category || "Category");
            const filled = Number.isFinite(owned) ? owned : 0;
            els.quotaChip.hidden = false;
            els.quotaChip.textContent =
                filled >= max
                    ? `${label} quota is fulfilled (${filled}/${max}) — you cannot bid`
                    : `${label} quota ${filled}/${max}`;
            els.quotaChip.classList.toggle("is-full", filled >= max);
        } else {
            els.quotaChip.hidden = true;
            els.quotaChip.textContent = "";
            els.quotaChip.classList.remove("is-full");
        }
    }
    syncSelectedBid(player);
    renderBidStepper(player);
    els.bidBtn.textContent = selectedBidAmount
        ? `BID ${money(selectedBidAmount)}`
        : "BID";
    // Keep button clickable when blocked so the bidder can tap and read why.
    els.bidBtn.disabled = bidding || (!player.canBid && !player.bidBlockReason);
    if (!player.canBid && player.bidBlockReason) {
        els.bidBtn.disabled = false;
        els.bidBtn.classList.add("is-blocked");
    } else {
        els.bidBtn.classList.remove("is-blocked");
    }
    updateBidStatus(player);
}

function playerRowHtml(player) {
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
    const photo = escapeHtml(player.photo || "../assets/placeholder.png");
    return `<div class="list-row has-photo">
        <img class="list-photo" src="${photo}" alt="" loading="lazy" onerror="this.src='../assets/placeholder.png'">
        <div>
            <strong>${escapeHtml(player.name || "—")}</strong><br>
            <small>${escapeHtml(
                [player.category, player.role, player.currentClub, player.mobile]
                    .filter(Boolean)
                    .join(" · ") || "—"
            )}</small>
        </div>
        <span class="badge ${badge}">${badgeText}</span>
    </div>`;
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
                `<button type="button" data-cat="${escapeHtml(name)}" class="${
                    name === activeCategory ? "is-active" : ""
                }">${escapeHtml(name)} (${categories[name].length})</button>`
        )
        .join("");
    els.categoryTabs.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
            activeCategory = button.dataset.cat;
            renderCategories(live?.categories || {});
        });
    });
    const rows = categories[activeCategory] || [];
    els.categoryList.innerHTML = rows.map(playerRowHtml).join("");
}

function renderSearch() {
    if (!els.searchList) return;
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) {
        els.searchList.innerHTML = `<div class="list-row"><div class="meta">Type a name, mobile, club, or category.</div></div>`;
        return;
    }
    const matches = allPlayersFromLive().filter((player) => {
        const hay = [
            player.name,
            player.code,
            player.category,
            player.role,
            player.currentClub,
            player.mobile,
            player.battingStyle,
            player.bowlingStyle
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return hay.includes(query);
    });
    if (!matches.length) {
        els.searchList.innerHTML = `<div class="list-row"><div>No players match “${escapeHtml(query)}”.</div></div>`;
        return;
    }
    els.searchList.innerHTML = matches.slice(0, 40).map(playerRowHtml).join("");
}

function renderSquad(squad) {
    if (!squad?.length) {
        els.squadList.innerHTML = `<div class="list-row"><div>No players signed yet.</div></div>`;
        return;
    }
    els.squadList.innerHTML = squad
        .map((player) => {
            const photo = escapeHtml(player.photo || "../assets/placeholder.png");
            return `<div class="list-row has-photo">
            <img class="list-photo" src="${photo}" alt="" loading="lazy" onerror="this.src='../assets/placeholder.png'">
            <div>
                <strong>${escapeHtml(player.name || "—")}</strong><br>
                <small>${escapeHtml(
                    [
                        player.category,
                        player.role,
                        player.currentClub,
                        player.mobile,
                        player.finalPrice != null ? money(player.finalPrice) : ""
                    ]
                        .filter(Boolean)
                        .join(" · ")
                )}</small>
            </div>
            <span class="badge yours">Squad</span>
        </div>`;
        })
        .join("");
}

function renderAll(payload) {
    live = payload;
    if (els.bidStatus) delete els.bidStatus.dataset.sticky;
    try {
        const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");
        els.divisionTitle.textContent =
            payload.divisionName || meta.division?.name || payload.divisionId || "Division";
    } catch (_) {
        els.divisionTitle.textContent = payload.divisionName || "Division";
    }
    renderPurse(payload.team, payload.currentPlayer);
    renderPlayer(payload.currentPlayer);
    renderCategories(payload.categories || {});
    renderSearch();
    renderSquad(payload.squad || []);
}

let refreshBusy = false;
let lastAppliedRevision = -1;

async function refreshLive({ force = false } = {}) {
    if (refreshBusy && !force) return live;
    refreshBusy = true;
    try {
        const payload = await api("/api/v1/bidder/live");
        const rev = Number(payload?.revision);
        const playerKey = `${payload?.currentPlayer?.id || ""}:${payload?.currentPlayer?.status || ""}:${payload?.currentPlayer?.currentBid || 0}:${payload?.currentPlayer?.soldTeamId || ""}`;
        const prevKey = `${live?.currentPlayer?.id || ""}:${live?.currentPlayer?.status || ""}:${live?.currentPlayer?.currentBid || 0}:${live?.currentPlayer?.soldTeamId || ""}`;
        if (
            force ||
            !Number.isFinite(rev) ||
            rev !== lastAppliedRevision ||
            playerKey !== prevKey
        ) {
            lastAppliedRevision = Number.isFinite(rev) ? rev : lastAppliedRevision;
            renderAll(payload);
        } else {
            live = payload;
        }
        return payload;
    } finally {
        refreshBusy = false;
    }
}

function bumpBid(direction) {
    const player = live?.currentPlayer;
    if (!player?.canBid || bidding) return;
    syncSelectedBid(player);
    const minAmount = minBidAmount(player);
    const maxAmount = maxBidAmount(player);
    if (direction > 0) {
        const step = bidIncrement(selectedBidAmount || minAmount);
        const next = (selectedBidAmount || minAmount) + step;
        if (next > maxAmount) {
            if (els.bidStatus) {
                els.bidStatus.dataset.sticky = "1";
                els.bidStatus.textContent = `Max spendable is ${money(maxAmount)}.`;
                els.bidStatus.classList.add("is-blocked");
            }
            return;
        }
        selectedBidAmount = next;
    } else {
        const step = bidIncrement(Math.max(0, (selectedBidAmount || minAmount) - 1));
        selectedBidAmount = Math.max(minAmount, (selectedBidAmount || minAmount) - step);
    }
    if (els.bidStatus) delete els.bidStatus.dataset.sticky;
    renderPlayer(player);
}

async function placeBid() {
    const player = live?.currentPlayer;
    if (bidding) return;
    if (!player?.canBid) {
        const reason =
            player?.bidBlockReason ||
            live?.bidBlockReason ||
            "You cannot bid on this player right now.";
        if (els.bidStatus) {
            els.bidStatus.dataset.sticky = "1";
            els.bidStatus.textContent = reason;
            els.bidStatus.classList.add("is-blocked");
        }
        return;
    }
    syncSelectedBid(player);
    const amount = Math.max(minBidAmount(player), Number(selectedBidAmount) || 0);
    if (amount > maxBidAmount(player)) {
        if (els.bidStatus) {
            els.bidStatus.dataset.sticky = "1";
            els.bidStatus.textContent = `Cannot bid ${money(amount)}. Spendable now: ${money(maxBidAmount(player))}.`;
            els.bidStatus.classList.add("is-blocked");
        }
        return;
    }
    bidding = true;
    els.bidBtn.disabled = true;
    if (els.bidMinus) els.bidMinus.disabled = true;
    if (els.bidPlus) els.bidPlus.disabled = true;
    if (els.bidStatus) {
        els.bidStatus.dataset.sticky = "1";
        els.bidStatus.classList.remove("is-blocked");
        els.bidStatus.textContent = `Placing bid ${money(amount)}…`;
    }
    try {
        const result = await api("/api/v1/bidder/bid", {
            method: "POST",
            body: { expectedRevision: live.revision, amount }
        });
        selectedBidAmount = 0;
        bidContextKey = "";
        if (result.live) renderAll(result.live);
        else await refreshLive();
        if (els.bidStatus) {
            els.bidStatus.dataset.sticky = "1";
            els.bidStatus.textContent = `Bid placed: ${money(result.amount)}`;
            els.bidStatus.classList.remove("is-blocked");
        }
    } catch (error) {
        if (els.bidStatus) {
            els.bidStatus.dataset.sticky = "1";
            els.bidStatus.textContent = error.message || "Bid failed";
            els.bidStatus.classList.add("is-blocked");
        }
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

document.getElementById("logout-btn")?.addEventListener("click", async () => {
    try {
        await api("/api/v1/bidder/logout", { method: "POST", body: {} });
    } catch (_) {
        /* still clear local session */
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(META_KEY);
    window.location.replace("./");
});

els.bidBtn?.addEventListener("click", placeBid);
els.bidMinus?.addEventListener("click", () => bumpBid(-1));
els.bidPlus?.addEventListener("click", () => bumpBid(1));

els.playerSearch?.addEventListener("input", () => {
    searchQuery = els.playerSearch.value || "";
    renderSearch();
});

function startLivePolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
        if (document.hidden) return;
        refreshLive().catch(() => {});
    }, 900);
}

refreshLive({ force: true })
    .then(() => {
        startLivePolling();
    })
    .catch((error) => {
        if (els.bidStatus) {
            els.bidStatus.textContent = error.message || "Could not load auction";
            els.bidStatus.classList.add("is-blocked");
        }
        startLivePolling();
    });

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshLive({ force: true }).catch(() => {});
});
window.addEventListener("focus", () => {
    refreshLive({ force: true }).catch(() => {});
});

window.addEventListener("beforeunload", () => {
    if (pollTimer) clearInterval(pollTimer);
});
