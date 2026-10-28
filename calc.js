/* ตัวคำนวณ Line Balance (ฟังก์ชันล้วน ไม่อ่าน/เขียนหน้าจอ ทดสอบด้วย Node ได้) */
(function (root) {
'use strict';
function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; d = d == null ? 1 : d; var s = n.toFixed(d); if (+s === 0) s = s.replace('-', ''); /* กัน "-0" */ return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'); }
function pct(n) { return fmt(n * 100, 1) + '%'; }
/* ลำดับเวลา: คู่ขนาน = แต่ละคน/เครื่องมีเส้นเวลาของตัวเอง งานที่ใช้หลายทรัพยากรเริ่มเมื่อทุกตัวว่าง / ต่อเนื่อง = เรียงงานทีละงาน */
function lbSchedule(E, par, R) {
  var t = 0, free = {}, mult = {};
  (R || []).forEach(function (r) { mult[r.id] = r.mult == null ? 1 : r.mult; });
  var mu = function (k) { return mult[k] == null ? 1 : mult[k]; }; /* ตัวคูณของทรัพยากร (ไม่ระบุ = 1) ใช้ชุดเดียวกับโหลดใน lbCompute */
  return E.map(function (e) {
    var ids = Object.keys(e.vals).filter(function (k) { return e.vals[k] > 0; }), o;
    if (!par || !ids.length) {
      var len = e.time * ids.reduce(function (a, k) { return Math.max(a, mu(k)); }, 0); /* ต่อเนื่อง: เวลางาน × ตัวคูณสูงสุดของทรัพยากรที่ใช้ */
      o = { e: e, start: t, end: t + len }; t += len; return o;
    }
    var st = ids.reduce(function (a, k) { return Math.max(a, free[k] || 0); }, 0), mx = 0;
    ids.forEach(function (k) { var d = e.vals[k] * mu(k); free[k] = st + d; mx = Math.max(mx, d); });
    return { e: e, start: st, end: st + mx };
  });
}
/* แถบ Step: ช่วงเวลาของแต่ละ Step ไม่ซ้อนกัน */
function bandsOf(m) {
  var map = {}, list = [];
  m.sched.forEach(function (o) {
    var k = o.e.step || '', b = map[k];
    if (!b) { b = map[k] = { step: k, a: o.start, b: o.end }; list.push(b); } else { b.a = Math.min(b.a, o.start); b.b = Math.max(b.b, o.end); }
  });
  list.sort(function (x, y) { return x.a - y.a; });
  var out = [], prev = 0;
  list.forEach(function (b) { var a = Math.max(b.a, prev); if (b.b > a) { out.push({ step: b.step, a: a, b: b.b }); prev = b.b; } });
  return out;
}
function lbCompute(S, par) {
  var E = S.elements, R = S.resources, cycle = +S.cycle || 0, pcs = Math.max(1, +S.pcs || 1), takt = +S.takt || 0;
  var loads = {}, m = { perPiece: cycle / pcs, cycle: cycle, pcs: pcs, takt: takt };
  R.forEach(function (r) { loads[r.id] = E.reduce(function (a, e) { return a + (e.vals[r.id] || 0); }, 0) * (r.mult == null ? 1 : r.mult); });
  m.loads = loads;
  var men = R.filter(function (r) { return r.kind === 'man'; });
  var manSum = men.reduce(function (a, r) { return a + loads[r.id]; }, 0);
  var manMax = men.reduce(function (a, r) { return Math.max(a, loads[r.id]); }, 0);
  m.men = men.length; m.manSum = manSum;
  m.balEff = men.length && manMax ? manSum / (men.length * manMax) : null;
  m.laborUtil = men.length && cycle ? manSum / (men.length * cycle) : null;
  m.laborPerPc = men.length ? manSum / pcs : null;
  var maxLoad = 0; R.forEach(function (r) { if (loads[r.id] > maxLoad) maxLoad = loads[r.id]; });
  m.maxLoad = maxLoad;
  m.bottle = R.filter(function (r) { return maxLoad > 0 && Math.abs(loads[r.id] - maxLoad) < 1e-9; });
  m.capacity = m.perPiece ? 3600 / m.perPiece : null;
  m.required = takt ? 3600 / takt : null;
  m.sched = lbSchedule(E, par, R);
  m.total = m.sched.reduce(function (a, o) { return Math.max(a, o.end); }, 0);
  return m;
}

function status(load, cycle) {
  if (cycle && load > cycle + 1e-9) return { cls: 'bad', ico: '▲', txt: 'เกินรอบ' };
  if (cycle && load >= cycle * 0.95) return { cls: 'warn', ico: '●', txt: 'ใกล้เต็ม' };
  return { cls: 'good', ico: '✓', txt: 'ปกติ' };
}


var api = { fmt: fmt, pct: pct, lbSchedule: lbSchedule, bandsOf: bandsOf, lbCompute: lbCompute, status: status };
/* บนเบราว์เซอร์ห้ามวางชื่อ status ลง window: window.status เป็นข้อความเก่าของเบราว์เซอร์ ฟังก์ชันที่ใส่เข้าไปจะถูกแปลงเป็นสตริง แล้วเรียก status() ไม่ได้ (กราฟไม่ขึ้น) จึงใช้ชื่อ lbStatus แทน */
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else { var g = Object.assign({}, api, { lbStatus: status }); delete g.status; Object.assign(root, g); }
})(typeof window !== 'undefined' ? window : globalThis);
