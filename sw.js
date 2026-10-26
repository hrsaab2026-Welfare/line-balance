/* Service worker: ให้ติดตั้งเป็นแอปได้ และเปิดหน้าแอปได้แม้เน็ตหลุด (ข้อมูลงานยังต้องใช้เน็ตกับ Supabase)
   ไฟล์ของแอปเอง: ลองเน็ตก่อน ถ้าไม่ได้ใช้ของที่เก็บไว้ (ได้เวอร์ชันใหม่เสมอเมื่อออนไลน์)
   ไลบรารี/ฟอนต์จาก CDN: ใช้ที่เก็บไว้ก่อน  ส่วน Supabase ไม่แตะเลย
   เปลี่ยนไฟล์แอปแล้วไม่ต้องแก้อะไร ถ้าเปลี่ยนรายการ SHELL ให้เพิ่มเลขเวอร์ชันของ CACHE */
var CACHE = 'lb-v1';
var SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'js/calc.js', 'js/parse.js', 'js/lazy.js', 'js/errlog.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
var CDN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;
  var u = new URL(r.url);
  if (u.origin === location.origin) {
    e.respondWith(fetch(r).then(function (res) {
      if (res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); }
      return res;
    }).catch(function () { return caches.match(r, { ignoreSearch: true }).then(function (m) { return m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()); }); }));
  } else if (CDN.test(r.url)) {
    e.respondWith(caches.match(r).then(function (m) {
      return m || fetch(r).then(function (res) { if (res.ok || res.type === 'opaque') { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); } return res; });
    }));
  }
});
