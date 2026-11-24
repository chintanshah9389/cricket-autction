const TOKEN_KEY = "ca_bidder_token";
const META_KEY = "ca_bidder_meta";

function qs(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
}

const divisionInput = document.getElementById("bidder-division");
const codeInput = document.getElementById("bidder-code");
const pinInput = document.getElementById("bidder-pin");
const statusEl = document.getElementById("bidder-login-status");
const form = document.getElementById("bidder-login-form");

if (divisionInput && !divisionInput.value) {
    divisionInput.value = qs("div") || qs("division") || "";
}

if (localStorage.getItem(TOKEN_KEY)) {
    window.location.replace("./app.html");
}

form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Signing in…";
    try {
        const body = {
            code: String(codeInput.value || "").trim(),
            pin: String(pinInput.value || "").trim(),
            divisionId: String(divisionInput.value || "").trim()
        };
        const response = await fetch("/api/v1/bidder/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || "Login failed");
        }
        localStorage.setItem(TOKEN_KEY, payload.token);
        localStorage.setItem(META_KEY, JSON.stringify({
            team: payload.team,
            division: payload.division,
            tournament: payload.tournament
        }));
        window.location.href = "./app.html";
    } catch (error) {
        statusEl.textContent = error.message || "Login failed";
    }
});
