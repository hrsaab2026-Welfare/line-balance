/* หน้าจอ Yamazumi Chart + ข้อเสนอแนะ (ใช้ฟังก์ชันจาก yamazumi.js และตัวช่วยของหน้าหลัก) */
(function () {
  var K = 'lbYz', OV = {}, COL = { va: 'var(--accent)', nva: 'var(--warn)', waste: 'var(--bad)' }, SH = { va: 'VA', nva: 'NVA', waste: 'Waste' };
  try { OV = JSON.parse(localStorage.getItem(K) || '{}') || {}; } catch (e) {}
  function keep() { try { localStorage.setItem(K, JSON.stringify(OV)); } catch (e) {} }

  function chart(m, rows) {
    var W = 760, left = 46, right = 20, top = 32, bot = 46, H = 300, ph = H - top - bot, pw = W - left - right;
    var cap = m.takt ? m.takt * m.pcs : 0, ymax = Math.max(cap, m.cycle, m.maxLoad) * 1.12 || 10;
    function Y(v) { return top + ph - (v / ymax) * ph; }
    var step = ymax > 150 ? 50 : ymax > 60 ? 20 : 10, g = '', tv;
    for (tv = 0; tv <= ymax; tv += step) g += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + Y(tv) + '" y2="' + Y(tv) + '" stroke="var(--line)"/><text class="num mut" x="' + (left - 6) + '" y="' + (Y(tv) + 4) + '" text-anchor="end" style="font-size:11px">' + tv + '</text>';
    var slot = pw / rows.length, bw = Math.min(72, slot * 0.6), bars = '';
    rows.forEach(function (r, i) {
      var x = left + slot * i + (slot - bw) / 2, acc = 0;
      ['va', 'nva', 'waste'].forEach(function (k) {
        var v = r[k]; if (!(v > 0)) return;
        var y0 = Y(acc + v), h = Y(acc) - y0, tip = esc(r.name) + ' · ' + SH[k] + ' ' + fmt(v) + ' วินาที (' + pct(r.total ? v / r.total : 0) + ' ของโหลด)';
        bars += '<rect data-tip="' + tip + '" x="' + x + '" y="' + y0 + '" width="' + bw + '" height="' + Math.max(1, h) + '" fill="' + COL[k] + '" stroke="var(--surface)" stroke-width="1"/>';
        if (h >= 17) bars += '<text class="num strong" x="' + (x + bw / 2) + '" y="' + (y0 + h / 2 + 4) + '" text-anchor="middle" style="font-size:11px;fill:#fff">' + fmt(v) + '</text>';
        acc += v;
      });
      bars += '<text class="num strong" x="' + (x + bw / 2) + '" y="' + (Y(r.total) - 6) + '" text-anchor="middle" style="font-size:12px">' + fmt(r.total) + '</text>';
      bars += '<text class="strong" x="' + (x + bw / 2) + '" y="' + (H - bot + 18) + '" text-anchor="middle" style="font-size:12px">' + esc(r.name) + '</text>';
    });
    var ref = cap ? '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + Y(cap) + '" y2="' + Y(cap) + '" stroke="var(--fg)" stroke-width="2"/><text class="num strong" x="' + (W - right) + '" y="' + (Y(cap) - 6) + '" text-anchor="end" style="font-size:11.5px">Takt×' + m.pcs + ' ' + fmt(cap) + '</text>' : '';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Yamazumi Chart แสดงเวลา VA NVA และ Waste ของแต่ละคนและเครื่อง">' + g + bars + ref + '</svg>';
  }

  function sugHtml(list, men) {
    if (men < 2) return '<p class="mut" style="margin:0">ต้องมีพนักงานอย่างน้อย 2 คน จึงจะแนะนำการย้ายงานได้</p>';
    var li = list.map(function (o) {
      if (o.type === 'move') return '<li>ย้าย <b>' + esc(o.name) + '</b> (' + o.pos + 'ของ ' + esc(o.from) + ' · ' + fmt(o.time) + ' วินาที) ไป <b>' + esc(o.to) + '</b> คอขวดจะลดจาก ' + fmt(o.oldMax) + ' เหลือ <b>' + fmt(o.newMax) + '</b> วินาที (ลด ' + fmt(o.gain) + ')' + (o.meetsTakt === true ? ' <span class="pill good">ทัน Takt</span>' : o.meetsTakt === false ? ' <span class="pill warn">ยังไม่ทัน Takt</span>' : '') + '</li>';
      if (o.type === 'nva') return '<li><b>' + esc(o.who) + '</b> ใช้ ' + fmt(o.secs) + ' วินาที (' + pct(o.share) + ') ไปกับงาน NVA/Waste ลองลดด้วย Jig จัดวางชิ้นงานใหม่ หรือย้ายไปทำคู่ขนานกับเครื่อง</li>';
      return '<li>คอขวด <b>' + esc(o.who) + '</b> ยังเกิน Takt อีก <b>' + fmt(o.over) + '</b> วินาที ย้ายงานเดี่ยวอย่างเดียวไม่พอ ต้องแตกงานให้ละเอียดขึ้น ลดเวลางาน หรือเพิ่มคน</li>';
    }).join('');
    if (!li) return '<p class="mut" style="margin:0">ไม่พบการย้ายงานเดี่ยวที่ช่วยลดคอขวดได้ (ไลน์สมดุลดีแล้ว หรือต้องแตกงานให้เล็กลงก่อน)</p>';
    return '<b>ข้อเสนอแนะ</b><ul class="yz-sug">' + li + '</ul><p class="mut" style="margin:6px 0 0;font-size:12px">เป็นข้อเสนอจากตัวเลขเท่านั้น (ย้ายเฉพาะงานแรก/งานสุดท้ายไปสถานีข้างเคียงเพื่อคงลำดับงาน) ต้องตรวจความเป็นไปได้หน้างานก่อน เช่น ทักษะ ระยะเดิน Jig</p>';
  }

  function cfg(cats) {
    $('yzMap').innerHTML = '<div class="yz-cfg">' + cats.map(function (c) {
      var cur = lbYzClass(c, OV);
      return '<label><span>' + esc(c) + '</span><select data-yz="' + esc(c) + '">' + ['va', 'nva', 'waste'].map(function (k) { return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + SH[k] + '</option>'; }).join('') + '</select></label>';
    }).join('') + '</div>' + (Object.keys(OV).length ? '<button class="btn ghost sm" id="yzReset" type="button">คืนค่าอัตโนมัติ</button>' : '');
  }

  window.renderYamazumi = function (m) {
    if (!window.S || !$('yzChart')) return;
    m = m || compute();
    var rows = lbYamazumi(S, OV), men = S.resources.filter(function (r) { return r.kind === 'man'; }), tot = { va: 0, nva: 0, waste: 0 };
    rows.forEach(function (r) { ['va', 'nva', 'waste'].forEach(function (k) { tot[k] += r[k]; }); });
    var all = tot.va + tot.nva + tot.waste;
    $('yzChart').innerHTML = chart(m, rows);
    $('yzNote').textContent = all ? 'VA ' + pct(tot.va / all) + ' · NVA ' + pct(tot.nva / all) + ' · Waste ' + pct(tot.waste / all) : '';
    $('yzSug').innerHTML = sugHtml(lbSuggest(S, m, OV), men.length);
    var cats = []; S.elements.forEach(function (e) { if (cats.indexOf(e.cat) < 0) cats.push(e.cat); });
    if (!$('yzMap').contains(document.activeElement)) cfg(cats);
  };

  $('yzMap').addEventListener('change', function (e) {
    var c = e.target.getAttribute && e.target.getAttribute('data-yz'); if (c == null) return;
    if (e.target.value === lbYzClass(c)) delete OV[c]; else OV[c] = e.target.value;
    keep(); renderYamazumi();
  });
  $('yzMap').addEventListener('click', function (e) { if (e.target.id === 'yzReset') { OV = {}; keep(); renderYamazumi(); } });
  if (window.S) renderYamazumi();
})();
