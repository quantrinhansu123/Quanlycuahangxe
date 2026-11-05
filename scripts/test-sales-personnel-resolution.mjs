import assert from 'node:assert/strict';
import { resolveSalesPersonnelTokens } from '../src/utils/salesPersonnel.ts';

const staff = [
  { id: 'staff-row-1', auth_user_id: '1835d8e4-12aa-449e-8b04-51253a1bbd32', id_nhan_su: 'NV-001', ho_ten: 'Nguyễn Văn A' },
  { id: 'staff-row-2', auth_user_id: 'e7f7ceb2-322f-4f94-9a6a-fa63e4a549c0', id_nhan_su: 'NV-002', ho_ten: 'Trần Thị B' },
];

assert.deepEqual(
  resolveSalesPersonnelTokens('1835d8e4-12aa-449e-8b04-51253a1bbd32,e7f7ceb2-322f-4f94-9a6a-fa63e4a549c0', staff)
    .map(person => person.ho_ten),
  ['Nguyễn Văn A', 'Trần Thị B'],
);
assert.deepEqual(
  resolveSalesPersonnelTokens('NV-001,Không có hồ sơ', staff).map(person => person.ho_ten),
  ['Nguyễn Văn A', 'Không có hồ sơ'],
);
console.log('PASS sales personnel UUID resolution');
