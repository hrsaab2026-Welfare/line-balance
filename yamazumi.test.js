const test = require('node:test'), assert = require('node:assert/strict');
const Y = require('../js/yamazumi.js'), C = require('../js/calc.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);

/* Man 1: Set 5 + Weld 25 ; Man 2: Set 5 + Ass'y 10 + Check 5 + Move 5  (Takt 25) */
const S = () => ({
  cycle: 30, pcs: 1, takt: 25,
  resources: [{ id: 'm1', name: 'Man 1', kind: 'man', mult: 1 }, { id: 'm2', name: 'Man 2', kind: 'man', mult: 1 }],
  elements: [
    { cat: 'Set', name: 'set1', time: 5, vals: { m1: 5 } },
    { cat: 'Weld', name: 'weld', time: 25, vals: { m1: 25 } },
    { cat: 'Set', name: 'set2', time: 5, vals: { m2: 5 } },
    { cat: "Ass'y", name: 'asy', time: 10, vals: { m2: 10 } },
    { cat: 'Check', name: 'chk', time: 5, vals: { m2: 5 } },
    { cat: 'Move', name: 'mv', time: 5, vals: { m2: 5 } }]
});

test('lbYzClass: จัดหมวด + override', () => {
  assert.equal(C.status ? Y.lbYzClass('Weld') : '', 'va'); assert.equal(Y.lbYzClass("Ass'y"), 'va');
  ['Set', 'Move', 'Check', 'Take off', 'หยิบชิ้นงาน'].forEach(c => assert.equal(Y.lbYzClass(c), 'nva', c));
  ['Walk', 'Wait', 'เดิน'].forEach(c => assert.equal(Y.lbYzClass(c), 'waste', c));
  assert.equal(Y.lbYzClass('Weld', { Weld: 'waste' }), 'waste'); assert.equal(Y.lbYzClass(null), 'va');
});

test('lbYamazumi: ผลรวมต่อทรัพยากรเท่ากับโหลดของ compute (รวม mult)', () => {
  const s = S(); s.resources[1].mult = 2;
  const m = C.lbCompute(s, true), y = Y.lbYamazumi(s);
  y.forEach(r => near(r.va + r.nva + r.waste, m.loads[r.id]));
  near(y[0].va, 25); near(y[0].nva, 5); near(y[1].va, 20); near(y[1].nva, 30);
});

test('lbSuggest: ย้ายงานสุดท้ายของ Man 1 ไป Man 2 / ไม่ย้ายถ้าไม่ดีขึ้น', () => {
  const s = S(), m = C.lbCompute(s, true);
  /* Man 1 = 30, Man 2 = 25: ย้าย set1(5) ไป Man 0 ไม่มี, ย้ายงานสุดท้าย (weld 25) ไป Man 2 → 50 แย่ลง ต้องไม่เสนอ */
  assert.deepEqual(Y.lbSuggest(s, m).filter(o => o.type === 'move'), []);
  const s2 = S(); s2.elements.push({ cat: 'Move', name: 'tail', time: 4, vals: { m1: 4 } });
  const m2 = C.lbCompute(s2, true), mv = Y.lbSuggest(s2, m2).filter(o => o.type === 'move');
  assert.equal(mv.length, 1); assert.equal(mv[0].name, 'tail'); assert.equal(mv[0].to, 'Man 2');
  near(mv[0].oldMax, 34); near(mv[0].newMax, 30); near(mv[0].gain, 4); assert.equal(mv[0].meetsTakt, false);
});

test('lbSuggest: แจ้ง NVA สูงและช่องว่างจาก Takt', () => {
  const s = S(); s.elements.push({ cat: 'Move', name: 'tail', time: 4, vals: { m1: 4 } });
  const o = Y.lbSuggest(s, C.lbCompute(s, true));
  assert.ok(o.some(x => x.type === 'gap' && Math.abs(x.over - 9) < 1e-9));
  const n = o.find(x => x.type === 'nva'); assert.ok(n === undefined || n.share >= 0.3);
});

test('lbSuggest: คนเดียว → ไม่มีข้อเสนอ', () => {
  const s = S(); s.resources = [s.resources[0]]; s.elements = s.elements.slice(0, 2);
  assert.deepEqual(Y.lbSuggest(s, C.lbCompute(s, true)), []);
});
