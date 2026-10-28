/* Yamazumi (กราฟแท่งซ้อน VA / NVA / Waste) และข้อเสนอแนะย้ายงานลดคอขวด (ฟังก์ชันล้วน ทดสอบด้วย Node ได้) */
(function (root) {
'use strict';
var WASTE_RE = /^(walk|wait|idle|search|rework|defect|scrap)|^(เดิน|รอ|หา|แก้งาน|ซ่อม)(?![\u0E00-\u0E7F])/i;
var NVA_RE = /^(set|move|take|pick|load|unload|check|inspect|mark|handl|transport|supply|store|clean|เตรียม|หยิบ|วาง|ตรวจ|ขนย้าย|เคลื่อน|ทำความสะอาด)/i;
var TH = { va: 'งานเพิ่มคุณค่า (VA)', nva: 'งานจำเป็นแต่ไม่เพิ่มคุณค่า (NVA)', waste: 'ความสูญเปล่า (Waste)' };

/* จัดหมวดจากชื่อหมวด (cat) ก่อน ถ้าไม่เข้าเกณฑ์ใช้ผู้ใช้กำหนด (override) หรือถือเป็น VA */
function lbYzClass(cat, override) {
  var c = String(cat == null ? '' : cat).trim();
  if (override && override[c]) return override[c];
  if (WASTE_RE.test(c)) return 'waste';
  if (NVA_RE.test(c)) return 'nva';
  return 'va';
}

/* ต่อทรัพยากร: เวลา VA/NVA/Waste (รวมตัวคูณ mult แล้ว ผลรวม = โหลดของ compute เสมอ) */
function lbYamazumi(S, override) {
  var rows = S.resources.map(function (r) { return { id: r.id, name: r.name, kind: r.kind, va: 0, nva: 0, waste: 0, total: 0, cats: {} }; });
  var by = {}; rows.forEach(function (x, i) { by[x.id] = i; });
  var mult = {}; S.resources.forEach(function (r) { mult[r.id] = r.mult == null ? 1 : r.mult; });
  S.elements.forEach(function (e) {
    var cl = lbYzClass(e.cat, override);
    Object.keys(e.vals).forEach(function (id) {
      if (!(id in by) || !(e.vals[id] > 0)) return;
      var t = e.vals[id] * mult[id], x = rows[by[id]];
      x[cl] += t; x.total += t; x.cats[e.cat] = (x.cats[e.cat] || 0) + t;
    });
  });
  return rows;
}

/* ข้อเสนอ: ย้ายงานแรก/งานสุดท้ายของคอขวด (คน) ไปสถานีข้างเคียง เพื่อคงลำดับงานไว้ */
function lbSuggest(S, m, override) {
  var out = [], men = S.resources.filter(function (r) { return r.kind === 'man'; });
  var cap = m.takt && m.takt > 0 ? m.takt * m.pcs : 0;
  if (men.length < 2) return out;
  var worst = men.reduce(function (a, r) { return m.loads[r.id] > m.loads[a.id] ? r : a; }, men[0]);
  var wi = men.indexOf(worst), oldMax = Math.max.apply(null, men.map(function (r) { return m.loads[r.id]; }));
  var mine = S.elements.filter(function (e) { var k = Object.keys(e.vals).filter(function (i) { return e.vals[i] > 0; }); return k.length === 1 && k[0] === worst.id; });
  var cands = [];
  if (mine.length > 1) {
    if (wi > 0) cands.push({ e: mine[0], to: men[wi - 1], pos: 'งานแรก' });
    if (wi < men.length - 1) cands.push({ e: mine[mine.length - 1], to: men[wi + 1], pos: 'งานสุดท้าย' });
  }
  cands.forEach(function (c) {
    var raw = c.e.vals[worst.id], wm = worst.mult == null ? 1 : worst.mult, nw = m.loads[worst.id] - raw * wm, nt = m.loads[c.to.id] + raw * (c.to.mult == null ? 1 : c.to.mult);
    var newMax = Math.max.apply(null, men.map(function (r) { return r === worst ? nw : r === c.to ? nt : m.loads[r.id]; }));
    if (newMax < oldMax - 1e-9) out.push({ type: 'move', name: c.e.name, cat: c.e.cat, pos: c.pos, time: raw * wm, raw: raw, from: worst.name, to: c.to.name, oldMax: oldMax, newMax: newMax, gain: oldMax - newMax, meetsTakt: cap ? newMax <= cap + 1e-9 : null });
  });
  out.sort(function (a, b) { return b.gain - a.gain; });
  var y = lbYamazumi(S, override).filter(function (x) { return x.id === worst.id; })[0];
  if (y && y.total > 0 && (y.nva + y.waste) / y.total >= 0.3) out.push({ type: 'nva', who: worst.name, share: (y.nva + y.waste) / y.total, secs: y.nva + y.waste });
  if (cap && oldMax > cap + 1e-9 && !out.some(function (o) { return o.type === 'move' && o.meetsTakt; })) out.push({ type: 'gap', who: worst.name, over: oldMax - cap });
  return out;
}

var api = { lbYzClass: lbYzClass, lbYamazumi: lbYamazumi, lbSuggest: lbSuggest, LB_YZ_TH: TH };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
