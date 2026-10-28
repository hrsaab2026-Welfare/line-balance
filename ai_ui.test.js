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


test('ui: การ์ด AI แสดงสถานะ และกดโดยไม่ล็อกอินได้ข้อความแจ้ง ไม่มี error', async () => {
  const { w, d, errors } = await open();
  click(w, d.getElementById('sampleBtn')); click(w, d.getElementById('tabbtn-balance'));
  assert.ok(d.querySelector('#aiState .pill'), 'ต้องมีป้ายสถานะ');
  assert.equal(d.getElementById('aiGo').disabled, false);
  click(w, d.getElementById('aiGo'));
  assert.match(d.getElementById('aiOut').textContent, /เข้าสู่ระบบ/);
  assert.ok(!/undefined|NaN/.test(d.getElementById('aiBox').textContent));
  assert.deepEqual(errors, []);
});

test('ui: ข้อเสนอที่มี effect วาดกราฟก่อน-หลัง ส่วน effect ที่แต่งชื่อเองไม่วาดกราฟ ไม่มี error', async () => {
  const { w, d, errors } = await open();
  click(w, d.getElementById('sampleBtn')); click(w, d.getElementById('tabbtn-balance'));
  const pay = w.eval('(function(){var m=compute();return lbAiPayload(S,m,lbYamazumi(S,null),lbSuggest(S,m,null));})()');
  const bn = pay.bottleneck[0], t = pay.topTasks[0], other = pay.resources.find(r => r.name !== bn);
  const reply = { summary: 'ทดสอบ', model: 'm', actions: [
    { title: 'A', detail: 'x', gain: 'AI บอกว่า 1', effect: { kind: 'move', task: t.name, to: other.name } },
    { title: 'B', detail: 'y', gain: 'AI ประมาณเอง', effect: { kind: 'move', task: 'งานที่ไม่มีจริง', to: other.name } }] };
  w.__lbCloud = { db: () => ({ functions: { invoke: () => Promise.resolve({ data: reply, error: null }) } }) };
  click(w, d.getElementById('aiGo'));
  await new Promise(r => setTimeout(r, 50));
  const items = d.querySelectorAll('#aiOut .ai-item');
  assert.equal(items.length, 2);
  assert.ok(items[0].querySelector('.ai-fig svg rect'), 'ข้อ A ต้องมีกราฟ');
  assert.match(items[0].querySelector('.ai-gain').textContent, /คอขวด/);
  assert.equal(items[1].querySelector('.ai-fig'), null);
  assert.match(items[1].querySelector('.ai-gain').textContent, /AI ประมาณเอง/);
  assert.ok(!/undefined|NaN/.test(d.getElementById('aiOut').textContent));
  assert.deepEqual(errors, []);
});
