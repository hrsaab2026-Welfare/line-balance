/* วิเคราะห์ Line Balance ด้วย AI: ส่งเฉพาะตัวเลขสรุป (ไม่ส่ง Part No. ลูกค้า) ผ่าน Supabase Edge Function "lb-ai"
   ส่วนสร้าง payload เป็นฟังก์ชันล้วน ทดสอบด้วย Node ได้ ส่วนหน้าจอทำงานเฉพาะเมื่อมีการ์ด #aiBox */
(function (root) {
'use strict';
var r1 = function (n) { return Math.round((+n || 0) * 10) / 10; };
var cut = function (s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); };

function lbAiPayload(S, m, rows, sug) {
  var cap = m.takt > 0 ? m.takt * m.pcs : 0, mult = {}, i;
  S.resources.forEach(function (r) { mult[r.id] = r.mult == null ? 1 : r.mult; });
  var verdict = !cap ? 'no_takt' : m.maxLoad > cap + 1e-9 ? 'over' : m.maxLoad >= cap * 0.95 ? 'near' : 'ok';
  var worst = m.bottle && m.bottle[0];
  var top = !worst ? [] : S.elements.filter(function (e) { return e.vals[worst.id] > 0; }).map(function (e) {
    return { cat: cut(e.cat, 30), name: cut(e.name, 40), sec: r1(e.vals[worst.id] * mult[worst.id]), raw: r1(e.vals[worst.id]) };
  }).sort(function (a, b) { return b.sec - a.sec; }).slice(0, 6);
  var resources = rows.map(function (r) {
    return { name: cut(r.name, 30), kind: r.kind, mult: mult[r.id] == null ? 1 : mult[r.id], load: r1(r.total), va: r1(r.va), nva: r1(r.nva), waste: r1(r.waste), pctOfCap: cap ? Math.round(r.total / cap * 100) : null };
  });
  var moves = (sug || []).filter(function (o) { return o.type === 'move'; }).slice(0, 3).map(function (o) {
    return { task: cut(o.name, 40), from: cut(o.from, 30), to: cut(o.to, 30), newMax: r1(o.newMax), meetsTakt: o.meetsTakt };
  });
  return {
    verdict: verdict, takt: r1(m.takt), pieces: m.pcs, cycle: r1(m.cycle), cap: r1(cap), maxLoad: r1(m.maxLoad),
    men: m.men, minMen: cap && m.manSum ? Math.ceil(m.manSum / cap - 1e-9) : null,
    balanceEff: m.balEff == null ? null : Math.round(m.balEff * 100),
    bottleneck: (m.bottle || []).map(function (r) { return cut(r.name, 30); }),
    resources: resources, topTasks: top, ruleMoves: moves
  };
}

/* จำลองผลของข้อเสนอจากข้อมูลจริง: ef = {kind:'move', task, to} | {kind:'cut', who, secs} ถ้าชื่อไม่ตรงกับข้อมูลคืน null (ไม่เชื่อ AI) */
function lbAiEffect(p, ef) {
  if (!p || !ef || typeof ef !== 'object') return null;
  var cap = p.cap, by = {}, after = {}, changed = {}, note = '';
  p.resources.forEach(function (r) { if (!(r.name in by)) { by[r.name] = r; after[r.name] = r.load; } });
  if (ef.kind === 'move') {
    var from = p.bottleneck[0], to = by[cut(ef.to, 30)], t = null, nm = cut(ef.task, 40);
    p.topTasks.forEach(function (x) { if (!t && x.name === nm) t = x; });
    if (!t || !to || !from || !by[from] || to.name === from) return null;
    after[from] = r1(after[from] - t.sec); after[to.name] = r1(after[to.name] + t.raw * (to.mult == null ? 1 : to.mult));
    changed[from] = 1; changed[to.name] = 1; note = 'ย้าย “' + t.name + '” จาก ' + from + ' ไป ' + to.name;
  } else if (ef.kind === 'cut') {
    var w = by[cut(ef.who, 30)], s = +ef.secs;
    if (!w || !(s > 0)) return null;
    var room = Math.min(w.nva + w.waste, w.load), used = Math.min(s, room);
    if (!(used > 0)) return null;
    after[w.name] = r1(w.load - used); changed[w.name] = 1;
    note = 'ลดเวลา ' + w.name + ' ' + r1(used) + ' วินาที' + (used < s - 1e-9 ? ' (ลดได้สูงสุดเท่าที่มีงาน NVA/Waste)' : '');
  } else return null;
  var rows = p.resources.map(function (r) { return { name: r.name, kind: r.kind, before: r.load, after: after[r.name], changed: !!changed[r.name] }; });
  var mb = Math.max.apply(null, rows.map(function (r) { return r.before; })), ma = Math.max.apply(null, rows.map(function (r) { return r.after; }));
  return { rows: rows, maxBefore: mb, maxAfter: ma, cap: cap, improved: ma < mb - 1e-9, worse: ma > mb + 1e-9, meets: cap ? ma <= cap + 1e-9 : null, note: note };
}

var api = { lbAiPayload: lbAiPayload, lbAiEffect: lbAiEffect };
if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
Object.assign(root, api);

/* ---------- หน้าจอ ---------- */
if (typeof document === 'undefined' || !document.getElementById('aiBox')) return;
var $ = function (id) { return document.getElementById(id); }, E = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
var cache = {}, cur = '', busy = false, lastKey = null;
var VT = { over: ['bad', 'เกิน Takt'], near: ['warn', 'ใกล้เต็ม Takt'], ok: ['good', 'ทัน Takt'], no_takt: ['acc', 'ยังไม่ได้ใส่ Takt'] };
var COL = { over: 'var(--bad)', near: 'var(--warn)', ok: 'var(--good)', no_takt: 'var(--bar)' };
var IC = {
  warn: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18.5v.01"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/></svg>'
};

function payloadNow() {
  if (!root.S || !root.compute) return null;
  var m = root.compute(), rows = root.lbYamazumi(root.S, null);
  return lbAiPayload(root.S, m, rows, root.lbSuggest(root.S, m, null));
}
function show(html) { $('aiOut').innerHTML = html; }
function note(html, err, small) {
  show('<div class="ai-note' + (err ? ' err' : '') + '">' + (err ? IC.warn : IC.lock) + '<div>' + html + (small ? '<small>' + small + '</small>' : '') + '</div></div>');
}
function empty() {
  show('<div class="ai-empty"><p>กดปุ่ม <b>วิเคราะห์ด้วย AI</b> ให้ AI อ่านโหลดของแต่ละคนและเครื่อง แล้วเสนอวิธีปรับปรุงพร้อมผลที่คาดว่าจะได้</p><span class="ai-priv">' + IC.lock + ' ส่งเฉพาะตัวเลขสรุป ไม่ส่ง Part No. และชื่อลูกค้า</span></div>');
}
function loading() {
  show('<div class="ai-skel" role="status" aria-live="polite"><span>AI กำลังอ่านตัวเลขของไลน์ อาจใช้เวลาสักครู่</span><i style="width:92%"></i><i style="width:78%"></i><i style="width:85%"></i><i style="width:60%"></i></div>');
}
function gauge(p) {
  var cap = p.cap, mx = p.maxLoad, scale = Math.max(cap, mx) * 1.15 || 1, fmt = root.fmt, pct = root.pct;
  var w = Math.min(100, mx / scale * 100), tick = cap ? cap / scale * 100 : null;
  var line = p.verdict === 'over' ? 'เกิน Takt อยู่ <b>' + fmt(mx - cap) + '</b> วินาที (' + pct((mx - cap) / cap) + ')'
    : p.verdict === 'no_takt' ? 'ใส่ Takt Time เพื่อให้เทียบกับเป้าได้' : 'เหลือเวลา <b>' + fmt(cap - mx) + '</b> วินาที ก่อนถึง Takt';
  var extra = '';
  if (p.minMen != null) extra += '<span>ต้องใช้คนอย่างน้อย <b>' + p.minMen + '</b> คน (ตอนนี้ ' + p.men + ')</span>';
  if (p.balanceEff != null) extra += '<span>Balance efficiency <b>' + p.balanceEff + '%</b></span>';
  return '<div class="ai-gauge" style="--ai-c:' + COL[p.verdict] + '"><div class="ai-gt"><span>คอขวด <b>' + E(p.bottleneck.join(', ') || '-') + '</b></span><span class="ai-gv">' + fmt(mx) + (cap ? ' / ' + fmt(cap) : '') + ' <small>วินาที</small></span></div>' +
    '<div class="ai-track" role="img" aria-label="โหลดคอขวด ' + fmt(mx) + ' วินาที เทียบกับ Takt ' + fmt(cap) + ' วินาที"><i style="width:' + w.toFixed(1) + '%"></i>' + (tick == null ? '' : '<u style="left:' + tick.toFixed(1) + '%"><em>Takt ' + fmt(cap) + '</em></u>') + '</div>' +
    '<div class="ai-gs"><span>' + line + '</span>' + extra + '</div></div>';
}
function figure(ef) {
  var fmt = root.fmt, W = 560, left = 84, right = 56, top = 40, ys = [], y = top, gap = 4;
  ef.rows.forEach(function (r) { var two = r.changed && Math.abs(r.before - r.after) > 1e-9; r.two = two; ys.push(y); y += (two ? 40 : 26) + gap; });
  var H = y + 2, xmax = Math.max(ef.maxBefore, ef.maxAfter, ef.cap || 0) * 1.08 || 1, X = function (v) { return left + (W - left - right) * Math.max(0, v) / xmax; };
  var col = function (v) { return !ef.cap ? 'var(--accent)' : v > ef.cap + 1e-9 ? 'var(--bad)' : v >= ef.cap * 0.95 ? 'var(--warn)' : 'var(--good)'; };
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:640px" role="img" aria-label="กราฟโหลดก่อนและหลังปรับ คอขวดจาก ' + fmt(ef.maxBefore) + ' เป็น ' + fmt(ef.maxAfter) + ' วินาที">';
  s += '<rect x="' + left + '" y="5" width="16" height="9" rx="2" fill="var(--line-strong)"/><text x="' + (left + 22) + '" y="14" style="font-size:12px;fill:var(--fg2)">ก่อนปรับ</text>' +
    '<rect x="' + (left + 90) + '" y="5" width="16" height="9" rx="2" fill="' + col(ef.maxAfter) + '"/><text x="' + (left + 112) + '" y="14" style="font-size:12px;font-weight:700;fill:var(--fg)">หลังปรับ</text>';
  ef.rows.forEach(function (r, i) {
    var y0 = ys[i], lab = function (yy, t, bold) { return '<text x="' + (left - 8) + '" y="' + yy + '" text-anchor="end" style="font-size:12px;fill:var(' + (bold ? '--fg' : '--fg2') + ');font-weight:' + (bold ? 700 : 400) + '">' + t + '</text>'; };
    var val = function (v, yy, bold) { return '<text x="' + (X(v) + 6) + '" y="' + yy + '" style="font-size:11.5px;font-weight:' + (bold ? 700 : 500) + ';font-family:var(--font-data);fill:var(' + (bold ? '--fg' : '--muted') + ')">' + fmt(v) + '</text>'; };
    if (r.two) {
      s += lab(y0 + 26, E(r.name), true);
      s += '<rect x="' + left + '" y="' + (y0 + 3) + '" width="' + Math.max(1, X(r.before) - left) + '" height="10" rx="3" fill="var(--line-strong)"/>' + val(r.before, y0 + 12, false);
      s += '<rect x="' + left + '" y="' + (y0 + 16) + '" width="' + Math.max(1, X(r.after) - left) + '" height="15" rx="3" fill="' + col(r.after) + '"/>' + val(r.after, y0 + 28, true);
    } else {
      s += lab(y0 + 17, E(r.name), false);
      s += '<rect x="' + left + '" y="' + (y0 + 5) + '" width="' + Math.max(1, X(r.after) - left) + '" height="15" rx="3" fill="' + col(r.after) + '" opacity=".5"/>' + val(r.after, y0 + 17, false);
    }
  });
  if (ef.cap) s += '<line x1="' + X(ef.cap) + '" x2="' + X(ef.cap) + '" y1="' + (top - 8) + '" y2="' + (H - 2) + '" stroke="var(--fg)" stroke-width="2"/><text x="' + X(ef.cap) + '" y="' + (top - 12) + '" text-anchor="middle" style="font-size:11.5px;font-weight:600;fill:var(--fg)">Takt ' + fmt(ef.cap) + '</text>';
  return s + '</svg>';
}
function result(r, stale) {
  var a = (r.actions || []).map(function (x, i) {
    var ef = r.p ? lbAiEffect(r.p, x.effect) : null, fmt = root.fmt, chip = '', fig = '';
    if (ef) {
      chip = '<span class="ai-gain' + (ef.improved ? '' : ' flat') + '">' + IC.down + (ef.improved ? 'คอขวดลดจาก ' + fmt(ef.maxBefore) + ' เหลือ ' + fmt(ef.maxAfter) + ' วินาที' : ef.worse ? 'คอขวดแย่ลงเป็น ' + fmt(ef.maxAfter) + ' วินาที' : 'คอขวดคงเดิมที่ ' + fmt(ef.maxAfter) + ' วินาที') + (ef.meets === true ? ' · ทัน Takt' : ef.meets === false ? ' · ยังไม่ทัน Takt' : '') + '</span>';
      fig = '<details class="ai-fig"' + (i === 0 ? ' open' : '') + '><summary>ดูภาพก่อน–หลังปรับ</summary>' + figure(ef) + '<p class="ai-fcap">' + E(ef.note) + '<br>แท่งเทาคือก่อนปรับ แท่งสีคือหลังปรับ (เขียว = ทัน Takt, ส้ม = ใกล้เต็ม, แดง = เกิน) · คำนวณจากโหลดจริงของไลน์นี้ ไม่ใช่ตัวเลขที่ AI ประมาณ</p></details>';
    } else if (x.gain) chip = '<span class="ai-gain">' + IC.down + E(x.gain) + '</span>';
    return '<li class="ai-item' + (i === 0 ? ' top' : '') + '"><div class="ai-ti"><b>' + E(x.title) + '</b>' + (i === 0 ? '<span class="pill acc">ทำก่อน</span>' : '') + '</div><p>' + E(x.detail) + '</p>' + chip + fig + '</li>';
  }).join('');
  show((stale ? '<div class="ai-stale">' + IC.warn + ' ข้อมูลเปลี่ยนไปแล้ว ผลด้านล่างเป็นของข้อมูลก่อนหน้า กดวิเคราะห์ใหม่เพื่ออัปเดต</div>' : '') +
    '<p class="ai-lead">' + E(r.summary) + '</p><ul class="ai-list' + (stale ? ' old' : '') + '">' + a + '</ul>' +
    '<p class="ai-foot">AI เสนอจากตัวเลขสรุปเท่านั้น ต้องตรวจความเป็นไปได้หน้างานก่อนลงมือเสมอ' + (r.model ? ' · ' + E(r.model) : '') + '</p>');
}
function refresh() {
  var p = payloadNow(); if (!p) return;
  var key = JSON.stringify(p), v = VT[p.verdict], first = cur === '';
  $('aiState').innerHTML = '<span class="pill ' + v[0] + '">' + v[1] + '</span>';
  $('aiMeter').innerHTML = gauge(p);
  $('aiGo').disabled = busy || !p.resources.length;
  if (key === cur) return;
  cur = key;
  if (cache[key]) result(cache[key], false);
  else if (lastKey && cache[lastKey]) result(cache[lastKey], true);
  else if (first) empty();
}
function analyze() {
  var cloud = root.__lbCloud, db = cloud && cloud.db && cloud.db(), p = payloadNow();
  if (!p || busy) return;
  if (!db) { note('ต้อง<b>เข้าสู่ระบบ Cloud</b> ก่อนจึงจะใช้ AI ได้', false, 'ข้อเสนอจากกฎด้านบนยังใช้ได้ตามปกติ'); return; }
  var key = JSON.stringify(p);
  if (cache[key]) { result(cache[key], false); return; }
  busy = true; $('aiGo').disabled = true; $('aiGo').textContent = 'กำลังวิเคราะห์…';
  loading();
  db.functions.invoke('lb-ai', { body: { payload: p } }).then(function (r) {
    var d = r.data, ctx = r.error && r.error.context;
    var parse = ctx && typeof ctx.json === 'function' ? ctx.json().catch(function () { return null; }) : Promise.resolve(null);
    return parse.then(function (eb) {
      d = d || eb;
      if (r.error || !d || d.error || !d.summary) {
        var st = ctx && ctx.status, code = (d && d.error) || ((st === 504 || st === 546 || st === 502) && !d ? 'timeout' : ''), why = '';
        if (d && d.tried && d.tried.length) why = d.tried.map(function (t) { return t.model + ' → ' + t.status; }).join(' · ');
        else if (code === 'not_configured') why = 'ยังไม่ได้ตั้ง GEMINI_API_KEY ใน Supabase';
        else if (code === 'auth') why = 'ล็อกอินหมดอายุ ลองออกจากระบบแล้วเข้าใหม่';
        note(E(code === 'rate_limited' ? 'ใช้ AI ถี่เกินไป รอสักครู่แล้วลองใหม่' : code === 'quota' ? 'โควตา AI ฟรีของวันนี้เต็มแล้ว ลองใหม่พรุ่งนี้' : code === 'timeout' ? 'AI ตอบช้าเกินไป กดวิเคราะห์อีกครั้งได้เลย' : 'ตอนนี้เรียก AI ไม่ได้') + ' ข้อเสนอจากกฎด้านบนยังใช้ได้ตามปกติ', true, why ? 'สาเหตุ: ' + E(why) : '');
        if (root.lbLogError) root.lbLogError('lb-ai: ' + (code || (r.error && r.error.message) || 'empty') + (why ? ' ' + why : ''));
        return;
      }
      d.p = p; cache[key] = d; lastKey = key; cur = key; result(d, false);
    });
  }).catch(function (e) { note('ตอนนี้เรียก AI ไม่ได้ ข้อเสนอจากกฎด้านบนยังใช้ได้ตามปกติ', true); if (root.lbLogError) root.lbLogError('lb-ai: ' + (e && e.message)); })
    .then(function () { busy = false; $('aiGo').textContent = 'วิเคราะห์ด้วย AI'; refresh(); });
}
$('aiGo').addEventListener('click', analyze);
var orig = root.renderYamazumi;
if (typeof orig === 'function') root.renderYamazumi = function () { var x = orig.apply(this, arguments); try { refresh(); } catch (e) {} return x; };
try { refresh(); } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
