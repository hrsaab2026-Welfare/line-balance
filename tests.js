/* ชุดทดสอบทั้งหมดในไฟล์เดียว  รัน: npm install แล้ว npm test
   ดึงโค้ดจาก index.html โดยตรง (ส่วนที่ติดป้าย inline: js/xxx.js) จึงทดสอบตัวเดียวกับที่รันบนเว็บจริง ไม่ต้องมีโฟลเดอร์ js/ */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
function mod(name) {
  const m = new RegExp('<script>/\\* inline: js/' + name + '\\.js \\*/([\\s\\S]*?)</script>').exec(HTML);
  if (!m) throw new Error('ไม่พบ js/' + name + '.js ที่ฝังใน index.html');
  const module = { exports: {} };
  new Function('module', m[1])(module);
  return module.exports;
}


/* ================= คำนวณ Line Balance (calc) ================= */
{
const C = mod('calc');
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

test('schedule: mult ต้องคูณในแท่ง Gantt ด้วย (ตรงกับโหลด)', () => {
  const md = model(); md.resources[0].mult = 2;
  const par = C.lbCompute(md, true), seq = C.lbCompute(md, false);
  assert.equal(par.sched[0].end - par.sched[0].start, 20); assert.equal(par.loads.m1, 20);
  assert.equal(par.sched[1].end - par.sched[1].start, 30); /* mult 1 ไม่เปลี่ยน */
  assert.deepEqual(seq.sched.map(o => [o.start, o.end]), [[0, 20], [20, 50], [50, 70]]);
});

test('schedule: งานเดียวกันบนทรัพยากรเดิมรอกันด้วยความยาวที่คูณแล้ว', () => {
  const md = model({ elements: [{ step: 'S', name: 'a', time: 10, vals: { m1: 10 } }, { step: 'S', name: 'b', time: 5, vals: { m1: 5 } }] });
  md.resources[0].mult = 3;
  assert.deepEqual(C.lbCompute(md, true).sched.map(o => [o.start, o.end]), [[0, 30], [30, 45]]);
});

test('lbCompute: resource ไม่มี mult ถือเป็น 1 (ไม่เป็น NaN)', () => {
  const m = C.lbCompute({ cycle: 10, pcs: 1, takt: 0, resources: [{ id: 'a', name: 'A', kind: 'man' }, { id: 'b', name: 'B', kind: 'man', mult: 1 }], elements: [{ cat: 'x', name: 'e', time: 10, vals: { a: 10, b: 4 } }] }, true);
  assert.equal(m.loads.a, 10); assert.ok(Number.isFinite(m.balEff));
});

test('fmt: ไม่แสดง -0', () => { assert.equal(C.fmt(-0.04), '0'); assert.equal(C.fmt(-0.04, 2), '-0.04'); assert.equal(C.fmt(-1.5), '-1.5'); });
test('lbSchedule ต่อเนื่อง: mult < 1 ใช้ตัวคูณจริง ตรงกับโหลด', () => {
  const m = C.lbCompute({ cycle: 10, pcs: 1, takt: 0, resources: [{ id: 'a', name: 'A', kind: 'man', mult: 0.5 }], elements: [{ cat: 'x', name: 'e', time: 10, vals: { a: 10 } }] }, false);
  near(m.loads.a, 5); near(m.total, 5);
});
test('lbSchedule ต่อเนื่อง: ความยาวงานใช้ vals × mult ไม่ใช่ time (แก้ vals แล้ว time เดิม)', () => {
  const md = model(); md.elements[0].vals.m1 = 25; md.resources[0].mult = 2; /* time ยังเป็น 10 */
  const m = C.lbCompute(md, false);
  near(m.sched[0].end - m.sched[0].start, 50);
  near(m.total, 50 + 30 + 20);
  near(m.loads.m1, 50);
});
}

/* ================= Forecast และ Work Load ================= */
{
const F = mod('forecast');
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, a + ' != ' + b);

test('เดือน: บวกเดือน ข้ามปี และป้ายชื่อ', () => {
  assert.equal(F.addMonth('2026-11', 3), '2027-02'); assert.equal(F.addMonth('2026-01', -1), '2025-12');
  assert.equal(F.daysIn('2028-02'), 29); assert.equal(F.monthLabel('2026-10'), 'Oct-26');
});

test('parseMonthCell: Date / เลขวันที่ Excel / ข้อความ', () => {
  assert.equal(F.parseMonthCell(new Date(2026, 9, 1)), '2026-10');
  assert.equal(F.parseMonthCell(new Date(2026, 8, 30, 23, 59, 59)), '2026-10'); /* คลาดเคลื่อนเล็กน้อยก่อนเที่ยงคืน */
  assert.equal(F.parseMonthCell(46296), '2026-10'); assert.equal(F.parseMonthCell('2026-11-01T00:00:00.000Z'), '2026-11');
  assert.equal(F.parseMonthCell('Oct-26'), '2026-10'); assert.equal(F.parseMonthCell('Dec 2026'), '2026-12');
  assert.equal(F.parseMonthCell('Part Name'), null); assert.equal(F.parseMonthCell(5), null); assert.equal(F.parseMonthCell(null), null);
});

/* ต.ค. 2026: 31 วัน อาทิตย์ 4 วัน (4,11,18,25) → จันทร์-เสาร์ 27 วัน */
test('workDays: จันทร์-เสาร์ / วันหยุดบริษัท / ช่วงหยุดยาว / วันทำงานพิเศษ / กรอกทับ', () => {
  const f = F.blank();
  assert.equal(F.workDays(f, '2026-10').n, 27);
  f.holidays = [{ date: '2026-10-13', name: 'วันนวมินทร์', type: 'off' }, { date: '2026-10-23', name: 'วันปิยมหาราช', type: 'off' }];
  assert.equal(F.workDays(f, '2026-10').n, 25);
  f.holidays.push({ date: '2026-10-04', name: 'ทำงานชดเชย', type: 'work' }); assert.equal(F.workDays(f, '2026-10').n, 26);
  f.holidays.push({ date: '2026-10-04', name: 'หยุดซ้อน', type: 'off' }); assert.equal(F.workDays(f, '2026-10').n, 25); /* วันหยุดชนะ */
  const g = F.blank(); g.holidays = [{ date: '2026-10-12', to: '2026-10-14', name: 'หยุดยาว', type: 'off' }]; assert.equal(F.workDays(g, '2026-10').n, 24);
  g.holidays = [{ date: '2026-09-30', to: '2026-10-02', name: 'ข้ามเดือน', type: 'off' }]; assert.equal(F.workDays(g, '2026-10').n, 25); /* 1,2 ต.ค. */
  g.dayOv['2026-10'] = 20; const w = F.workDays(g, '2026-10'); assert.equal(w.n, 20); assert.equal(w.auto, 25); assert.equal(w.ov, true);
  g.dayOv = {}; g.weekdays = [0, 1, 1, 1, 1, 1, 0]; g.holidays = []; assert.equal(F.workDays(g, '2026-10').n, 22); /* จันทร์-ศุกร์ */
  g.holidays = [{ date: 'abc', type: 'off' }, { date: '2026-13-40', type: 'off' }]; assert.equal(F.workDays(g, '2026-10').n, 22);
});

test('compute: กำลังผลิต N = ชม./วัน × วันทำงาน (ตรงตารางตัวอย่าง N1 6.8 N2 13.6 N3 16.1 N4 18.6)', () => {
  const f = F.blank(); f.months = ['2022-01', '2022-02', '2022-03']; f.dayOv = { '2022-01': 23, '2022-02': 21, '2022-03': 25 };
  const c = F.compute(f), r = (id, k) => Math.round(c.cap[id][k]);
  assert.deepEqual(['2022-01', '2022-02', '2022-03'].map(k => r('n1', k)), [156, 143, 170]);
  assert.deepEqual(['2022-01', '2022-02', '2022-03'].map(k => r('n2', k)), [313, 286, 340]);
  assert.deepEqual(['2022-01', '2022-02', '2022-03'].map(k => r('n3', k)), [370, 338, 403]);
  assert.deepEqual(['2022-01', '2022-02', '2022-03'].map(k => r('n4', k)), [428, 391, 465]);
});

const rows = () => [
  [null, null, null, null, null, null, null, 'REVISED'], [], [null, null, null, null, null, null, null, new Date(2026, 9, 1)],
  ['Item', 'Part Number', null, 'Part Name', 'Model', new Date(2026, 9, 1), new Date(2026, 10, 1), new Date(2026, 11, 1)],
  [null, 'Customer', 'SAB'],
  [1, 8981405832, '898140 5832', 'PIPE ASM', 'RT', 0, 0, 0],
  [13, 8982989231, '898298 9231', 'PIPE ASM;EXHAUST', 'RT', 1000, 2000, 0],
  ['NEW MODEL RG01'],
  [53, 8974724452, '897472 4452', 'STEP ASM;ASST', null, 0, 360, 0, 'Change Part Number'],
  [null, null, null, null, null, null, 0],
  ['ISUZU ENGINE'],
  [1, '7552731170', '7552731170', 'BRACKET', 'ES37', 3600, 0, 0]];

test('parseForecast: หัวตาราง เดือน กลุ่ม ลูกค้า หมายเหตุ', () => {
  const P = F.parseForecast(rows());
  assert.deepEqual(P.months, ['2026-10', '2026-11', '2026-12']); assert.equal(P.customer, 'SAB'); assert.equal(P.parts.length, 4);
  assert.deepEqual(P.parts.map(p => p.grp), ['SAB', 'SAB', 'NEW MODEL RG01', 'ISUZU ENGINE']);
  assert.equal(P.parts[1].no, '8982989231'); assert.equal(P.parts[1].qty['2026-11'], 2000); assert.equal(P.parts[1].model, 'RT');
  assert.equal(P.parts[2].note, 'Change Part Number'); assert.equal(P.parts[3].no, '7552731170'); assert.equal(P.skipped, 1);
});

test('parseForecast: ไม่ใช่รูปแบบ Forecast → null', () => {
  assert.equal(F.parseForecast([['a', 'b'], [1, 2]]), null);
  assert.equal(F.parseForecast([['Item', 'Part Number', 'Part Name'], [1, 123, 'x']]), null); /* ไม่มีคอลัมน์เดือน */
});

test('compute: ชั่วโมงงานต่อชิ้นงาน/ไลน์/รวม และชิ้นงานที่ยังไม่กรอกเวลา', () => {
  const f = F.blank(), P = F.parseForecast(rows()); F.applyImport(f, P, 'x.xlsx');
  f.lines = [{ id: 'L1', name: 'Line A' }];
  f.parts[1].time = 36; f.parts[1].line = 'L1'; /* 1000×36วิ = 10ชม. , 2000×36 = 20ชม. */
  f.parts[3].time = 1; /* 3600×1วิ = 1ชม. ยังไม่ระบุไลน์ */
  const c = F.compute(f);
  near(c.parts[f.parts[1].id].hrs['2026-10'], 10); near(c.parts[f.parts[1].id].total, 30);
  near(c.lines[0].hrs['2026-11'], 20); assert.equal(c.lines[0].n, 1);
  const un = c.lines.find(l => l.id === ''); near(un.hrs['2026-10'], 1); assert.equal(un.n, 3);
  near(c.total['2026-10'], 11);
  assert.deepEqual(c.missing, [f.parts[2].id]); /* RG01 มียอด 360 แต่ไม่มีเวลา */
  f.unit = 'min'; near(F.compute(f).parts[f.parts[1].id].hrs['2026-10'], 600); /* หน่วยนาที: 1000×36นาที = 600ชม. */
});

test('applyImport: ไฟล์ฉบับใหม่คงเวลา/ไลน์ตามเลขชิ้นงาน เลขซ้ำจับคู่ตามลำดับ', () => {
  const f = F.blank(); F.applyImport(f, F.parseForecast(rows()), 'a.xlsx');
  f.lines = [{ id: 'L1', name: 'A' }]; f.parts[1].time = 12; f.parts[1].line = 'L1'; f.dayOv['2026-10'] = 20; f.dayOv['2020-01'] = 5;
  const r2 = rows(); r2[6][5] = 777; r2.push([20, 8982989231, 'x', 'DUP', 'RT', 5, 5, 5]);
  const res = F.applyImport(f, F.parseForecast(r2), 'b.xlsx');
  assert.equal(res.kept, 4); assert.equal(res.added, 1);
  assert.equal(f.parts[1].time, 12); assert.equal(f.parts[1].line, 'L1'); assert.equal(f.parts[1].qty['2026-10'], 777);
  assert.equal(f.parts[4].time, ''); assert.equal(f.file, 'b.xlsx'); assert.equal(f.dayOv['2026-10'], 20); assert.equal(f.dayOv['2020-01'], undefined);
});

test('fitLevel: ระดับ N ที่รองรับโหลดได้', () => {
  assert.equal(F.fitLevel(0, [156, 313, 370, 428]), 0); assert.equal(F.fitLevel(156, [156, 313]), 0); assert.equal(F.fitLevel(250, [156, 313, 370, 428]), 1);
  assert.equal(F.fitLevel(500, [156, 313, 370, 428]), -1); assert.equal(F.fitLevel(5, []), -1);
});

test('norm: ซ่อมข้อมูลที่เพี้ยน (ไลน์ที่ถูกลบ เดือนผิดรูปแบบ เวลาติดลบ)', () => {
  const f = F.norm({ unit: 'x', months: ['2026-10', 'bad'], lines: [{ id: 'L1', name: 'A' }], levels: [], weekdays: [1], dayOv: { '2026-10': '21', '2030-01': 3 },
    parts: [{ id: 'p1', no: 1, qty: { '2026-10': '5', zz: 1 }, time: -3, line: 'gone' }, { id: 'p2', no: 'B', qty: {}, time: '2.5', line: 'L1' }] });
  assert.equal(f.unit, 'sec'); assert.deepEqual(f.months, ['2026-10']); assert.equal(f.levels.length, 4); assert.deepEqual(f.weekdays, [0, 1, 1, 1, 1, 1, 1]);
  assert.equal(f.parts[0].qty['2026-10'], 5); assert.equal(f.parts[0].time, ''); assert.equal(f.parts[0].line, ''); assert.equal(f.parts[1].time, 2.5); assert.equal(f.parts[1].line, 'L1');
  assert.deepEqual(f.dayOv, { '2026-10': 21 }); assert.deepEqual(F.norm(null).parts, []);
});

test('demo: ข้อมูลจำลองคำนวณได้ ทุกไลน์มีโหลด และไม่ทับระดับ N / วันหยุดที่ผู้ใช้ตั้งไว้', () => {
  const f = F.blank(); f.levels[0].hpd = 7; f.holidays = [{ id: 'h', date: '2026-10-13', to: '', name: 'x', type: 'off' }];
  F.demo(f, '2026-10');
  assert.equal(f.months.length, 6); assert.equal(f.parts.length, 12); assert.equal(f.lines.length, 3); assert.equal(f.levels[0].hpd, 7); assert.equal(f.holidays.length, 1);
  const c = F.compute(f); assert.deepEqual(c.missing, []); assert.ok(c.lines.every(l => l.n === 4 && l.total > 0));
  assert.ok(f.months.every(k => c.total[k] > 100 && c.total[k] < 1000));
  const g = F.blank(); F.demo(g, '2026-10'); assert.equal(g.holidays.length, 2);
});

test('toggleDay: กดเพิ่ม/กดซ้ำยกเลิก วันอาทิตย์เป็นวันทำงานพิเศษ และตัดวันออกจากช่วงยาว', () => {
  const f = F.blank();
  assert.equal(F.toggleDay(f, '2026-10-13'), 'off'); assert.equal(F.workDays(f, '2026-10').n, 26);
  assert.equal(F.toggleDay(f, '2026-10-13'), 'removed'); assert.equal(f.holidays.length, 0); assert.equal(F.workDays(f, '2026-10').n, 27);
  assert.equal(F.toggleDay(f, '2026-10-04'), 'work'); assert.equal(f.holidays[0].type, 'work'); assert.equal(F.workDays(f, '2026-10').n, 28);
  const g = F.blank(); g.holidays = [{ id: 'a', date: '2026-10-12', to: '2026-10-16', name: 'ยาว', type: 'off' }];
  assert.equal(F.toggleDay(g, '2026-10-14'), 'removed');
  assert.deepEqual(g.holidays.map(h => [h.date, h.to, h.name]), [['2026-10-12', '2026-10-13', 'ยาว'], ['2026-10-15', '2026-10-16', 'ยาว']]);
  assert.equal(F.workDays(g, '2026-10').n, 27 - 4);
  F.toggleDay(g, '2026-10-12'); assert.deepEqual(g.holidays.map(h => [h.date, h.to]), [['2026-10-13', ''], ['2026-10-15', '2026-10-16']]);
  assert.equal(F.toggleDay(g, 'bad'), null);
});

test('taktFor: Takt = ชม./วันของระดับ N × 3600 ÷ (ยอดเดือน ÷ วันทำงาน) จับคู่เลขชิ้นงานโดยไม่สนช่องว่าง', () => {
  const f = F.blank(); f.months = ['2026-10'];
  f.parts = [{ id: 'p', no: '8981405832', name: 'X', qty: { '2026-10': 2700 }, time: '', line: '' }];
  const r = F.taktFor(f, '898140 5832', '2026-10', 'n1'); /* ต.ค. 2026 = 27 วัน → 100 ชิ้น/วัน, N1 6.8 ชม. = 408 นาที */
  assert.equal(r.days, 27); near(r.perDay, 100); near(r.minutes, 408); near(r.takt, 244.8); assert.equal(r.dup, 1);
  f.holidays = [{ date: '2026-10-13', name: 'x', type: 'off' }]; /* วันทำงานลด → ยอด/วันเพิ่ม → Takt สั้นลง */
  const r2 = F.taktFor(f, '8981405832', '2026-10', 'n2'); assert.equal(r2.days, 26); near(r2.perDay, 2700 / 26); near(r2.takt, 13.6 * 3600 / (2700 / 26));
});

test('taktFor: ไม่พบ → null / ไม่มียอด·ไม่มีวันทำงาน·ไม่มีชั่วโมง → พบแต่ takt เป็น null', () => {
  const f = F.blank(); f.months = ['2026-10', '2026-11'];
  f.parts = [{ id: 'p', no: '111', qty: { '2026-10': 500, '2026-11': 0 } }, { id: 'q', no: '111', qty: { '2026-10': 9 } }];
  assert.equal(F.taktFor(f, '999', '2026-10', 'n1'), null); assert.equal(F.taktFor(f, '111', '2027-01', 'n1'), null); assert.equal(F.taktFor(f, '111', '2026-10', 'zz'), null); assert.equal(F.taktFor(f, '', '2026-10', 'n1'), null);
  const a = F.taktFor(f, '111', '2026-10', 'n1'); assert.equal(a.dup, 2); near(a.qty, 500); /* เลขซ้ำใช้แถวแรก */
  const b = F.taktFor(f, '111', '2026-11', 'n1'); assert.equal(b.takt, null); assert.equal(b.perDay, null);
  f.dayOv['2026-10'] = 0; assert.equal(F.taktFor(f, '111', '2026-10', 'n1').takt, null);
  f.dayOv = {}; f.levels[0].hpd = 0; assert.equal(F.taktFor(f, '111', '2026-10', 'n1').takt, null);
});
}

/* ================= อ่านไฟล์ / จัดไลน์อัตโนมัติ ================= */
{
const P = mod('parse'), C = mod('calc');

test('lbNum / lbClean', () => {
  assert.equal(P.lbNum(5), 5); assert.equal(P.lbNum(' 12.5 '), 12.5); assert.equal(P.lbNum('abc'), null); assert.equal(P.lbNum(null), null); assert.equal(P.lbNum(Infinity), null);
  assert.equal(P.lbClean('  a \n b  '), 'a b'); assert.equal(P.lbClean(null), '');
});

test('lbParseSheet: ไม่พบหัวคอลัมน์ Time (Sec) → null', () => {
  assert.equal(P.lbParseSheet([['a', 'b'], [1, 2]]), null);
});

/* ใช้ข้อมูลตัวอย่างจริงใน index.html เป็น fixture */
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
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
}

/* ================= Yamazumi และข้อเสนอแนะ ================= */
{
const Y = mod('yamazumi'), C = mod('calc');
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

test('lbSuggest: time ของงานที่ย้ายต้องรวม mult ของคนต้นทาง (B1)', () => {
  const s = S(); s.resources[0].mult = 2; s.elements.push({ cat: 'Move', name: 'tail', time: 4, vals: { m1: 4 } });
  const m = C.lbCompute(s, true), mv = Y.lbSuggest(s, m).filter(o => o.type === 'move');
  assert.equal(mv.length, 1); assert.equal(mv[0].name, 'tail');
  near(mv[0].time, 8); near(mv[0].raw, 4);
  near(mv[0].oldMax, 68); near(mv[0].newMax, 60); near(mv[0].gain, mv[0].time);
});
}

/* ================= AI payload / effect ================= */
{
const A = mod('ai'), C = mod('calc'), Y = mod('yamazumi');

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
}

/* ================= หน้าเว็บจริงด้วย jsdom (รวมการ์ด AI) ================= */
{
/* ทดสอบหน้าเว็บจริงด้วย jsdom: โหลด index.html กดตัวอย่าง แล้วเช็กว่าไม่มี error และกราฟขึ้น
   (จับ bug แบบเรียก status() ไม่ได้ ที่เทสต์ตรรกะบน Node มองไม่เห็น) ต้อง npm install ก่อน */
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');
const ROOT = __dirname, BASE = 'http://localhost/';

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

test('ui: ปุ่มวิธีใช้ 3 ขั้นตอน เปิด/ปิดได้ และมีศัพท์ 3 คำ', async () => {
  const { w, d, errors } = await open();
  const dlg = d.getElementById('helpDlg');
  assert.ok(!dlg.open);
  click(w, d.getElementById('wlHelp')); assert.ok(dlg.open, 'ปุ่มหน้าแรกต้องเปิดวิธีใช้');
  assert.equal(dlg.querySelectorAll('.hl-steps li').length, 3);
  assert.deepEqual([...dlg.querySelectorAll('.hl-gloss dt')].map(e => e.textContent), ['Takt Time', 'Cycle Time', 'Yamazumi']);
  click(w, d.getElementById('hlClose')); assert.ok(!dlg.open);
  click(w, d.getElementById('helpBtn')); assert.ok(dlg.open, 'ปุ่มบน header ต้องเปิดวิธีใช้');
  assert.deepEqual(errors, []);
});

test('ui: เมนูที่ยังไม่มีข้อมูลบอกเหตุผล ไม่ใช่หน้าว่างเฉยๆ', async () => {
  const { w, d, errors } = await open();
  const note = d.getElementById('wlTabNote');
  for (const [id, nm] of [['flow', 'Process Flow'], ['balance', 'Line Balance'], ['compare', 'Manual กับ Robot']]) {
    click(w, d.getElementById('tabbtn-' + id));
    assert.equal(note.hidden, false, id); assert.ok(note.textContent.includes(nm), id + ': ' + note.textContent);
  }
  click(w, d.getElementById('tabbtn-fc')); assert.equal(note.hidden, true, 'Forecast ใช้ได้เลย ไม่ต้องมีข้อความนี้');
  click(w, d.getElementById('sampleBtn')); click(w, d.getElementById('tabbtn-balance'));
  assert.equal(note.hidden, true, 'มีข้อมูลแล้วต้องซ่อน');
  assert.deepEqual(errors, []);
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

test('ui: Work load ดูรายชิ้นงาน (Part) ได้ และคำนวณชั่วโมงต่อชิ้นงานถูกต้อง', async () => {
  const { w, d, errors } = await open();
  click(w, d.getElementById('tabbtn-fc'));
  const rows = [['Item', 'Part Number', null, 'Part Name', 'Model', new w.Date(2026, 9, 1)],
    [1, 1111111111, null, 'A', 'M1', 3600], [2, 2222222222, null, 'B', 'M2', 1800], [3, 3333333333, null, 'C', 'M3', 0]];
  assert.ok(w.lbFc.importRows(rows, 'x.xlsx'));
  const ids = w.lbFc.state().parts.map(p => p.id);
  d.querySelectorAll('#fcPT tr input[data-f="time"]').forEach((t, i) => { t.value = String(10 * (i + 1)); t.dispatchEvent(new w.Event('input', { bubbles: true })); });
  const sel = () => d.getElementById('fcScope');
  const og = [...sel().querySelectorAll('optgroup option')].map(o => o.value);
  assert.deepEqual(og, ['p:' + ids[0], 'p:' + ids[1]], 'แสดงเฉพาะชิ้นงานที่มียอด (C ยอด 0 ไม่ขึ้น)');
  sel().value = 'p:' + ids[0]; sel().dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(sel().value, 'p:' + ids[0]);
  assert.ok(d.querySelectorAll('#fcRes svg rect').length > 0);
  assert.match(d.querySelector('.fc-pinfo').textContent, /Model M1/);
  /* A: 3600 ชิ้น × 10 วินาที ÷ 3600 = 10 ชม. */
  assert.match(d.querySelector('#fcRes .fc-sum tbody tr.fc-hl').textContent, /ชม\.\)10$/);
  sel().value = 'all'; sel().dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(d.querySelector('.fc-pinfo'), null);
  assert.ok(!/undefined|NaN/.test(d.getElementById('tab-fc').textContent));
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
}
