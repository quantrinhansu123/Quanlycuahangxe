import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, after } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  DEFAULT_ATTENDANCE_SETTINGS,
  attendanceCreditBreakdownForDay,
  overtimeMinutesForDayShifts,
  validateAttendanceSettings,
  workDaysForDayShifts,
} from '../src/utils/timekeeping.ts';
import { matchImportedAttendancePairs } from '../src/utils/attendanceImport.ts';

const morning = { checkin: '08:30', checkout: '12:00' };
const afternoon = { checkin: '13:00', checkout: '17:30' };
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE nhan_su(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_nhan_su text, ho_ten text, vi_tri text);
 CREATE TABLE cham_cong(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_cham_cong text, nhan_su text, ngay date,
 checkin time, checkout time, anh text, vi_tri text, created_at timestamptz DEFAULT now());
 INSERT INTO nhan_su(id,id_nhan_su,ho_ten,vi_tri) VALUES
 ('00000000-0000-0000-0000-000000000001','NV1','Quản lý','quản lý'),
 ('00000000-0000-0000-0000-000000000002','NV2','Nhân viên','kỹ thuật viên');
 CREATE FUNCTION current_app_nhan_su_uuid() RETURNS uuid LANGUAGE sql AS $$
 SELECT nullif(current_setting('test.actor', true), '')::uuid $$;
 SET test.actor = '00000000-0000-0000-0000-000000000001';`);
const migration = await readFile(new URL('../supabase/migrations/202609090003_attendance_shifts.sql', import.meta.url), 'utf8');
await db.exec(migration);
const fullDayFallbackMigration = await readFile(new URL('../supabase/migrations/202609160001_attendance_full_day_fallback.sql', import.meta.url), 'utf8');
await db.exec(fullDayFallbackMigration);
const attendanceSettingsMigration = await readFile(new URL('../supabase/migrations/202609160002_attendance_settings.sql', import.meta.url), 'utf8');
await db.exec(attendanceSettingsMigration);
const manual = (day, shift = 'morning', start = '08:30', end = '12:00', note = 'Quên chấm công') => db.query(
  `SELECT * FROM add_manual_attendance('00000000-0000-0000-0000-000000000002', $1, $2, $3, $4, $5)`, [day, shift, start, end, note]);
const credit = async day => Number((await db.query(`SELECT attendance_day_credit('NV2', $1) n`, [day])).rows[0].n);
const saveSettings = overrides => {
  const value = {
    shiftName: 'Ca Hành chính', fullDayStart: '08:30', fullDayEnd: '17:30',
    standardWorkMinutes: 480, unpaidBreakMinutes: 60, fullDayCredit: 1,
    splitShiftEnabled: true, morningStart: '08:30', morningEnd: '12:00', morningCredit: 0.5,
    afternoonStart: '13:00', afternoonEnd: '17:30', afternoonCredit: 0.5,
    lateGraceMinutes: 10, overtimeStart: '19:40', maxOvertimeHoursMonth: 25,
    ...overrides,
  };
  return db.query(`SELECT * FROM save_attendance_settings(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
  )`, [
    value.shiftName, value.fullDayStart, value.fullDayEnd,
    value.standardWorkMinutes, value.unpaidBreakMinutes, value.fullDayCredit,
    value.splitShiftEnabled, value.morningStart, value.morningEnd, value.morningCredit,
    value.afternoonStart, value.afternoonEnd, value.afternoonCredit,
    value.lateGraceMinutes, value.overtimeStart, value.maxOvertimeHoursMonth,
  ]);
};

test('TEST 1 / TEST 2 / TEST 3: morning 0.5, afternoon 0.5, both 1; database parity', async () => {
  for (const [day, rows, expected] of [['2026-09-01', [morning], 0.5], ['2026-09-02', [afternoon], 0.5], ['2026-09-03', [morning, afternoon], 1]]) {
    assert.equal(workDaysForDayShifts(rows), expected);
    for (const r of rows) await db.query(`INSERT INTO cham_cong(nhan_su,ngay,checkin,checkout) VALUES('NV2',$1,$2,$3)`, [day, r.checkin, r.checkout]);
    assert.equal(await credit(day), expected);
  }
});
test('TEST 4: manager supplies a forgotten morning, audit saved', async () => {
  const { rows } = await manual('2026-09-08');
  assert.equal(rows.length, 1); assert.equal(await credit('2026-09-08'), 0.5);
  assert.equal(rows[0].ghi_chu, 'Quên chấm công');
  assert.equal(rows[0].bo_sung_boi, '00000000-0000-0000-0000-000000000001');
});
test('TEST 5: duplicate morning rejected; full day is atomic when one shift exists', async () => {
  await assert.rejects(manual('2026-09-08'), { code: '23505' });
  await assert.rejects(manual('2026-09-08', 'full'), { code: '23505' });
  assert.equal(await credit('2026-09-08'), 0.5);
});
test('TEST 6: missing afternoon can be supplied; three-day total = 2', async () => {
  await manual('2026-09-08', 'afternoon', '13:00', '17:30');
  await manual('2026-09-09'); await manual('2026-09-10', 'afternoon', '13:00', '17:30');
  assert.equal(await credit('2026-09-08'), 1);
  assert.equal(await credit('2026-09-08') + await credit('2026-09-09') + await credit('2026-09-10'), 2);
});
test('full day creates two shifts; repeat cannot duplicate; transaction rolls back earlier morning', async () => {
  assert.equal((await manual('2026-09-11', 'full')).rows.length, 2);
  assert.equal(await credit('2026-09-11'), 1);
  await manual('2026-09-12', 'afternoon', '13:00', '17:30');
  await assert.rejects(manual('2026-09-12', 'full'), { code: '23505' });
  assert.equal(await credit('2026-09-12'), 0.5);
});
test('missing times, incomplete shifts, duplicate rows and contiguous split intervals', () => {
  assert.equal(workDaysForDayShifts([morning, morning, afternoon, afternoon]), 1);
  assert.equal(workDaysForDayShifts([{ checkin: '08:30', checkout: null }]), 0);
  assert.equal(workDaysForDayShifts([{ checkin: '09:00', checkout: '12:00' }]), 0);
  assert.equal(workDaysForDayShifts([{ checkin: '08:30:59', checkout: '12:00:00' }]), 0);
  assert.equal(workDaysForDayShifts([{ checkin: '08:30', checkout: '17:30' }]), 1);
  assert.equal(workDaysForDayShifts([{ checkin: '08:30', checkout: '10:00' }, { checkin: '10:00', checkout: '12:00' }]), 0.5);
});
test('single full-day fallback gives 1 công without changing four-punch or overtime logic', async () => {
  const noLunchPunch = [{ checkin: '08:35:00', checkout: '20:02:00' }];
  const fourPunchData = [
    { checkin: '08:35:00', checkout: '12:00:00' },
    { checkin: '13:00:00', checkout: '20:02:00' },
  ];

  assert.equal(workDaysForDayShifts(noLunchPunch), 1, 'Một lượt đầu-cuối ngày được fallback đủ hai ca');
  assert.equal(workDaysForDayShifts(fourPunchData), 0.5, 'Nhiều lượt vẫn tính đúng logic từng ca cũ');
  assert.equal(overtimeMinutesForDayShifts(noLunchPunch), 22, 'OT vẫn chỉ tính sau 19:40, không gồm giờ nghỉ trưa');

  await db.query(`INSERT INTO cham_cong(nhan_su,ngay,checkin,checkout) VALUES('NV2','2026-09-04','08:35','20:02')`);
  assert.equal(await credit('2026-09-04'), 1, 'Database dùng cùng fallback với giao diện/bảng lương');

  await db.query(`INSERT INTO cham_cong(nhan_su,ngay,checkin,checkout) VALUES
    ('NV2','2026-09-05','08:35','12:00'), ('NV2','2026-09-05','13:00','20:02')`);
  assert.equal(await credit('2026-09-05'), 0.5, 'Database giữ nguyên logic nhiều lượt chấm');
});
test('permission, note validation, regular inserts/updates and name/code duplicates guarded', async () => {
  await assert.rejects(manual('2026-09-13', 'morning', '07:30', '11:30', ''), { code: '22023' });
  await db.exec(`SET test.actor = '00000000-0000-0000-0000-000000000002'`);
  await assert.rejects(manual('2026-09-13'), { code: '42501' });
  await db.exec(`SET test.actor = ''`);
  await assert.rejects(manual('2026-09-13'), { code: '42501' });
  await db.exec(`SET test.actor = '00000000-0000-0000-0000-000000000001'`);
  await assert.rejects(db.exec(`INSERT INTO cham_cong(nhan_su,ngay,checkin,checkout) VALUES('Nhân viên','2026-09-08','08:30','12:00')`), { code: '23505' });
  await assert.rejects(db.exec(`UPDATE cham_cong SET checkin='08:30' WHERE ngay='2026-09-08' AND checkin='13:00'`), { code: '23505' });
  const { rows } = await db.query(`SELECT next_attendance_code() code FROM generate_series(1, 200)`);
  assert.equal(new Set(rows.map(r => r.code)).size, 200);
});
test('migration reruns without deleting attendance', async () => {
  const before = await db.query('SELECT count(*) n FROM cham_cong');
  await db.exec(migration);
  await db.exec(fullDayFallbackMigration);
  await db.exec(attendanceSettingsMigration);
  assert.deepEqual(await db.query('SELECT count(*) n FROM cham_cong'), before);
});

test('name and employee code share one daily credit', async () => {
  await db.exec(`INSERT INTO cham_cong(nhan_su,ngay,checkin,checkout) VALUES('Nhân viên','2026-09-20','08:30','12:00')`);
  await manual('2026-09-20', 'afternoon', '13:00', '17:30');
  assert.equal(await credit('2026-09-20'), 1);
});

test('settings RPC saves valid values and rejects overlap, excess credit and unauthorized staff', async () => {
  const { rows } = await saveSettings({
    fullDayStart: '09:00', fullDayEnd: '18:00',
    morningStart: '09:00', morningEnd: '12:30', morningCredit: 0.4,
    afternoonStart: '13:30', afternoonEnd: '18:00', afternoonCredit: 0.6,
    lateGraceMinutes: 5, overtimeStart: '18:30',
  });
  assert.equal(String(rows[0].morning_credit), '0.400');
  assert.equal(String(rows[0].afternoon_credit), '0.600');
  await assert.rejects(saveSettings({ morningEnd: '14:00', afternoonStart: '13:00' }), { code: '22023' });
  await assert.rejects(saveSettings({ morningCredit: 0.7, afternoonCredit: 0.6 }), { code: '22023' });
  await db.exec(`SET test.actor = '00000000-0000-0000-0000-000000000002'`);
  await assert.rejects(saveSettings({}), { code: '42501' });
  await db.exec(`SET test.actor = '00000000-0000-0000-0000-000000000001'`);
  await saveSettings({});
});

test('custom split configuration applies to full day, two shifts and one shift', async () => {
  const custom = {
    ...DEFAULT_ATTENDANCE_SETTINGS,
    fullDayStart: '09:00', fullDayEnd: '18:00',
    morningStart: '09:00', morningEnd: '12:30', morningCredit: 0.4,
    afternoonStart: '13:30', afternoonEnd: '18:00', afternoonCredit: 0.6,
    lateGraceMinutes: 5, overtimeStart: '18:30',
  };
  assert.deepEqual(validateAttendanceSettings(custom), []);
  assert.deepEqual(
    attendanceCreditBreakdownForDay([{ checkin: '09:04', checkout: '18:00' }], custom),
    { morning: 0.4, afternoon: 0.6, total: 1, fullDay: true }
  );
  assert.equal(workDaysForDayShifts([
    { checkin: '09:00', checkout: '12:30' },
    { checkin: '13:30', checkout: '18:00' },
  ], custom), 1);
  assert.equal(workDaysForDayShifts([{ checkin: '09:00', checkout: '12:30' }], custom), 0.4);
  assert.equal(workDaysForDayShifts([{ checkin: '13:30', checkout: '18:00' }], custom), 0.6);
  assert.equal(overtimeMinutesForDayShifts([{ checkin: '09:00', checkout: '19:00' }], custom), 30);

  await db.exec(`UPDATE attendance_settings SET
    full_day_start='09:00', full_day_end='18:00', standard_work_minutes=480, unpaid_break_minutes=60,
    morning_start='09:00', morning_end='12:30', morning_credit=0.4,
    afternoon_start='13:30', afternoon_end='18:00', afternoon_credit=0.6,
    late_grace_minutes=5, overtime_start='18:30' WHERE scope='global'`);
  await db.query(`INSERT INTO cham_cong(nhan_su,ngay,checkin,checkout) VALUES
    ('NV2','2026-09-21','09:00','12:30'), ('NV2','2026-09-21','13:30','18:00'),
    ('NV2','2026-09-22','09:00','12:30'), ('NV2','2026-09-23','09:04','18:00')`);
  assert.equal(await credit('2026-09-21'), 1);
  assert.equal(await credit('2026-09-22'), 0.4);
  assert.equal(await credit('2026-09-23'), 1);
});

test('invalid configuration is rejected before save', () => {
  assert.ok(validateAttendanceSettings({
    ...DEFAULT_ATTENDANCE_SETTINGS,
    morningEnd: '14:00', afternoonStart: '13:00',
  }).some((message) => message.includes('chồng nhau')));
  assert.ok(validateAttendanceSettings({
    ...DEFAULT_ATTENDANCE_SETTINGS,
    morningCredit: 0.7, afternoonCredit: 0.6,
  }).some((message) => message.includes('vượt quá 1')));
});

test('Excel import preserves separate morning and afternoon pairs', () => {
  const imported = [
    { nhan_su: 'NV2', ngay: '2026-09-24', checkin: '08:30', checkout: '12:00' },
    { nhan_su: 'NV2', ngay: '2026-09-24', checkin: '13:00', checkout: '17:30' },
  ];
  const existing = [
    { id: 'morning-id', id_cham_cong: 'CC-1001', nhan_su: 'Nhân viên', ngay: '2026-09-24', checkin: '08:30', checkout: '12:00' },
    { id: 'afternoon-id', id_cham_cong: 'CC-1002', nhan_su: 'Nhân viên', ngay: '2026-09-24', checkin: '13:00', checkout: '17:30' },
  ];
  const matched = matchImportedAttendancePairs(imported, existing, () => 'same-person');
  assert.equal(matched.records.length, 2);
  assert.equal(matched.updatedCount, 2);
  assert.deepEqual(matched.records.map((row) => row.id), ['morning-id', 'afternoon-id']);
});

after(() => db.close());
