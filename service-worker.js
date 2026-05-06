const CACHE_NAME = 'ss-student-cache-v1';
const IMAGE_CACHE = 'ss-student-images-v1';

// Recursos críticos (App Shell)
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './firebase-student.js'
];

// Instalar Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activar y limpiar cachés antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== IMAGE_CACHE) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estrategias de Interceptación Inteligente
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. CACHÉ AGRESIVO PARA IMÁGENES (Firebase Storage o avatares)
  // Siempre busca en caché primero. Si no está, la descarga y la guarda.
  if (event.request.destination === 'image' || url.href.includes('firebasestorage.googleapis.com')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse; // Carga instantánea

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(IMAGE_CACHE).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Si no hay red y no está en caché, devolvemos una imagen vacía o rota genérica
          return new Response('<svg width="100" height="100" fill="#ccc"><rect width="100" height="100"/></svg>', {
            headers: { 'Content-Type': 'image/svg+xml' }
          });
        });
      })
    );
    return;
  }

  // 2. NETWORK-FIRST PARA LA APP SHELL (HTML, JS)
  // Intenta descargar la última versión. Si falla (offline), usa el caché.
  if (event.request.mode === 'navigate' || url.origin === location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Si no hay red, sirve el index.html guardado
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }
});
