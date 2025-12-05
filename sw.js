// sw.js
// Enkel service worker for AHA Chat – offline + cache av app-shell

const CACHE_NAME = "aha-chat-v1.0.0.109";

// Justér stier hvis nettstedet ligger i en undermappe
const ASSETS = [
  "/",                 // forsiden (på GitHub Pages user-site)
  "/index.html",
  "/aha-chat.css",
  "/insightsChamber.js",
  "/metaInsightsEngine.js",
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

// Fetch – prøv cache først, deretter nettverk
self.addEventListener("fetch", (event) => {
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
