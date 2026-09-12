import assert from 'node:assert/strict';
import { test } from 'node:test';
import { salesAmount } from '../src/lib/salesAmount.ts';
import { findExistingCustomer, needsCustomerIdentityCheck, normalizePlate } from '../src/lib/customerIdentity.ts';
import { digitsOnly, samePhoneCore } from '../src/lib/phoneUtils.ts';
import { branchKey, branchLabel, getBranchOptions, setBranchOptions, subscribeBranches } from '../src/lib/branchCatalog.ts';
import { getErrorDetails, getReadErrorMessage, isAbortError } from '../src/lib/errorDetails.ts';
import { readRequest } from '../src/lib/readRequest.ts';
import {
  assertSalesDateNotFuture,
  parseExcelDateValue,
} from '../src/utils/datetimeFormat.ts';
import {
  buildShortNumericCustomerSearchOrConditions,
  buildTargetedCustomerSearchOrConditions,
  buildTargetedSalesSearchOrConditions,
  isShortNumericSearch,
  isPlateLikeSearch,
  isTargetedVehicleSearch,
  normalizeVehicleSearch,
  targetedCustomerRowMatches,
  vehicleNumericSuffix,
} from '../src/lib/shortNumericSearch.ts';

test('short numeric search uses only customer code and plate fields', () => {
  assert.equal(isShortNumericSearch('37435'), true);
  assert.equal(isShortNumericSearch(' 37435 '), true);
  assert.equal(isShortNumericSearch('123'), false);
  assert.equal(isShortNumericSearch('12345678'), false);
  assert.equal(isShortNumericSearch('37A35'), false);
  assert.deepEqual(buildShortNumericCustomerSearchOrConditions('37435'), [
    'ma_khach_hang.ilike.%37435%',
    'bien_so_xe.ilike.%37435%',
  ]);
});

test('sales dates correct ambiguous Excel month/day and reject future dates', () => {
  const importOptions = { maxDate: '2026-09-12', preferNonFutureAmbiguous: true };
  assert.equal(parseExcelDateValue('7/12/2026', importOptions), '2026-07-12');
  assert.equal(parseExcelDateValue('6/12/2026', importOptions), '2026-06-12');
  assert.equal(parseExcelDateValue('12/7/2026', importOptions), '2026-07-12');
  assert.equal(parseExcelDateValue('13/7/2026', importOptions), '2026-07-13');
  assert.equal(parseExcelDateValue('7/13/2026', importOptions), '2026-07-13');
  assert.equal(parseExcelDateValue('7/12/2026'), '2026-12-07');
  assert.throws(() => parseExcelDateValue('31/2/2026'), /không hợp lệ/);
  assert.throws(() => parseExcelDateValue('13/12/2026', importOptions), /không được lớn hơn/);
  assert.doesNotThrow(() => assertSalesDateNotFuture('2026-09-12', '2026-09-12'));
  assert.throws(
    () => assertSalesDateNotFuture('2026-09-13', '2026-09-12'),
    /không được lớn hơn/
  );
});

test('plate-like searches normalize separators and stay on plate/code fields', () => {
  assert.equal(isPlateLikeSearch('99d1-37435'), true);
  assert.equal(isPlateLikeSearch('99D1 37435'), true);
  assert.equal(isPlateLikeSearch('99D1 374.35'), true);
  assert.equal(isPlateLikeSearch('29A-12345'), true);
  assert.equal(isTargetedVehicleSearch('99d137435'), true);
  assert.equal(vehicleNumericSuffix('99D1 374.35'), '37435');
  assert.equal(isPlateLikeSearch('0988123456'), false);
  assert.equal(isTargetedVehicleSearch('Nguyễn Văn Hưng'), false);
  assert.equal(isTargetedVehicleSearch('37435%'), false);
  assert.equal(isTargetedVehicleSearch('99d1,37435'), false);
  assert.deepEqual(buildTargetedCustomerSearchOrConditions('37435%'), []);
  assert.deepEqual(buildTargetedCustomerSearchOrConditions('99d1,37435'), []);
  assert.equal(normalizeVehicleSearch(' 99D1-37435 '), '99d137435');
  assert.equal(targetedCustomerRowMatches({ bien_so_xe: '99D1-37435' }, '99d1 37435'), true);
  assert.equal(targetedCustomerRowMatches({ bien_so_xe: '99D1-00001' }, '37435'), false);
  assert.deepEqual(buildTargetedCustomerSearchOrConditions('99d1-37435'), [
    'bien_so_xe.ilike.%99d137435%',
    'bien_so_xe.ilike.%37435%',
    'ma_khach_hang.ilike.%99d137435%',
    'ma_khach_hang.ilike.%37435%',
  ]);
  assert.deepEqual(buildTargetedSalesSearchOrConditions('99D1 374.35'), [
    'id_bh.ilike.%99d137435%,khach_hang_id.ilike.%99d137435%',
    'id_bh.ilike.%37435%,khach_hang_id.ilike.%37435%',
  ]);
});

test('read timeout aborts the underlying request and reports the slow-server message', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  const request = readRequest('test_read_timeout', signal => new Promise(resolve => {
    signal.addEventListener('abort', () => { aborted = true; resolve({ error: 'aborted' }); });
  }));
  const rejection = assert.rejects(request, /Máy chủ phản hồi chậm\. Vui lòng thử lại\./);
  t.mock.timers.tick(8000);
  await rejection;
  assert.equal(aborted, true);
});

test('caller cancellation aborts a superseded read', async () => {
  const controller = new AbortController();
  const request = readRequest('test_read_cancel', signal => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve('cancelled'));
  }), controller.signal);
  controller.abort();
  assert.equal(await request, 'cancelled');
});

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

test('read errors classify abort, timeout, network and fallback consistently', () => {
  const abort = new Error('The operation was aborted');
  abort.name = 'AbortError';
  assert.equal(isAbortError(abort), true);
  assert.equal(isAbortError({ name: 'AbortError', message: 'cancelled' }), true);
  assert.equal(isAbortError({ code: '20', message: 'aborted' }), true);

  const fallback = 'Không tải được danh sách.';
  assert.equal(getReadErrorMessage({ code: '57014', message: 'canceling statement due to statement timeout' }, fallback), 'Máy chủ phản hồi chậm. Vui lòng thử lại.');
  assert.equal(getReadErrorMessage({ code: 57014, details: 'statement timeout' }, fallback), 'Máy chủ phản hồi chậm. Vui lòng thử lại.');
  assert.equal(getReadErrorMessage({ message: 'statement timeout' }, fallback), 'Máy chủ phản hồi chậm. Vui lòng thử lại.');
  assert.equal(getReadErrorMessage({ message: 'Failed to fetch' }, fallback), 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  assert.equal(getReadErrorMessage({ message: 'Network error' }, fallback), 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  assert.equal(getReadErrorMessage(new TypeError('Network request failed'), fallback), 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  assert.equal(getReadErrorMessage({ code: '42501', message: 'permission denied' }, fallback), 'permission denied');
  assert.equal(getReadErrorMessage({}, fallback), fallback);
});
test('legacy numeric phone and normalized plates', () => {
  assert.equal(digitsOnly(392251537), '392251537');
  assert.ok(samePhoneCore(392251537, '+84 392.251.537'));
  assert.equal(normalizePlate(' 27az-04620 '), normalizePlate('27AZ04620'));
});
test('editing a selected legacy customer keeps its identity across formatting changes', () => {
  const selected = { id: 'selected-id', ma_khach_hang: '0a5e8f54', bien_so_xe: '98B3-54497', so_dien_thoai: '989824193' };
  assert.equal(needsCustomerIdentityCheck(selected, { ...selected }), false);
  assert.equal(needsCustomerIdentityCheck(selected, { ...selected, bien_so_xe: ' 98b3 54497 ', so_dien_thoai: '+84 989.824.193' }), false);
  assert.equal(needsCustomerIdentityCheck(selected, { ...selected, bien_so_xe: '98B3-99999' }), true);
  assert.equal(needsCustomerIdentityCheck(selected, { ...selected, so_dien_thoai: '0989123456' }), true);
  assert.equal(needsCustomerIdentityCheck(null, selected), true);
  assert.equal(needsCustomerIdentityCheck({ ma_khach_hang: '0a5e8f54' }, selected), true);
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
