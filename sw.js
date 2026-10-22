/* Service worker: เปิดหน้าเว็บได้เร็วและติดตั้งเป็นแอปได้
   - ไฟล์ของแอป: โหลดจากเน็ตก่อน ถ้าเน็ตช้า/หลุดใช้ของที่เก็บไว้ (ได้เวอร์ชันใหม่เสมอเมื่อมีเน็ต)
   - ไลบรารีจาก CDN และฟอนต์: เก็บไว้ใช้ซ้ำ (เปิดเร็วบนเน็ตโรงงาน)
   - Supabase (ข้อมูลงาน/ล็อกอิน/Realtime) ไม่แตะเลย ไปที่เครือข่ายตรงๆ เสมอ
   ถ้าแก้ไฟล์ในรายการ SHELL ให้เปลี่ยนเลข VERSION ด้วย */
var VERSION = 'v1';
var SHELL_CACHE = 'lb-shell-' + VERSION, CDN_CACHE = 'lb-cdn-' + VERSION;
var SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest',
  'js/lazy.js', 'js/errlog.js', 'js/parse.js', 'js/calc.js', 'js/mobile.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/icon.svg'
];
var CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', function (e) {
  /* ไม่ใช้ addAll: ถ้ามีไฟล์ใดหายไป ที่เหลือยังถูกเก็บ และติดตั้งต่อได้ */
  e.waitUntil(caches.open(SHELL_CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }));
  /* ไม่ skipWaiting เอง: รอให้ผู้ใช้กด "อัปเดตเลย" กันหน้าจอรีเฟรชตอนกำลังกรอกเวลา */
});

self.addEventListener('message', function (e) { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return /^lb-(shell|cdn)-/.test(k) && k !== SHELL_CACHE && k !== CDN_CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
});

function networkFirst(req, cacheName, ms, isNav) {
  return new Promise(function (resolve) {
    var done = false;
    function fallback() { return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || (isNav ? caches.match('index.html') : null); }); }
    var timer = setTimeout(function () { if (done) return; fallback().then(function (r) { if (r && !done) { done = true; resolve(r); } }); }, ms);
    fetch(req).then(function (res) {
      if (res && res.ok) { var cp = res.clone(); caches.open(cacheName).then(function (c) { c.put(req, cp); }); }
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      if (!done) fallback().then(function (r) { done = true; resolve(r || Response.error()); });
    });
  });
}

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (/\.supabase\.(co|in)$/.test(url.hostname)) return;           /* ข้อมูลงานและล็อกอิน ไม่แคช */
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req, SHELL_CACHE, 3500, req.mode === 'navigate')); return;
  }
  if (CDN_HOSTS.indexOf(url.hostname) >= 0) e.respondWith(staleWhileRevalidate(req, CDN_CACHE));
});
