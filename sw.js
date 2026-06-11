// ============================================================
// SERVICE WORKER — Porra Mundial 2026
// Gestiona caché offline + notificaciones push (FCM)
// ============================================================

const CACHE_NAME = 'porra-mundial-v1';
const PRECACHE   = ['./', './index.html', './css/style.css', './js/app.js', './js/data.js', './js/config.js'];

// ── Caché offline ─────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// ── Firebase Cloud Messaging ──────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// ⚠️ IMPORTANTE: Copia aquí exactamente los mismos valores que en js/config.js
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC2HnE4uUCKKPh0fOudH9m0NZP34YQt09M",
  authDomain:        "porra-mundial-8f63e.firebaseapp.com",
  projectId:         "porra-mundial-8f63e",
  storageBucket:     "porra-mundial-8f63e.firebasestorage.app",
  messagingSenderId: "602321830220",
  appId:             "1:602321830220:web:c5c62592e8875e3fdf4fe9",
};

firebase.initializeApp(FIREBASE_CONFIG);
const messaging = firebase.messaging();

// Notificaciones en segundo plano (app cerrada o en background)
messaging.onBackgroundMessage(payload => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || '⚽ Porra Mundial 2026', {
    body:               n.body || 'Tienes una porra pendiente',
    icon:               './favicon.ico',
    badge:              './favicon.ico',
    requireInteraction: true,
    vibrate:            [200, 100, 200],
    data:               payload.data || {},
    tag:                payload.data?.matchId || 'porra',
  });
});

// Tap en la notificación → abrir / enfocar la app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      for (const c of cs) {
        if ('focus' in c) return c.focus();
      }
      return clients.openWindow('./');
    })
  );
});
