/* ตัวอ่านไฟล์ Excel / Process Flow และตัวจัดไลน์อัตโนมัติ (ไม่แตะหน้าจอ ทดสอบด้วย Node ได้) */
(function (root) {
'use strict';
/* ---- Excel parser: Process Line sheet -> model ---- */
function lbClean(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
function lbNum(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return parseFloat(v);
  return null;
}
var LB_TIME_RE = /^time\s*\(?\s*sec/i;

function lbParseSheet(aoa) {
  var s = lbClean, num = lbNum, i, j;
  var h = -1, tc = -1;
  for (i = 0; i < Math.min(aoa.length, 40) && h < 0; i++) {
    for (j = 0; j < (aoa[i] || []).length; j++) {
      if (LB_TIME_RE.test(s(aoa[i][j]))) { h = i; tc = j; break; }
    }
  }
  if (h < 0) return null;

  // resource columns (Robot, Jig, Man ...)
  var head = aoa[h] || [], sub = aoa[h + 1] || [];
  var maxC = Math.max(head.length, sub.length);
  var cols = [], lastHead = '';
  for (j = tc + 1; j < maxC; j++) {
    var hd = s(head[j]), sb = s(sub[j]);
    if (!hd && !sb) { lastHead = ''; continue; }
    if (hd) lastHead = hd;
    var base = hd || lastHead;
    var kind = /^man/i.test(base) ? 'man' : /robot/i.test(base) ? 'robot' : /jig/i.test(base) ? 'jig' : 'other';
    var name, tag = '';
    if (kind === 'man') { name = base; tag = sb; }
    else if (kind === 'robot') { name = sb ? 'Robot ' + sb : 'Robot'; }
    else if (kind === 'jig') { name = 'Jig ' + (sb || ''); name = name.trim(); }
    else { name = sb && hd !== sb ? base + ' ' + sb : base; }
    cols.push({ col: j, name: name, kind: kind, tag: tag });
  }

  if (!cols.some(function (cl) { return cl.kind !== 'other'; })) return null;

  // element rows
  var elements = [], station = '', step = '', cat = '';
  var stated = null, firstSummary = null, vals;
  for (i = h + 2; i < aoa.length; i++) {
    var r = aoa[i] || [];
    var a = s(r[0]), b = s(r[1]), c = s(r[2]), d = s(r[3]);
    if (LB_TIME_RE.test(s(r[tc]))) break;
    if (/^su\w*\s*total/i.test(a)) {
      var t0 = num(r[tc]);
      if (firstSummary == null && t0 != null) firstSummary = t0;
      var st = {}, any = false;
      cols.forEach(function (cl) { var v = num(r[cl.col]); if (v != null && v > 0) { st[cl.col] = v; any = true; } });
      if (any) { stated = st; break; }
      continue;
    }
    if (a) station = a;
    if (b) step = b;
    if (/^total$/i.test(c)) continue;
    if (c) cat = c;
    var t = num(r[tc]);
    if (!d || d === '-' || t == null) continue;
    vals = {};
    cols.forEach(function (cl) { var v = num(r[cl.col]); if (v != null && v > 0) vals[cl.col] = v; });
    elements.push({ station: station, step: step, cat: cat || 'อื่นๆ', name: d, time: t, vals: vals });
  }
  if (!elements.length) return null;

  // resources that actually have work
  var resources = cols.filter(function (cl) {
    return elements.some(function (e) { return e.vals[cl.col] > 0; });
  }).map(function (cl, k) { return { id: 'r' + k, col: cl.col, name: cl.name, kind: cl.kind, tag: cl.tag }; });
  var colToId = {};
  resources.forEach(function (rs) { colToId[rs.col] = rs.id; });
  elements.forEach(function (e) {
    var nv = {};
    Object.keys(e.vals).forEach(function (k) { if (colToId[k]) nv[colToId[k]] = e.vals[k]; });
    e.vals = nv;
  });

  // multiplier = pieces each resource handles per cycle (stated summary / sum of rows)
  resources.forEach(function (rs) {
    var comp = elements.reduce(function (acc, e) { return acc + (e.vals[rs.id] || 0); }, 0);
    var stv = stated ? stated[rs.col] : null;
    rs.mult = stv && comp > 0 ? Math.round((stv / comp) * 100) / 100 : 1;
  });

  // takt / cycle / pcs
  var takt = null, pcs = null, cycle = null;
  for (i = 0; i < aoa.length; i++) {
    var row = aoa[i] || [];
    for (j = 0; j < row.length; j++) {
      var txt = s(row[j]);
      if (!txt) continue;
      if (takt == null && /^takt\s*time/i.test(txt)) {
        for (var k = j + 1; k < row.length; k++) { var nv2 = num(row[k]); if (nv2 != null) { takt = nv2; break; } }
      }
      var m = /(\d+(?:\.\d+)?)\s*sec\s*\/\s*(\d+)\s*pcs/i.exec(txt);
      if (m && cycle == null) { cycle = parseFloat(m[1]); pcs = parseInt(m[2], 10); }
    }
  }
  if (cycle == null) {
    cycle = firstSummary;
    if (cycle == null) {
      cycle = 0;
      resources.forEach(function (rs) {
        var l = elements.reduce(function (acc, e) { return acc + (e.vals[rs.id] || 0); }, 0) * rs.mult;
        if (l > cycle) cycle = l;
      });
    }
  }
  return { elements: elements, resources: resources, takt: takt, pcs: pcs || 1, cycle: cycle };
}

function lbParseWorkbook(wb, XLSX) {
  for (var n = 0; n < wb.SheetNames.length; n++) {
    var ws = wb.Sheets[wb.SheetNames[n]];
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    var res = lbParseSheet(aoa);
    if (res) { res.sheet = wb.SheetNames[n]; return res; }
  }
  return null;
}
/* ---- Excel parser: Man-Machine scenario sheet (Scenario / Process / Time) ---- */
function lbParseScenarios(aoa) {
  var s = lbClean, num = lbNum, i, j, h = -1, cs = -1, cp = -1, ct = -1;
  for (i = 0; i < Math.min(aoa.length, 40) && h < 0; i++) {
    var row = aoa[i] || [], a1 = -1, p1 = -1, t1 = -1;
    for (j = 0; j < row.length; j++) {
      var x = s(row[j]);
      if (/^scenario$/i.test(x)) a1 = j;
      else if (/^process$/i.test(x)) p1 = j;
      else if (/^time/i.test(x) && t1 < 0) t1 = j;
    }
    if (a1 >= 0 && p1 >= 0 && t1 >= 0) { h = i; cs = a1; cp = p1; ct = t1; }
  }
  if (h < 0) return null;
  var map = {}, order = [], cur = '';
  for (i = h + 1; i < aoa.length; i++) {
    var r = aoa[i] || [];
    var a = s(r[cs]), p = s(r[cp]), t = num(r[ct]);
    if (/^total/i.test(p)) continue;
    if (a) cur = a;
    if (!p || t == null || !cur) continue;
    if (!map[cur]) { map[cur] = []; order.push(cur); }
    map[cur].push({ name: p, time: t });
  }
  if (order.length < 2) return null;
  return { scenarios: order.map(function (n) { return { name: n, steps: map[n] }; }) };
}
function lbParseScenarioWorkbook(wb, XLSX) {
  for (var n = 0; n < wb.SheetNames.length; n++) {
    var ws = wb.Sheets[wb.SheetNames[n]];
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    var res = lbParseScenarios(aoa);
    if (res) { res.sheet = wb.SheetNames[n]; return res; }
  }
  return null;
}
/* ---- Process Flow parser (two-column NPC flow sheet) ---- */
function lbTitle(t) { return String(t).toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace(/\bFg\b/, 'FG'); }
function lbUniq(a) { var seen = {}, out = []; a.forEach(function (x) { var k = x.toUpperCase(); if (!seen[k]) { seen[k] = 1; out.push(x); } }); return out; }

function lbClassify(p) {
  var n = p.name.toUpperCase();
  if (/HANDLING|TRANSPORT|SUPPLY|DELIVER|MOVE/.test(n)) return 'move';
  if (/WAREHOUSE|STORAGE|STORE/.test(n)) return 'storage';
  if (/INSPECT|AUDIT|CHECK/.test(n)) return 'inspection';
  return 'operation';
}

function lbParseProcessFlow(aoa) {
  var s = lbClean, num = lbNum, i, j, r = -1, starts = [];
  for (i = 0; i < Math.min(aoa.length, 30) && r < 0; i++) {
    var row = aoa[i] || [], st = [], hasName = false;
    for (j = 0; j < row.length; j++) {
      var x = s(row[j]);
      if (/^proc\.?$/i.test(x)) st.push(j);
      if (/process\s*name|ชื่อกระบวนการ/i.test(x)) hasName = true;
    }
    if (st.length && hasName) { r = i; starts = st; }
  }
  if (r < 0) return null;
  var maxC = 0;
  aoa.forEach(function (rw) { if (rw && rw.length > maxC) maxC = rw.length; });
  function findIn(rows, re, a, b) {
    for (var q = 0; q < rows.length; q++) {
      var rw = aoa[rows[q]] || [];
      for (var c = a; c < Math.min(b, rw.length); c++) if (re.test(s(rw[c]))) return c;
    }
    return -1;
  }
  var near = [r - 2, r - 1, r, r + 1, r + 2].filter(function (v) { return v >= 0 && v < aoa.length; });
  var blocks = starts.map(function (pc, k) {
    var end = k + 1 < starts.length ? starts[k + 1] : maxC;
    return {
      pc: pc,
      nc: findIn(near, /process\s*name|ชื่อกระบวนการ/i, pc + 1, end),
      mc: findIn(near, /machine/i, pc + 1, end),
      cc: findIn(near, /characteristics/i, pc + 1, end),
      pdc: findIn([r], /^product$/i, pc + 1, end),
      rkc: findIn([r], /^rank$/i, pc + 1, end)
    };
  });
  var procs = [], cur = [];
  for (i = r + 1; i < aoa.length; i++) {
    var rw2 = aoa[i] || [], stop = false;
    for (j = 0; j < rw2.length; j++) if (/\(copy\)|symbols\s*:|core\s*team/i.test(s(rw2[j]))) { stop = true; break; }
    if (stop) break;
    blocks.forEach(function (b, k) {
      var no = num(rw2[b.pc]);
      if (no != null) { cur[k] = { no: no, lines: [], machines: [], chars: [] }; procs.push(cur[k]); }
      var p = cur[k];
      if (!p) return;
      if (b.nc >= 0) { var t = s(rw2[b.nc]); if (t) p.lines.push(t); }
      if (b.mc >= 0) { var m = s(rw2[b.mc]); if (m) p.machines.push(m); }
      var pcs = b.cc >= 0 ? s(rw2[b.cc]) : '', pd = b.pdc >= 0 ? s(rw2[b.pdc]) : '', rk = b.rkc >= 0 ? s(rw2[b.rkc]) : '';
      if (pcs || pd || rk) p.chars.push({ proc: pcs, prod: pd, rank: rk });
    });
  }
  if (procs.length < 2) return null;
  procs.sort(function (a, b) { return a.no - b.no; });
  procs.forEach(function (p) {
    var nm = [], notes = [];
    p.lines.forEach(function (t) { if (/=|^\d{6,}$|^\d+\s*\.\s/.test(t)) notes.push(t); else nm.push(t); });
    p.name = nm.join(' ').replace(/\s+/g, ' ').trim() || p.lines[0] || ('Process ' + p.no);
    p.notes = notes; delete p.lines;
    p.type = lbClassify(p);
    p.robot = p.machines.some(function (m) { return /robot/i.test(m); });
  });
  var fo = -1;
  procs.forEach(function (p, k) { if (fo < 0 && p.type === 'operation') fo = k; });
  if (fo >= 0) for (i = fo; i < procs.length && (procs[i].type === 'operation' || procs[i].type === 'inspection'); i++) procs[i].inline = true;

  var part = {}, labels = [['cust', /^cust\.?\s*:/i], ['model', /^model\s*:/i], ['partNo', /^part\s*no/i], ['partName', /^part\s*name/i], ['rev', /^rev\.?\s*no/i]];
  for (i = 0; i < r; i++) {
    var rr = aoa[i] || [];
    for (j = 0; j < rr.length; j++) {
      var tx = s(rr[j]);
      if (!tx) continue;
      labels.forEach(function (l) {
        if (!(l[0] in part) && l[1].test(tx)) {
          var below = aoa[i + 1] ? s(aoa[i + 1][j]) : '';
          part[l[0]] = below;
        }
      });
    }
  }
  return { part: part, processes: procs };
}
function lbParseProcessFlowWorkbook(wb, XLSX) {
  for (var n = 0; n < wb.SheetNames.length; n++) {
    var ws = wb.Sheets[wb.SheetNames[n]];
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    var res = lbParseProcessFlow(aoa);
    if (res) { res.sheet = wb.SheetNames[n]; return res; }
  }
  return null;
}

/* ---- sub-task generator, draft model, auto balancing ---- */
function lbBom(procs) {
  for (var i = 0; i < procs.length; i++) {
    var out = [];
    procs[i].notes.forEach(function (t) {
      var m = /^(\d+)\s*\.\s*(.+?)\s*\/\s*(\S+)\s*$/.exec(t);
      if (m) out.push({ n: +m[1], name: m[2].trim(), id: m[3] });
    });
    if (out.length) return out;
  }
  return [];
}

function lbGenElements(o, bom) {
  var n = o.name.toUpperCase(), ms = o.machines.join(' ').toUpperCase(), E = [];
  var allChars = o.chars.map(function (c) { return c.proc + ' ' + c.prod; }).join(' ').toUpperCase();
  var prodChars = lbUniq(o.chars.map(function (c) { return c.prod; }).filter(function (x) { return x && !/QUANTITY|STATUS/i.test(x); }));
  if (o.type === 'inspection' || /INSPECT|CHECK/.test(n)) {
    E.push({ cat: 'Set', name: /FIXTURE/.test(ms) ? 'Set part on checking fixture' : 'Set part for inspection', kind: 'man' });
    (prodChars.length ? prodChars : ['APPEARANCE']).forEach(function (c) { E.push({ cat: 'Check', name: 'Check ' + lbTitle(c), kind: 'man' }); });
    E.push({ cat: 'Move', name: 'Mark / Take Off', kind: 'man' });
  } else if (o.robot || /WELD|MAIN ASS|ASSEMBL/.test(n)) {
    if (bom && bom.length) bom.forEach(function (b) { E.push({ cat: 'Set', name: 'Set ' + lbTitle(b.name) + ' on jig', kind: 'man' }); });
    else E.push({ cat: 'Set', name: 'Set parts on jig', kind: 'man' });
    E.push({ cat: 'Weld', name: o.robot ? 'Robot welding' : 'Welding', kind: o.robot ? 'robot' : 'man' });
    E.push({ cat: 'Move', name: 'Take Off (FG)', kind: 'man' });
  } else if (/CLEAN|RUST|OIL/.test(n)) {
    if (/CLEAN/.test(n)) E.push({ cat: "Ass'y", name: /SPATTER/.test(allChars) ? 'Clean part (remove spatter)' : 'Clean part', kind: 'man' });
    if (/OIL|RUST/.test(n) || /OIL/.test(ms)) E.push({ cat: "Ass'y", name: 'Apply preventive oil', kind: 'man' });
    E.push({ cat: 'Move', name: 'Take Off', kind: 'man' });
  } else if (/PACK/.test(n)) {
    var box = o.machines.filter(function (m) { return /BOX|PALLET|BAG|CASE/i.test(m); })[0];
    E.push({ cat: "Ass'y", name: 'Pack into ' + (box ? lbTitle(box) : 'box'), kind: 'man' });
    if (/IDENT|INDENT|TAG|LABEL/.test(allChars)) E.push({ cat: "Ass'y", name: 'Identify (tag / label)', kind: 'man' });
    E.push({ cat: 'Move', name: 'Move to rack', kind: 'man' });
  } else if (o.type === 'move') {
    E.push({ cat: 'Move', name: lbTitle(o.name), kind: 'man' });
  } else if (o.type === 'storage') {
    E.push({ cat: 'Move', name: 'Store / pick part', kind: 'man' });
  } else {
    E.push({ cat: 'Set', name: 'Set part', kind: 'man' });
    E.push({ cat: "Ass'y", name: lbTitle(o.name), kind: o.robot ? 'robot' : 'man' });
    E.push({ cat: 'Move', name: 'Take Off', kind: 'man' });
  }
  return E;
}

function lbAddGenerated(D, o) {
  lbGenElements(o, D.bom).forEach(function (g) {
    D.elements.push({ id: D.nextId++, proc: o.no, cat: g.cat, name: g.name, kind: g.kind, time: null });
  });
}

function lbInitDraft(pf) {
  var D = { part: pf.part, bom: lbBom(pf.processes), procs: [], elements: [], nextId: 1, takt: null, demand: '', minutes: '', menFix: '', sheet: pf.sheet || '' };
  pf.processes.forEach(function (p) {
    var o = { no: p.no, name: p.name, notes: p.notes, machines: p.machines, chars: p.chars, type: p.type, robot: p.robot, include: !!p.inline };
    D.procs.push(o);
    if (o.include) lbAddGenerated(D, o);
  });
  return D;
}

/* Draft -> line-balance model. Man elements are cut into consecutive groups (one man each).
   Robot elements run in parallel with the men (positioner / jig swap), so they load the Robot only. */
function lbAutoModel(D) {
  var warn = [], i;
  var order = D.procs.filter(function (p) { return p.include; });
  var els = [];
  order.forEach(function (p, pi) {
    var k = 0;
    D.elements.forEach(function (e) {
      if (e.proc !== p.no) return;
      k++;
      if (e.time > 0) els.push({ e: e, step: p.no + ' ' + p.name, label: (pi + 1) + '.' + k + ' ' + e.name });
    });
  });
  if (!els.length) return { empty: true, warn: warn };
  var takt = +D.takt > 0 ? +D.takt : 0;
  var men = els.filter(function (x) { return x.e.kind !== 'robot'; });
  var rob = els.filter(function (x) { return x.e.kind === 'robot'; });
  var groups = [];
  if (men.length) {
    var times = men.map(function (x) { return x.e.time; });
    var total = times.reduce(function (a, b) { return a + b; }, 0), mx = Math.max.apply(null, times);
    var part = function (M) {
      var g = [[]], sum = 0;
      men.forEach(function (x) {
        if (sum + x.e.time > M + 1e-9 && sum > 0) { g.push([]); sum = 0; }
        g[g.length - 1].push(x); sum += x.e.time;
      });
      return g;
    };
    var fix = Math.floor(+D.menFix) > 0 ? Math.floor(+D.menFix) : 0;
    var n = fix || (takt ? part(takt).length : 1);
    var lo = mx, hi = total;
    for (i = 0; i < 60; i++) { var mid = (lo + hi) / 2; if (part(mid).length <= n) hi = mid; else lo = mid; }
    groups = part(hi);
    if (fix && groups.length < fix) warn.push('งานแบ่งให้คนได้ละเอียดสุด ' + groups.length + ' คน จึงใช้ ' + groups.length + ' คนแทน ' + fix + ' คน');
  }
  var resources = [], idOf = new Map();
  groups.forEach(function (g, k) {
    var id = 'm' + (k + 1);
    resources.push({ id: id, name: 'Man ' + (k + 1), kind: 'man', tag: '', mult: 1 });
    g.forEach(function (x) { idOf.set(x, id); });
  });
  var robotLoad = rob.reduce(function (a, x) { return a + x.e.time; }, 0);
  if (rob.length) resources.push({ id: 'rb', name: 'Robot', kind: 'robot', tag: '', mult: 1 });
  var stationOf = new Map();
  groups.forEach(function (g, k) { g.forEach(function (x) { stationOf.set(x, 'Station ' + (k + 1)); }); });
  var elements = els.map(function (x) {
    var vals = {}, isRob = x.e.kind === 'robot';
    vals[isRob ? 'rb' : idOf.get(x)] = x.e.time;
    return { station: isRob ? 'Robot' : stationOf.get(x), step: x.step, cat: x.e.cat, name: x.label, time: x.e.time, vals: vals };
  });
  var cycle = 0, loads = {};
  elements.forEach(function (e) { Object.keys(e.vals).forEach(function (k) { loads[k] = (loads[k] || 0) + e.vals[k]; }); });
  Object.keys(loads).forEach(function (k) { if (loads[k] > cycle) cycle = loads[k]; });
  if (takt) {
    els.forEach(function (x) { if (x.e.kind !== 'robot' && x.e.time > takt) warn.push('"' + x.label + '" ใช้ ' + x.e.time + ' วินาที เกิน Takt ' + takt + ' วินาที ต้องแตกงานให้ละเอียดขึ้นหรือให้สองคนทำคู่กัน'); });
    if (robotLoad > takt) warn.push('งานของ Robot รวม ' + robotLoad + ' วินาที เกิน Takt ' + takt + ' วินาที ต้องใช้หุ่นยนต์หรือ Jig อย่างน้อย ' + Math.ceil(robotLoad / takt) + ' ชุดทำงานคู่ขนาน');
  }
  return { empty: false, warn: warn, model: { elements: elements, resources: resources, takt: takt || null, pcs: 1, cycle: cycle, auto: true } };
}
var api = { lbClean: lbClean, lbNum: lbNum, LB_TIME_RE: LB_TIME_RE, lbParseSheet: lbParseSheet, lbParseWorkbook: lbParseWorkbook, lbParseScenarios: lbParseScenarios, lbParseScenarioWorkbook: lbParseScenarioWorkbook, lbTitle: lbTitle, lbUniq: lbUniq, lbClassify: lbClassify, lbParseProcessFlow: lbParseProcessFlow, lbParseProcessFlowWorkbook: lbParseProcessFlowWorkbook, lbBom: lbBom, lbGenElements: lbGenElements, lbAddGenerated: lbAddGenerated, lbInitDraft: lbInitDraft, lbAutoModel: lbAutoModel };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
