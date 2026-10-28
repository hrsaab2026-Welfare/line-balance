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

function payloadNow() {
  if (!root.S || !root.compute) return null;
  var m = root.compute(), rows = root.lbYamazumi(root.S, null);
  return lbAiPayload(root.S, m, rows, root.lbSuggest(root.S, m, null));
}
function show(html) { $('aiOut').innerHTML = html; }
function result(r, stale) {
  var a = (r.actions || []).map(function (x) {
    return '<li><b>' + E(x.title) + '</b><br>' + E(x.detail) + (x.gain ? '<br><span class="mut">ผลที่คาด: ' + E(x.gain) + '</span>' : '') + '</li>';
  }).join('');
  show((stale ? '<p class="mut" style="margin:0 0 6px">ข้อมูลเปลี่ยนไปแล้ว กดวิเคราะห์ใหม่เพื่ออัปเดต</p>' : '') +
    '<p style="margin:0 0 8px">' + E(r.summary) + '</p><ol class="yz-sug">' + a + '</ol>' +
    '<p class="mut" style="margin:8px 0 0;font-size:12px">AI เสนอจากตัวเลขสรุปเท่านั้น ต้องตรวจความเป็นไปได้หน้างานก่อนลงมือเสมอ</p>');
}
function refresh() {
  var p = payloadNow(); if (!p) return;
  var key = JSON.stringify(p), v = VT[p.verdict];
  $('aiState').innerHTML = '<span class="pill ' + v[0] + '">' + v[1] + '</span>';
  $('aiGo').disabled = busy || !p.resources.length;
  if (key === cur) return;
  cur = key;
  if (cache[key]) result(cache[key], false);
  else if (lastKey && cache[lastKey]) result(cache[lastKey], true);
}
function analyze() {
  var cloud = root.__lbCloud, db = cloud && cloud.db && cloud.db(), p = payloadNow();
  if (!p || busy) return;
  if (!db) { show('<p class="mut" style="margin:0">ต้องเข้าสู่ระบบ Cloud ก่อนจึงจะใช้ AI ได้ (ส่วนข้อเสนอจากกฎด้านบนยังใช้ได้ตามปกติ)</p>'); return; }
  var key = JSON.stringify(p);
  if (cache[key]) { result(cache[key], false); return; }
  busy = true; $('aiGo').disabled = true; $('aiGo').textContent = 'กำลังวิเคราะห์…';
  show('<p class="mut" style="margin:0">AI กำลังอ่านตัวเลข อาจใช้เวลาสักครู่</p>');
  db.functions.invoke('lb-ai', { body: { payload: p } }).then(function (r) {
    var d = r.data, ctx = r.error && r.error.context;
    var parse = ctx && typeof ctx.json === 'function' ? ctx.json().catch(function () { return null; }) : Promise.resolve(null);
    return parse.then(function (eb) {
      d = d || eb;
      if (r.error || !d || d.error || !d.summary) {
        var code = d && d.error, why = '';
        if (d && d.tried && d.tried.length) why = d.tried.map(function (t) { return t.model + ' → ' + t.status; }).join(' · ');
        else if (code === 'not_configured') why = 'ยังไม่ได้ตั้ง GEMINI_API_KEY ใน Supabase';
        else if (code === 'auth') why = 'ล็อกอินหมดอายุ ลองออกจากระบบแล้วเข้าใหม่';
        show('<p style="margin:0">' + E(code === 'rate_limited' ? 'ใช้ AI ถี่เกินไป รอสักครู่แล้วลองใหม่' : code === 'quota' ? 'โควตา AI ฟรีของวันนี้เต็มแล้ว ลองใหม่พรุ่งนี้' : 'ตอนนี้เรียก AI ไม่ได้') + ' ข้อเสนอจากกฎด้านบนยังใช้ได้ตามปกติ</p>' + (why ? '<p class="mut" style="margin:6px 0 0;font-size:12px">สาเหตุ: ' + E(why) + '</p>' : ''));
        if (root.lbLogError) root.lbLogError('lb-ai: ' + (code || (r.error && r.error.message) || 'empty') + (why ? ' ' + why : ''));
        return;
      }
      cache[key] = d; lastKey = key; cur = key; result(d, false);
    });
  }).catch(function (e) { show('<p style="margin:0">ตอนนี้เรียก AI ไม่ได้ ข้อเสนอจากกฎด้านบนยังใช้ได้ตามปกติ</p>'); if (root.lbLogError) root.lbLogError('lb-ai: ' + (e && e.message)); })
    .then(function () { busy = false; $('aiGo').textContent = 'วิเคราะห์ด้วย AI'; refresh(); });
}
$('aiGo').addEventListener('click', analyze);
var orig = root.renderYamazumi;
if (typeof orig === 'function') root.renderYamazumi = function () { var x = orig.apply(this, arguments); try { refresh(); } catch (e) {} return x; };
try { refresh(); } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
