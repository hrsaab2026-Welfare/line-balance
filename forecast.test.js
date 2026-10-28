const test = require('node:test'), assert = require('node:assert/strict');
const F = require('../js/forecast.js');
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
