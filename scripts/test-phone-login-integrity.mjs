import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import ts from 'typescript';

test('phone login resolves one identity; password changes invalidate old credentials and sessions', async t => {
  const db = new PGlite({ extensions: { pgcrypto } });
  t.after(() => db.close());
  const primary = '11111111-1111-4111-8111-111111111111';
  const duplicate = '22222222-2222-4222-8222-222222222222';
  const other = '33333333-3333-4333-8333-333333333333';
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE nhan_su(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_nhan_su text,ho_ten text,vi_tri text,co_so text,email text,sdt text,
      auth_user_id uuid,password text);
    INSERT INTO nhan_su(id,ho_ten,sdt,password) VALUES
      ('${primary}','Current fixture','0912345678','new-fixture'),
      ('${duplicate}','Old fixture','0912345678','old-fixture'),
      ('${other}','Other fixture','0987654321','other-fixture');
  `);
  const baseline = fs.readFileSync('supabase/migrations/202608180001_payroll_confirmation_workflow.sql', 'utf8');
  await db.exec(baseline.slice(0, baseline.indexOf('CREATE OR REPLACE FUNCTION public.is_app_payroll_manager()')));
  const login = async (phone, password) => (await db.query('SELECT * FROM login_with_phone($1,$2)', [phone, password])).rows;
  const probe = async token => {
    await db.query("SELECT set_config('request.headers',$1,false)", [JSON.stringify({ 'x-app-session': token })]);
    return (await db.query('SELECT current_app_nhan_su_uuid() AS id')).rows[0].id;
  };
  const update = (id, password) => db.query('UPDATE nhan_su SET password=$2 WHERE id=$1', [id, password]);
  const oldPrimaryToken = (await login('0912345678', 'new-fixture'))[0].session_token;
  const oldDuplicateToken = (await login('0912345678', 'old-fixture'))[0].session_token;
  const otherToken = (await login('0987654321', 'other-fixture'))[0].session_token;

  const migration = fs.readFileSync('supabase/migrations/202610210001_phone_login_integrity.sql', 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(fs.readFileSync('supabase/migrations/202610310005_login_with_phone_no_lock_wait.sql', 'utf8'));
  const initialPersonnel = (await db.query('SELECT * FROM nhan_su ORDER BY id')).rows;

  await t.test('reproduces both legacy passwords, then blocks ambiguous login for every format', async () => {
    for (const phone of ['0912345678', '912345678', '+84 912 345 678', '0084912345678']) {
      for (const password of ['new-fixture', 'old-fixture', 'wrong-fixture']) {
        await assert.rejects(login(phone, password), e => e.code === '21000' && /nhiều hồ sơ/.test(e.message));
      }
    }
    assert.deepEqual((await db.query('SELECT * FROM nhan_su ORDER BY id')).rows, initialPersonnel,
      'migration and failed logins do not merge or alter personnel');
    assert.equal(await probe(oldPrimaryToken), primary, 'migration preserves existing sessions for review');
  });

  await t.test('new duplicates and ambiguous password resets are rejected atomically', async () => {
    for (const phone of ['0987654321', '987654321', '+84 987 654 321']) {
      await assert.rejects(db.query('INSERT INTO nhan_su(sdt,password) VALUES($1,$2)', [phone, 'fixture']), e => e.code === '23505');
      await assert.rejects(db.query('UPDATE nhan_su SET sdt=$2 WHERE id=$1', [primary, phone]), e => e.code === '23505');
    }
    await assert.rejects(update(primary, 'reset-fixture'), e => e.code === '23505');
    await db.query('UPDATE nhan_su SET ho_ten=$2,sdt=sdt,password=password WHERE id=$1', [primary, 'Renamed fixture']);
    assert.equal(await probe(oldPrimaryToken), primary, 'ordinary edits preserve sessions');
    assert.equal((await db.query('SELECT count(*) FROM nhan_su')).rows[0].count, 3);
  });

  await t.test('explicitly disabling a duplicate in the fixture preserves its personnel row', async () => {
    await db.query('UPDATE nhan_su SET password=NULL WHERE id=$1', [duplicate]);
    assert.equal(await probe(oldDuplicateToken), null);
    assert.equal((await db.query('SELECT count(*) FROM nhan_su')).rows[0].count, 3);
    assert.equal((await db.query('SELECT sdt FROM nhan_su WHERE id=$1', [duplicate])).rows[0].sdt, '0912345678',
      'disabling login keeps the contact phone and historical personnel record');
    for (const phone of ['0912345678', '912345678', '+84 912 345 678', '0084912345678']) {
      assert.equal((await login(phone, 'new-fixture'))[0].id, primary);
      assert.deepEqual(await login(phone, 'old-fixture'), []);
    }
    await assert.rejects(update(duplicate, 'restored-fixture'), e => e.code === '23505',
      'a disabled profile cannot re-enable a second password on the same phone');
    await db.query("INSERT INTO app_sessions(nhan_su_id,token_hash) VALUES($1,encode(digest('late-fixture-token','sha256'),'hex'))", [duplicate]);
    assert.equal(await probe('late-fixture-token'), null, 'a late old-RPC session cannot restore a disabled login');
  });

  await t.test('repeated password changes reject old passwords and revoke every prior session', async () => {
    for (const [previous, next] of [['new-fixture', 'second-fixture'], ['second-fixture', 'third-fixture']]) {
      const tokens = [(await login('0912345678', previous))[0].session_token,
        (await login('0912345678', previous))[0].session_token];
      await update(primary, next);
      assert.deepEqual(await login('0912345678', previous), []);
      for (const token of tokens) assert.equal(await probe(token), null);
      const fresh = (await login('0912345678', next))[0];
      assert.equal(await probe(fresh.session_token), primary);
      assert.equal(await probe(otherToken), other, 'other accounts remain signed in');
    }
    assert.equal(await probe(oldPrimaryToken), null);
  });

  await t.test('format-only edits keep sessions; phone changes and empty passwords invalidate them', async () => {
    const token = (await login('0912345678', 'third-fixture'))[0].session_token;
    await db.query('UPDATE nhan_su SET sdt=$2 WHERE id=$1', [primary, '+84 912 345 678']);
    assert.equal(await probe(token), primary);
    await db.query('UPDATE nhan_su SET sdt=$2 WHERE id=$1', [primary, '0900000001']);
    assert.equal(await probe(token), null);
    assert.deepEqual(await login('0912345678', 'third-fixture'), []);
    assert.equal((await login('0900000001', 'third-fixture'))[0].id, primary);
    await update(primary, '');
    for (const [phone, password] of [['0900000001', ''], ['', 'fixture'], [null, 'fixture'], ['0000000000', 'fixture']]) {
      assert.deepEqual(await login(phone, password), []);
    }
  });

  await t.test('anonymous clients can call the RPC without reading session storage', async () => {
    await db.exec('SET ROLE anon');
    try {
      const fresh = (await login('0987654321', 'other-fixture'))[0];
      assert.equal(fresh.id, other);
      assert.equal(await probe(fresh.session_token), other);
      await assert.rejects(db.query('SELECT * FROM app_sessions'), e => e.code === '42501');
    } finally { await db.exec('RESET ROLE'); }
  });
});

test('personnel save never retries without phone/password or logs the password payload', async () => {
  let missingColumn = 'password';
  const calls = [], exported = {}, logs = [];
  const supabase = { from: () => ({ upsert(payload) {
    calls.push(payload);
    return { select: () => ({ single: async () => calls.length === 1
      ? { data: null, error: { code: 'PGRST204', message: `Could not find the '${missingColumn}' column of 'nhan_su' in the schema cache` } }
      : { data: payload, error: null } }) };
  } }) };
  new Function('require', 'exports', ts.transpileModule(fs.readFileSync('src/data/personnelData.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(name => name === '../lib/supabase' ? { supabase } : {}, exported);
  const originalError = console.error, originalWarn = console.warn;
  console.error = (...args) => logs.push(args);
  console.warn = (...args) => logs.push(args);
  try {
    for (const column of ['password', 'sdt', 'ghi_chu_noi_bo']) {
      calls.length = 0; missingColumn = column;
      await assert.rejects(exported.upsertPersonnel({ [column]: 'private-fixture-password' }));
      assert.equal(calls.length, 1, `${column} cannot be silently dropped`);
    }
    calls.length = 0; missingColumn = 'luong_co_ban';
    assert.deepEqual(await exported.upsertPersonnel({ ho_ten: 'Fixture', luong_co_ban: 100 }), { ho_ten: 'Fixture' });
    assert.equal(calls.length, 2, 'existing non-credential compatibility fallback still works');
    assert.ok(!JSON.stringify(logs).includes('private-fixture-password'));
  } finally { console.error = originalError; console.warn = originalWarn; }
});
