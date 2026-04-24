export type ViewPermissionKey =
  | 'dashboard'
  | 'ban-hang'
  | 'thu-chi'
  | 'dich-vu'
  | 'bao-cao'
  | 'nhan-su'
  | 'nhan-su-ung-vien'
  | 'cham-cong'
  | 'kho-van'
  | 'tien-luong'
  | 'tien-luong-cau-hinh'
  | 'cai-dat-phan-quyen';

export interface ViewPermissionOption {
  key: ViewPermissionKey;
  label: string;
}

export const VIEW_PERMISSION_OPTIONS: ViewPermissionOption[] = [
  { key: 'dashboard', label: 'Trang chủ' },
  { key: 'ban-hang', label: 'Bán hàng' },
  { key: 'thu-chi', label: 'Thu chi' },
  { key: 'dich-vu', label: 'Dịch vụ' },
  { key: 'bao-cao', label: 'Báo cáo' },
  { key: 'nhan-su', label: 'Nhân sự' },
  { key: 'nhan-su-ung-vien', label: 'Nhân sự - Ứng viên' },
  { key: 'cham-cong', label: 'Chấm công' },
  { key: 'kho-van', label: 'Kho vận' },
  { key: 'tien-luong', label: 'Tiền lương' },
  { key: 'tien-luong-cau-hinh', label: 'Tiền lương - Cấu hình' },
  { key: 'cai-dat-phan-quyen', label: 'Cài đặt phân quyền' },
];

export const VIEW_PERMISSION_STORAGE_KEY = 'view_permissions_by_position';
