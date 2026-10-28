/* Forecast Work Load: อ่านไฟล์ Forecast (แถวจาก Excel), นับวันทำงาน (วันหยุดบริษัท), คำนวณชั่วโมงงานต่อเดือน/ต่อไลน์ เทียบกำลังผลิต N1..Nx
   (ฟังก์ชันล้วน ไม่แตะหน้าจอ ทดสอบด้วย Node ได้) */
(function (root) {
'use strict';
var DEF_LEVELS = [{ id: 'n1', name: 'N1', hpd: 6.8 }, { id: 'n2', name: 'N2', hpd: 13.6 }, { id: 'n3', name: 'N3', hpd: 16.1 }, { id: 'n4', name: 'N4', hpd: 18.6 }];
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var seq = 0;
function uid(p) { seq++; return p + Date.now().toString(36) + seq.toString(36) + Math.floor(Math.random() * 1296).toString(36); }
function num(v) { if (typeof v === 'number') return isFinite(v) ? v : null; if (typeof v === 'string' && v.trim() !== '') { var n = +v.replace(/,/g, ''); return isFinite(n) ? n : null; } return null; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function blank() {
  return { v: 1, file: '', customer: '', unit: 'sec', months: [], parts: [], lines: [], levels: clone(DEF_LEVELS),
    weekdays: [0, 1, 1, 1, 1, 1, 1], /* อา จ อ พ พฤ ศ ส (1 = ทำงาน) */ holidays: [], dayOv: {} };
}

/* ---------- เดือน ---------- */
function monthKey(y, m) { return y + '-' + pad(m); } /* m = 1..12 */
function splitKey(k) { var p = String(k).split('-'); return { y: +p[0], m: +p[1] }; }
function addMonth(k, n) { var s = splitKey(k), t = s.y * 12 + (s.m - 1) + n; return monthKey(Math.floor(t / 12), (t % 12) + 1); }
function daysIn(k) { var s = splitKey(k); return new Date(Date.UTC(s.y, s.m, 0)).getUTCDate(); }
function monthLabel(k) { var s = splitKey(k); return MON[s.m - 1] + '-' + String(s.y).slice(2); }

/* หัวคอลัมน์เดือนใน Excel: Date, เลขลำดับวันที่ Excel, 'YYYY-MM(-DD)', 'Oct-26', 'Oct 2026' */
function parseMonthCell(v) {
  var d, m, y, s;
  if (v instanceof Date && !isNaN(v)) { d = new Date(v.getTime() + 12 * 3600e3); return monthKey(d.getFullYear(), d.getMonth() + 1); }
  if (typeof v === 'number') { if (v > 20000 && v < 80000) { d = new Date(Math.round((v - 25569) * 86400000)); return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1); } return null; }
  if (typeof v !== 'string') return null;
  s = v.trim();
  if ((m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?(?:[T ].*)?$/.exec(s))) return +m[2] >= 1 && +m[2] <= 12 ? monthKey(+m[1], +m[2]) : null;
  if ((m = /^([A-Za-z]{3})[a-z]*[-\/ ]+(\d{2}|\d{4})$/.exec(s))) {
    var i = MON.map(function (x) { return x.toLowerCase(); }).indexOf(m[1].toLowerCase());
    if (i < 0) return null; y = +m[2]; if (y < 100) y += 2000; return monthKey(y, i + 1);
  }
  return null;
}

/* ---------- วันหยุดบริษัท / วันทำงานพิเศษ ---------- */
function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s + 'T00:00:00Z')); }
/* ขยายช่วง (date..to) เป็นรายวัน: คืน {off:{วัน:ชื่อ}, work:{วัน:ชื่อ}} (ช่วงยาวเกิน 366 วันตัดทิ้ง) */
function expandHolidays(list) {
  var off = {}, work = {};
  (list || []).forEach(function (h) {
    if (!isDate(h.date)) return;
    var to = isDate(h.to) && h.to >= h.date ? h.to : h.date, t = Date.parse(h.date + 'T00:00:00Z'), e = Date.parse(to + 'T00:00:00Z'), n = 0;
    for (; t <= e && n < 366; t += 86400000, n++) { var d = new Date(t), k = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); (h.type === 'work' ? work : off)[k] = h.name || ''; }
  });
  return { off: off, work: work };
}
/* วันทำงานของเดือน: นับตามวันในสัปดาห์ที่ทำงาน + วันทำงานพิเศษ − วันหยุดบริษัท (วันหยุดชนะถ้าซ้อนกัน) แล้วให้ผู้ใช้กรอกทับรายเดือนได้ */
function workDays(F, key, hx) {
  hx = hx || expandHolidays(F.holidays);
  var s = splitKey(key), n = 0, dim = daysIn(key), d, k, wd;
  for (d = 1; d <= dim; d++) {
    k = key + '-' + pad(d); wd = new Date(Date.UTC(s.y, s.m - 1, d)).getUTCDay();
    if (hx.off[k] != null) continue;
    if (F.weekdays[wd] || hx.work[k] != null) n++;
  }
  var ov = num(F.dayOv && F.dayOv[key]);
  return { auto: n, n: ov != null && ov >= 0 ? ov : n, ov: ov != null && ov >= 0 };
}

/* ปฏิทิน: กดวัน = เพิ่มวันหยุด (วันทำงานปกติ) หรือวันทำงานพิเศษ (วันที่ปกติหยุด) กดซ้ำ = ยกเลิก (ถ้าอยู่ในช่วงยาว จะตัดเฉพาะวันนั้นออก) */
function dayAdd(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
function toggleDay(F, date) {
  if (!isDate(date)) return null;
  var hit = F.holidays.filter(function (h) { var x = expandHolidays([h]); return x.off[date] != null || x.work[date] != null; });
  if (hit.length) {
    hit.forEach(function (h) {
      var a = h.date, b = isDate(h.to) && h.to >= h.date ? h.to : h.date, i = F.holidays.indexOf(h), keep = [];
      if (a < date) keep.push({ id: uid('h'), date: a, to: dayAdd(date, -1) === a ? '' : dayAdd(date, -1), name: h.name, type: h.type });
      if (b > date) keep.push({ id: uid('h'), date: dayAdd(date, 1), to: dayAdd(date, 1) === b ? '' : b, name: h.name, type: h.type });
      F.holidays.splice.apply(F.holidays, [i, 1].concat(keep));
    });
    return 'removed';
  }
  var wd = new Date(Date.parse(date + 'T00:00:00Z')).getUTCDay(), work = !F.weekdays[wd];
  F.holidays.push({ id: uid('h'), date: date, to: '', name: work ? 'ทำงานพิเศษ' : 'วันหยุดบริษัท', type: work ? 'work' : 'off' });
  F.holidays.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
  return work ? 'work' : 'off';
}

/* ---------- อ่านไฟล์ Forecast ---------- */
function cellText(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
function partNo(v) { if (typeof v === 'number') return isFinite(v) ? String(Math.round(v)) : ''; var s = cellText(v); return /\d/.test(s) ? s : ''; }
/* rows = sheet_to_json(ws,{header:1}) คืน null ถ้าไม่ใช่รูปแบบ Forecast (ไม่พบหัว Part Number หรือไม่พบเดือน) */
function parseForecast(rows) {
  var hr = -1, r, c, row;
  for (r = 0; r < Math.min(rows.length, 40) && hr < 0; r++) { row = rows[r] || []; for (c = 0; c < row.length; c++) if (/^part\s*(number|no\.?)\b/i.test(cellText(row[c]))) { hr = r; break; } }
  if (hr < 0) return null;
  var H = rows[hr], pn = -1, nm = -1, md = -1, im = -1;
  for (c = 0; c < H.length; c++) {
    var t = cellText(H[c]);
    if (pn < 0 && /^part\s*(number|no\.?)\b/i.test(t)) pn = c; else if (nm < 0 && /^part\s*name/i.test(t)) nm = c; else if (md < 0 && /^model/i.test(t)) md = c; else if (im < 0 && /^item/i.test(t)) im = c;
  }
  var first = Math.max(pn, nm, md) + 1, mcols = [];
  for (c = first; c < H.length; c++) { var k = parseMonthCell(H[c]); if (k && !mcols.some(function (x) { return x.k === k; })) mcols.push({ c: c, k: k }); }
  if (!mcols.length) return null;
  var lastC = mcols.reduce(function (a, x) { return Math.max(a, x.c); }, 0), customer = '';
  for (r = hr; r <= hr + 3 && r < rows.length && !customer; r++) { row = rows[r] || []; for (c = 0; c < row.length - 1; c++) if (/^customer$/i.test(cellText(row[c]))) { for (var j = c + 1; j < row.length; j++) if (cellText(row[j])) { customer = cellText(row[j]); break; } break; } }
  var parts = [], grp = customer, skipped = 0;
  for (r = hr + 1; r < rows.length; r++) {
    row = rows[r] || [];
    var no = partNo(row[pn]);
    if (!no || /^customer$/i.test(cellText(row[pn]))) {
      /* หัวข้อกลุ่ม: ข้อความในคอลัมน์ Item ที่ไม่ใช่ตัวเลข และไม่มียอด */
      var g = cellText(row[im >= 0 ? im : 0]);
      if (g && num(row[im >= 0 ? im : 0]) == null && !mcols.some(function (x) { return num(row[x.c]) != null; })) grp = g; else if (!/^customer$/i.test(cellText(row[pn])) && row.some(function (v) { return v != null && cellText(v) !== ''; })) skipped++;
      continue;
    }
    var q = {}; mcols.forEach(function (x) { var v = num(row[x.c]); q[x.k] = v == null ? 0 : v; });
    parts.push({ id: uid('p'), grp: grp, no: no, name: cellText(row[nm]), model: cellText(row[md]), qty: q, time: '', line: '', note: cellText(row[lastC + 1]) });
  }
  if (!parts.length) return null;
  return { customer: customer, months: mcols.map(function (x) { return x.k; }).sort(), parts: parts, skipped: skipped };
}

/* นำเข้า Forecast ฉบับใหม่ทับของเดิม แต่คงเวลาต่อชิ้น/ไลน์/หมายเหตุไว้ตามเลขชิ้นงาน (เลขซ้ำจับคู่ตามลำดับที่พบ) */
function applyImport(F, P, fileName) {
  var seen = {}, old = {}, kept = 0;
  F.parts.forEach(function (p) { var s = (seen[p.no] = (seen[p.no] || 0) + 1); old[p.no + '#' + s] = p; });
  seen = {};
  P.parts.forEach(function (p) {
    var s = (seen[p.no] = (seen[p.no] || 0) + 1), o = old[p.no + '#' + s];
    if (o) { kept++; if (o.time !== '' && o.time != null) p.time = o.time; if (o.line) p.line = o.line; if (!p.note && o.note) p.note = o.note; if (!p.grp && o.grp) p.grp = o.grp; }
  });
  F.parts = P.parts; F.months = P.months; F.customer = P.customer || F.customer; F.file = fileName || F.file;
  Object.keys(F.dayOv).forEach(function (k) { if (F.months.indexOf(k) < 0) delete F.dayOv[k]; });
  return { kept: kept, added: P.parts.length - kept };
}

/* ---------- คำนวณ ---------- */
function unitDiv(F) { return F.unit === 'min' ? 60 : 3600; }
function partHrs(F, p, key) { var t = num(p.time), q = num(p.qty && p.qty[key]); return t > 0 && q > 0 ? q * t / unitDiv(F) : 0; }
function fitLevel(load, caps) { /* ดัชนีระดับ N แรกที่รับโหลดได้ (-1 = เกินทุกระดับ) */
  for (var i = 0; i < caps.length; i++) if (load <= caps[i] + 1e-9) return i;
  return -1;
}
function compute(F) {
  var hx = expandHolidays(F.holidays), days = {}, cap = {}, out = { months: F.months.slice(), days: days, cap: cap, levels: F.levels, parts: {}, lines: [], total: {}, missing: [] };
  F.months.forEach(function (k) { days[k] = workDays(F, k, hx); out.total[k] = 0; });
  F.levels.forEach(function (L) { cap[L.id] = {}; F.months.forEach(function (k) { cap[L.id][k] = (num(L.hpd) || 0) * days[k].n; }); });
  var byLine = {}, rows = F.lines.map(function (l) { var o = { id: l.id, name: l.name, hrs: {}, n: 0, total: 0 }; F.months.forEach(function (k) { o.hrs[k] = 0; }); byLine[l.id] = o; return o; });
  var un = { id: '', name: 'ยังไม่ระบุไลน์', hrs: {}, n: 0, total: 0 }; F.months.forEach(function (k) { un.hrs[k] = 0; });
  F.parts.forEach(function (p) {
    var tgt = byLine[p.line] || un, h = {}, tot = 0, hasQ = false;
    F.months.forEach(function (k) { var v = partHrs(F, p, k); h[k] = v; tot += v; out.total[k] += v; tgt.hrs[k] += v; if (num(p.qty && p.qty[k]) > 0) hasQ = true; });
    out.parts[p.id] = { hrs: h, total: tot };
    tgt.n++; tgt.total += tot;
    if (hasQ && !(num(p.time) > 0)) out.missing.push(p.id);
  });
  out.lines = rows.concat(un.n ? [un] : []);
  out.fit = function (load, key) { return fitLevel(load, F.levels.map(function (L) { return cap[L.id][key]; })); };
  return out;
}

/* ข้อมูลจำลองสำหรับดูภาพรวม: 3 ไลน์ 12 ชิ้นงาน 6 เดือนนับจาก startKey (สุ่มแบบกำหนดค่าตั้งต้น ได้ผลเหมือนเดิมทุกครั้ง)
   แทนที่ชิ้นงาน/เดือน/ไลน์เดิม คงระดับ N และวันทำงานในสัปดาห์ไว้ ใส่วันหยุดตัวอย่างเฉพาะเมื่อยังไม่มีวันหยุด */
function demo(F, startKey) {
  var s = 20261028, r = function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  var ms = [], i, j;
  for (i = 0; i < 6; i++) ms.push(addMonth(startKey, i));
  var L = [{ id: uid('l'), name: 'Line A (Muffler)' }, { id: uid('l'), name: 'Line B (Step ASM)' }, { id: uid('l'), name: 'Line C (Bracket)' }];
  var spec = [[0, 'MUFFLER ASM', 'RT85', 2400, 38], [0, 'PIPE ASM;EXHAUST', 'RT85', 1800, 45], [0, 'PIPE ASM EXH FRT', 'RJ01', 2900, 32], [0, 'SILENCER ASM', 'VD00', 900, 55],
    [1, "STEP ASM ASS'Y LH (CREW)", 'RG21', 2600, 78], [1, "STEP ASM ASS'Y RH (CREW)", 'RG21', 2600, 78], [1, "STEP ASM ASS'Y LH (EXT)", 'RG21', 1500, 70], [1, "STEP ASM ASS'Y RH (EXT)", 'RG21', 1500, 70],
    [2, 'BRACKET;HARNESS', 'ES30', 5200, 14], [2, 'BRACKET;C/CASE B', 'ES30', 3100, 18], [2, 'PROTECTOR;HEAT', 'RG01', 4300, 16], [2, 'BRACKET AIR DUCT', 'RT93', 2800, 22]];
  F.months = ms; F.dayOv = {}; F.customer = 'DEMO'; F.file = 'ข้อมูลจำลอง (Demo)'; F.lines = L;
  F.parts = spec.map(function (x, n) {
    var q = {}; ms.forEach(function (k) { q[k] = Math.round(x[3] * (0.7 + r() * 0.6) / 10) * 10; });
    return { id: uid('p'), grp: L[x[0]].name.replace(/ \(.*/, ''), no: String(9000000000 + 1000 * (n + 1) + Math.floor(r() * 900)), name: x[1], model: x[2], qty: q, time: x[4], line: L[x[0]].id, note: '' };
  });
  if (!F.holidays.length && ms.length > 3) F.holidays = [{ id: uid('h'), date: ms[1] + '-13', to: '', name: 'วันหยุดบริษัท (ตัวอย่าง)', type: 'off' }, { id: uid('h'), date: ms[3] + '-02', to: ms[3] + '-04', name: 'หยุดต่อเนื่อง (ตัวอย่าง)', type: 'off' }];
  return F;
}

/* ตรวจ/ซ่อมข้อมูลที่โหลดจาก localStorage หรือไฟล์สำรอง */
function norm(o) {
  var F = blank(); if (!o || typeof o !== 'object') return F;
  F.file = cellText(o.file); F.customer = cellText(o.customer); F.unit = o.unit === 'min' ? 'min' : 'sec';
  F.months = Array.isArray(o.months) ? o.months.filter(function (k) { return /^\d{4}-\d{2}$/.test(k); }).sort() : [];
  if (Array.isArray(o.levels) && o.levels.length) F.levels = o.levels.map(function (L, i) { return { id: cellText(L.id) || 'n' + (i + 1), name: cellText(L.name) || 'N' + (i + 1), hpd: num(L.hpd) || 0 }; });
  if (Array.isArray(o.weekdays) && o.weekdays.length === 7) F.weekdays = o.weekdays.map(function (x) { return x ? 1 : 0; });
  F.holidays = (Array.isArray(o.holidays) ? o.holidays : []).map(function (h) { return { id: cellText(h.id) || uid('h'), date: cellText(h.date), to: cellText(h.to), name: cellText(h.name), type: h.type === 'work' ? 'work' : 'off' }; });
  F.lines = (Array.isArray(o.lines) ? o.lines : []).map(function (l) { return { id: cellText(l.id) || uid('l'), name: cellText(l.name) }; });
  var lid = {}; F.lines.forEach(function (l) { lid[l.id] = 1; });
  F.parts = (Array.isArray(o.parts) ? o.parts : []).map(function (p) {
    var q = {}; F.months.forEach(function (k) { q[k] = num(p.qty && p.qty[k]) || 0; });
    var t = num(p.time);
    return { id: cellText(p.id) || uid('p'), grp: cellText(p.grp), no: cellText(p.no), name: cellText(p.name), model: cellText(p.model), qty: q, time: t > 0 ? t : '', line: lid[p.line] ? p.line : '', note: cellText(p.note) };
  });
  if (o.dayOv && typeof o.dayOv === 'object') Object.keys(o.dayOv).forEach(function (k) { var v = num(o.dayOv[k]); if (F.months.indexOf(k) >= 0 && v != null && v >= 0) F.dayOv[k] = v; });
  return F;
}

/* ---------- Takt จาก Forecast: ยอด/วัน = ยอดเดือน ÷ วันทำงาน, เวลาทำงาน/วัน = ชม./วันของระดับ N ---------- */
function normPn(v) { return String(v == null ? '' : v).replace(/[^0-9A-Za-z]/g, '').toUpperCase(); } /* '898140 5832' = '8981405832' */
function findParts(F, pn) { var k = normPn(pn); return k ? F.parts.filter(function (p) { return normPn(p.no) === k; }) : []; }
/* คืน null ถ้าไม่พบชิ้นงาน/เดือน/ระดับ N; ถ้าพบแต่ไม่มียอดหรือวันทำงาน perDay/takt จะเป็น null (ให้หน้าจอบอกสาเหตุ) */
function taktFor(F, pn, key, levelId) {
  var ps = findParts(F, pn), L = null;
  F.levels.forEach(function (x) { if (x.id === levelId) L = x; });
  if (!ps.length || !L || F.months.indexOf(key) < 0) return null;
  var qty = num(ps[0].qty && ps[0].qty[key]) || 0, days = workDays(F, key).n, hpd = num(L.hpd) || 0;
  var r = { part: ps[0], dup: ps.length, key: key, level: L, qty: qty, days: days, hpd: hpd, minutes: hpd * 60, perDay: null, takt: null };
  if (qty > 0 && days > 0) r.perDay = qty / days;
  if (r.perDay && hpd > 0) r.takt = hpd * 3600 / r.perDay;
  return r;
}

var api = { DEF_LEVELS: DEF_LEVELS, uid: uid, blank: blank, norm: norm, monthKey: monthKey, addMonth: addMonth, daysIn: daysIn, monthLabel: monthLabel, parseMonthCell: parseMonthCell,
  expandHolidays: expandHolidays, workDays: workDays, toggleDay: toggleDay, parseForecast: parseForecast, applyImport: applyImport, demo: demo, compute: compute, fitLevel: fitLevel, partHrs: partHrs, normPn: normPn, findParts: findParts, taktFor: taktFor };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else Object.assign(root, { lbFcLib: api });
})(typeof window !== 'undefined' ? window : globalThis);
