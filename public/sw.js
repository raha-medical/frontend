/* Service Worker — مجمع الرحمة. لا يخزّن أي استدعاء API أو SignalR أبداً. */
const VERSION = "rahma-v2";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const PRECACHE = ["/offline.html", "/rahma-mark.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)));
});
self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                     // API على منفذ آخر، والخطوط من Google
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/hubs/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.open(STATIC).then(async (c) => {              // ملفات ببصمة: cache-first
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res;
    }));
    return;
  }
  // الصفحات وبيانات RSC: الشبكة أولاً ثم آخر نسخة مخزنة، وأخيراً صفحة عدم الاتصال
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && (req.mode === "navigate" || url.searchParams.has("_rsc"))) { const c = await caches.open(PAGES); c.put(req, res.clone()); }
      return res;
    } catch {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === "navigate") return (await caches.match("/offline.html")) || Response.error();
      return Response.error();
    }
  })());
});
