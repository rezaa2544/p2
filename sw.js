/* ═══════════════════════════════════════════════════════════════════
   sw.js — Service Worker for Payesh PWA & Offline Support
   -------------------------------------------------------------------
   Caches HTML, static assets, and fonts for 100% offline functionality.
   Network-First for APIs, Cache-First for static assets and shell.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const CACHE_NAME = 'payesh-pwa-v1.0.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/USER_GUIDE.html',
  '/privacy.html',
  '/account-deletion.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: Network-First with offline queue fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ ok: false, code: 'offline', message: 'دستگاه در حالت آفلاین است' }),
          { headers: { 'Content-Type': 'application/json; charset=utf-8' }, status: 503 }
        );
      })
    );
    return;
  }

  // Static Assets / HTML Shell: Cache-First, fallback to Network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Offline fallback to root index.html
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
