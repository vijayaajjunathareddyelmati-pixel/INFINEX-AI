const CACHE = "infinex-v1";

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll(["/", "/style.css", "/script.js", "/manifest.json"])
    )
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request)
    )
  );
});