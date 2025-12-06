// sw.js
// Enkel service worker for AHA Chat – offline + cache av app-shell
// NY: blander oss ikke inn i API-kall / andre domener

const CACHE_NAME = "aha-chat-v3.0.4.203";

// Justér stier hvis nettstedet ligger i en undermappe
const ASSETS = [
  "/",                 // forsiden (på GitHub Pages user-site)
  "/index.html",
  "/aha-chat.css",
  "/insightsChamber.js",
  "/metaInsightsEngine.js",
  "/ahaFieldProfiles.js",
  "/ahaChat.js"
];

// Install – cache grunnfilene
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Activate – rydde bort gamle cache-versjoner
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Fetch – cache bare samme origin, aldri API-kall
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1) Ikke rør API-kall til /api/aha-agent (de skal rett til backend)
  if (url.pathname.startsWith("/api/aha-agent")) {
    return; // lar request gå rett til nettverket
  }

  // 2) Ikke rør cross-origin (f.eks. Codespaces-backend på annen port/host)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Vanlig app-shell caching for egne filer
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          return new Response(
            "Du er offline, og denne ressursen finnes ikke i cachen ennå.",
            { status: 503, statusText: "Offline" }
          );
        });
    })
  );
});
