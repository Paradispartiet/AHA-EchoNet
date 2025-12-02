// sw.js
// Enkel service worker for AHA Chat – offline + cache av app-shell

const CACHE_NAME = "aha-chat-v1.0.0.101";

// Justér stier hvis nettstedet ligger i en undermappe
const ASSETS = [
  "/",                 // forsiden (på GitHub Pages user-site)
  "/index.html",
  "/insightsChamber.js",
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

// Activate – slett gammel cache når du endrer CACHE_NAME
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
});

// Fetch – prøv cache først, fall tilbake til nett
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Bare håndter GET-forespørsler
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Returner cachet respons
        return cached;
      }
      // Ellers: hent fra nett og legg i cache
      return fetch(req)
        .then((response) => {
          // Ikke cache f.eks. feil
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const respClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, respClone);
          });

          return response;
        })
        .catch(() => {
          // Her kan du evt. returnere en offline-side senere
          return new Response(
            "Du er offline, og denne ressursen finnes ikke i cachen ennå.",
            { status: 503, statusText: "Offline" }
          );
        });
    })
  );
});
