import type { NhanVien } from '../context/AuthContext';

export const AUTH_NHAN_VIEN_KEY = 'local_nhan_vien';
export const AUTH_DEMO_ROLE_KEY = 'demo_role';

function parseNhanVien(raw: string): NhanVien | null {
  try {
    return JSON.parse(raw) as NhanVien;
  } catch {
    return null;
  }
}

/** Đọc phiên đăng nhập — ưu tiên localStorage (giữ sau khi đóng trình duyệt). */
export function getStoredNhanVien(): NhanVien | null {
  if (typeof window === 'undefined') return null;

  const fromLocal = localStorage.getItem(AUTH_NHAN_VIEN_KEY);
  if (fromLocal) {
    const parsed = parseNhanVien(fromLocal);
    if (parsed) return parsed;
    localStorage.removeItem(AUTH_NHAN_VIEN_KEY);
  }

  const fromSession = sessionStorage.getItem(AUTH_NHAN_VIEN_KEY);
  if (fromSession) {
    const parsed = parseNhanVien(fromSession);
    if (parsed) {
      localStorage.setItem(AUTH_NHAN_VIEN_KEY, fromSession);
      sessionStorage.removeItem(AUTH_NHAN_VIEN_KEY);
      return parsed;
    }
    sessionStorage.removeItem(AUTH_NHAN_VIEN_KEY);
  }

  return null;
}

export function setStoredNhanVien(nhanVien: NhanVien | Record<string, unknown>): void {
  const json = JSON.stringify(nhanVien);
  localStorage.setItem(AUTH_NHAN_VIEN_KEY, json);
}

export function getStoredDemoRole(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_DEMO_ROLE_KEY) || sessionStorage.getItem(AUTH_DEMO_ROLE_KEY);
}

export function clearStoredAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_NHAN_VIEN_KEY);
  localStorage.removeItem(AUTH_DEMO_ROLE_KEY);
  sessionStorage.removeItem(AUTH_NHAN_VIEN_KEY);
  sessionStorage.removeItem(AUTH_DEMO_ROLE_KEY);
}
