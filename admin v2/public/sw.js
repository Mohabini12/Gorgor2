const CACHE_NAME = "gorgor-shell-v1";
const BRAND_ICON = "/api/branding/icon.svg";

const CORE_ASSETS = [
  "/",
  "/manifest.json",
  BRAND_ICON,
  "/sql-wasm.wasm",
  "/sql-wasm-browser.wasm",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never cache live messaging/auth API mutations or external origins improperly
  if (url.origin !== self.location.origin) return;
  // The backend-generated emblem is a static brand asset: cache it for offline use
  if (url.pathname.startsWith("/api/") && url.pathname !== BRAND_ICON) return;

  // Cache-first for static Next.js chunks and wasm, network-first for HTML navigation
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".wasm") ||
    url.pathname.endsWith(".svg") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
  }
});
