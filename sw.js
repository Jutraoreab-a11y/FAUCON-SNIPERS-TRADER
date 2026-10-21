// Service Worker — met en cache le "shell" de l'app (HTML/CSS/JS statiques)
// pour un chargement instantané et un fonctionnement correct sur mobile,
// même en cas de réseau faible. Les données Supabase, elles, restent
// toujours récupérées en direct (jamais mises en cache ici).

const CACHE_NAME = "faucon-shell-v2";
const SHELL_FILES = [
  "./index.html",
  "./landing.html",
  "./css/style.css",
  "./js/config.js",
  "./js/supabaseClient.js",
  "./js/mockData.js",
  "./js/aiSources.js",
  "./js/app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
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

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Ne jamais mettre en cache les appels Supabase (toujours des données fraîches)
  if (url.hostname.includes("supabase.co")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
