export type ViewPermissionKey =
  | 'dashboard'
  | 'ban-hang'
  | 'khach-hang'
  | 'don-hang'
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
  { key: 'ban-hang', label: 'Bán hàng (toàn module)' },
  { key: 'khach-hang', label: 'Khách hàng' },
  { key: 'don-hang', label: 'Đơn hàng / Phiếu bán hàng' },
  { key: 'thu-chi', label: 'Thu chi' },
  { key: 'dich-vu', label: 'Dịch vụ' },
  { key: 'bao-cao', label: 'Báo cáo' },
  { key: 'nhan-su', label: 'Nhân sự (toàn module)' },
  { key: 'nhan-su-ung-vien', label: 'Nhân sự - Ứng viên' },
  { key: 'cham-cong', label: 'Chấm công' },
  { key: 'kho-van', label: 'Kho vận' },
  { key: 'tien-luong', label: 'Tiền lương' },
  { key: 'tien-luong-cau-hinh', label: 'Tiền lương - Cấu hình' },
  { key: 'cai-dat-phan-quyen', label: 'Cài đặt phân quyền' },
];

export const VIEW_PERMISSION_STORAGE_KEY = 'view_permissions_by_position';

/** Quyền mặc định khi chưa cấu hình trong Cài đặt phân quyền */
export const DEFAULT_VIEW_PERMISSIONS_BY_POSITION: Record<string, ViewPermissionKey[]> = {
  'kỹ thuật viên': ['khach-hang', 'don-hang', 'cham-cong'],
};

export function normalizePositionKey(viTri: string): string {
  const v = viTri.trim().toLowerCase();
  if (v.includes('kỹ thuật') || v.includes('ky thuat')) return 'kỹ thuật viên';
  return v;
}

export function isTechnicianViTri(viTri: string | null | undefined): boolean {
  return normalizePositionKey(viTri ?? '') === 'kỹ thuật viên';
}

export function getStoredPermissionMap(): Record<string, ViewPermissionKey[]> {
  try {
    const raw = localStorage.getItem(VIEW_PERMISSION_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ViewPermissionKey[]>;
  } catch {
    return {};
  }
}

/** null = không giới hạn (vị trí chưa cấu hình) */
export function getAllowedViewsForPosition(viTri: string | null | undefined): ViewPermissionKey[] | null {
  const positionKey = normalizePositionKey(viTri ?? '');
  if (!positionKey) return null;

  const stored = getStoredPermissionMap();
  if (Object.prototype.hasOwnProperty.call(stored, positionKey)) {
    return stored[positionKey];
  }
  for (const [storedKey, views] of Object.entries(stored)) {
    if (normalizePositionKey(storedKey) === positionKey) return views;
  }

  if (positionKey in DEFAULT_VIEW_PERMISSIONS_BY_POSITION) {
    return DEFAULT_VIEW_PERMISSIONS_BY_POSITION[positionKey];
  }

  return null;
}

export function expandsViewAccess(
  allowed: ViewPermissionKey[],
  viewKey: ViewPermissionKey
): boolean {
  if (allowed.includes(viewKey)) return true;
  if ((viewKey === 'khach-hang' || viewKey === 'don-hang') && allowed.includes('ban-hang')) {
    return true;
  }
  if (viewKey === 'cham-cong' && allowed.includes('nhan-su')) return true;
  if (viewKey === 'nhan-su-ung-vien' && allowed.includes('nhan-su')) return true;
  if (viewKey === 'nhan-su' && allowed.includes('nhan-su')) return true;
  return false;
}

export function canAccessView(
  viTri: string | null | undefined,
  viewKey: ViewPermissionKey,
  isAdmin: boolean
): boolean {
  // Trang chủ luôn cho phép với user đã đăng nhập.
  if (viewKey === 'dashboard') return true;
  if (isAdmin) return true;
  const allowed = getAllowedViewsForPosition(viTri);
  if (allowed === null) return true;
  return expandsViewAccess(allowed, viewKey);
}

export function canAccessAnyView(
  viTri: string | null | undefined,
  viewKeys: ViewPermissionKey[],
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  return viewKeys.some((key) => canAccessView(viTri, key, false));
}

const HOME_PATH_PRIORITY: { key: ViewPermissionKey; path: string }[] = [
  { key: 'dashboard', path: '/' },
  { key: 'khach-hang', path: '/ban-hang/khach-hang' },
  { key: 'don-hang', path: '/ban-hang/phieu-ban-hang' },
  { key: 'cham-cong', path: '/nhan-su/bang-cham-cong' },
  { key: 'ban-hang', path: '/ban-hang/khach-hang' },
  { key: 'thu-chi', path: '/thu-chi' },
  { key: 'dich-vu', path: '/dich-vu' },
  { key: 'bao-cao', path: '/bao-cao/san-pham' },
  { key: 'nhan-su', path: '/nhan-su/danh-sach' },
  { key: 'tien-luong', path: '/tien-luong/bang-luong' },
  { key: 'kho-van', path: '/kho-van/xuat-nhap-kho' },
];

export function getDefaultHomePath(viTri: string | null | undefined, isAdmin: boolean): string {
  if (isAdmin) return '/';
  for (const { key, path } of HOME_PATH_PRIORITY) {
    if (canAccessView(viTri, key, false)) return path;
  }
  return '/';
}

/** Map route path → permission key (dùng chung menu/module/topbar). */
export function resolveViewKeyByPath(path?: string): ViewPermissionKey | undefined {
  if (!path) return undefined;
  if (path.includes('/ban-hang/khach-hang')) return 'khach-hang';
  if (path.includes('/ban-hang/phieu-ban-hang')) return 'don-hang';
  if (path.includes('/nhan-su/bang-cham-cong') || path.startsWith('/cham-cong')) return 'cham-cong';
  // Nhập chấm công thủ công cùng nhóm quyền "Chấm công", không phải "Nhân sự (toàn module)".
  if (path.includes('/nhan-su/them-cham-cong')) return 'cham-cong';
  if (path.includes('/nhan-su/danh-sach')) return 'nhan-su';
  if (path.includes('/nhan-su/ung-vien')) return 'nhan-su-ung-vien';
  if (path.startsWith('/thu-chi')) return 'thu-chi';
  if (path.startsWith('/dich-vu')) return 'dich-vu';
  if (path.startsWith('/bao-cao')) return 'bao-cao';
  if (path.startsWith('/kho-van')) return 'kho-van';
  if (path.startsWith('/tien-luong/thong-so') || path.startsWith('/tien-luong/thanh-phan') || path.startsWith('/tien-luong/chinh-sach')) {
    return 'tien-luong-cau-hinh';
  }
  if (path.startsWith('/tien-luong')) return 'tien-luong';
  return undefined;
}

export const VIEW_PERMISSIONS_UPDATED_EVENT = 'view-permissions-updated';
