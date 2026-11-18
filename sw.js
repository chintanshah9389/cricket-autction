/* Intentionally non-offline: auction desk requires node server.js + data-project. */
const CACHE_NAME = "cricket-auction-disabled-v1";

self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
            await self.clients.claim();
            // Remove this service worker so the browser never serves a cached app shell
            try {
                await self.registration.unregister();
            } catch (_) {
                // ignore
            }
        })()
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const accept = request.headers.get("accept") || "";
    const isNavigate = request.mode === "navigate" || accept.includes("text/html");

    // Never fall back to a cached full app when the server is down
    if (isNavigate) {
        event.respondWith(
            fetch(request).catch(
                () =>
                    new Response(
                        `<!doctype html><html><head><meta charset="utf-8"><title>Server offline</title>
<style>body{font-family:system-ui,sans-serif;background:#152238;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:28rem;padding:1.5rem;border:1px solid rgba(255,255,255,.2);border-radius:1rem;background:#1c2f4a}
code{background:rgba(0,0,0,.35);padding:.15rem .4rem;border-radius:.35rem}</style></head>
<body><main><h1>Offline</h1><p>The auction desk needs the local server.</p>
<p>Run <code>node server.js</code> then open <code>http://localhost:3000</code>.</p>
<p>Cached offline mode is disabled.</p></main></body></html>`,
                        {
                            status: 503,
                            headers: { "Content-Type": "text/html; charset=utf-8" }
                        }
                    )
            )
        );
        return;
    }

    // API and other assets: network only, no cache fallback
    event.respondWith(
        fetch(request).catch(
            () =>
                new Response("Offline — start node server.js", {
                    status: 503,
                    headers: { "Content-Type": "text/plain; charset=utf-8" }
                })
        )
    );
});
