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
    return { cat: cut(e.cat, 30), name: cut(e.name, 40), sec: r1(e.vals[worst.id] * mult[worst.id]) };
  }).sort(function (a, b) { return b.sec - a.sec; }).slice(0, 6);
  var resources = rows.map(function (r) {
    return { name: cut(r.name, 30), kind: r.kind, load: r1(r.total), va: r1(r.va), nva: r1(r.nva), waste: r1(r.waste), pctOfCap: cap ? Math.round(r.total / cap * 100) : null };
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

var api = { lbAiPayload: lbAiPayload };
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
function result(r, stale) {
  var a = (r.actions || []).map(function (x, i) {
    return '<li class="ai-item' + (i === 0 ? ' top' : '') + '"><div class="ai-ti"><b>' + E(x.title) + '</b>' + (i === 0 ? '<span class="pill acc">ทำก่อน</span>' : '') + '</div><p>' + E(x.detail) + '</p>' + (x.gain ? '<span class="ai-gain">' + IC.down + E(x.gain) + '</span>' : '') + '</li>';
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
      cache[key] = d; lastKey = key; cur = key; result(d, false);
    });
  }).catch(function (e) { note('ตอนนี้เรียก AI ไม่ได้ ข้อเสนอจากกฎด้านบนยังใช้ได้ตามปกติ', true); if (root.lbLogError) root.lbLogError('lb-ai: ' + (e && e.message)); })
    .then(function () { busy = false; $('aiGo').textContent = 'วิเคราะห์ด้วย AI'; refresh(); });
}
$('aiGo').addEventListener('click', analyze);
var orig = root.renderYamazumi;
if (typeof orig === 'function') root.renderYamazumi = function () { var x = orig.apply(this, arguments); try { refresh(); } catch (e) {} return x; };
try { refresh(); } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
