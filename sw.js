const CACHE = "expense-cache-v1";

const FILES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Navigation requests
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static assets
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});

