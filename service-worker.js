'use strict';

// 氢枢 HyHub PWA service worker: precache the app shell, then cache-first for
// same-origin GET requests so the app opens offline from the home screen.
const CACHE = 'hyhub-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon.svg',
  './icons/maskable.svg',
  './icons/icon.svg',
  './assets/css/legacy-app.css',
  './assets/css/workspace.css',
  './assets/css/engineering-workbench-v3.css',
  './assets/css/reference-platform-v4.css',
  './assets/css/fc-scenario-compare-v1.css',
  './assets/css/readability-accessibility-v10.css',
  './assets/js/reference-data.js',
  './assets/js/legacy-app.js',
  './assets/js/engineering-workbench-v3.js',
  './assets/js/engineering-scenario-compare-v1.js',
  './assets/js/workspace-v5.js',
  './assets/js/workspace-v5-model-assurance.js',
  './assets/js/reference-shell-v4-boot.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    // ignoreSearch: index.html loads css/js with ?v= cache-busting queries,
    // while the precache stores the bare paths.
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch((error) => {
        if (request.mode === 'navigate') {
          return caches.match('./index.html', { ignoreSearch: true });
        }
        throw error;
      });
    })
  );
});
