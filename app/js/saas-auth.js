/**
 * Shared SaaS client auth helper for /app pages.
 */
(function (global) {
  const ACCESS_KEY = "ca_saas_access";
  const REFRESH_KEY = "ca_saas_refresh";
  const USER_KEY = "ca_saas_user";
  const MEMBERSHIPS_KEY = "ca_saas_memberships";
  const ORG_KEY = "ca_saas_org_id";
  const TOURNAMENT_KEY = "ca_saas_tournament_id";

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (_) {
      // ignore
    }
  }

  function getAccessToken() {
    return storageGet(ACCESS_KEY);
  }

  function getRefreshToken() {
    return storageGet(REFRESH_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(storageGet(USER_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function getMemberships() {
    try {
      return JSON.parse(storageGet(MEMBERSHIPS_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function getActiveOrgId() {
    const stored = storageGet(ORG_KEY);
    if (stored) return stored;
    const memberships = getMemberships();
    return memberships[0]?.org?.id || memberships[0]?.orgId || memberships[0]?.org_id || null;
  }

  function setActiveOrgId(orgId) {
    storageSet(ORG_KEY, orgId || null);
  }

  function getActiveTournamentId() {
    return storageGet(TOURNAMENT_KEY);
  }

  function setActiveTournamentId(tournamentId) {
    storageSet(TOURNAMENT_KEY, tournamentId || null);
  }

  function saveSession({ user, memberships, accessToken, refreshToken, organization }) {
    if (accessToken) storageSet(ACCESS_KEY, accessToken);
    if (refreshToken) storageSet(REFRESH_KEY, refreshToken);
    if (user) storageSet(USER_KEY, JSON.stringify(user));
    if (memberships) storageSet(MEMBERSHIPS_KEY, JSON.stringify(memberships));
    if (organization?.id) setActiveOrgId(organization.id);
    else if (!getActiveOrgId() && Array.isArray(memberships) && memberships.length) {
      setActiveOrgId(
        memberships[0].org?.id || memberships[0].orgId || memberships[0].org_id || null
      );
    }
  }

  function clearSession() {
    storageSet(ACCESS_KEY, null);
    storageSet(REFRESH_KEY, null);
    storageSet(USER_KEY, null);
    storageSet(MEMBERSHIPS_KEY, null);
    storageSet(TOURNAMENT_KEY, null);
    storageSet(ORG_KEY, null);
  }

  function isLoggedIn() {
    return Boolean(getAccessToken() && getUser());
  }

  function isSuperAdmin() {
    const user = getUser();
    return Boolean(user?.isSuperAdmin || user?.is_super_admin);
  }

  async function api(path, { method = "GET", body, auth = true } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth) {
      const token = getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store"
    });

    if (response.status === 401 && auth && getRefreshToken()) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return api(path, { method, body, auth });
      }
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function refreshAccessToken() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const response = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        clearSession();
        return false;
      }
      saveSession({
        user: payload.user,
        memberships: payload.memberships,
        accessToken: payload.accessToken
      });
      return true;
    } catch (_) {
      clearSession();
      return false;
    }
  }

  async function login(loginValue, password) {
    const payload = await api("/api/v1/auth/login", {
      method: "POST",
      auth: false,
      body: { login: loginValue, password }
    });
    saveSession(payload);
    return payload;
  }

  async function registerOwner(fields) {
    const payload = await api("/api/v1/auth/register-owner", {
      method: "POST",
      auth: false,
      body: fields
    });
    saveSession(payload);
    return payload;
  }

  async function logout() {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await api("/api/v1/auth/logout", {
          method: "POST",
          body: { refreshToken }
        });
      }
    } catch (_) {
      // ignore network/revoke failures
    }
    clearSession();
  }

  async function requireAuth({ superAdmin = false } = {}) {
    if (!isLoggedIn()) {
      window.location.href = "/app/login.html";
      return null;
    }
    try {
      const me = await api("/api/v1/auth/me");
      saveSession({
        user: me.user,
        memberships: me.memberships,
        accessToken: getAccessToken()
      });
      if (superAdmin && !(me.user?.isSuperAdmin || me.user?.is_super_admin)) {
        window.location.href = "/app/dashboard.html";
        return null;
      }
      return me;
    } catch (_) {
      clearSession();
      window.location.href = "/app/login.html";
      return null;
    }
  }

  function redirectAfterLogin() {
    if (isSuperAdmin()) {
      window.location.href = "/app/super.html";
      return;
    }
    window.location.href = "/app/dashboard.html";
  }

  function setStatus(el, message, isError) {
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.dataset.state = isError ? "error" : "ok";
  }

  let busyDepth = 0;
  let busyStyleReady = false;

  function ensureBusyStyles() {
    if (busyStyleReady || typeof document === "undefined") return;
    busyStyleReady = true;
    const style = document.createElement("style");
    style.id = "saas-busy-style";
    style.textContent = `
      .saas-busy-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.25rem;
        background: rgba(12, 24, 41, 0.48);
        backdrop-filter: blur(2px);
      }
      .saas-busy-overlay[hidden] { display: none !important; }
      .saas-busy-card {
        min-width: min(320px, 92vw);
        max-width: 420px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.35);
        background: #fff;
        box-shadow: 0 18px 50px rgba(12, 24, 41, 0.28);
        padding: 1.15rem 1.25rem;
        display: grid;
        gap: 0.75rem;
        justify-items: center;
        text-align: center;
        font-family: Hind, system-ui, sans-serif;
        color: #16325c;
      }
      .saas-busy-spinner {
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        border: 3px solid rgba(22, 50, 92, 0.18);
        border-top-color: #1f8fbf;
        animation: saas-busy-spin 0.75s linear infinite;
      }
      .saas-busy-text {
        margin: 0;
        font-size: 0.98rem;
        font-weight: 600;
        line-height: 1.35;
      }
      @keyframes saas-busy-spin { to { transform: rotate(360deg); } }
      body.saas-busy { cursor: progress; }
    `;
    document.head.appendChild(style);
  }

  function showBusy(message) {
    if (typeof document === "undefined") return;
    ensureBusyStyles();
    busyDepth += 1;
    let overlay = document.getElementById("saas-busy-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "saas-busy-overlay";
      overlay.className = "saas-busy-overlay";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.innerHTML = `
        <div class="saas-busy-card">
          <div class="saas-busy-spinner" aria-hidden="true"></div>
          <p class="saas-busy-text" id="saas-busy-text">Working…</p>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    const text = document.getElementById("saas-busy-text");
    if (text) text.textContent = message || "Working…";
    overlay.hidden = false;
    document.body.classList.add("saas-busy");
  }

  function hideBusy() {
    if (typeof document === "undefined") return;
    busyDepth = Math.max(0, busyDepth - 1);
    if (busyDepth > 0) return;
    const overlay = document.getElementById("saas-busy-overlay");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("saas-busy");
  }

  function updateBusy(message) {
    if (typeof document === "undefined" || busyDepth <= 0) return;
    const text = document.getElementById("saas-busy-text");
    if (text && message) text.textContent = message;
  }

  async function withBusy(message, fn) {
    showBusy(message);
    try {
      return await fn();
    } finally {
      hideBusy();
    }
  }

  /**
   * Upload a file to R2 for the active org/tournament.
   * Returns { objectKey, publicUrl }.
   */
  async function uploadMedia(file, purpose = "upload", options = {}) {
    const label = options.message || `Uploading ${purpose.replace(/-/g, " ")}…`;
    const run = async () => {
      if (!file) throw new Error("No file selected.");
      const orgId = getActiveOrgId();
      const tournamentId = getActiveTournamentId();
      if (!orgId) throw new Error("Select an organization first.");
      const signed = await api("/api/v1/media/sign-upload", {
        method: "POST",
        body: {
          orgId,
          tournamentId,
          purpose,
          fileName: file.name || "file.bin",
          contentType: file.type || "application/octet-stream"
        }
      });
      const headers = {
        "Content-Type": file.type || "application/octet-stream",
        ...(signed.uploadHeaders || {})
      };
      const put = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers,
        body: file
      });
      if (!put.ok) {
        throw new Error(`Upload failed (HTTP ${put.status})`);
      }
      return {
        objectKey: signed.objectKey,
        publicUrl: signed.publicUrl || null,
        mode: signed.mode || "r2"
      };
    };
    // If a parent batch loader is already open, only update its text.
    if (busyDepth > 0) {
      updateBusy(label);
      return run();
    }
    return withBusy(label, run);
  }

  async function deleteMedia(objectKey, options = {}) {
    const key = String(objectKey || "").trim();
    if (!key) return { deleted: false };
    const label = options.message || "Deleting file…";
    const run = async () => {
      const orgId = getActiveOrgId();
      if (!orgId) throw new Error("Select an organization first.");
      return api("/api/v1/media", {
        method: "DELETE",
        body: { orgId, objectKey: key }
      });
    };
    if (busyDepth > 0) {
      updateBusy(label);
      return run();
    }
    return withBusy(label, run);
  }

  global.SaasAuth = {
    getAccessToken,
    getRefreshToken,
    getUser,
    getMemberships,
    getActiveOrgId,
    setActiveOrgId,
    getActiveTournamentId,
    setActiveTournamentId,
    saveSession,
    clearSession,
    isLoggedIn,
    isSuperAdmin,
    api,
    uploadMedia,
    deleteMedia,
    showBusy,
    hideBusy,
    updateBusy,
    withBusy,
    login,
    registerOwner,
    logout,
    requireAuth,
    redirectAfterLogin,
    setStatus
  };
})(window);
