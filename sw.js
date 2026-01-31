const CACHE = "expense-v3";

const APP_FILES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE)
            .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;

  // Navigation requests
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("/index.html").then(res => {
        return res || fetch(req);
      })
    );
    return;
  }

  // Assets
  event.respondWith(
    caches.match(req).then(res => {
      return res || fetch(req).then(networkRes => {
        return caches.open(CACHE).then(cache => {
          cache.put(req, networkRes.clone());
          return networkRes;
        });
      });
    })
  );
});

