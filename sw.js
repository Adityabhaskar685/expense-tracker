const CACHE = "expense-cache-v2";
const CDN_CACHE = "expense-cdn-v1";

const coreUrl = path => new URL(path, self.registration.scope).toString();

const CORE_FILES = [
  coreUrl("./"),
  coreUrl("./index.html"),
  coreUrl("./app.js"),
  coreUrl("./manifest.json"),
  coreUrl("./favicon.ico")
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(CORE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key !== CACHE && key !== CDN_CACHE)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, coreUrl("./index.html")));
    return;
  }

  if (url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(cacheFirst(event.request, CDN_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request, CACHE));
  }
});

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(fallbackUrl, response.clone());
    return response;
  } catch {
    return caches.match(fallbackUrl);
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.status < 400) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}
