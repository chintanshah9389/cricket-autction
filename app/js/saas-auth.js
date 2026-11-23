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

  /**
   * Upload a file to R2 for the active org/tournament.
   * Returns { objectKey, publicUrl }.
   */
  async function uploadMedia(file, purpose = "upload") {
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
  }

  async function deleteMedia(objectKey) {
    const key = String(objectKey || "").trim();
    if (!key) return { deleted: false };
    const orgId = getActiveOrgId();
    if (!orgId) throw new Error("Select an organization first.");
    return api("/api/v1/media", {
      method: "DELETE",
      body: { orgId, objectKey: key }
    });
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
    login,
    registerOwner,
    logout,
    requireAuth,
    redirectAfterLogin,
    setStatus
  };
})(window);
