import assert from 'node:assert/strict';
import { test } from 'node:test';
import { salesAmount } from '../src/lib/salesAmount.ts';
import { findExistingCustomer, normalizePlate } from '../src/lib/customerIdentity.ts';
import { digitsOnly, samePhoneCore } from '../src/lib/phoneUtils.ts';
import { branchKey, branchLabel, getBranchOptions, setBranchOptions, subscribeBranches } from '../src/lib/branchCatalog.ts';
import { getErrorDetails } from '../src/lib/errorDetails.ts';

test('frontend amount respects server amount and valid zero/discount detail', () => {
  assert.equal(salesAmount({ resolved_amount: 0, tong_tien: 100 }), 0);
  assert.equal(salesAmount({ the_ban_hang_ct: [{ thanh_tien: 80, gia_ban: 100, so_luong: 1 }] }), 80);
  assert.equal(salesAmount({ the_ban_hang_ct: [{ thanh_tien: 0, gia_ban: 100, so_luong: 1 }], tong_tien: 100 }), 0);
  assert.equal(salesAmount({ the_ban_hang_ct: [{ gia_ban: 100, so_luong: 0 }] }), 0);
  assert.equal(salesAmount({ tong_tien: 123 }), 123);
  assert.equal(salesAmount({ dich_vu: { gia_ban: 345 } }), 345);
});

test('error messages preserve Supabase plain objects and ordinary Error instances', () => {
  assert.equal(getErrorDetails({ code: '23505', message: 'Trùng dữ liệu' }).message, 'Trùng dữ liệu');
  assert.equal(getErrorDetails({ code: '42501' }).code, '42501');
  assert.equal(getErrorDetails(new Error('Mất kết nối')).message, 'Mất kết nối');
  assert.deepEqual(getErrorDetails(null), {});
  assert.equal(getErrorDetails({ message: { unexpected: true } }).message, undefined);
});
test('legacy numeric phone and normalized plates', () => {
  assert.equal(digitsOnly(392251537), '392251537');
  assert.ok(samePhoneCore(392251537, '+84 392.251.537'));
  assert.equal(normalizePlate(' 27az-04620 '), normalizePlate('27AZ04620'));
});
test('Excel identity prioritizes ID; phone alone never overwrites another vehicle', () => {
  const rows = [
    { id: 'a', ma_khach_hang: 'KH1', so_dien_thoai: '0392251537', bien_so_xe: '27AZ-04620' },
    { id: 'b', ma_khach_hang: 'KH2', so_dien_thoai: '0392251537', bien_so_xe: '27AZ-99999' },
  ];
  assert.equal(findExistingCustomer(rows, { ma_khach_hang: 'kh1' })?.id, 'a');
  assert.equal(findExistingCustomer(rows, { so_dien_thoai: '+84 392251537', bien_so_xe: '27az04620' })?.id, 'a');
  assert.equal(findExistingCustomer(rows, { so_dien_thoai: '0392251537', bien_so_xe: '27AZ-33333' }), undefined);
  assert.equal(findExistingCustomer(rows, { so_dien_thoai: '0392251537' }), undefined);
  assert.throws(() => findExistingCustomer([...rows, { ...rows[0], id: 'c' }], { so_dien_thoai: '0392251537', bien_so_xe: '27az04620' }));
});

test('branch catalog publishes new names and does not collapse a numbered branch', () => {
  assert.equal(branchKey('  Cơ sở Hải   Dương '), branchKey('hai duong'));
  assert.notEqual(branchKey('Bắc Ninh 2'), branchKey('Bắc Ninh'));
  assert.equal(branchLabel(' Hải Dương '), 'Cơ sở Hải Dương');
  let updates = 0;
  const unsubscribe = subscribeBranches(() => updates++);
  setBranchOptions(['Cơ sở Bắc Ninh', 'Cơ sở Hải Dương', 'Cơ sở Bắc Ninh 2']);
  assert.ok(getBranchOptions().includes('Cơ sở Hải Dương'));
  assert.equal(getBranchOptions().length, 3);
  assert.equal(updates, 1);
  unsubscribe();
});
