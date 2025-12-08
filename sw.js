// sw.js
// AHA Chat – enkel service worker med NETWORK-FIRST strategi
// Prøver alltid nett først, bruker cache som fallback (slik at nye deploys synes med en gang)

const CACHE_NAME = "aha-chat-v4.0.110";

// Filer vi gjerne vil ha tilgjengelig offline (app-shell)
const ASSETS = [
  "/",
  "/index.html",
  "/aha-chat.css",
  "/insightsChamber.js",
  "/metaInsightsEngine.js",
  "/ahaFieldProfiles.js",
  "/ahaChat.js",
  "/emnerLoader.js",
  "/ahaEmneMatcher.js"
];

// Install – legg basisfilene i cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // Ta over så fort som mulig
  self.skipWaiting();
});

// Activate – slett gamle cache-versjoner
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch – NETWORK FIRST for samme origin, rør ikke API / andre domener
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Ikke rør API-kall (la de gå rett til backend)
  if (url.pathname.startsWith("/api/aha-agent")) {
    return; // ingen respondWith → vanlig nettverksrequest
  }

  // 2) Ikke rør cross-origin (andre domener/ports)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Bare GET-forespørsler håndteres
  if (req.method !== "GET") {
    return;
  }

  // NETWORK FIRST: prøv nett, fallback til cache
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        // Oppdater cache i bakgrunnen
        const resClone = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, resClone);
        });
        return networkRes;
      })
      .catch(() => {
        // Offline eller nettfeil → prøv cache
        return caches.match(req).then((cached) => {
          if (cached) {
            return cached;
          }
          // Hvis vi ikke finner noe, gi en enkel offline-respons
          return new Response(
            "Du er offline, og denne ressursen finnes ikke i cachen ennå.",
            { status: 503, statusText: "Offline" }
          );
        });
      })
  );
});
