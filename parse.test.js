const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const P = require('../js/parse.js'), C = require('../js/calc.js');

test('lbNum / lbClean', () => {
  assert.equal(P.lbNum(5), 5); assert.equal(P.lbNum(' 12.5 '), 12.5); assert.equal(P.lbNum('abc'), null); assert.equal(P.lbNum(null), null); assert.equal(P.lbNum(Infinity), null);
  assert.equal(P.lbClean('  a \n b  '), 'a b'); assert.equal(P.lbClean(null), '');
});

test('lbParseSheet: ไม่พบหัวคอลัมน์ Time (Sec) → null', () => {
  assert.equal(P.lbParseSheet([['a', 'b'], [1, 2]]), null);
});

/* ใช้ข้อมูลตัวอย่างจริงใน index.html เป็น fixture */
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const PF = JSON.parse(/var SAMPLE_PF = (\{.*\});/.exec(html)[1]);
const draft = () => P.lbInitDraft(JSON.parse(JSON.stringify(PF)));

test('lbInitDraft: สร้างร่างจาก Process Flow ตัวอย่าง', () => {
  const D = draft();
  assert.equal(D.part.partNo, '7552731170'); assert.equal(D.procs.length, PF.processes.length);
  assert.ok(D.elements.length > 0);
});

test('lbAutoModel: ยังไม่กรอกเวลา → empty', () => {
  const D = draft(); D.elements.forEach(e => { e.time = 0; });
  assert.equal(P.lbAutoModel(D).empty, true);
});

test('lbAutoModel: ผลรวมโหลดตรงกับเวลางานที่กรอก และส่งต่อให้ compute ได้', () => {
  const D = draft(); D.takt = 60;
  D.elements.forEach((e, i) => { e.time = 10 + (i % 3) * 5; });
  const r = P.lbAutoModel(D);
  assert.equal(r.empty, false);
  const m = C.lbCompute(r.model, true);
  const inc = new Set(D.procs.filter(p => p.include).map(p => p.no));
  const total = D.elements.filter(e => inc.has(e.proc)).reduce((a, e) => a + e.time, 0);
  const sum = Object.values(m.loads).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - total) < 1e-6, sum + ' vs ' + total);
  assert.ok(m.maxLoad > 0 && m.bottle.length >= 1);
});
