const CACHE_NAME = "xteink-cjk-shell-v1";
const SHELL_ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(pathname) {
  if (pathname.startsWith("/assets/")) {
    return true;
  }
  return /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const network = await fetch(request);
          if (network.ok) {
            cache.put("/index.html", network.clone());
          }
          return network;
        } catch {
          return (await cache.match("/index.html")) || (await cache.match("/")) || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((network) => {
            if (network.ok) {
              cache.put(request, network.clone());
            }
            return network;
          })
          .catch(() => undefined);

        return cached || (await networkPromise) || new Response("Offline", { status: 503 });
      })()
    );
  }
});
