import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, after } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { workDaysForDayShifts } from '../src/utils/timekeeping.ts';

const morning = { checkin: '07:30', checkout: '11:30' };
const afternoon = { checkin: '14:00', checkout: '19:30' };
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
const manual = (day, shift = 'morning', start = '07:30', end = '11:30', note = 'Quên chấm công') => db.query(
  `SELECT * FROM add_manual_attendance('00000000-0000-0000-0000-000000000002', $1, $2, $3, $4, $5)`, [day, shift, start, end, note]);
const credit = async day => Number((await db.query(`SELECT attendance_day_credit('NV2', $1) n`, [day])).rows[0].n);

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
  await manual('2026-09-08', 'afternoon', '14:00', '19:30');
  await manual('2026-09-09'); await manual('2026-09-10', 'afternoon', '14:00', '19:30');
  assert.equal(await credit('2026-09-08'), 1);
  assert.equal(await credit('2026-09-08') + await credit('2026-09-09') + await credit('2026-09-10'), 2);
});
test('full day creates two shifts; repeat cannot duplicate; transaction rolls back earlier morning', async () => {
  assert.equal((await manual('2026-09-11', 'full')).rows.length, 2);
  assert.equal(await credit('2026-09-11'), 1);
  await manual('2026-09-12', 'afternoon', '14:00', '19:30');
  await assert.rejects(manual('2026-09-12', 'full'), { code: '23505' });
  assert.equal(await credit('2026-09-12'), 0.5);
});
test('missing times, incomplete shifts, duplicate rows and contiguous split intervals', () => {
  assert.equal(workDaysForDayShifts([morning, morning, afternoon, afternoon]), 1);
  assert.equal(workDaysForDayShifts([{ checkin: '07:30', checkout: null }]), 0);
  assert.equal(workDaysForDayShifts([{ checkin: '08:00', checkout: '11:30' }]), 0);
  assert.equal(workDaysForDayShifts([{ checkin: '07:30:59', checkout: '11:30:00' }]), 0);
  assert.equal(workDaysForDayShifts([{ checkin: '07:30', checkout: '19:30' }]), 1);
  assert.equal(workDaysForDayShifts([{ checkin: '07:30', checkout: '09:00' }, { checkin: '09:00', checkout: '11:30' }]), 0.5);
});
test('permission, note validation, regular inserts/updates and name/code duplicates guarded', async () => {
  await assert.rejects(manual('2026-09-13', 'morning', '07:30', '11:30', ''), { code: '22023' });
  await db.exec(`SET test.actor = '00000000-0000-0000-0000-000000000002'`);
  await assert.rejects(manual('2026-09-13'), { code: '42501' });
  await db.exec(`SET test.actor = ''`);
  await assert.rejects(manual('2026-09-13'), { code: '42501' });
  await db.exec(`SET test.actor = '00000000-0000-0000-0000-000000000001'`);
  await assert.rejects(db.exec(`INSERT INTO cham_cong(nhan_su,ngay,checkin,checkout) VALUES('Nhân viên','2026-09-08','07:30','11:30')`), { code: '23505' });
  await assert.rejects(db.exec(`UPDATE cham_cong SET checkin='07:30' WHERE ngay='2026-09-08' AND checkin='14:00'`), { code: '23505' });
  const { rows } = await db.query(`SELECT next_attendance_code() code FROM generate_series(1, 200)`);
  assert.equal(new Set(rows.map(r => r.code)).size, 200);
});
test('migration reruns without deleting attendance', async () => {
  const before = await db.query('SELECT count(*) n FROM cham_cong');
  await db.exec(migration);
  assert.deepEqual(await db.query('SELECT count(*) n FROM cham_cong'), before);
});

test('name and employee code share one daily credit', async () => {
  await db.exec(`INSERT INTO cham_cong(nhan_su,ngay,checkin,checkout) VALUES('Nhân viên','2026-09-20','07:30','11:30')`);
  await manual('2026-09-20', 'afternoon', '14:00', '19:30');
  assert.equal(await credit('2026-09-20'), 1);
});

after(() => db.close());
