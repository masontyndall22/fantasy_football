const CACHE_NAME = "the-league-shell-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./js/dom.js",
  "./js/format.js",
  "./js/ranking.js",
  "./js/state.js",
  "./js/data-loader.js",
  "./js/nav.js",
  "./js/components/standings-list.js",
  "./js/pages/home.js",
  "./js/pages/bios.js",
  "./js/pages/scoring.js",
  "./js/pages/playoffs.js",
  "./js/pages/rivalries.js",
  "./js/pages/history.js",
  "./js/pages/year-review.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/mark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn("Failed to cache", url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for everything, with cache as an offline fallback only.
// { cache: "reload" } forces the browser to bypass its own HTTP cache and
// actually hit the network (bypassing any Cache-Control the host sends) —
// without this, a plain fetch() can be silently satisfied by the browser's
// HTTP cache, which defeats "network-first" and is the main reason iOS
// home-screen installs were serving stale code/styles/data.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request, { cache: "reload" })
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});