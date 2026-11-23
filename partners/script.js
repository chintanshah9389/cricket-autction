const TIER_LABELS = {
    title: "Title Partner",
    presented: "Presented By",
    partner: "Partner"
};

const TIER_RANK = { title: 0, presented: 1, partner: 2 };

const heroStage = document.getElementById("hero-stage");
const heroTier = document.getElementById("hero-tier");
const heroLogo = document.getElementById("hero-logo");
const heroVideo = document.getElementById("hero-video");
const heroMediaWrap = document.getElementById("hero-media-wrap");
const heroName = document.getElementById("hero-name");
const heroTagline = document.getElementById("hero-tagline");
const showcaseCaption = document.getElementById("showcase-caption");
const dotsEl = document.getElementById("partners-dots");
const emptyEl = document.getElementById("empty-state");

let highlighted = [];
let cycleIndex = 0;
let cycleTimer = null;
let videoEndedHandler = null;

function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fadeShowcaseCaption(out) {
    if (!showcaseCaption) return;
    if (out) {
        showcaseCaption.classList.add("is-fading");
        await waitMs(420);
    } else {
        showcaseCaption.classList.remove("is-fading");
    }
}

function resolveMediaSrc(path) {
    const value = String(path || "").trim();
    if (!value) return "";
    if (
        value.startsWith("data:") ||
        value.startsWith("http") ||
        value.startsWith("../") ||
        value.startsWith("/")
    ) {
        return value;
    }
    if (value.startsWith("data-project/") || value.startsWith("assets/")) return `../${value}`;
    return value;
}

function sortHighlighted(list) {
    return [...list].sort((a, b) => {
        const tierDiff = (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9);
        if (tierDiff !== 0) return tierDiff;
        const orderDiff = Number(a.order || 0) - Number(b.order || 0);
        if (orderDiff !== 0) return orderDiff;
        return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

function clearCycleTimer() {
    if (cycleTimer) {
        clearTimeout(cycleTimer);
        cycleTimer = null;
    }
    if (heroVideo && videoEndedHandler) {
        heroVideo.removeEventListener("ended", videoEndedHandler);
        videoEndedHandler = null;
    }
}

function stopVideo() {
    if (!heroVideo) return;
    heroVideo.pause();
    heroVideo.removeAttribute("src");
    heroVideo.classList.add("is-hidden");
    try {
        heroVideo.load();
    } catch (_) {
        // ignore
    }
}

function playVideo(src, { loop = false } = {}) {
    return new Promise((resolve) => {
        if (!heroVideo || !src) {
            resolve(false);
            return;
        }
        stopVideo();
        heroVideo.classList.remove("is-hidden");
        heroVideo.muted = true;
        heroVideo.playsInline = true;
        heroVideo.loop = loop;
        heroVideo.src = src;

        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            heroVideo.removeEventListener("canplay", onReady);
            resolve(ok);
        };
        const onReady = () => {
            heroVideo.play().then(() => finish(true)).catch(() => finish(false));
        };
        heroVideo.addEventListener("canplay", onReady);
        heroVideo.addEventListener("error", () => finish(false), { once: true });
    });
}

function renderDots() {
    if (!dotsEl) return;
    if (highlighted.length <= 1) {
        dotsEl.innerHTML = "";
        return;
    }
    dotsEl.innerHTML = highlighted
        .map(
            (_, i) =>
                `<span class="showcase-dot${i === cycleIndex % highlighted.length ? " is-active" : ""}"></span>`
        )
        .join("");
}

async function showHero(partner, { animate = false } = {}) {
    if (!partner) return;
    if (animate) await fadeShowcaseCaption(true);

    const tier = partner.tier || "partner";
    heroTier.textContent = TIER_LABELS[tier] || "Partner";
    heroTier.dataset.tier = tier;
    heroName.textContent = String(partner.name || "Partner").trim();

    const tagline = String(partner.tagline || "").trim();
    if (tagline) {
        heroTagline.textContent = tagline;
        heroTagline.classList.remove("is-hidden");
    } else {
        heroTagline.textContent = "";
        heroTagline.classList.add("is-hidden");
    }

    const videoSrc = resolveMediaSrc(partner.video);
    const logoSrc = resolveMediaSrc(partner.logo);
    const brandLogo = document.getElementById("showcase-brand-logo");
    if (brandLogo) {
        if (logoSrc) {
            brandLogo.classList.remove("is-hidden");
            brandLogo.src = logoSrc;
            brandLogo.alt = `${partner.name || "Partner"} logo`;
            brandLogo.onerror = () => {
                brandLogo.onerror = null;
                brandLogo.classList.add("is-hidden");
                brandLogo.removeAttribute("src");
            };
        } else {
            brandLogo.classList.add("is-hidden");
            brandLogo.removeAttribute("src");
        }
    }

    if (videoSrc) {
        heroMediaWrap.dataset.mode = "video";
        heroLogo.classList.add("is-hidden");
        heroLogo.removeAttribute("src");
        const played = await playVideo(videoSrc, { loop: highlighted.length <= 1 });
        if (!played && logoSrc) {
            stopVideo();
            heroMediaWrap.dataset.mode = "logo";
            heroLogo.classList.remove("is-hidden");
            heroLogo.src = logoSrc;
            heroLogo.alt = partner.name || "Partner logo";
        }
    } else {
        stopVideo();
        heroMediaWrap.dataset.mode = "logo";
        if (logoSrc) {
            heroLogo.classList.remove("is-hidden");
            heroLogo.src = logoSrc;
            heroLogo.alt = partner.name || "Partner logo";
        } else {
            heroLogo.classList.add("is-hidden");
            heroLogo.removeAttribute("src");
        }
    }

    renderDots();
    await fadeShowcaseCaption(false);
}

function showCurrentPartner({ animate = false } = {}) {
    if (!highlighted.length) return;
    const featured = highlighted[cycleIndex % highlighted.length];
    showHero(featured, { animate }).then(() => scheduleAdvance(featured));
}

function advancePartner() {
    if (highlighted.length <= 1) return;
    cycleIndex = (cycleIndex + 1) % highlighted.length;
    showCurrentPartner({ animate: true });
}

function scheduleAdvance(partner) {
    clearCycleTimer();
    if (highlighted.length <= 1) return;

    const hasVideo = Boolean(String(partner?.video || "").trim());
    if (hasVideo && heroVideo) {
        videoEndedHandler = () => advancePartner();
        heroVideo.addEventListener("ended", videoEndedHandler);
        cycleTimer = setTimeout(() => advancePartner(), 20000);
        return;
    }

    cycleTimer = setTimeout(() => advancePartner(), 6000);
}

function startCycle() {
    clearCycleTimer();
    cycleIndex = 0;
    showcaseCaption?.classList.add("is-fading");
    showCurrentPartner({ animate: false });
}

async function loadPartners() {
    const tournamentId =
        window.SaasAuth?.getActiveTournamentId?.() ||
        (() => {
            try {
                return localStorage.getItem("ca_saas_tournament_id");
            } catch (_) {
                return null;
            }
        })();
    if (!tournamentId || !window.SaasAuth?.api) {
        throw new Error("Sign in and select a tournament to view partners.");
    }
    const payload = await window.SaasAuth.api(
        `/api/v1/tournaments/${encodeURIComponent(tournamentId)}/partners`
    );
    const all = Array.isArray(payload.partners) ? payload.partners : [];
    highlighted = sortHighlighted(all.filter((p) => p && p.highlight));

    if (!highlighted.length) {
        heroStage.classList.add("is-empty");
        emptyEl.classList.remove("is-hidden");
        clearCycleTimer();
        stopVideo();
        return;
    }

    emptyEl.classList.add("is-hidden");
    heroStage.classList.remove("is-empty");
    startCycle();
}

async function boot() {
    try {
        await loadPartners();
    } catch (_) {
        emptyEl.classList.remove("is-hidden");
        emptyEl.textContent = "Could not load partners. Start with: node server.js";
        heroStage.classList.add("is-empty");
    }
}

boot();
setInterval(() => {
    loadPartners().catch(() => {});
}, 30000);
