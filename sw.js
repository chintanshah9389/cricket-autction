/* Desk must never cache. Unregister immediately and pass all traffic to network. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
      try {
        await self.registration.unregister();
      } catch (_) {
        // ignore
      }
    })()
  );
});

// Do not intercept fetch — fake 503s during deploys were locking the auction desk.
