
const CACHE = "infinex-v2";

const FILES = [
    "/",
    "/index.html",
    "/style.css",
    "/script.js",
    "/auth.css",
    "/login.html",
    "/signup.html",
    "/auth.js",
    "/manifest.json"
];

// INSTALL
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(FILES))
    );

    self.skipWaiting();
});

// ACTIVATE
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE)
                    .map(key => caches.delete(key))
            )
        )
    );

    self.clients.claim();
});

// FETCH
self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok && new URL(event.request.url).origin === self.location.origin) {
                    const copy = response.clone();
                    caches.open(CACHE).then(cache =>
                        cache.put(event.request, copy)
                    );
                }

                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
