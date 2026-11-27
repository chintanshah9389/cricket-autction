const qs = new URLSearchParams(window.location.search);
const tournamentRef = qs.get("t") || qs.get("tournament") || qs.get("slug") || "";
const divisionRef = qs.get("div") || qs.get("division") || "";
const accessKey = qs.get("k") || qs.get("key") || qs.get("access") || "";
const VIEWER_KEY_STORAGE = "ca_viewer_key";

const ROLE_ORDER = [
    "Batter",
    "Batsman",
    "Wicket Keeper",
    "Wicket-Keeper",
    "WK",
    "All Rounder",
    "All-Rounder",
    "Bowler"
];

function getViewerKey() {
    try {
        let key = sessionStorage.getItem(VIEWER_KEY_STORAGE);
        if (!key) {
            key =
                typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            sessionStorage.setItem(VIEWER_KEY_STORAGE, key);
        }
        return key;
    } catch (_) {
        return `v_${Date.now().toString(36)}`;
    }
}

const viewerKey = getViewerKey();

let live = null;
let activeTeamId = null;
let pollTimer = null;
let activeView = "live";
let sponsorIndex = 0;
let sponsorTimer = null;
let sponsorSignature = "";
let activeSponsors = [];
let currentSponsorVideoUrl = "";

const els = {
    tournamentLogo: document.getElementById("tournament-logo"),
    tournamentTitle: document.getElementById("tournament-title"),
    divisionTitle: document.getElementById("division-title"),
    viewCountValue: document.getElementById("view-count-value"),
    status: document.getElementById("status"),
    sponsorAd: document.getElementById("sponsor-ad"),
    sponsorAdLabel: document.getElementById("sponsor-ad-label"),
    sponsorAdName: document.getElementById("sponsor-ad-name"),
    sponsorAdTagline: document.getElementById("sponsor-ad-tagline"),
    sponsorAdLink: document.getElementById("sponsor-ad-link"),
    sponsorPlayBtn: document.getElementById("sponsor-play-btn"),
    sponsorPlayOverlay: document.getElementById("sponsor-play-overlay"),
    sponsorVideo: document.getElementById("sponsor-video"),
    sponsorLogo: document.getElementById("sponsor-logo"),
    sponsorBrandLogo: document.getElementById("sponsor-brand-logo"),
    liveHero: document.getElementById("live-hero"),
    liveKicker: document.getElementById("live-kicker"),
    playerPhoto: document.getElementById("player-photo"),
    playerName: document.getElementById("player-name"),
    playerMeta: document.getElementById("player-meta"),
    currentBid: document.getElementById("current-bid"),
    leadingLogo: document.getElementById("leading-logo"),
    leadingText: document.getElementById("leading-text"),
    leadingRow: document.getElementById("leading-row"),
    soldResult: document.getElementById("sold-result"),
    soldLogo: document.getElementById("sold-logo"),
    soldTeamName: document.getElementById("sold-team-name"),
    soldPrice: document.getElementById("sold-price"),
    recentSold: document.getElementById("recent-sold"),
    soldCountNote: document.getElementById("sold-count-note"),
    teamTabs: document.getElementById("team-tabs"),
    squadHero: document.getElementById("squad-hero"),
    squadTeamLogo: document.getElementById("squad-team-logo"),
    squadTeamLabel: document.getElementById("squad-team-label"),
    squadTeamName: document.getElementById("squad-team-name"),
    squadSummary: document.getElementById("squad-summary"),
    squadList: document.getElementById("squad-list"),
    livePanel: document.getElementById("live-panel"),
    squadsPanel: document.getElementById("squads-panel")
};

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

function setLogo(img, src, alt = "") {
    if (!img) return;
    if (src) {
        img.hidden = false;
        img.src = src;
        img.alt = alt;
        img.onerror = () => {
            img.hidden = true;
        };
    } else {
        img.hidden = true;
        img.removeAttribute("src");
        img.alt = "";
    }
}

function tierLabel(tier) {
    const value = String(tier || "").toLowerCase();
    if (value === "title") return "Title sponsor";
    if (value === "presented") return "Presented by";
    return "Official partner";
}

function stopSponsorCycle() {
    if (sponsorTimer) {
        clearTimeout(sponsorTimer);
        sponsorTimer = null;
    }
}

function setPlayButtonVisible(visible) {
    if (els.sponsorPlayBtn) els.sponsorPlayBtn.hidden = !visible;
    if (els.sponsorPlayOverlay) els.sponsorPlayOverlay.hidden = !visible;
}

function stopSponsorVideo() {
    const video = els.sponsorVideo;
    if (!video) return;
    try {
        video.pause();
    } catch (_) {}
    video.removeAttribute("src");
    while (video.firstChild) video.removeChild(video.firstChild);
    try {
        video.load();
    } catch (_) {}
    currentSponsorVideoUrl = "";
}

function showFallbackLogo(sponsor) {
    stopSponsorVideo();
    setPlayButtonVisible(false);
    if (sponsor?.logo && els.sponsorLogo) {
        els.sponsorLogo.hidden = false;
        els.sponsorLogo.src = sponsor.logo;
        els.sponsorLogo.alt = sponsor.name || "Sponsor";
        els.sponsorLogo.removeAttribute("data-fit");
    } else if (els.sponsorLogo) {
        els.sponsorLogo.hidden = true;
    }
}

function ensureSponsorVideoPlaying() {
    const video = els.sponsorVideo;
    if (!video || !currentSponsorVideoUrl) return Promise.resolve(false);
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.playsInline = true;
    if (els.sponsorLogo) els.sponsorLogo.hidden = true;
    const attempt = video.play();
    if (attempt && typeof attempt.then === "function") {
        return attempt
            .then(() => {
                setPlayButtonVisible(false);
                return true;
            })
            .catch(() => {
                setPlayButtonVisible(true);
                return false;
            });
    }
    setPlayButtonVisible(Boolean(video.paused));
    return Promise.resolve(!video.paused);
}

function sponsorVideoCandidates(sponsor) {
    const list = [];
    const push = (value) => {
        const url = String(value || "").trim().replace(/#.*$/, "");
        if (url && !list.includes(url)) list.push(url);
    };
    // Prefer same-origin proxy (now serves correct 206 Range for mobile).
    if (sponsor?.videoKey) {
        push(`/api/v1/public/media?key=${encodeURIComponent(sponsor.videoKey)}`);
    }
    push(sponsor?.video);
    push(sponsor?.videoDirect);
    return list;
}

let sponsorLoadToken = 0;

/**
 * Same pattern as desk partners intro — simple src + canplay + play().
 * Never replace with logo just because autoplay was blocked.
 */
function playSponsorVideo(src, token, poster) {
    const video = els.sponsorVideo;
    if (!video || !src || token !== sponsorLoadToken) return Promise.resolve(false);

    stopSponsorCycle();
    if (els.sponsorLogo) els.sponsorLogo.hidden = true;

    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.playsInline = true;
    video.autoplay = true;
    video.loop = true;
    video.controls = false;
    video.preload = "auto";
    if (poster) video.setAttribute("poster", poster);
    else video.removeAttribute("poster");
    video.style.display = "block";
    video.style.opacity = "1";
    currentSponsorVideoUrl = src;
    video.src = src;

    return new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
            if (settled || token !== sponsorLoadToken) return;
            settled = true;
            video.removeEventListener("canplay", onReady);
            video.removeEventListener("loadeddata", onReady);
            video.removeEventListener("error", onError);
            resolve(ok);
        };
        const onReady = () => {
            video.play()
                .then(() => {
                    setPlayButtonVisible(false);
                    finish(true);
                })
                .catch(() => {
                    setPlayButtonVisible(true);
                    finish(true);
                });
        };
        const onError = () => finish(false);
        video.addEventListener("canplay", onReady);
        video.addEventListener("loadeddata", onReady);
        video.addEventListener("error", onError, { once: true });
        try {
            video.load();
        } catch (_) {}
    });
}

async function loadSponsorVideo(sponsor) {
    const urls = sponsorVideoCandidates(sponsor);
    if (!urls.length) {
        showFallbackLogo(sponsor);
        return false;
    }
    sponsorLoadToken += 1;
    const token = sponsorLoadToken;
    const poster = String(sponsor?.logo || "").trim();

    for (const url of urls) {
        if (token !== sponsorLoadToken) return false;
        const ok = await playSponsorVideo(url, token, poster);
        if (ok) return true;
    }
    // Last resort: keep trying the first URL visibly with controls rather than a static logo,
    // so users still see motion once they tap play.
    if (token === sponsorLoadToken && urls[0] && els.sponsorVideo) {
        if (els.sponsorLogo) els.sponsorLogo.hidden = true;
        currentSponsorVideoUrl = urls[0];
        els.sponsorVideo.controls = true;
        els.sponsorVideo.src = urls[0];
        try {
            els.sponsorVideo.load();
        } catch (_) {}
        setPlayButtonVisible(true);
        return true;
    }
    if (token === sponsorLoadToken) showFallbackLogo(sponsor);
    return false;
}

function showSponsor(sponsors, index) {
    if (!els.sponsorAd || !sponsors?.length) return;
    const sponsor = sponsors[index % sponsors.length];
    if (!sponsor) return;

    els.sponsorAd.hidden = false;
    els.sponsorAdLabel.textContent = tierLabel(sponsor.tier);
    const cleanName = String(sponsor.name || "Sponsor")
        .replace(/[^\w\s.&'’\-()/]/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Sponsor";
    els.sponsorAdName.textContent = cleanName;
    const tagline = String(sponsor.tagline || "").trim();
    els.sponsorAdTagline.textContent = tagline;
    els.sponsorAdTagline.hidden = !tagline;
    setLogo(els.sponsorBrandLogo, sponsor.logo || "", cleanName);

    if (sponsor.url) {
        els.sponsorAdLink.hidden = false;
        els.sponsorAdLink.href = sponsor.url;
    } else {
        els.sponsorAdLink.hidden = true;
        els.sponsorAdLink.removeAttribute("href");
    }

    if (sponsor.video || sponsor.videoDirect || sponsor.videoKey) {
        loadSponsorVideo(sponsor);
    } else {
        showFallbackLogo(sponsor);
    }
    scheduleSponsorAdvance(sponsors);
}

function scheduleSponsorAdvance(sponsors) {
    stopSponsorCycle();
    if (!sponsors || sponsors.length < 2) return;
    const current = sponsors[sponsorIndex % sponsors.length];
    const delay = current?.video ? 20000 : 8000;
    sponsorTimer = setTimeout(() => {
        sponsorIndex = (sponsorIndex + 1) % sponsors.length;
        showSponsor(sponsors, sponsorIndex);
        scheduleSponsorAdvance(sponsors);
    }, delay);
}

function renderSponsors(payload) {
    const sponsors = payload.titleSponsors?.length
        ? payload.titleSponsors
        : (payload.partners || []).filter((p) => p.video || p.logo).slice(0, 3);

    activeSponsors = sponsors;

    if (!sponsors.length) {
        stopSponsorCycle();
        stopSponsorVideo();
        sponsorSignature = "";
        setPlayButtonVisible(false);
        if (els.sponsorAd) els.sponsorAd.hidden = true;
        return;
    }

    const nextSignature = sponsors
        .map(
            (s) =>
                `${s.id || s.name}|${s.video || ""}|${s.videoDirect || ""}|${s.videoKey || ""}|${s.logo || ""}`
        )
        .join(";");

    if (nextSignature === sponsorSignature) {
        if (currentSponsorVideoUrl && els.sponsorVideo?.paused) {
            ensureSponsorVideoPlaying();
        }
        return;
    }
    sponsorSignature = nextSignature;
    sponsorIndex = 0;
    showSponsor(sponsors, sponsorIndex);
}

function renderHeader(payload) {
    const title = [payload.tournament?.name, payload.tournament?.year]
        .filter(Boolean)
        .join(" - ");
    els.tournamentTitle.textContent = title || "Live Auction";
    els.divisionTitle.textContent = payload.division?.name || "Division";
    setLogo(els.tournamentLogo, payload.tournament?.logo || "", title);
    document.title = `${title || "Auction"} · Viewer`;
    if (els.viewCountValue) {
        const count = Math.max(1, Number(payload.viewerCount) || 1);
        els.viewCountValue.textContent = String(count);
    }
    if (els.soldCountNote) {
        const sold = Number(payload.soldCount) || 0;
        els.soldCountNote.textContent = sold ? `${sold} sold` : "";
    }
}

function renderLivePlayer(player) {
    if (!player) {
        els.liveHero.dataset.status = "idle";
        if (els.liveKicker) els.liveKicker.textContent = "Waiting";
        els.playerName.textContent = "Waiting for auction…";
        els.playerMeta.textContent = "Desk has not opened a player yet";
        els.currentBid.textContent = "—";
        els.leadingText.textContent = "No bids yet";
        setLogo(els.leadingLogo, "");
        els.soldResult.hidden = true;
        els.playerPhoto.src = "../assets/placeholder.png";
        return;
    }

    const status = String(player.status || "").toLowerCase();
    els.liveHero.dataset.status = player.settled
        ? status === "sold"
            ? "sold"
            : status === "unsold" || status === "skipped"
              ? "unsold"
              : "settled"
        : "live";

    if (els.liveKicker) {
        els.liveKicker.textContent = player.settled
            ? status === "sold"
                ? "Player sold"
                : status === "unsold"
                  ? "Went unsold"
                  : "Settled"
            : "Now on the block";
    }

    els.playerPhoto.src = player.photo || "../assets/placeholder.png";
    els.playerName.textContent = player.name || "—";
    els.playerMeta.textContent = [player.category, player.role, player.code]
        .filter(Boolean)
        .join(" · ");
    els.currentBid.textContent = player.currentBid
        ? money(player.currentBid)
        : "—";

    const isSold = status === "sold" || Boolean(player.soldTeamName);
    if (isSold) {
        els.leadingText.textContent = player.soldTeamName || "Winning team";
        setLogo(els.leadingLogo, player.soldTeamLogo || "", player.soldTeamName || "");
        els.soldResult.hidden = false;
        els.soldTeamName.textContent = player.soldTeamName || "Winning team";
        els.soldPrice.textContent =
            player.finalPrice != null
                ? money(player.finalPrice)
                : player.currentBid
                  ? money(player.currentBid)
                  : "";
        if (player.soldTeamColor) {
            els.soldResult.style.setProperty("--sold-team-color", player.soldTeamColor);
        }
        setLogo(els.soldLogo, player.soldTeamLogo || "", player.soldTeamName || "");
    } else {
        els.soldResult.hidden = true;
        if (player.leadingTeamName) {
            els.leadingText.textContent = player.leadingTeamName;
            setLogo(els.leadingLogo, player.leadingTeamLogo || "", player.leadingTeamName);
        } else {
            els.leadingText.textContent = "No bids yet";
            setLogo(els.leadingLogo, "");
        }
    }
}

function renderRecentSold(rows) {
    if (!els.recentSold) return;
    if (!rows?.length) {
        els.recentSold.innerHTML = `<div class="list-row"><div><strong>No sold players yet</strong><small>Sold players will appear here.</small></div></div>`;
        return;
    }
    els.recentSold.innerHTML = rows
        .map((player) => {
            const photo = escapeHtml(player.photo || "../assets/placeholder.png");
            return `<article class="list-row">
                <img src="${photo}" alt="" loading="lazy" onerror="this.src='../assets/placeholder.png'">
                <div>
                    <strong>${escapeHtml(player.name || "—")}</strong>
                    <small>${escapeHtml(
                        [player.teamName, player.category, player.role].filter(Boolean).join(" · ")
                    )}</small>
                    <span class="price">${
                        player.finalPrice != null ? escapeHtml(money(player.finalPrice)) : "—"
                    }</span>
                </div>
            </article>`;
        })
        .join("");
}

function normalizeRole(role) {
    const value = String(role || "").trim();
    if (!value) return "Other";
    const lower = value.toLowerCase();
    if (lower.includes("bat") && !lower.includes("all")) return "Batter";
    if (lower.includes("keep") || lower === "wk") return "Wicket Keeper";
    if (lower.includes("all")) return "All Rounder";
    if (lower.includes("bowl")) return "Bowler";
    return value;
}

function roleSortIndex(role) {
    const normalized = normalizeRole(role);
    const idx = ROLE_ORDER.findIndex(
        (entry) => entry.toLowerCase() === normalized.toLowerCase()
    );
    return idx === -1 ? 99 : idx;
}

function renderTeamTabs(teams) {
    if (!els.teamTabs) return;
    if (!teams?.length) {
        els.teamTabs.innerHTML = "";
        return;
    }
    if (
        activeTeamId == null ||
        !teams.some((team) => String(team.teamId) === String(activeTeamId))
    ) {
        activeTeamId = teams[0].teamId;
    }
    els.teamTabs.innerHTML = teams
        .map((team) => {
            const logo = team.logo
                ? `<img src="${escapeHtml(team.logo)}" alt="" onerror="this.style.display='none'">`
                : `<img src="../assets/placeholder.png" alt="">`;
            const accent = team.color || "#1f6b4a";
            return `<button type="button" data-team="${escapeHtml(String(team.teamId))}" style="--team-accent:${escapeHtml(accent)}" class="${
                String(team.teamId) === String(activeTeamId) ? "is-active" : ""
            }">${logo}<span>${escapeHtml(team.teamName)}</span></button>`;
        })
        .join("");
    els.teamTabs.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
            activeTeamId = button.dataset.team;
            renderSquads(live?.teams || []);
        });
    });
}

function renderSquads(teams) {
    renderTeamTabs(teams);
    const team =
        (teams || []).find((entry) => String(entry.teamId) === String(activeTeamId)) ||
        teams?.[0];

    if (!team) {
        if (els.squadTeamName) els.squadTeamName.textContent = "No teams yet";
        if (els.squadSummary) els.squadSummary.innerHTML = "";
        if (els.squadList) {
            els.squadList.innerHTML = `<div class="squad-empty">Teams will appear once the auction starts.</div>`;
        }
        setLogo(els.squadTeamLogo, "");
        return;
    }

    const accent = team.color || "#1f6b4a";
    if (els.squadHero) els.squadHero.style.setProperty("--team-accent", accent);
    if (els.squadTeamLabel) els.squadTeamLabel.textContent = "Squad";
    if (els.squadTeamName) els.squadTeamName.textContent = team.teamName || "Team";
    setLogo(els.squadTeamLogo, team.logo || "", team.teamName || "");

    els.squadSummary.innerHTML = `
        <div><em>Players</em><strong>${team.playerBought ?? team.squad?.length ?? 0}</strong></div>
        <div><em>Spent</em><strong>${escapeHtml(money(team.totalCost || 0))}</strong></div>
        <div><em>Purse</em><strong>${escapeHtml(money(team.purse || 0))}</strong></div>
    `;

    if (!team.squad?.length) {
        els.squadList.innerHTML = `<div class="squad-empty">No players sold to this team yet.</div>`;
        return;
    }

    const grouped = new Map();
    for (const player of team.squad) {
        const role = normalizeRole(player.role || player.category);
        if (!grouped.has(role)) grouped.set(role, []);
        grouped.get(role).push(player);
    }

    const roles = [...grouped.keys()].sort(
        (a, b) => roleSortIndex(a) - roleSortIndex(b) || a.localeCompare(b)
    );

    els.squadList.innerHTML = roles
        .map((role) => {
            const players = grouped.get(role) || [];
            const cards = players
                .map((player) => {
                    const photo = escapeHtml(player.photo || "../assets/placeholder.png");
                    return `<article class="player-card">
                        <img src="${photo}" alt="" loading="lazy" onerror="this.src='../assets/placeholder.png'">
                        <div>
                            <strong>${escapeHtml(player.name || "—")}</strong>
                            <small>${escapeHtml(
                                [player.category, player.code].filter(Boolean).join(" · ")
                            )}</small>
                            <span class="price">${
                                player.finalPrice != null
                                    ? escapeHtml(money(player.finalPrice))
                                    : "—"
                            }</span>
                        </div>
                    </article>`;
                })
                .join("");
            return `<section class="role-block">
                <div class="role-block-head">
                    <h3>${escapeHtml(role)}</h3>
                    <span>${players.length}</span>
                </div>
                <div class="player-grid">${cards}</div>
            </section>`;
        })
        .join("");
}

function setView(view) {
    activeView = view === "squads" ? "squads" : "live";
    document.querySelectorAll(".view-tabs button").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.view === activeView);
    });
    if (els.livePanel) {
        els.livePanel.hidden = activeView !== "live";
        els.livePanel.classList.toggle("is-active", activeView === "live");
    }
    if (els.squadsPanel) {
        els.squadsPanel.hidden = activeView !== "squads";
        els.squadsPanel.classList.toggle("is-active", activeView === "squads");
    }
}

function renderAll(payload) {
    live = payload;
    renderHeader(payload);
    renderSponsors(payload);
    renderLivePlayer(payload.currentPlayer);
    renderRecentSold(payload.recentSold || []);
    renderSquads(payload.teams || []);
}

async function refreshLive() {
    if (!tournamentRef) {
        throw new Error("Missing tournament in link. Open Config and copy the Viewer URL.");
    }
    const params = new URLSearchParams({
        t: tournamentRef,
        viewerKey,
        _: String(Date.now())
    });
    if (divisionRef) params.set("div", divisionRef);
    if (accessKey) params.set("k", accessKey);
    const response = await fetch(`/api/v1/public/live?${params.toString()}`, {
        cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error || "Could not load live auction");
    }
    renderAll(payload);
    if (els.status) els.status.textContent = "";
    return payload;
}

document.querySelectorAll(".view-tabs button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
});

function bindSponsorPlayClick(element) {
    if (!element) return;
    element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        ensureSponsorVideoPlaying();
    });
}

bindSponsorPlayClick(els.sponsorPlayBtn);
bindSponsorPlayClick(els.sponsorPlayOverlay);

if (els.sponsorAd) {
    els.sponsorAd.addEventListener("click", (event) => {
        if (event.target.closest("a, button")) return;
        if (currentSponsorVideoUrl && els.sponsorVideo?.paused) {
            ensureSponsorVideoPlaying();
        }
    });
}

if (els.sponsorVideo) {
    els.sponsorVideo.addEventListener("pause", () => {
        if (currentSponsorVideoUrl && els.sponsorVideo.paused) {
            setPlayButtonVisible(true);
        }
    });
    els.sponsorVideo.addEventListener("playing", () => setPlayButtonVisible(false));
}

setView("live");

refreshLive()
    .then(() => {
        pollTimer = setInterval(() => {
            if (document.hidden) return;
            refreshLive().catch(() => {});
        }, 1200);
    })
    .catch((error) => {
        if (els.status) els.status.textContent = error.message || "Could not load viewer";
    });

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        refreshLive().catch(() => {});
        ensureSponsorVideoPlaying();
    }
});

window.addEventListener("beforeunload", () => {
    if (pollTimer) clearInterval(pollTimer);
    stopSponsorCycle();
    stopSponsorVideo();
});
