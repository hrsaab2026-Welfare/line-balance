/* ทดสอบหน้าเว็บจริงด้วย jsdom: โหลด index.html กดตัวอย่าง แล้วเช็กว่าไม่มี error และกราฟขึ้น
   (จับ bug แบบเรียก status() ไม่ได้ ที่เทสต์ตรรกะบน Node มองไม่เห็น) ต้อง npm install ก่อน */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..'), BASE = 'http://localhost/';

/* ไฟล์ในโปรเจกต์อ่านจากดิสก์ ส่วน CDN / ฟอนต์ตอบ 404 ทันที (ไม่ต้องใช้เน็ต) */
const loader = requestInterceptor(request => {
  if (!request.url.startsWith(BASE)) return new Response('', { status: 404 });
  const f = path.join(ROOT, decodeURIComponent(request.url.slice(BASE.length).split('?')[0]));
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return new Response('', { status: 404 });
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/plain' } });
});
async function open() {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', e => { const m = (e.detail && e.detail.message) || e.message; if (!/^Could not load (link|script)/.test(m)) errors.push(m); }); /* CDN/ฟอนต์โหลดไม่ได้ในเทสต์ เป็นเรื่องปกติ */
  vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), { url: BASE, runScripts: 'dangerously', resources: { interceptors: [loader] }, pretendToBeVisual: true, virtualConsole: vc });
  await new Promise(r => dom.window.addEventListener('load', r));
  return { w: dom.window, d: dom.window.document, errors };
}
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

test('ui: เปิดหน้าแรกไม่มี error', async () => {
  const { d, errors } = await open();
  assert.deepEqual(errors, []);
  assert.equal(d.getElementById('welcome').hidden, false);
});

test('ui: โหลดข้อมูลตัวอย่าง แล้วทุกแท็บวาดได้ ไม่มี error', async () => {
  const { w, d, errors } = await open();
  click(w, d.getElementById('sampleBtn'));
  click(w, d.getElementById('tabbtn-balance'));
  assert.deepEqual(errors, []);
  assert.ok(d.querySelectorAll('#loadChart svg rect').length > 0, 'กราฟโหลดงานต้องมีแท่ง');
  assert.ok(d.querySelectorAll('#gantt svg rect').length > 0, 'Man-Machine Chart ต้องมีแท่ง');
  assert.ok(d.querySelectorAll('#resTable tbody tr').length > 0 && !/undefined/.test(d.getElementById('resTable').textContent));
  click(w, d.getElementById('tabbtn-compare'));
  assert.ok(d.querySelectorAll('#scChart svg rect').length > 0);
  assert.deepEqual(errors, []);
});

test('ui: ตัวอย่าง RG21 วาดกราฟและมีสถานะต่อคน', async () => {
  const { w, d, errors } = await open();
  click(w, d.getElementById('rg21Btn'));
  assert.deepEqual(errors, []);
  assert.ok(d.querySelectorAll('#loadChart svg rect[data-key]').length >= 9);
  assert.ok(d.querySelectorAll('#resTable .pill').length >= 9);
  assert.ok(d.querySelectorAll('#yzChart svg rect').length > 0);
});

test('ui: พิมพ์เวลา → ยอดรวมต่อขั้นตอนอัปเดตทันที และผลลัพธ์ขึ้นการ์ด', async () => {
  const { w, d, errors } = await open();
  click(w, d.getElementById('sampleBtn'));
  const inp = d.querySelector('#taskTable input[data-ft="time"]'), sum = d.querySelector('#taskTable .stsum');
  const before = sum.textContent;
  inp.value = '77'; inp.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.notEqual(sum.textContent, before);
  assert.match(sum.textContent, /77|รวม/);
  assert.ok(d.querySelectorAll('#flowResult .rs-card').length > 0);
  assert.deepEqual(errors, []);
});

test('ui: ชื่องานที่มี HTML ไม่ถูกตีความใน tooltip (XSS)', async () => {
  const { w, d } = await open();
  click(w, d.getElementById('sampleBtn')); click(w, d.getElementById('tabbtn-balance'));
  const bad = '<img src=x onerror="window.__x=1">';
  const r = d.querySelector('#loadChart rect[data-tip]');
  r.setAttribute('data-tip', bad);
  r.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
  const tip = d.getElementById('tip');
  assert.equal(tip.querySelector('img'), null);
  assert.equal(tip.textContent, bad);
  assert.equal(w.__x, undefined);
});

test('ui: เมนู Forecast เปิดได้โดยไม่ต้องมีงาน Line Balance และคำนวณ Work load ได้', async () => {
  const { w, d, errors } = await open();
  click(w, d.getElementById('tabbtn-fc'));
  assert.equal(d.getElementById('tab-fc').hidden, false); assert.equal(d.getElementById('welcome').hidden, true);
  const rows = [['Item', 'Part Number', null, 'Part Name', 'Model', new w.Date(2026, 9, 1), new w.Date(2026, 10, 1)],
    [1, 1111111111, null, 'A', 'M1', 3600, 7200], ['GROUP B'], [2, 2222222222, null, 'B', 'M2', 1800, 0]];
  assert.ok(w.lbFc.importRows(rows, 'x.xlsx'));
  assert.equal(d.querySelectorAll('#fcPT tbody tr').length, 2);
  const t = d.querySelector('#fcPT tr input[data-f="time"]'); t.value = '10'; t.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.ok(d.querySelectorAll('#fcRes svg rect').length > 0, 'กราฟ Work load ต้องมีแท่ง');
  assert.ok(!/undefined|NaN/.test(d.getElementById('tab-fc').textContent));
  click(w, d.querySelector('[data-fc="addh"]'));
  assert.equal(d.querySelectorAll('#fcHol tr[data-h]').length, 1);
  click(w, d.querySelector('[data-fc="addln"]'));
  assert.equal(w.lbFc.state().lines.length, 1);
  assert.deepEqual(errors, []);
});

test('ui: ดึงยอด/วัน + เวลาทำงานจาก Forecast → Takt (จับคู่ Part No.) และส่งต่อหน้า Line Balance', async () => {
  const { w, d, errors } = await open();
  click(w, d.getElementById('sampleBtn')); /* Process Flow ตัวอย่าง Part No. 7552731170 */
  click(w, d.getElementById('tabbtn-fc'));
  assert.ok(w.lbFc.importRows([['Item', 'Part Number', null, 'Part Name', 'Model', new w.Date(2026, 9, 1)], [1, '7552 731170', null, 'BRACKET', 'ES37', 2700], [2, 5555555555, null, 'OTHER', 'X', 100]], 'x.xlsx'));
  click(w, d.getElementById('tabbtn-flow'));
  assert.equal(d.getElementById('fcPick').hidden, false);
  assert.match(d.getElementById('fcpInfo').textContent, /100 ชิ้น\/วัน/); assert.match(d.getElementById('fcpInfo').textContent, /244\.8/);
  click(w, d.getElementById('fcpApply'));
  assert.equal(d.getElementById('fp-demand').value, '100'); assert.equal(d.getElementById('fp-minutes').value, '408'); assert.equal(d.getElementById('fp-takt').value, '244.8');
  assert.match(d.getElementById('flowTakt').textContent, /244\.8/);
  assert.deepEqual(errors, []);
});

test('ui: ไม่พบ Part No. ใน Forecast → ไม่แสดงตัวเลือกดึงค่า', async () => {
  const { w, d, errors } = await open();
  click(w, d.getElementById('sampleBtn')); click(w, d.getElementById('tabbtn-fc'));
  w.lbFc.importRows([['Item', 'Part Number', null, 'Part Name', 'Model', new w.Date(2026, 9, 1)], [1, 5555555555, null, 'OTHER', 'X', 100]], 'x.xlsx');
  click(w, d.getElementById('tabbtn-flow'));
  assert.equal(d.getElementById('fcPick').hidden, true); assert.deepEqual(errors, []);
});

test('ui: Standard Work Chart อ่านตัวเลขที่มีคอมมาคั่นหลักพัน (27,000 = 27000)', async () => {
  const { w, d, errors } = await open();
  click(w, d.getElementById('tabbtn-swc'));
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const swn = new w.Function(src.match(/function swn\(v\)[^\n]*/)[0] + '; return swn;')();
  assert.equal(swn('27,000'), 27000); assert.equal(swn('1,234,567'), 1234567);
  assert.equal(swn('2,5'), 2.5); assert.equal(swn('2.5'), 2.5); assert.equal(swn(''), 0); assert.equal(swn('-3'), 0);
  assert.deepEqual(errors, []);
});

test('ui: Forecast ยังพิมพ์ได้เมื่ออยู่โหมด viewer (ข้อมูล local ไม่ถูกล็อก)', async () => {
  const { w, d } = await open();
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(src, /function lockedEl\(t\)[^\n]*!t\.closest\('#tab-fc'\)/);
  click(w, d.getElementById('tabbtn-fc'));
});
