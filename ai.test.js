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
