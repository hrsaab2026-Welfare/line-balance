/* หน้าจอเมนู Forecast: อัปโหลด Forecast (.xlsx) → Work Load ต่อเดือน/ต่อไลน์ เทียบกำลังผลิต N1..Nx
   ใช้ฟังก์ชันคำนวณจาก forecast.js และตัวช่วยของหน้าหลัก ข้อมูลเก็บในเครื่อง (localStorage) */
(function () {
  var Lib = window.lbFcLib, K = 'lbFc1', F, scope = 'all', sel = {}, flt = { q: '', line: '', qty: true, nt: false }, saveT = 0;
  var COL = ['#00b050', '#ff00ff', '#ff9a4d', '#ff0000', '#4f81bd', '#8064a2', '#4bacc6', '#9bbb59'], WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  try { F = Lib.norm(JSON.parse(localStorage.getItem(K) || 'null')); } catch (e) { F = Lib.blank(); }
  function keep() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(K, JSON.stringify(F)); } catch (e) {} }, 300); }

  function num(v) { if (typeof v === 'number') return isFinite(v) ? v : null; if (typeof v === 'string' && v.trim() !== '') { var n = +v.replace(/,/g, ''); return isFinite(n) ? n : null; } return null; }
  function nf(n, d) { if (n == null || !isFinite(n)) return '—'; d = d == null ? 0 : d; return Number(n.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d }); }
  function va(v) { return esc(v == null ? '' : v); }
  function opt(v, t, cur) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(t) + '</option>'; }
  function part(id) { for (var i = 0; i < F.parts.length; i++) if (F.parts[i].id === id) return F.parts[i]; return null; }
  function hasQty(p) { return F.months.some(function (k) { return num(p.qty[k]) > 0; }); }
  function lineName(id) { for (var i = 0; i < F.lines.length; i++) if (F.lines[i].id === id) return F.lines[i].name || '(ไม่มีชื่อ)'; return 'ยังไม่ระบุไลน์'; }
  function curMonth() { var d = new Date(); return Lib.monthKey(d.getFullYear(), d.getMonth() + 1); }
  function unitTxt() { return F.unit === 'min' ? 'นาที' : 'วินาที'; }
  function lvCls(i, n) { return i < 0 ? 'bad' : i === 0 ? 'good' : (i === n - 1 && n > 1) ? 'warn' : 'acc'; }
  function lvPill(c, load, k) {
    if (!(load > 0)) return '<span class="mut">—</span>';
    var i = c.fit(load, k), n = c.levels.length;
    return '<span class="pill ' + lvCls(i, n) + '">' + (i < 0 ? 'เกิน ' + esc(n ? c.levels[n - 1].name : 'N') : esc(c.levels[i].name)) + '</span>';
  }
  function ratioCls(r) { return r > 1 + 1e-9 ? 'bad' : r >= 0.95 ? 'warn' : 'good'; }

  /* ---------- 1) ระดับ N / หน่วยเวลา / วันทำงานในสัปดาห์ ---------- */
  function rCond() {
    var lv = F.levels.map(function (L) {
      return '<tr data-lv="' + va(L.id) + '"><td><input class="fc-lvn" data-f="lvn" value="' + va(L.name) + '" aria-label="ชื่อระดับ"></td><td class="r"><input class="fc-q" data-f="lvh" inputmode="decimal" value="' + va(L.hpd) + '" aria-label="ชั่วโมงทำงานต่อวัน"></td><td><button class="fc-x" type="button" data-fc="dellv" title="ลบระดับนี้" aria-label="ลบระดับ">×</button></td></tr>';
    }).join('');
    var wd = WD.map(function (n, i) { return '<label><input type="checkbox" data-f="wd" data-i="' + i + '"' + (F.weekdays[i] ? ' checked' : '') + '>' + n + '</label>'; }).join('');
    $('fcCond').innerHTML = '<div class="fc-grid"><div class="panel"><div class="fc-h">ระดับกำลังผลิต (N)</div>' +
      '<table class="fc-lv"><thead><tr><th>ชื่อระดับ</th><th class="r">ชั่วโมงทำงาน/วัน</th><th></th></tr></thead><tbody>' + lv + '</tbody></table>' +
      '<div class="fc-bar" style="margin-top:10px"><button class="btn ghost sm" type="button" data-fc="addlv">+ เพิ่มระดับ N</button></div>' +
      '<p class="note">กำลังผลิตต่อเดือน = ชั่วโมงทำงาน/วัน × วันทำงานของเดือนนั้น</p></div>' +
      '<div class="panel"><div class="field"><label for="fcUnit">หน่วยของเวลาต่อชิ้น</label><select id="fcUnit" data-f="unit">' + opt('sec', 'วินาที / ชิ้น', F.unit) + opt('min', 'นาที / ชิ้น', F.unit) + '</select></div>' +
      '<div class="fc-h" style="margin-top:16px">วันทำงานปกติในสัปดาห์</div><div class="fc-wd">' + wd + '</div>' +
      '<p class="note">ติ๊กวันที่ทำงานปกติ แล้วเพิ่มวันหยุดบริษัทหรือวันทำงานพิเศษในหัวข้อถัดไป</p></div></div>';
  }

  /* ---------- 2) วันหยุดบริษัท + วันทำงานต่อเดือน ---------- */
  function hDays(h) { var x = Lib.expandHolidays([h]); return Object.keys(x.off).length + Object.keys(x.work).length; }
  var calK = '', TM = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  function rCal() {
    var el = $('fcCal'); if (!el) return;
    if (!calK) calK = F.months.length ? F.months[0] : curMonth();
    var k = calK, hx = Lib.expandHolidays(F.holidays), y = +k.slice(0, 4), m = +k.slice(5), first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), dim = Lib.daysIn(k), cells = '', d, n = 0;
    for (d = 0; d < first; d++) cells += '<span></span>';
    for (d = 1; d <= dim; d++) {
      var ds = k + '-' + (d < 10 ? '0' : '') + d, st = hx.off[ds] != null ? 'h' : hx.work[ds] != null ? 'w' : F.weekdays[(first + d - 1) % 7] ? '' : 'x', nm = hx.off[ds] != null ? hx.off[ds] : hx.work[ds];
      if (st === 'h' || st === 'w') n++;
      cells += '<button type="button" class="fc-cd ' + st + '" data-fc="cal" data-d="' + ds + '"' + (nm ? ' title="' + va(nm) + '"' : '') + ' aria-label="' + ds + (st === 'h' ? ' วันหยุด' : st === 'w' ? ' ทำงานพิเศษ' : '') + '" aria-pressed="' + (st === 'h' || st === 'w' ? 'true' : 'false') + '">' + d + '</button>';
    }
    el.innerHTML = '<div class="panel fc-cal"><div class="fc-cal-nav"><button class="fc-nv" type="button" data-fc="calprev" aria-label="เดือนก่อนหน้า">‹</button><div class="fc-cal-t"><b>' + TM[m - 1] + ' ' + y + '</b><span class="note">' + Lib.workDays(F, k, hx).n + ' วันทำงาน' + (n ? ' · ปรับเอง ' + n + ' วัน' : '') + '</span></div><button class="fc-nv" type="button" data-fc="calnext" aria-label="เดือนถัดไป">›</button></div>' +
      '<div class="fc-cal-g">' + WD.map(function (x, i) { return '<em' + (F.weekdays[i] ? '' : ' class="off"') + '>' + x + '</em>'; }).join('') + cells + '</div>' +
      '<div class="fc-leg"><span><i class="fc-cd h"></i>วันหยุดบริษัท</span><span><i class="fc-cd w"></i>ทำงานพิเศษ</span><span><i class="fc-cd x"></i>หยุดประจำสัปดาห์</span></div>' +
      '<p class="note" style="margin:8px 0 0">กดที่วันเพื่อเพิ่ม กดซ้ำเพื่อยกเลิก</p></div>';
  }
  function rHol() {
    var rows = F.holidays.map(function (h) {
      return '<tr data-h="' + va(h.id) + '"><td><input type="date" class="fc-dt" data-f="hd" value="' + va(h.date) + '" aria-label="จากวันที่"></td><td><input type="date" class="fc-dt" data-f="ht" value="' + va(h.to) + '" aria-label="ถึงวันที่"></td>' +
        '<td><input class="fc-nm" data-f="hn" value="' + va(h.name) + '" placeholder="เช่น หยุดสงกรานต์ / ปิดซ่อมบำรุง" aria-label="ชื่อวันหยุด"></td>' +
        '<td><select data-f="hy" aria-label="ประเภท">' + opt('off', 'วันหยุด (ไม่ทำงาน)', h.type) + opt('work', 'วันทำงานพิเศษ (ทำงานในวันที่ปกติหยุด)', h.type) + '</select></td>' +
        '<td class="r num" data-hc>' + (hDays(h) || '—') + '</td><td><button class="fc-x" type="button" data-fc="delh" title="ลบ" aria-label="ลบวันหยุด">×</button></td></tr>';
    }).join('');
    $('fcHol').innerHTML = '<div class="fc-hol-top"><div id="fcCal"></div><div id="fcDays"></div></div><div class="fc-h" style="margin-top:14px">รายการวันหยุด <span class="note">แก้ชื่อ หรือกำหนดช่วงวันที่ต่อเนื่องได้ที่ตารางนี้</span></div><div class="panel scroll"><table class="fc-h-t"><thead><tr><th>จากวันที่</th><th>ถึงวันที่ (ถ้าหยุดต่อเนื่อง)</th><th>ชื่อ / เหตุผล</th><th>ประเภท</th><th class="r">วัน</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6" class="mut">ยังไม่มีวันหยุดบริษัท กดเพิ่มด้านล่าง ระบบจะหักออกจากวันทำงานของเดือนนั้น</td></tr>') + '</tbody></table></div>' +
      '<div class="fc-bar"><button class="btn ghost sm" type="button" data-fc="addh">+ เพิ่มวันหยุด</button></div>';
    rCal(); rDays();
  }
  function rDays() {
    var el = $('fcDays'); if (!el) return;
    var real = F.months.length > 0, ms = real ? F.months : [0, 1, 2, 3, 4, 5].map(function (i) { return Lib.addMonth(curMonth(), i); }), hx = Lib.expandHolidays(F.holidays), tot = 0;
    var rows = ms.map(function (k) {
      var dim = Lib.daysIn(k), y = +k.slice(0, 4), m = +k.slice(5), wk = 0, co = 0, sp = 0, d, ds, wo, w = Lib.workDays(F, k, hx);
      for (d = 1; d <= dim; d++) {
        ds = k + '-' + (d < 10 ? '0' : '') + d; wo = !F.weekdays[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
        if (hx.off[ds] != null) { if (wo) wk++; else co++; } else if (wo) { if (hx.work[ds] != null) sp++; else wk++; }
      }
      tot += w.n;
      return '<tr' + (k === calK ? ' class="cur"' : '') + '><td><button class="linkbtn" type="button" data-fc="calgo" data-k="' + k + '" title="ดูเดือนนี้ในปฏิทิน">' + Lib.monthLabel(k) + '</button></td><td class="r num">' + dim + '</td><td class="r num">' + (wk || '—') + '</td><td class="r num">' + (co || '—') + '</td><td class="r num">' + (sp || '—') + '</td><td class="r num strong">' + w.auto + '</td>' +
        '<td class="r">' + (real ? '<input class="fc-q" data-f="dov" data-k="' + k + '" inputmode="numeric" placeholder="' + w.auto + '" value="' + (w.ov ? va(w.n) : '') + '" aria-label="วันทำงานที่ใช้จริง ' + Lib.monthLabel(k) + '">' : '<span class="num">' + w.auto + '</span>') + '</td></tr>';
    }).join('');
    el.innerHTML = '<div class="panel scroll"><div class="fc-h">จำนวนวันทำงานของแต่ละเดือน</div><table class="fc-days"><thead><tr><th>เดือน</th><th class="r">วันในเดือน</th><th class="r">หยุดประจำสัปดาห์</th><th class="r">หยุดบริษัท</th><th class="r">ทำงานพิเศษ</th><th class="r">วันทำงาน (คำนวณ)</th><th class="r">ใช้คำนวณจริง</th></tr></thead><tbody>' + rows +
      '<tr class="fc-hl"><td class="lbl">รวม</td><td></td><td></td><td></td><td></td><td></td><td class="r num strong">' + tot + '</td></tr></tbody></table>' +
      '<p class="note">วันทำงาน = วันในเดือน − หยุดประจำสัปดาห์ − หยุดบริษัท (วันทำงานพิเศษนับเป็นวันทำงาน) ช่อง “ใช้คำนวณจริง” กรอกทับได้ เว้นว่าง = ใช้ค่าที่คำนวณ' + (real ? '' : ' · กรอกทับได้หลังอัปโหลด Forecast') + ' · กดชื่อเดือนเพื่อดูในปฏิทิน</p></div>';
  }

  /* ---------- 3) ไลน์ (Line group) ---------- */
  function rLines() {
    var cnt = {}, un = 0; F.parts.forEach(function (p) { if (p.line) cnt[p.line] = (cnt[p.line] || 0) + 1; else un++; });
    var rows = F.lines.map(function (l) {
      return '<tr data-ln="' + va(l.id) + '"><td><input class="fc-nm" data-f="ln" value="' + va(l.name) + '" placeholder="ชื่อไลน์" aria-label="ชื่อไลน์"></td><td class="r num">' + (cnt[l.id] || 0) + '</td><td><button class="fc-x" type="button" data-fc="delln" title="ลบไลน์" aria-label="ลบไลน์">×</button></td></tr>';
    }).join('');
    var grps = {}; F.parts.forEach(function (p) { if (p.grp && !p.line) grps[p.grp] = 1; });
    $('fcLines').innerHTML = '<div class="panel scroll"><table class="fc-ln-t"><thead><tr><th>ชื่อไลน์ (กลุ่มที่จะคำนวณแยก)</th><th class="r">ชิ้นงาน</th><th></th></tr></thead><tbody>' + rows +
      '<tr><td class="mut">ยังไม่ระบุไลน์</td><td class="r num mut">' + un + '</td><td></td></tr></tbody></table></div>' +
      '<div class="fc-bar"><button class="btn ghost sm" type="button" data-fc="addln">+ เพิ่มไลน์</button>' + (Object.keys(grps).length ? '<button class="btn ghost sm" type="button" data-fc="grp" title="สร้างไลน์ชื่อเดียวกับหัวข้อกลุ่มในไฟล์ แล้วจัดชิ้นงานที่ยังไม่มีไลน์เข้าให้">สร้างไลน์จากกลุ่มในไฟล์ (' + Object.keys(grps).length + ' กลุ่ม)</button>' : '') + '</div>';
  }

  /* ---------- 4) ผลการคำนวณ ---------- */
  function niceStep(mx) { var raw = mx / 5, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), i, c = [1, 2, 5, 10]; for (i = 0; i < c.length; i++) if (c[i] * p >= raw) return c[i] * p; return 10 * p; }
  function chart(c, hrs) {
    var W = 760, H = 330, left = 50, right = 44, top = 26, bot = 58, pw = W - left - right, ph = H - top - bot, ms = c.months, mx = 0, g = '', i;
    ms.forEach(function (k) { mx = Math.max(mx, hrs[k] || 0); c.levels.forEach(function (L) { mx = Math.max(mx, c.cap[L.id][k]); }); });
    var step = niceStep(mx * 1.08 || 10), ymax = Math.ceil((mx * 1.08 || 10) / step) * step;
    function Y(v) { return top + ph - (v / ymax) * ph; }
    for (var tv = 0; tv <= ymax + 1e-9; tv += step) g += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + Y(tv) + '" y2="' + Y(tv) + '" stroke="var(--line)"/><text class="num mut" x="' + (left - 6) + '" y="' + (Y(tv) + 4) + '" text-anchor="end" style="font-size:11px">' + nf(tv) + '</text>';
    var slot = pw / ms.length, bw = Math.min(46, slot * 0.5), bars = '', lines = '', lab = '';
    ms.forEach(function (k, j) {
      var cx = left + slot * (j + 0.5), v = hrs[k] || 0, tip = Lib.monthLabel(k) + ' · Work load ' + nf(v, 1) + ' ชม.' + c.levels.map(function (L) { var cp = c.cap[L.id][k]; return ' · ' + L.name + ' ' + nf(cp) + ' ชม. (' + (cp ? pct(v / cp) : '—') + ')'; }).join('');
      bars += '<rect data-tip="' + esc(tip) + '" x="' + (cx - bw / 2) + '" y="' + Y(v) + '" width="' + bw + '" height="' + Math.max(0, Y(0) - Y(v)) + '" fill="var(--accent)" opacity=".88" rx="2"/>';
      if (v > 0) { var tall = Y(0) - Y(v) >= 24; lab += '<text class="num strong" x="' + cx + '" y="' + (tall ? Y(0) - 8 : Y(v) - 5) + '" text-anchor="middle" style="font-size:11px;' + (tall ? 'fill:#fff' : '') + '">' + nf(v) + '</text>'; }
      g += '<text class="strong" x="' + cx + '" y="' + (H - bot + 18) + '" text-anchor="middle" style="font-size:12px">' + Lib.monthLabel(k) + '</text><text class="num mut" x="' + cx + '" y="' + (H - bot + 33) + '" text-anchor="middle" style="font-size:11px">' + c.days[k].n + ' วัน</text>';
    });
    c.levels.forEach(function (L, li) {
      var col = COL[li % COL.length], pts = ms.map(function (k, j) { return (left + slot * (j + 0.5)).toFixed(1) + ',' + Y(c.cap[L.id][k]).toFixed(1); });
      lines += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linejoin="round"/>';
      ms.forEach(function (k, j) { lines += '<circle data-tip="' + esc(Lib.monthLabel(k) + ' · ' + L.name + ' ' + nf(c.cap[L.id][k], 1) + ' ชม. (' + nf(L.hpd, 1) + ' ชม./วัน × ' + c.days[k].n + ' วัน)') + '" cx="' + (left + slot * (j + 0.5)) + '" cy="' + Y(c.cap[L.id][k]) + '" r="3.5" fill="' + col + '"/>'; });
      lines += '<text class="strong" x="' + (left + slot * (ms.length - 0.5) + 9) + '" y="' + (Y(c.cap[L.id][ms[ms.length - 1]]) + 4) + '" style="font-size:12px;fill:' + col + '">' + esc(L.name) + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="กราฟ Work Load ต่อเดือน เทียบกำลังผลิตแต่ละระดับ N">' + g + bars + lab + lines + '</svg>';
  }
  function rRes() {
    var c = Lib.compute(F), el = $('fcRes');
    if (!F.months.length || !F.parts.length) { el.innerHTML = '<div class="fc-empty">ยังไม่มีข้อมูล Forecast<br><small>อัปโหลดไฟล์ Forecast (.xlsx) ด้านบน หรือเพิ่มชิ้นงานเองในหัวข้อ “รายการชิ้นงาน”</small></div>'; return c; }
    if (scope !== 'all' && scope !== '__none' && !F.lines.some(function (l) { return l.id === scope; })) scope = 'all';
    var cur = scope === 'all' ? { name: 'ทุกไลน์รวมกัน', hrs: c.total } : scope === '__none' ? c.lines.filter(function (l) { return l.id === ''; })[0] || { name: 'ยังไม่ระบุไลน์', hrs: c.total } : c.lines.filter(function (l) { return l.id === scope; })[0];
    var sopt = opt('all', 'ทุกไลน์รวมกัน', scope) + F.lines.map(function (l) { return opt(l.id, l.name || '(ไม่มีชื่อ)', scope); }).join('') + (c.lines.some(function (l) { return l.id === ''; }) ? opt('__none', 'ยังไม่ระบุไลน์', scope) : '');
    var legend = '<div class="legend"><span><i style="background:var(--accent)"></i>Work load (ชม./เดือน)</span>' + c.levels.map(function (L, i) { return '<span><span class="ln" style="border-top:3px solid ' + COL[i % COL.length] + '"></span>' + esc(L.name) + ' · ' + nf(L.hpd, 1) + ' ชม./วัน</span>'; }).join('') + '</div>';
    var h = cur.hrs, th = '<th></th>' + c.months.map(function (k) { return '<th class="r">' + Lib.monthLabel(k) + '</th>'; }).join('');
    var body = '<tr class="fc-hl"><td class="lbl">Work load (ชม.)</td>' + c.months.map(function (k) { return '<td class="r num strong">' + nf(h[k], 1) + '</td>'; }).join('') + '</tr>' +
      '<tr><td>วันทำงาน</td>' + c.months.map(function (k) { return '<td class="r num">' + c.days[k].n + (c.days[k].ov ? '<sup title="กรอกทับเอง">*</sup>' : '') + '</td>'; }).join('') + '</tr>';
    c.levels.forEach(function (L, i) { body += '<tr><td><i class="fc-sw" style="background:' + COL[i % COL.length] + '"></i>' + esc(L.name) + ' กำลังผลิต (ชม.)</td>' + c.months.map(function (k) { return '<td class="r num">' + nf(c.cap[L.id][k]) + '</td>'; }).join('') + '</tr>'; });
    c.levels.forEach(function (L, i) { body += '<tr><td><i class="fc-sw" style="background:' + COL[i % COL.length] + '"></i>โหลด ÷ ' + esc(L.name) + '</td>' + c.months.map(function (k) { var cp = c.cap[L.id][k], r = cp ? h[k] / cp : (h[k] > 0 ? Infinity : 0); return '<td class="r">' + (h[k] > 0 ? '<span class="pill ' + ratioCls(r) + '">' + (isFinite(r) ? pct(r) : '—') + '</span>' : '<span class="mut">—</span>') + '</td>'; }).join('') + '</tr>'; });
    body += '<tr class="fc-hl"><td class="lbl">รองรับได้ที่ระดับ</td>' + c.months.map(function (k) { return '<td class="r">' + lvPill(c, h[k], k) + '</td>'; }).join('') + '</tr>';
    var bl = '<table class="fc-sum"><thead><tr><th>ไลน์ (ชม./เดือน)</th>' + c.months.map(function (k) { return '<th class="r">' + Lib.monthLabel(k) + '</th>'; }).join('') + '<th class="r">รวม</th></tr></thead><tbody>' +
      c.lines.map(function (l) { return '<tr><td>' + esc(l.name || '(ไม่มีชื่อ)') + ' <span class="mut">· ' + l.n + ' ชิ้น</span></td>' + c.months.map(function (k) { return '<td class="r">' + (l.hrs[k] > 0 ? '<span class="num">' + nf(l.hrs[k], 1) + '</span> ' + lvPill(c, l.hrs[k], k) : '<span class="mut">—</span>') + '</td>'; }).join('') + '<td class="r num strong">' + nf(l.total, 1) + '</td></tr>'; }).join('') +
      '<tr class="fc-hl"><td class="lbl">รวมทุกไลน์</td>' + c.months.map(function (k) { return '<td class="r num strong">' + nf(c.total[k], 1) + '</td>'; }).join('') + '<td class="r num strong">' + nf(c.months.reduce(function (a, k) { return a + c.total[k]; }, 0), 1) + '</td></tr></tbody></table>';
    el.innerHTML = '<div class="fc-bar"><div class="field"><label for="fcScope">ดูผลของ</label><select id="fcScope" data-f="scope">' + sopt + '</select></div><span class="note">Work load = ยอดผลิต × เวลาต่อชิ้น ÷ ' + (F.unit === 'min' ? '60' : '3600') + ' (ชั่วโมง)</span></div>' +
      '<div class="panel">' + legend + chart(c, h) + '</div><div class="panel scroll">' + '<table class="fc-sum"><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="fc-h" style="margin-top:6px">แยกตามไลน์ <span class="note">ป้ายระดับ = ระดับ N ที่ต้องใช้เพื่อรับโหลดของไลน์นั้นทั้งไลน์</span></div><div class="panel scroll">' + bl + '</div>';
    return c;
  }
  function rWarn(c) {
    c = c || Lib.compute(F); var el = $('fcWarn'), n = c.missing.length;
    el.hidden = !n;
    if (n) el.innerHTML = '<b aria-hidden="true">i</b><span><strong>' + n + ' ชิ้นงาน</strong> มียอดผลิตแต่ยังไม่กรอกเวลาต่อชิ้น จึงยังไม่ถูกนับเข้า Work load <button class="linkbtn" type="button" data-fc="shownt">ดูเฉพาะรายการนั้น</button></span>';
  }
  function rFile() { $('fcFileNote').textContent = F.file ? F.file + (F.customer ? ' · ลูกค้า ' + F.customer : '') + ' · ' + F.parts.length + ' ชิ้นงาน · ' + F.months.length + ' เดือน' : ''; }

  /* ---------- 5) รายการชิ้นงาน ---------- */
  function rFilter() {
    $('fcPF').innerHTML = '<div class="fc-bar"><div class="field"><label for="fcQ">ค้นหา</label><input id="fcQ" class="fc-s" type="search" value="' + va(flt.q) + '" placeholder="เลขชิ้นงาน / ชื่อ / Model / กลุ่ม"></div>' +
      '<div class="field"><label for="fcFL">ไลน์</label><select id="fcFL">' + opt('', 'ทุกไลน์', flt.line) + F.lines.map(function (l) { return opt(l.id, l.name || '(ไม่มีชื่อ)', flt.line); }).join('') + opt('__none', 'ยังไม่ระบุไลน์', flt.line) + '</select></div>' +
      '<label class="fc-ck"><input type="checkbox" id="fcQty"' + (flt.qty ? ' checked' : '') + '>เฉพาะชิ้นงานที่มียอด</label><label class="fc-ck"><input type="checkbox" id="fcNT"' + (flt.nt ? ' checked' : '') + '>เฉพาะที่ยังไม่กรอกเวลา</label>' +
      '<span class="note" id="fcCnt"></span></div>' +
      '<div class="fc-bar fc-bulk"><b>ตั้งค่าให้ที่เลือก</b><span id="fcSelN" class="note">0 รายการ</span>' +
      '<div class="field"><label for="fcBL">ไลน์</label><select id="fcBL">' + opt('__keep', '— ไม่เปลี่ยน —', '__keep') + opt('', 'ยังไม่ระบุไลน์', '__keep') + F.lines.map(function (l) { return opt(l.id, l.name || '(ไม่มีชื่อ)', '__keep'); }).join('') + '</select></div>' +
      '<div class="field"><label for="fcBT">เวลา/ชิ้น (' + unitTxt() + ')</label><input id="fcBT" class="fc-q" inputmode="decimal" placeholder="ไม่เปลี่ยน"></div>' +
      '<button class="btn ghost sm" type="button" data-fc="bulk">ตั้งค่า</button>' +
      '<span class="fc-sp"></span><button class="btn ghost sm" type="button" data-fc="addm">+ เพิ่มเดือน</button><button class="btn sm" type="button" data-fc="addp">+ เพิ่มชิ้นงาน</button></div>';
  }
  function visible(p) {
    if (flt.line === '__none' ? p.line : (flt.line && p.line !== flt.line)) return false;
    if (flt.qty && !hasQty(p)) return false;
    if (flt.nt && !(hasQty(p) && !(num(p.time) > 0))) return false;
    if (flt.q) { var s = (p.no + ' ' + p.name + ' ' + p.model + ' ' + p.grp).toLowerCase(); if (s.indexOf(flt.q.toLowerCase()) < 0) return false; }
    return true;
  }
  function selCount() { return F.parts.filter(function (p) { return sel[p.id]; }).length; }
  function rParts() {
    var c = Lib.compute(F), vis = F.parts.filter(visible), lo = F.lines.map(function (l) { return [l.id, l.name || '(ไม่มีชื่อ)']; });
    var head = '<th><input type="checkbox" data-f="selall" aria-label="เลือกทั้งหมดที่แสดง"' + (vis.length && vis.every(function (p) { return sel[p.id]; }) ? ' checked' : '') + '></th><th>Part No.</th><th>ชื่อชิ้นงาน</th><th>Model</th><th>กลุ่ม</th>' +
      F.months.map(function (k) { return '<th class="r">' + Lib.monthLabel(k) + ' <button class="fc-x" type="button" data-fc="delm" data-k="' + k + '" title="ลบเดือนนี้" aria-label="ลบเดือน ' + Lib.monthLabel(k) + '">×</button></th>'; }).join('') +
      '<th class="r">เวลา/ชิ้น (' + unitTxt() + ')</th><th>ไลน์</th><th class="r">Work load รวม (ชม.)</th><th></th>';
    var rows = vis.map(function (p) {
      return '<tr data-id="' + va(p.id) + '"><td><input type="checkbox" data-f="sel"' + (sel[p.id] ? ' checked' : '') + ' aria-label="เลือก"></td>' +
        '<td><input class="fc-no" data-f="no" value="' + va(p.no) + '" aria-label="Part No."></td><td><input class="fc-nm" data-f="name" value="' + va(p.name) + '" aria-label="ชื่อชิ้นงาน"></td>' +
        '<td><input class="fc-md" data-f="model" value="' + va(p.model) + '" aria-label="Model"></td><td><input class="fc-gp" data-f="grp" value="' + va(p.grp) + '" aria-label="กลุ่ม"></td>' +
        F.months.map(function (k) { return '<td class="r"><input class="fc-q" data-f="q" data-k="' + k + '" inputmode="numeric" value="' + va(p.qty[k] || 0) + '" aria-label="ยอด ' + Lib.monthLabel(k) + '"></td>'; }).join('') +
        '<td class="r"><input class="tm" data-f="time" inputmode="decimal" placeholder="กรอก" value="' + va(p.time) + '" aria-label="เวลาต่อชิ้น"></td>' +
        '<td><select data-f="line" aria-label="ไลน์">' + opt('', '— ไม่ระบุ —', p.line) + lo.map(function (x) { return opt(x[0], x[1], p.line); }).join('') + '</select></td>' +
        '<td class="r num" data-ph>' + nf(c.parts[p.id] ? c.parts[p.id].total : 0, 1) + '</td><td><button class="fc-x" type="button" data-fc="delp" title="ลบชิ้นงานนี้" aria-label="ลบชิ้นงาน">×</button></td></tr>';
    }).join('');
    $('fcPT').innerHTML = '<div class="panel scroll fc-tall"><table class="fc-pt"><thead><tr>' + head + '</tr></thead><tbody>' + (rows || '<tr><td colspan="' + (F.months.length + 9) + '" class="mut">' + (F.parts.length ? 'ไม่พบชิ้นงานตามตัวกรองที่เลือก' : 'ยังไม่มีชิ้นงาน อัปโหลด Forecast หรือกด “+ เพิ่มชิ้นงาน”') + '</td></tr>') + '</tbody></table></div>';
    cnt();
  }
  function cnt() { var a = $('fcCnt'), b = $('fcSelN'); if (a) a.textContent = 'แสดง ' + F.parts.filter(visible).length + ' จาก ' + F.parts.length + ' ชิ้นงาน'; if (b) b.textContent = selCount() + ' รายการ'; }

  function renderAll() { calK = ''; rFile(); rCond(); rHol(); rLines(); var c = rRes(); rWarn(c); rFilter(); rParts(); }
  function afterEdit(tr) { var c = rRes(); rWarn(c); if (tr) { var cell = tr.querySelector('[data-ph]'), p = c.parts[tr.getAttribute('data-id')]; if (cell && p) cell.textContent = nf(p.total, 1); } keep(); }
  function ensureMonth() { if (!F.months.length) { F.months.push(curMonth()); F.parts.forEach(function (p) { p.qty[F.months[0]] = 0; }); } }

  /* ---------- นำเข้า / ส่งออก Excel ---------- */
  function importFile(file) {
    if (!file) return;
    if (!/\.xls[xm]?$/i.test(file.name || '')) { msg('ไฟล์ต้องเป็น Excel (.xlsx)', true); return; }
    msg('กำลังอ่านไฟล์ Forecast…');
    lbLoad(['xlsx']).then(function () {
      if (!lbLoaded(['xlsx'])) { msg('โหลดตัวช่วย Excel ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', true); return; }
      return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = no; r.readAsArrayBuffer(file); }).then(function (buf) {
        var wb = XLSX.read(buf, { type: 'array', cellDates: true }), P = null, i;
        for (i = 0; i < wb.SheetNames.length && !P; i++) P = Lib.parseForecast(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, raw: true, defval: null }));
        if (!P) { msg('ไม่พบตาราง Forecast ในไฟล์นี้ ต้องมีหัวคอลัมน์ Part Number และหัวเดือน (เช่น Oct-26)', true); return; }
        var go = function () {
          var r = Lib.applyImport(F, P, file.name); sel = {}; flt = { q: '', line: '', qty: true, nt: false }; renderAll(); keep();
          msg('นำเข้า ' + P.parts.length + ' ชิ้นงาน ' + P.months.length + ' เดือนแล้ว' + (r.kept ? ' · คงเวลา/ไลน์เดิมไว้ ' + r.kept + ' รายการ' : '') + (P.skipped ? ' · ข้าม ' + P.skipped + ' แถวที่ไม่มีเลขชิ้นงาน' : ''));
        };
        if (!F.parts.length) { go(); return; }
        lbConfirm({ tone: 'warn', title: 'นำเข้า Forecast ฉบับใหม่?', msg: 'รายการชิ้นงานและยอดผลิตจะถูกแทนที่ด้วยไฟล์ “' + file.name + '”', hint: 'เวลาต่อชิ้นและไลน์ที่ตั้งไว้จะคงไว้ให้ตามเลข Part Number', ok: 'นำเข้า', cancel: 'ยกเลิก' }).then(function (y) { if (y) go(); else msg(''); });
      });
    }).catch(function (e) { msg('อ่านไฟล์ไม่สำเร็จ: ' + ((e && e.message) || e), true); });
  }
  function exportXlsx() {
    if (!F.parts.length) { msg('ยังไม่มีข้อมูลให้ส่งออก', true); return; }
    lbLoad(['xlsx']).then(function () {
      if (!lbLoaded(['xlsx'])) { msg('โหลดตัวช่วย Excel ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', true); return; }
      var c = Lib.compute(F), ms = c.months, lab = ms.map(Lib.monthLabel), r3 = function (v) { return Math.round(v * 1000) / 1000; }, lvName = function (i) { return i < 0 ? 'เกิน ' + (c.levels.length ? c.levels[c.levels.length - 1].name : '') : c.levels[i].name; };
      var sum = [['Forecast Work Load', F.file || ''], [], ['', ].concat(lab), ['วันทำงาน'].concat(ms.map(function (k) { return c.days[k].n; })), ['Work load (ชม.)'].concat(ms.map(function (k) { return r3(c.total[k]); }))];
      c.levels.forEach(function (L) { sum.push([L.name + ' กำลังผลิต (ชม.) @' + L.hpd + ' ชม./วัน'].concat(ms.map(function (k) { return r3(c.cap[L.id][k]); }))); });
      c.levels.forEach(function (L) { sum.push(['โหลด ÷ ' + L.name].concat(ms.map(function (k) { var cp = c.cap[L.id][k]; return cp ? r3(c.total[k] / cp) : ''; }))); });
      sum.push(['รองรับได้ที่ระดับ'].concat(ms.map(function (k) { return c.total[k] > 0 ? lvName(c.fit(c.total[k], k)) : ''; })));
      var byl = [['ไลน์', 'จำนวนชิ้นงาน'].concat(lab).concat(['รวม (ชม.)'])];
      c.lines.forEach(function (l) { byl.push([l.name, l.n].concat(ms.map(function (k) { return r3(l.hrs[k]); })).concat([r3(l.total)])); byl.push(['  ระดับ N ที่ต้องใช้', ''].concat(ms.map(function (k) { return l.hrs[k] > 0 ? lvName(c.fit(l.hrs[k], k)) : ''; }))); });
      var pr = [['Part No.', 'ชื่อชิ้นงาน', 'Model', 'กลุ่ม', 'ไลน์', 'เวลา/ชิ้น (' + unitTxt() + ')'].concat(lab.map(function (x) { return 'ยอด ' + x; })).concat(lab.map(function (x) { return 'ชม. ' + x; })).concat(['ชม. รวม', 'หมายเหตุ'])];
      F.parts.forEach(function (p) { pr.push([p.no, p.name, p.model, p.grp, p.line ? lineName(p.line) : '', p.time === '' ? '' : p.time].concat(ms.map(function (k) { return num(p.qty[k]) || 0; })).concat(ms.map(function (k) { return r3(c.parts[p.id].hrs[k]); })).concat([r3(c.parts[p.id].total), p.note])); });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Work Load'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(byl), 'By Line'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pr), 'Parts');
      XLSX.writeFile(wb, 'Forecast_WorkLoad_' + new Date().toISOString().slice(0, 10) + '.xlsx'); msg('ส่งออก Excel แล้ว');
    });
  }

  /* ---------- เหตุการณ์ ---------- */
  var root = $('tab-fc');
  function fld(e) { var t = e.target; return t && t.getAttribute ? t.getAttribute('data-f') : null; }
  function lvOf(t) { var tr = t.closest('tr'), id = tr && tr.getAttribute('data-lv'); return F.levels.filter(function (L) { return L.id === id; })[0]; }
  function hOf(t) { var tr = t.closest('tr'), id = tr && tr.getAttribute('data-h'); return F.holidays.filter(function (h) { return h.id === id; })[0]; }

  root.addEventListener('input', function (e) {
    var f = fld(e), t = e.target, tr = t.closest && t.closest('tr'), p, L, h, v;
    if (!f) return;
    if (f === 'q' || f === 'time' || f === 'no' || f === 'name' || f === 'model' || f === 'grp') {
      p = part(tr.getAttribute('data-id')); if (!p) return;
      if (f === 'q') { p.qty[t.getAttribute('data-k')] = num(t.value) || 0; afterEdit(tr); }
      else if (f === 'time') { v = num(t.value); p.time = v > 0 ? v : ''; afterEdit(tr); }
      else { p[f] = t.value; keep(); }
    } else if (f === 'lvn') { L = lvOf(t); if (L) { L.name = t.value; rRes(); keep(); } }
    else if (f === 'lvh') { L = lvOf(t); if (L) { L.hpd = num(t.value) || 0; afterEdit(); } }
    else if (f === 'hd' || f === 'ht' || f === 'hn') {
      h = hOf(t); if (!h) return; h[f === 'hd' ? 'date' : f === 'ht' ? 'to' : 'name'] = t.value;
      if (f !== 'hn') { var c = tr.querySelector('[data-hc]'); if (c) c.textContent = hDays(h) || '—'; rCal(); rDays(); afterEdit(); } else keep();
    } else if (f === 'dov') { v = num(t.value); if (v != null && v >= 0) F.dayOv[t.getAttribute('data-k')] = v; else delete F.dayOv[t.getAttribute('data-k')]; afterEdit(); }
    else if (f === 'ln') { var l = F.lines.filter(function (x) { return x.id === tr.getAttribute('data-ln'); })[0]; if (l) { l.name = t.value; keep(); } }
  });
  root.addEventListener('change', function (e) {
    var f = fld(e), t = e.target, tr = t.closest && t.closest('tr'), p, h, ids;
    if (f === 'unit') { F.unit = t.value === 'min' ? 'min' : 'sec'; renderAll(); keep(); return; }
    if (f === 'wd') { F.weekdays[+t.getAttribute('data-i')] = t.checked ? 1 : 0; rCal(); rDays(); afterEdit(); return; }
    if (f === 'hy') { h = hOf(t); if (h) { h.type = t.value === 'work' ? 'work' : 'off'; tr.querySelector('[data-hc]').textContent = hDays(h) || '—'; rCal(); rDays(); afterEdit(); } return; }
    if (f === 'ln') { rFilter(); rParts(); rRes(); keep(); return; }
    if (f === 'line') { p = part(tr.getAttribute('data-id')); if (p) { p.line = t.value; afterEdit(tr); rLines(); } return; }
    if (f === 'scope') { scope = t.value; rRes(); return; }
    if (f === 'sel') { p = part(tr.getAttribute('data-id')); if (p) { sel[p.id] = t.checked; cnt(); } return; }
    if (f === 'selall') { F.parts.filter(visible).forEach(function (q) { sel[q.id] = t.checked; }); rParts(); return; }
    if (t.id === 'fcFL') { flt.line = t.value; rParts(); } else if (t.id === 'fcQty') { flt.qty = t.checked; rParts(); } else if (t.id === 'fcNT') { flt.nt = t.checked; rParts(); }
  });
  $('fcPF').addEventListener('input', function (e) { if (e.target.id === 'fcQ') { flt.q = e.target.value; rParts(); } });

  root.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-fc]'); if (!b) return;
    var a = b.getAttribute('data-fc'), tr = b.closest('tr'), id = tr && (tr.getAttribute('data-id') || tr.getAttribute('data-ln') || tr.getAttribute('data-lv') || tr.getAttribute('data-h')), i, p, n;
    if (a === 'calprev' || a === 'calnext') { calK = Lib.addMonth(calK, a === 'calnext' ? 1 : -1); rCal(); rDays(); return; }
    if (a === 'calgo') { calK = b.getAttribute('data-k'); rCal(); rDays(); return; }
    if (a === 'cal') { Lib.toggleDay(F, b.getAttribute('data-d')); rHol(); afterEdit(); return; }
    if (a === 'addlv') { var last = F.levels[F.levels.length - 1]; F.levels.push({ id: Lib.uid('n'), name: 'N' + (F.levels.length + 1), hpd: last ? last.hpd : 8 }); rCond(); afterEdit(); }
    else if (a === 'dellv') { if (F.levels.length <= 1) { msg('ต้องมีระดับ N อย่างน้อย 1 ระดับ', true); return; } F.levels = F.levels.filter(function (L) { return L.id !== id; }); rCond(); afterEdit(); }
    else if (a === 'addh') { var o = { id: Lib.uid('h'), date: '', to: '', name: '', type: 'off' }; F.holidays.push(o); rHol(); keep(); var el = root.querySelector('tr[data-h="' + o.id + '"] input'); if (el) el.focus(); }
    else if (a === 'delh') { F.holidays = F.holidays.filter(function (h) { return h.id !== id; }); rHol(); afterEdit(); }
    else if (a === 'addln') { var l = { id: Lib.uid('l'), name: 'Line ' + (F.lines.length + 1) }; F.lines.push(l); rLines(); rFilter(); rParts(); rRes(); keep(); var el2 = root.querySelector('tr[data-ln="' + l.id + '"] input'); if (el2) { el2.focus(); el2.select(); } }
    else if (a === 'delln') {
      n = F.parts.filter(function (q) { return q.line === id; }).length;
      var del = function () { F.parts.forEach(function (q) { if (q.line === id) q.line = ''; }); F.lines = F.lines.filter(function (x) { return x.id !== id; }); if (flt.line === id) flt.line = ''; renderAll(); keep(); };
      if (!n) del(); else lbConfirm({ tone: 'warn', title: 'ลบไลน์ “' + lineName(id) + '”?', msg: 'ชิ้นงาน ' + n + ' รายการในไลน์นี้จะกลับไปเป็น “ยังไม่ระบุไลน์”', ok: 'ลบไลน์', cancel: 'ยกเลิก' }).then(function (y) { if (y) del(); });
    }
    else if (a === 'grp') {
      var made = 0, put = 0; F.parts.forEach(function (q) { if (q.line || !q.grp) return; var ln = F.lines.filter(function (x) { return x.name === q.grp; })[0]; if (!ln) { ln = { id: Lib.uid('l'), name: q.grp }; F.lines.push(ln); made++; } q.line = ln.id; put++; });
      renderAll(); keep(); msg('สร้างไลน์ใหม่ ' + made + ' ไลน์ และจัดชิ้นงาน ' + put + ' รายการเข้าไลน์แล้ว (แก้ไขชื่อหรือย้ายชิ้นงานได้ภายหลัง)');
    }
    else if (a === 'addp') {
      ensureMonth(); var q = {}; F.months.forEach(function (k) { q[k] = 0; });
      p = { id: Lib.uid('p'), grp: '', no: '', name: '', model: '', qty: q, time: '', line: (flt.line && flt.line !== '__none') ? flt.line : '', note: '' };
      F.parts.push(p); flt.qty = false; flt.nt = false; flt.q = ''; renderAll(); keep();
      var el3 = root.querySelector('tr[data-id="' + p.id + '"] input[data-f="no"]'); if (el3) { if (el3.scrollIntoView) el3.scrollIntoView({ block: 'center' }); el3.focus(); }
    }
    else if (a === 'delp') { F.parts = F.parts.filter(function (x) { return x.id !== id; }); delete sel[id]; rParts(); rLines(); afterEdit(); }
    else if (a === 'addm') {
      ensureMonth(); var nk = Lib.addMonth(F.months[F.months.length - 1], 1); F.months.push(nk); F.parts.forEach(function (x) { x.qty[nk] = 0; }); renderAll(); keep();
    }
    else if (a === 'delm') {
      var k = b.getAttribute('data-k');
      lbConfirm({ tone: 'danger', title: 'ลบเดือน ' + Lib.monthLabel(k) + '?', msg: 'ยอดผลิตของเดือนนี้ของทุกชิ้นงานจะถูกลบ', ok: 'ลบเดือน', cancel: 'ยกเลิก' }).then(function (y) { if (!y) return; F.months = F.months.filter(function (m) { return m !== k; }); F.parts.forEach(function (x) { delete x.qty[k]; }); delete F.dayOv[k]; renderAll(); keep(); });
    }
    else if (a === 'bulk') {
      var ids = F.parts.filter(function (x) { return sel[x.id]; }), ln = $('fcBL').value, tv = num($('fcBT').value);
      if (!ids.length) { msg('ติ๊กเลือกชิ้นงานในตารางก่อน', true); return; }
      if (ln === '__keep' && !(tv > 0)) { msg('เลือกไลน์ หรือกรอกเวลาต่อชิ้นที่จะตั้งให้', true); return; }
      ids.forEach(function (x) { if (ln !== '__keep') x.line = ln; if (tv > 0) x.time = tv; });
      renderAll(); keep(); msg('ตั้งค่าให้ ' + ids.length + ' ชิ้นงานแล้ว');
    }
    else if (a === 'shownt') { flt.nt = true; flt.qty = true; flt.q = ''; flt.line = ''; rFilter(); rParts(); var tb = $('fcPT'); if (tb.scrollIntoView) tb.scrollIntoView({ block: 'start' }); }
  });

  $('fcFile').addEventListener('change', function () { importFile(this.files[0]); this.value = ''; });
  $('fcDemo').addEventListener('click', function () {
    var go = function () { Lib.demo(F, curMonth()); sel = {}; flt = { q: '', line: '', qty: true, nt: false }; scope = 'all'; renderAll(); keep(); msg('สร้างข้อมูลจำลองแล้ว (3 ไลน์ 12 ชิ้นงาน 6 เดือน) ลองแก้เวลา ยอด หรือวันหยุดดูผลได้เลย'); };
    if (!F.parts.length) go(); else lbConfirm({ tone: 'warn', title: 'สร้างข้อมูลจำลองทับข้อมูลเดิม?', msg: 'ชิ้นงาน ยอดผลิต เวลาต่อชิ้น และไลน์ปัจจุบันจะถูกแทนที่ด้วยข้อมูลตัวอย่าง', hint: 'ถ้าต้องการเก็บข้อมูลเดิม ให้กดส่งออก Excel ก่อน', ok: 'สร้างข้อมูลจำลอง', cancel: 'ยกเลิก' }).then(function (y) { if (y) go(); });
  });
  $('fcExport').addEventListener('click', exportXlsx);
  $('fcClear').addEventListener('click', function () {
    if (!F.parts.length && !F.months.length) return;
    lbConfirm({ tone: 'danger', title: 'ล้างข้อมูล Forecast?', msg: 'รายการชิ้นงาน ยอดผลิต และเวลาต่อชิ้นทั้งหมดจะถูกลบ', hint: 'ระดับ N วันหยุด และรายชื่อไลน์ที่ตั้งไว้ยังอยู่', ok: 'ล้างข้อมูล', cancel: 'ยกเลิก' }).then(function (y) {
      if (!y) return; F.parts = []; F.months = []; F.dayOv = {}; F.file = ''; F.customer = ''; sel = {}; renderAll(); keep();
    });
  });
  /* ลากไฟล์มาวางตอนอยู่หน้า Forecast → นำเข้า Forecast (ไม่ส่งไปตัวอ่านไฟล์ Line Balance) */
  var _hf = window.handleFile;
  window.handleFile = function (f) { if (!root.hidden) importFile(f); else _hf(f); };

  /* เปิดเมนู */
  PG.fc = ['Forecast และ Work Load', 'อัปโหลด Forecast รายเดือน กรอกเวลาต่อชิ้น แล้วดู Work load เทียบกำลังผลิต N1–N4 ทั้งรวมและรายไลน์'];
  TAB_PANELS.fc = ['tab-fc'];
  $('tabbtn-fc').addEventListener('click', function () { renderAll(); showTab('fc'); });
  renderAll();
  window.lbFc = { load: function (o) { F = Lib.norm(o); sel = {}; renderAll(); keep(); }, state: function () { return F; }, importRows: function (rows, name) { var P = Lib.parseForecast(rows); if (!P) return null; Lib.applyImport(F, P, name || 'test.xlsx'); renderAll(); keep(); return P; } };
})();
