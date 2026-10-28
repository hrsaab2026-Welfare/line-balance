const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../js/ai.js'), C = require('../js/calc.js'), Y = require('../js/yamazumi.js');

/* Man 1 = 30+4 = 34, Man 2 = 25, Takt 25 → เกิน Takt */
const S = () => ({
  cycle: 34, pcs: 1, takt: 25,
  resources: [{ id: 'm1', name: 'Man 1', kind: 'man', mult: 1 }, { id: 'm2', name: 'Man 2', kind: 'man', mult: 2 }],
  elements: [
    { cat: 'Set', name: 'set1', time: 5, vals: { m1: 5 } }, { cat: 'Weld', name: 'weld', time: 25, vals: { m1: 25 } },
    { cat: 'Move', name: 'tail', time: 4, vals: { m1: 4 } }, { cat: "Ass'y", name: 'asy', time: 10, vals: { m2: 10 } }]
});
const build = (s) => { const m = C.lbCompute(s, true); return A.lbAiPayload(s, m, Y.lbYamazumi(s), Y.lbSuggest(s, m)); };

test('payload: สถานะ เกิน Takt และจำนวนคนขั้นต่ำ', () => {
  const p = build(S());
  assert.equal(p.verdict, 'over'); assert.equal(p.cap, 25); assert.equal(p.maxLoad, 34);
  assert.deepEqual(p.bottleneck, ['Man 1']); assert.equal(p.minMen, Math.ceil((34 + 20) / 25));
});
test('payload: งานของคอขวดเรียงมากไปน้อย และรวม mult', () => {
  const p = build(S());
  assert.deepEqual(p.topTasks.map(t => t.name), ['weld', 'set1', 'tail']);
  assert.equal(p.resources[1].load, 20); assert.equal(p.resources[1].pctOfCap, 80);
});
test('payload: ไม่มี Takt → no_takt ไม่เป็น NaN และไม่หลุดข้อมูลอื่น', () => {
  const s = S(); s.takt = 0; const p = build(s);
  assert.equal(p.verdict, 'no_takt'); assert.equal(p.minMen, null); assert.equal(p.resources[0].pctOfCap, null);
  assert.ok(!/NaN|undefined/.test(JSON.stringify(p)));
  assert.deepEqual(Object.keys(p).filter(k => /part|cust|model/i.test(k)), []);
});
test('payload: ตัดความยาวชื่องาน กันข้อความยาวผิดปกติ', () => {
  const s = S(); s.elements[1].name = 'x'.repeat(500); const p = build(s);
  assert.ok(p.topTasks.every(t => t.name.length <= 40));
});

/* ---- lbAiEffect: จำลองผลก่อน-หลังจากข้อมูลจริง ไม่เชื่อชื่อที่ AI แต่ง ---- */
test('effect move: ย้ายงานของคอขวดไปคนอื่น คำนวณโหลดใหม่รวม mult ปลายทาง', () => {
  const p = build(S());            /* Man 1 = 34 (Takt 25), Man 2 = 20 (mult 2) */
  const e = A.lbAiEffect(p, { kind: 'move', task: 'tail', to: 'Man 2' });
  assert.equal(e.maxBefore, 34);
  assert.equal(e.rows[0].after, 30);                 /* 34 - 4 */
  assert.equal(e.rows[1].after, 28);                 /* 20 + raw 4 × mult 2 */
  assert.equal(e.maxAfter, 30); assert.equal(e.improved, true); assert.equal(e.meets, false);
  assert.deepEqual(e.rows.map(r => r.changed), [true, true]);
});
test('effect cut: ลดเวลาได้ไม่เกิน NVA+Waste ที่มี', () => {
  const p = build(S());
  const e = A.lbAiEffect(p, { kind: 'cut', who: 'Man 1', secs: 100 });
  const nvaWaste = p.resources[0].nva + p.resources[0].waste;
  assert.equal(e.rows[0].after, Math.round((34 - nvaWaste) * 10) / 10);
  assert.match(e.note, /สูงสุด/);
});
test('effect: ชื่อไม่มีในข้อมูล / ย้ายหาตัวเอง / ชนิดแปลก / ตัวเลขไม่ถูกต้อง → null', () => {
  const p = build(S());
  [{ kind: 'move', task: 'ไม่มีงานนี้', to: 'Man 2' }, { kind: 'move', task: 'tail', to: 'Man 9' }, { kind: 'move', task: 'tail', to: 'Man 1' },
   { kind: 'cut', who: 'Man 9', secs: 5 }, { kind: 'cut', who: 'Man 1', secs: -3 }, { kind: 'cut', who: 'Man 1', secs: 'abc' },
   { kind: 'delete' }, null, 'x', undefined].forEach(x => assert.equal(A.lbAiEffect(p, x), null, JSON.stringify(x)));
});
test('effect move: ย้ายไปคนที่ช้ากว่าจนคอขวดแย่ลง → improved=false worse=true', () => {
  const s = S(); s.resources[1].mult = 2.5;          /* Man 2 = 25 ย้าย tail เข้าไป +10 = 35 > 34 เดิม */
  const e = A.lbAiEffect(build(s), { kind: 'move', task: 'tail', to: 'Man 2' });
  assert.equal(e.improved, false); assert.equal(e.worse, true); assert.equal(e.maxAfter, 35);
});
