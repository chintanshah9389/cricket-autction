/* Partners persist via /api/v1/tournaments/:id/partners (SaaS). */
const TIER_LABELS = {
    title: "Title Partner",
    presented: "Presented By",
    partner: "Partner"
};

const form = document.getElementById("partner-form");
const formHeading = document.getElementById("form-heading");
const editIdInput = document.getElementById("partner-edit-id");
const nameInput = document.getElementById("partner-name");
const tierInput = document.getElementById("partner-tier");
const urlInput = document.getElementById("partner-url");
const taglineInput = document.getElementById("partner-tagline");
const orderInput = document.getElementById("partner-order");
const highlightInput = document.getElementById("partner-highlight");
const logoPreview = document.getElementById("partner-logo-preview");
const logoUploadBtn = document.getElementById("partner-logo-upload-btn");
const logoFileInput = document.getElementById("partner-logo-file");
const logoClearBtn = document.getElementById("partner-logo-clear-btn");
const videoPreview = document.getElementById("partner-video-preview");
const videoUploadBtn = document.getElementById("partner-video-upload-btn");
const videoFileInput = document.getElementById("partner-video-file");
const videoClearBtn = document.getElementById("partner-video-clear-btn");
const videoNameEl = document.getElementById("partner-video-name");
const cancelBtn = document.getElementById("partner-cancel-btn");
const statusEl = document.getElementById("partner-status");
const listEl = document.getElementById("partners-list");
const countEl = document.getElementById("partner-count");

let partners = [];
let draftLogoDataUrl = "";
let draftLogoPath = "";
let draftLogoKey = "";
let draftVideoFile = null;
let draftVideoPath = "";
let draftVideoKey = "";
let draftVideoObjectUrl = "";

function setStatus(message, isError = false) {
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#b42318" : "";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function resolveMediaSrc(path) {
    const value = String(path || "").trim();
    if (!value) return "";
    if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http") || value.startsWith("../") || value.startsWith("/")) {
        return value;
    }
    if (value.startsWith("data-project/") || value.startsWith("assets/")) return `../${value}`;
    return value;
}

function resolveLogoSrc(path) {
    return resolveMediaSrc(path);
}

function createPartnerId() {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function sortPartners(list) {
    return [...(list || [])].sort((a, b) => {
        const orderDiff = Number(a.order || 0) - Number(b.order || 0);
        if (orderDiff !== 0) return orderDiff;
        return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

function nextOrder() {
    if (!partners.length) return 1;
    return Math.max(...partners.map((p) => Number(p.order) || 0)) + 1;
}

function updateLogoPreview(src) {
    const resolved = resolveLogoSrc(src);
    if (resolved) {
        logoPreview.src = resolved;
        logoPreview.classList.remove("is-empty");
        logoClearBtn.disabled = false;
    } else {
        logoPreview.removeAttribute("src");
        logoPreview.classList.add("is-empty");
        logoClearBtn.disabled = true;
    }
}

function clearDraftVideoObjectUrl() {
    if (draftVideoObjectUrl) {
        URL.revokeObjectURL(draftVideoObjectUrl);
        draftVideoObjectUrl = "";
    }
}

function updateVideoPreview(src, label = "") {
    const resolved = resolveMediaSrc(src);
    if (resolved) {
        videoPreview.src = resolved;
        videoPreview.classList.remove("is-empty");
        videoClearBtn.disabled = false;
        videoNameEl.textContent = label || "Video attached";
    } else {
        videoPreview.removeAttribute("src");
        videoPreview.load?.();
        videoPreview.classList.add("is-empty");
        videoClearBtn.disabled = true;
        videoNameEl.textContent = "";
    }
}

function resetForm() {
    editIdInput.value = "";
    nameInput.value = "";
    tierInput.value = "partner";
    urlInput.value = "";
    taglineInput.value = "";
    orderInput.value = String(nextOrder());
    highlightInput.checked = true;
    draftLogoDataUrl = "";
    draftLogoPath = "";
    draftLogoKey = "";
    draftVideoFile = null;
    draftVideoPath = "";
    draftVideoKey = "";
    clearDraftVideoObjectUrl();
    updateLogoPreview("");
    updateVideoPreview("");
    formHeading.textContent = "Add Partner";
    cancelBtn.hidden = true;
}

function fillForm(partner) {
    editIdInput.value = partner.id || "";
    nameInput.value = partner.name || "";
    tierInput.value = partner.tier || "partner";
    urlInput.value = partner.url || "";
    taglineInput.value = partner.tagline || "";
    orderInput.value = String(partner.order || partner.sortOrder || 1);
    highlightInput.checked = Boolean(partner.highlight);
    draftLogoDataUrl = "";
    draftLogoPath = partner.logo || "";
    draftLogoKey = partner.logoKey || "";
    draftVideoFile = null;
    draftVideoPath = partner.video || "";
    draftVideoKey = partner.videoKey || "";
    clearDraftVideoObjectUrl();
    updateLogoPreview(draftLogoPath);
    updateVideoPreview(draftVideoPath, draftVideoPath ? "Saved video" : "");
    formHeading.textContent = `Edit: ${partner.name || "Partner"}`;
    cancelBtn.hidden = false;
    nameInput.focus();
}

function requireSaasPartners() {
    if (!window.SaasAuth?.api || !window.SaasAuth?.getActiveTournamentId?.()) {
        throw new Error("Select a tournament first. Partners are stored in the database.");
    }
}

function partnersApiBase() {
    requireSaasPartners();
    const id = encodeURIComponent(window.SaasAuth.getActiveTournamentId());
    return `/api/v1/tournaments/${id}/partners`;
}

async function fetchPartners() {
    const payload = await window.SaasAuth.api(partnersApiBase());
    partners = sortPartners(payload.partners || []);
}

async function savePartnersList(nextList) {
    const payload = await window.SaasAuth.api(partnersApiBase(), {
        method: "PUT",
        body: { partners: nextList }
    });
    partners = sortPartners(payload.partners || nextList);
}

async function uploadLogo(partnerId, dataUrl) {
    requireSaasPartners();
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `${partnerId || "partner"}-logo.jpg`, {
        type: blob.type || "image/jpeg"
    });
    const uploaded = await window.SaasAuth.uploadMedia(file, "partner-logo");
    return { path: uploaded.publicUrl || "", key: uploaded.objectKey };
}

async function deleteLogo(partnerId, logoKey = "") {
    if (logoKey && window.SaasAuth?.deleteMedia) {
        await window.SaasAuth.deleteMedia(logoKey).catch(() => {});
    }
}

async function uploadVideo(partnerId, file) {
    requireSaasPartners();
    const uploaded = await window.SaasAuth.uploadMedia(file, "partner-video");
    return { path: uploaded.publicUrl || "", key: uploaded.objectKey };
}

async function deleteVideo(partnerId, videoKey = "") {
    if (videoKey && window.SaasAuth?.deleteMedia) {
        await window.SaasAuth.deleteMedia(videoKey).catch(() => {});
    }
}

function readImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error("No file selected."));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read image file."));
        reader.readAsDataURL(file);
    });
}

function renderList() {
    countEl.textContent = `${partners.length} partner${partners.length === 1 ? "" : "s"}`;
    if (!partners.length) {
        listEl.innerHTML = `<div class="partners-empty">No partners yet. Add your first sponsor above.</div>`;
        return;
    }

    listEl.innerHTML = partners
        .map((partner) => {
            const logoSrc = resolveLogoSrc(partner.logo);
            const logoClass = logoSrc ? "" : "is-empty";
            const logoAttr = logoSrc
                ? `src="${escapeHtml(logoSrc)}"`
                : "";
            return `
                <article class="partner-row" data-id="${escapeHtml(partner.id)}">
                    <img class="partner-row-logo ${logoClass}" ${logoAttr} alt="" onerror="this.classList.add('is-empty'); this.removeAttribute('src');">
                    <div class="partner-row-meta">
                        <strong>${escapeHtml(partner.name)}</strong>
                        <span class="partner-tier-chip" data-tier="${escapeHtml(partner.tier)}">${escapeHtml(TIER_LABELS[partner.tier] || "Partner")}</span>
                        ${partner.highlight ? `<span class="partner-highlight-chip">Highlighted</span>` : ""}
                        ${partner.video ? `<span class="partner-highlight-chip">Video</span>` : ""}
                        <span>Order ${escapeHtml(partner.order)}</span>
                        ${partner.tagline ? `<span>${escapeHtml(partner.tagline)}</span>` : ""}
                        ${partner.url ? `<span>${escapeHtml(partner.url)}</span>` : ""}
                    </div>
                    <div class="partner-row-actions">
                        <button type="button" class="secondary-btn" data-edit="${escapeHtml(partner.id)}">Edit</button>
                        <button type="button" class="secondary-btn" data-toggle-highlight="${escapeHtml(partner.id)}">${partner.highlight ? "Unhighlight" : "Highlight"}</button>
                        <button type="button" class="link-danger" data-delete="${escapeHtml(partner.id)}">Delete</button>
                    </div>
                </article>
            `;
        })
        .join("");

    listEl.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const partner = partners.find((p) => p.id === btn.dataset.edit);
            if (partner) fillForm(partner);
        });
    });

    listEl.querySelectorAll("[data-toggle-highlight]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.toggleHighlight;
            const next = partners.map((p) =>
                p.id === id ? { ...p, highlight: !p.highlight } : p
            );
            try {
                await savePartnersList(next);
                renderList();
                setStatus("Highlight updated.");
            } catch (error) {
                setStatus(error.message || "Could not update highlight.", true);
            }
        });
    });

    listEl.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.delete;
            const partner = partners.find((p) => p.id === id);
            if (!partner) return;
            if (!confirm(`Delete partner "${partner.name}"?`)) return;
            try {
                await deleteLogo(id, partner.logoKey || "");
                await deleteVideo(id, partner.videoKey || "");
                await savePartnersList(partners.filter((p) => p.id !== id));
                if (editIdInput.value === id) resetForm();
                renderList();
                setStatus(`Deleted ${partner.name}.`);
            } catch (error) {
                setStatus(error.message || "Could not delete partner.", true);
            }
        });
    });
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
        setStatus("Partner name is required.", true);
        return;
    }

    const editingId = editIdInput.value.trim();
    const id = editingId || createPartnerId();
    let logoPath = draftLogoPath;
    let logoKey = draftLogoKey;
    let videoPath = draftVideoPath;
    let videoKey = draftVideoKey;

    try {
        const savePartner = async () => {
            setStatus("Saving…");
            if (draftLogoDataUrl) {
                if (window.SaasAuth?.updateBusy) {
                    window.SaasAuth.updateBusy("Uploading partner logo…");
                }
                if (logoKey) await deleteLogo(id, logoKey);
                const uploaded = await uploadLogo(id, draftLogoDataUrl);
                logoPath = uploaded.path || "";
                logoKey = uploaded.key || "";
            }
            if (draftVideoFile) {
                setStatus("Uploading video…");
                if (window.SaasAuth?.updateBusy) {
                    window.SaasAuth.updateBusy("Uploading partner video…");
                }
                if (videoKey) await deleteVideo(id, videoKey);
                const uploaded = await uploadVideo(id, draftVideoFile);
                videoPath = uploaded.path || "";
                videoKey = uploaded.key || "";
            }

            if (window.SaasAuth?.updateBusy) {
                window.SaasAuth.updateBusy("Saving partner…");
            }
            const record = {
                id,
                name,
                tier: tierInput.value || "partner",
                url: urlInput.value.trim(),
                tagline: taglineInput.value.trim(),
                logo: logoPath || "",
                logoKey: logoKey || null,
                video: videoPath || "",
                videoKey: videoKey || null,
                highlight: Boolean(highlightInput.checked),
                order: Number(orderInput.value) || nextOrder(),
                sortOrder: Number(orderInput.value) || nextOrder()
            };

            const without = partners.filter((p) => p.id !== id);
            await savePartnersList([...without, record]);
            resetForm();
            renderList();
            setStatus(`Saved ${name}.`);
        };
        if (window.SaasAuth?.withBusy) {
            await window.SaasAuth.withBusy("Saving partner…", savePartner);
        } else {
            await savePartner();
        }
    } catch (error) {
        setStatus(error.message || "Could not save partner.", true);
    }
});

cancelBtn.addEventListener("click", () => {
    resetForm();
    setStatus("");
});

logoUploadBtn.addEventListener("click", () => logoFileInput.click());

logoFileInput.addEventListener("change", async () => {
    const file = logoFileInput.files?.[0];
    logoFileInput.value = "";
    if (!file) return;
    try {
        draftLogoDataUrl = await readImageFileAsDataUrl(file);
        draftLogoPath = "";
        updateLogoPreview(draftLogoDataUrl);
        setStatus("Logo ready — click Save Partner.");
    } catch (error) {
        setStatus(error.message || "Could not read logo.", true);
    }
});

logoClearBtn.addEventListener("click", async () => {
    const id = editIdInput.value.trim();
    const existing = partners.find((p) => p.id === id);
    draftLogoDataUrl = "";
    draftLogoPath = "";
    const keyToDelete = draftLogoKey || existing?.logoKey || "";
    draftLogoKey = "";
    updateLogoPreview("");
    if (id) {
        await deleteLogo(id, keyToDelete);
        const next = partners.map((p) =>
            p.id === id ? { ...p, logo: "", logoKey: null } : p
        );
        try {
            await savePartnersList(next);
            renderList();
            setStatus("Logo cleared.");
        } catch (error) {
            setStatus(error.message || "Could not clear logo.", true);
        }
    } else {
        setStatus("Logo cleared.");
    }
});

videoUploadBtn.addEventListener("click", () => videoFileInput.click());

videoFileInput.addEventListener("change", () => {
    const file = videoFileInput.files?.[0];
    videoFileInput.value = "";
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) {
        setStatus("Video is too large (max ~80MB). Use a shorter clip.", true);
        return;
    }
    draftVideoFile = file;
    draftVideoPath = "";
    clearDraftVideoObjectUrl();
    draftVideoObjectUrl = URL.createObjectURL(file);
    updateVideoPreview(draftVideoObjectUrl, file.name);
    setStatus("Video ready — click Save Partner.");
});

videoClearBtn.addEventListener("click", async () => {
    const id = editIdInput.value.trim();
    const existing = partners.find((p) => p.id === id);
    draftVideoFile = null;
    draftVideoPath = "";
    const keyToDelete = draftVideoKey || existing?.videoKey || "";
    draftVideoKey = "";
    clearDraftVideoObjectUrl();
    updateVideoPreview("");
    if (id) {
        await deleteVideo(id, keyToDelete);
        const next = partners.map((p) =>
            p.id === id ? { ...p, video: "", videoKey: null } : p
        );
        try {
            await savePartnersList(next);
            renderList();
            setStatus("Video cleared.");
        } catch (error) {
            setStatus(error.message || "Could not clear video.", true);
        }
    } else {
        setStatus("Video cleared.");
    }
});

async function boot() {
    try {
        if (window.SaasAuth?.requireAuth) {
            const me = await window.SaasAuth.requireAuth();
            if (!me) return;
        }
        await fetchPartners();
        resetForm();
        renderList();
        setStatus(
            partners.length
                ? "Partners loaded from database for this tournament."
                : "Ready to add partners."
        );
    } catch (error) {
        resetForm();
        renderList();
        setStatus(error.message || "Could not load partners from database.", true);
    }
}

boot();
