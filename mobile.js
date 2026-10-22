/* ใช้บนมือถือ/แท็บเล็ต: ติดตั้งเป็นแอป (PWA), แจ้งเวอร์ชันใหม่, ซูมกราฟด้วยปุ่มหรือการบีบนิ้ว */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- ข้อความลอยด้านล่าง ---------- */
  var toastEl;
  function toast(text, actions, onClose, ms) {
    if (toastEl) toastEl.remove();
    var t = toastEl = document.createElement('div');
    t.className = 'pwa-toast'; t.setAttribute('role', 'status');
    var s = document.createElement('span'); s.textContent = text; t.appendChild(s);
    (actions || []).forEach(function (a) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = a.label;
      b.addEventListener('click', function () { a.run(); t.remove(); }); t.appendChild(b);
    });
    var x = document.createElement('button'); x.type = 'button'; x.className = 'icbtn'; x.setAttribute('aria-label', 'ปิด'); x.textContent = '×';
    x.addEventListener('click', function () { t.remove(); if (onClose) onClose(); }); t.appendChild(x);
    document.body.appendChild(t);
    if (ms) setTimeout(function () { if (t.parentNode) t.remove(); }, ms);
  }

  /* ---------- Service worker + แจ้งอัปเดต ---------- */
  var hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        function offer(w) { toast('มีเวอร์ชันใหม่พร้อมใช้ (งานที่กรอกค้างอยู่ให้บันทึกก่อนนะ)', [{ label: 'อัปเดตเลย', run: function () { w.postMessage('SKIP_WAITING'); } }]); }
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var w = reg.installing; if (!w) return;
          w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
        });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update().catch(function () {}); });
      }).catch(function () {});
    });
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (!hadController || reloading) return; reloading = true; location.reload(); });
  }

  /* ---------- ปุ่มติดตั้งแอป (Android / Chrome / Edge) ---------- */
  var deferred = null, ib = $('installBtn');
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; if (ib) ib.hidden = false; });
  if (ib) ib.addEventListener('click', function () {
    if (!deferred) return;
    deferred.prompt(); deferred.userChoice.then(function () { deferred = null; ib.hidden = true; }, function () {});
  });
  window.addEventListener('appinstalled', function () { deferred = null; if (ib) ib.hidden = true; });

  /* ---------- iPhone / iPad: ไม่มีปุ่มติดตั้ง บอกวิธีให้ครั้งเดียว ---------- */
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (isIOS && !standalone && !lsGet('lbIosHint')) {
    var tries = 0;
    (function later() {
      var gate = $('lbGate');
      if (gate && gate.offsetParent !== null && ++tries < 6) { setTimeout(later, 8000); return; }
      lsSet('lbIosHint', '1'); /* บอกครั้งเดียว หายเองใน 12 วินาที */
      toast('ติดตั้งเป็นแอป: กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น) แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”', [], null, 12000);
    })();
  }

  /* ---------- ซูมกราฟ: ปุ่ม − + , บีบนิ้ว 2 นิ้ว, Ctrl + ล้อเมาส์ ---------- */
  var ZMIN = 0.6, ZMAX = 3;
  function zoomable(id, label) {
    var box = $(id), panel = box && box.closest('.panel'); if (!panel) return;
    var z = 1, bar = document.createElement('div');
    box.setAttribute('data-zoomable', '');
    bar.className = 'zoombar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'ซูม' + label);
    bar.innerHTML = '<button class="icbtn" type="button" data-z="out" aria-label="ย่อ ' + label + '">−</button>' +
      '<button class="zoomval" type="button" data-z="reset" aria-label="ขนาดปกติ ' + label + '">100%</button>' +
      '<button class="icbtn" type="button" data-z="in" aria-label="ขยาย ' + label + '">+</button>';
    panel.insertBefore(bar, panel.firstChild); /* ต้องอยู่ก่อนคำอธิบายสี (legend) เพราะรายงาน PDF อ้างพี่น้องตัวก่อนหน้ากราฟ */
    var val = bar.querySelector('.zoomval'), bOut = bar.querySelector('[data-z=out]'), bIn = bar.querySelector('[data-z=in]');

    function apply() {
      var svg = box.querySelector('svg'); if (!svg) return;
      var wa = svg.getAttribute('width') || '100%', pct = /%$/.test(wa);
      box.classList.toggle('zpct', pct); box.classList.toggle('znat', !pct);
      if (!pct) box.style.setProperty('--nw', parseFloat(wa) + 'px');
      box.style.setProperty('--z', String(z));
      val.textContent = Math.round(z * 100) + '%';
      bOut.disabled = z <= ZMIN + 1e-6; bIn.disabled = z >= ZMAX - 1e-6;
    }
    /* cx = ตำแหน่งในกรอบที่ต้องอยู่กับที่ขณะซูม */
    function setZ(nz, cx) {
      nz = Math.min(ZMAX, Math.max(ZMIN, nz));
      if (cx == null) cx = box.clientWidth / 2;
      var w0 = box.scrollWidth || 1, anchor = (box.scrollLeft + cx) / w0;
      z = nz; apply();
      box.scrollLeft = anchor * box.scrollWidth - cx;
    }
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-z]'); if (!b) return;
      var k = b.getAttribute('data-z');
      setZ(k === 'in' ? z * 1.25 : k === 'out' ? z / 1.25 : 1);
    });

    var d0 = 0, z0 = 1;
    function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    box.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { d0 = dist(e.touches); z0 = z; } }, { passive: true });
    box.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2 || !d0) return;
      if (e.cancelable) e.preventDefault();
      var mid = (e.touches[0].clientX + e.touches[1].clientX) / 2 - box.getBoundingClientRect().left;
      setZ(z0 * dist(e.touches) / d0, mid);
    }, { passive: false });
    function end(e) { if (!e.touches || e.touches.length < 2) d0 = 0; }
    box.addEventListener('touchend', end); box.addEventListener('touchcancel', end);
    box.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault(); setZ(z * Math.exp(-e.deltaY * 0.01), e.clientX - box.getBoundingClientRect().left);
    }, { passive: false });

    /* กราฟถูกวาดใหม่ทุกครั้งที่ข้อมูลเปลี่ยน: คงระดับซูมไว้ */
    new MutationObserver(apply).observe(box, { childList: true });
    apply();
  }
  zoomable('loadChart', 'กราฟโหลดงาน');
  zoomable('gantt', 'Man-Machine Chart');
  zoomable('scChart', 'กราฟเทียบ Manual กับ Robot');

  /* ---------- ช่องตัวเลข: เด้งแป้นตัวเลขบนมือถือ ---------- */
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t && t.tagName === 'INPUT' && t.type === 'number' && !t.getAttribute('inputmode')) t.setAttribute('inputmode', t.getAttribute('step') === '1' ? 'numeric' : 'decimal');
  });
})();
