const TOKEN_KEY = "ca_bidder_token";
const META_KEY = "ca_bidder_meta";

function qs(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
}

const codeInput = document.getElementById("bidder-code");
const pinInput = document.getElementById("bidder-pin");
const statusEl = document.getElementById("bidder-login-status");
const form = document.getElementById("bidder-login-form");

if (qs("expired") === "1" && statusEl) {
    statusEl.textContent =
        "Session expired or invalid. Log in again with the team code and PIN from Config (after Save).";
}

if (localStorage.getItem(TOKEN_KEY) && qs("expired") !== "1") {
    window.location.replace("./app.html");
}

form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Signing in…";
    try {
        const body = {
            code: String(codeInput.value || "").trim(),
            pin: String(pinInput.value || "").trim()
        };
        const response = await fetch("/api/v1/bidder/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(
                payload.error ||
                    (response.status === 401
                        ? "Invalid team code or PIN. Use the code/PIN from Config after Save — do not Generate a new one unless you want to replace it."
                        : "Login failed")
            );
        }
        localStorage.setItem(TOKEN_KEY, payload.token);
        localStorage.setItem(META_KEY, JSON.stringify({
            team: payload.team,
            division: payload.division,
            tournament: payload.tournament,
            maxDevices: payload.maxDevices || payload.tournament?.maxBidderDevices || 2
        }));
        if (payload.kickedDevices > 0 && statusEl) {
            statusEl.textContent = `Signed in. Oldest device was signed out (max ${payload.maxDevices} devices).`;
        }
        window.location.href = "./app.html";
    } catch (error) {
        statusEl.textContent = error.message || "Login failed";
    }
});
