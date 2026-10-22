const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../js/calc.js');
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, a + ' != ' + b);

/* โมเดลเล็กที่คำนวณมือได้: คน 2 + หุ่นยนต์ 1 ทำงานคู่ขนาน */
const model = (o) => Object.assign({
  cycle: 40, pcs: 1, takt: 35,
  resources: [{ id: 'm1', name: 'Man 1', kind: 'man', mult: 1 }, { id: 'm2', name: 'Man 2', kind: 'man', mult: 1 }, { id: 'r', name: 'Robot', kind: 'robot', mult: 1 }],
  elements: [
    { step: 'S1', name: 'a', time: 10, vals: { m1: 10 } },
    { step: 'S1', name: 'b', time: 30, vals: { m2: 30 } },
    { step: 'S2', name: 'c', time: 20, vals: { r: 20 } }]
}, o || {});

test('fmt / pct', () => {
  assert.equal(C.fmt(10), '10'); assert.equal(C.fmt(3.14159), '3.1'); assert.equal(C.fmt(2.5, 2), '2.5');
  assert.equal(C.fmt(null), '—'); assert.equal(C.fmt(NaN), '—'); assert.equal(C.pct(0.5), '50%');
});

test('compute: โหลด คอขวด และตัวชี้วัด', () => {
  const m = C.lbCompute(model(), true);
  assert.deepEqual(m.loads, { m1: 10, m2: 30, r: 20 });
  assert.equal(m.maxLoad, 30); assert.deepEqual(m.bottle.map(r => r.id), ['m2']);
  assert.equal(m.men, 2); assert.equal(m.manSum, 40);
  near(m.balEff, 40 / (2 * 30)); near(m.laborUtil, 40 / (2 * 40)); near(m.laborPerPc, 40);
  near(m.perPiece, 40); near(m.capacity, 90); near(m.required, 3600 / 35);
});

test('compute: ตัวคูณ (mult) และหลายชิ้นต่อรอบ', () => {
  const md = model({ pcs: 2 }); md.resources[0].mult = 2;
  const m = C.lbCompute(md, true);
  assert.equal(m.loads.m1, 20); near(m.perPiece, 20); near(m.laborPerPc, (20 + 30) / 2);
});

test('compute: ไม่มีพนักงาน ไม่ควรหารด้วยศูนย์', () => {
  const md = model(); md.resources = [md.resources[2]]; md.elements = [md.elements[2]];
  const m = C.lbCompute(md, true);
  assert.equal(m.balEff, null); assert.equal(m.laborUtil, null); assert.equal(m.laborPerPc, null);
});

test('compute: ไม่ใส่ Takt', () => {
  const m = C.lbCompute(model({ takt: null }), true);
  assert.equal(m.required, null);
});

test('schedule: คู่ขนานเทียบต่อเนื่อง', () => {
  const par = C.lbCompute(model(), true), seq = C.lbCompute(model(), false);
  assert.equal(par.total, 30); assert.deepEqual(par.sched.map(o => [o.start, o.end]), [[0, 10], [0, 30], [0, 20]]);
  assert.equal(seq.total, 60); assert.deepEqual(seq.sched.map(o => [o.start, o.end]), [[0, 10], [10, 40], [40, 60]]);
});

test('schedule: งานที่ใช้ทรัพยากรเดียวกันต้องรอกัน', () => {
  const md = model({ elements: [{ step: 'S', name: 'a', time: 10, vals: { m1: 10 } }, { step: 'S', name: 'b', time: 5, vals: { m1: 5 } }] });
  assert.deepEqual(C.lbCompute(md, true).sched.map(o => [o.start, o.end]), [[0, 10], [10, 15]]);
});

test('bandsOf: ช่วง Step ไม่ซ้อนกัน', () => {
  const b = C.bandsOf(C.lbCompute(model(), false));
  assert.deepEqual(b, [{ step: 'S1', a: 0, b: 40 }, { step: 'S2', a: 40, b: 60 }]);
});

test('status: เกินรอบ / ใกล้เต็ม / ปกติ', () => {
  assert.equal(C.status(41, 40).cls, 'bad'); assert.equal(C.status(40, 40).cls, 'warn');
  assert.equal(C.status(38, 40).cls, 'warn'); assert.equal(C.status(37, 40).cls, 'good'); assert.equal(C.status(10, 0).cls, 'good');
});
