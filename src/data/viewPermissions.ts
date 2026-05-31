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

/** Ghép phòng ban + vị trí: `cơ sở bắc giang::kỹ thuật viên` */
export const PERMISSION_KEY_SEP = '::';

export const DEPARTMENT_OPTIONS = ['Cơ sở Bắc Giang', 'Cơ sở Bắc Ninh'] as const;

export const POSITION_OPTIONS = ['Kỹ thuật viên', 'Quản lý', 'Admin', 'Kế toán', 'Bán hàng'] as const;

/** Quyền mặc định theo vị trí (áp dụng mọi phòng ban nếu chưa cấu hình riêng) */
export const DEFAULT_VIEW_PERMISSIONS_BY_POSITION: Record<string, ViewPermissionKey[]> = {
  'kỹ thuật viên': ['khach-hang', 'don-hang', 'cham-cong'],
};

export function normalizeDepartmentKey(phongBan: string): string {
  const v = phongBan.trim().toLowerCase();
  if (!v || v === 'tất cả' || v === 'tat ca' || v === '*') return '*';
  return v;
}

export function normalizePositionKey(viTri: string): string {
  const v = viTri.trim().toLowerCase();
  if (v.includes('kỹ thuật') || v.includes('ky thuat')) return 'kỹ thuật viên';
  return v;
}

export function buildPermissionKey(phongBan: string, viTri: string): string {
  return `${normalizeDepartmentKey(phongBan)}${PERMISSION_KEY_SEP}${normalizePositionKey(viTri)}`;
}

export function isCompositePermissionKey(key: string): boolean {
  return key.includes(PERMISSION_KEY_SEP);
}

export function parsePermissionKey(key: string): { phongBan: string; viTri: string } {
  if (!isCompositePermissionKey(key)) {
    return { phongBan: '*', viTri: normalizePositionKey(key) };
  }
  const [phongBan, viTri] = key.split(PERMISSION_KEY_SEP);
  return { phongBan: phongBan ?? '*', viTri: normalizePositionKey(viTri ?? '') };
}

export function formatPermissionKeyLabel(key: string): string {
  const { phongBan, viTri } = parsePermissionKey(key);
  const deptLabel = phongBan === '*' ? 'Tất cả phòng ban' : phongBan;
  return `${deptLabel} · ${viTri}`;
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

function resolveStoredViews(
  views: ViewPermissionKey[],
  positionKey: string
): ViewPermissionKey[] {
  if (views.length === 0 && positionKey in DEFAULT_VIEW_PERMISSIONS_BY_POSITION) {
    return DEFAULT_VIEW_PERMISSIONS_BY_POSITION[positionKey];
  }
  return views;
}

function lookupStoredViews(
  stored: Record<string, ViewPermissionKey[]>,
  key: string,
  positionKey: string
): ViewPermissionKey[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(stored, key)) return undefined;
  return resolveStoredViews(stored[key], positionKey);
}

/** null = không giới hạn (chưa cấu hình trong Cài đặt phân quyền) */
export function getAllowedViewsForUser(
  viTri: string | null | undefined,
  coSo: string | null | undefined
): ViewPermissionKey[] | null {
  const positionKey = normalizePositionKey(viTri ?? '');
  if (!positionKey) return null;

  const deptKey = normalizeDepartmentKey(coSo ?? '');
  const stored = getStoredPermissionMap();

  if (deptKey && deptKey !== '*') {
    const exact = lookupStoredViews(
      stored,
      buildPermissionKey(coSo!, viTri!),
      positionKey
    );
    if (exact !== undefined) return exact;
  }

  const wildcard = lookupStoredViews(
    stored,
    buildPermissionKey('*', viTri!),
    positionKey
  );
  if (wildcard !== undefined) return wildcard;

  const legacy = lookupStoredViews(stored, positionKey, positionKey);
  if (legacy !== undefined) return legacy;

  for (const [storedKey, views] of Object.entries(stored)) {
    if (isCompositePermissionKey(storedKey)) {
      const { phongBan, viTri: storedPos } = parsePermissionKey(storedKey);
      if (normalizePositionKey(storedPos) !== positionKey) continue;
      if (phongBan !== '*' && deptKey && phongBan !== deptKey) continue;
      return resolveStoredViews(views, positionKey);
    }
    if (normalizePositionKey(storedKey) === positionKey) {
      return resolveStoredViews(views, positionKey);
    }
  }

  if (positionKey in DEFAULT_VIEW_PERMISSIONS_BY_POSITION) {
    return DEFAULT_VIEW_PERMISSIONS_BY_POSITION[positionKey];
  }

  return null;
}

/** @deprecated Dùng getAllowedViewsForUser(viTri, coSo) */
export function getAllowedViewsForPosition(viTri: string | null | undefined): ViewPermissionKey[] | null {
  return getAllowedViewsForUser(viTri, null);
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
  isAdmin: boolean,
  coSo?: string | null
): boolean {
  if (viewKey === 'dashboard') return true;
  if (viewKey === 'khach-hang' || viewKey === 'don-hang') return true;
  if (isAdmin) return true;
  const allowed = getAllowedViewsForUser(viTri, coSo ?? null);
  if (allowed === null) return true;
  return expandsViewAccess(allowed, viewKey);
}

export function canAccessAnyView(
  viTri: string | null | undefined,
  viewKeys: ViewPermissionKey[],
  isAdmin: boolean,
  coSo?: string | null
): boolean {
  if (isAdmin) return true;
  return viewKeys.some((key) => canAccessView(viTri, key, false, coSo));
}

const NHAN_SU_VIEW_KEYS: ViewPermissionKey[] = ['nhan-su', 'cham-cong', 'nhan-su-ung-vien'];

const HOME_PATH_PRIORITY: { key: ViewPermissionKey; path: string }[] = [
  { key: 'dashboard', path: '/' },
  { key: 'khach-hang', path: '/ban-hang/khach-hang' },
  { key: 'don-hang', path: '/ban-hang/phieu-ban-hang' },
  { key: 'cham-cong', path: '/nhan-su' },
  { key: 'ban-hang', path: '/ban-hang/khach-hang' },
  { key: 'thu-chi', path: '/thu-chi' },
  { key: 'dich-vu', path: '/dich-vu' },
  { key: 'bao-cao', path: '/bao-cao/san-pham' },
  { key: 'nhan-su', path: '/nhan-su' },
  { key: 'nhan-su-ung-vien', path: '/nhan-su' },
  { key: 'tien-luong', path: '/tien-luong/bang-luong' },
  { key: 'kho-van', path: '/kho-van/xuat-nhap-kho' },
];

function isNhanSuOnlyUser(
  viTri: string | null | undefined,
  coSo?: string | null
): boolean {
  const allowed = getAllowedViewsForUser(viTri, coSo ?? null);
  if (allowed === null || allowed.length === 0) return false;
  return allowed.every((k) => k === 'dashboard' || NHAN_SU_VIEW_KEYS.includes(k));
}

export const DASHBOARD_PATH = '/';

/** Sau đăng nhập: nhân sự thuần → menu Nhân sự; còn lại → trang chủ. */
export function getLoginRedirectPath(
  viTri: string | null | undefined,
  isAdmin: boolean,
  coSo?: string | null
): string {
  if (isAdmin) return DASHBOARD_PATH;
  if (isNhanSuOnlyUser(viTri, coSo) && canAccessAnyView(viTri, NHAN_SU_VIEW_KEYS, false, coSo)) {
    return '/nhan-su';
  }
  return DASHBOARD_PATH;
}

/** Khi không có quyền trang hiện tại — về module đầu tiên được phép hoặc trang chủ. */
export function getDefaultHomePath(
  viTri: string | null | undefined,
  isAdmin: boolean,
  coSo?: string | null
): string {
  if (isAdmin) return DASHBOARD_PATH;

  for (const { key, path } of HOME_PATH_PRIORITY) {
    if (key === 'dashboard') continue;
    if (canAccessView(viTri, key, false, coSo)) return path;
  }

  return DASHBOARD_PATH;
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
