const CACHE_NAME = "cricket-auction-shell-v8";
const SHELL_URLS = [
    "./",
    "./index.html",
    "./styles.css",
    "./animations.css",
    "./app.js",
    "./manifest.webmanifest",
    "./js/money.js",
    "./js/config-store.js",
    "./js/players-store.js",
    "./js/offline-store.js",
    "./assets/placeholder.png",
    "./assets/tournament-logo.png",
    "./config/",
    "./config/index.html",
    "./config/styles.css",
    "./config/config.js",
    "./config/players.html",
    "./config/players.css",
    "./config/players.js"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await Promise.all(
                SHELL_URLS.map(async (url) => {
                    try {
                        const response = await fetch(url, { cache: "no-cache" });
                        if (response && response.ok) {
                            await cache.put(url, response);
                        }
                    } catch (_) {
                        // skip missing/redirect-only assets during install
                    }
                })
            );
            await self.skipWaiting();
        })()
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
            await self.clients.claim();
        })()
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const accept = request.headers.get("accept") || "";
    const isNavigate =
        request.mode === "navigate" ||
        accept.includes("text/html");

    // HTML pages: always prefer network so serve redirects and fresh pages work
    if (isNavigate) {
        event.respondWith(
            fetch(request)
                .then((response) => response)
                .catch(async () => {
                    const cached =
                        (await caches.match(request)) ||
                        (await caches.match("./index.html")) ||
                        (await caches.match("./config/players.html")) ||
                        (await caches.match("./config/index.html"));
                    if (cached) return cached;
                    return new Response("Offline — open the app once while online.", {
                        status: 503,
                        headers: { "Content-Type": "text/plain" }
                    });
                })
        );
        return;
    }

    // JS/CSS: network-first so desk fixes apply immediately; fall back to cache offline
    const isShellAsset = /\.(js|css)$/i.test(new URL(request.url).pathname);
    if (isShellAsset) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (
                        response &&
                        response.ok &&
                        response.type === "basic" &&
                        request.url.startsWith(self.location.origin)
                    ) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(async () => (await caches.match(request)) || Response.error())
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request)
                .then((response) => {
                    if (
                        response &&
                        response.ok &&
                        response.type === "basic" &&
                        request.url.startsWith(self.location.origin)
                    ) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});
