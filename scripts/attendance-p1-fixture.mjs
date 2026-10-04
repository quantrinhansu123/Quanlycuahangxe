export const personnel = [
  { id: '00000000-0000-0000-0000-000000000001', id_nhan_su: 'NV1', ho_ten: 'Nguyễn An', hinh_anh: null, co_so: 'A', vi_tri: 'quản lý' },
  { id: '00000000-0000-0000-0000-000000000002', id_nhan_su: 'NV2', ho_ten: 'Trần Bình', hinh_anh: null, co_so: 'A', vi_tri: 'kỹ thuật viên' },
  { id: '00000000-0000-0000-0000-000000000003', id_nhan_su: 'NV3', ho_ten: 'Không log', hinh_anh: null, co_so: 'B', vi_tri: 'kỹ thuật viên' },
];
export const columns = 'id,id_cham_cong,nhan_su,ngay,checkin,checkout,vi_tri,created_at,ghi_chu,bo_sung_boi,bo_sung_luc'.split(',');
export const compact = row => Object.fromEntries(columns.map(key => [key, row[key]]));
export function fixture() {
  const times = [
    ['08:30', '12:00'], ['13:00', '17:30'], ['08:35', '20:02'],
    ['08:35', '12:00'], ['13:00', '20:02'], [null, null],
    ['08:30', null], [null, '20:00'], ['09:10', '17:10'],
    ['08:30', '10:00'], ['10:00', '12:00'], ['13:00', '17:30'],
  ];
  return Array.from({ length: 34 }, (_, i) => ({
    id: `00000000-0000-0000-0001-${String(i + 1).padStart(12, '0')}`, id_cham_cong: `CC-${i + 1}`,
    nhan_su: i < 12 ? [personnel[0].ho_ten, 'NV1', personnel[0].id][i % 3] : ['NV2', personnel[1].ho_ten][i % 2],
    ngay: `2026-09-${String(Math.floor(i / 2) + 1).padStart(2, '0')}`,
    checkin: times[i % times.length][0], checkout: times[i % times.length][1], vi_tri: 'Cơ sở A',
    created_at: `2026-09-01T00:00:${String(i).padStart(2, '0')}Z`, ghi_chu: i === 0 ? 'Quên chấm công' : null,
    bo_sung_boi: i === 0 ? personnel[0].id : null, bo_sung_luc: i === 0 ? '2026-09-02T00:00:00Z' : null,
    anh: i === 0 ? 'data:image/png;base64,iVBORw0KGgo=' : null,
    lich_su_sua: i === 0 ? [{ thoi_gian: '01/09/2026 08:30', nguoi_sua: 'Admin', thay_doi: [{ truong: 'Giờ vào', gia_tri_cu: '08:00', gia_tri_moi: '08:30' }] }] : [],
  }));
}
