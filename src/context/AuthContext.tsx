import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  canAccessView,
  isQuanLyViTri,
  isTechnicianViTri,
  VIEW_PERMISSIONS_UPDATED_EVENT,
  VIEW_PERMISSION_STORAGE_KEY,
  type ViewPermissionKey,
} from '../data/viewPermissions';
import { fetchNhanVienById } from '../data/personnelData';
import {
  clearStoredAuth,
  getStoredDemoRole,
  getStoredNhanVien,
  setStoredNhanVien,
} from '../lib/authStorage';

/** Phiên ứng dụng (lưu local); không dùng Supabase Auth. */
export interface AppUser {
  id: string;
  email?: string | null;
  aud?: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface AppSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
  user: AppUser;
}

// Thông tin nhân viên lấy từ bảng nhan_su
export interface NhanVien {
  id: string;
  id_nhan_su: string | null;
  ho_ten: string;
  vi_tri: string;
  co_so: string;
  email: string | null;
  sdt?: string | null;
  auth_user_id: string | null;
}

interface AuthContextType {
  session: AppSession | null;
  supabaseUser: AppUser | null;
  nhanVien: NhanVien | null;
  isAdmin: boolean;
  isTechnician: boolean;
  /** false = kỹ thuật viên: không sửa chấm công / module khác (khách hàng & đơn hàng dùng canManage*) */
  canModifyData: boolean;
  /** Thêm khách hàng (admin + quản lý + kỹ thuật viên). Sửa/xóa bị chặn theo trang + RLS. */
  canManageCustomers: boolean;
  /** Thêm phiếu bán hàng (admin + quản lý + kỹ thuật viên). Sửa/xóa bị chặn theo trang + RLS. */
  canManageOrders: boolean;
  /** Xem doanh thu, tổng tiền, báo cáo tài chính — kỹ thuật viên: false */
  canViewRevenue: boolean;
  /** Dùng bộ lọc ngày/tháng/chi nhánh trên trang bán hàng & khách hàng */
  canUseDataFilters: boolean;
  isLoading: boolean;
  hasViewAccess: (viewKey: ViewPermissionKey) => boolean;
  persistLogin: (nhanVien: NhanVien) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  supabaseUser: null,
  nhanVien: null,
  isAdmin: false,
  isTechnician: false,
  canModifyData: true,
  canManageCustomers: false,
  canManageOrders: false,
  canViewRevenue: true,
  canUseDataFilters: true,
  isLoading: true,
  hasViewAccess: () => true,
  persistLogin: () => {},
  signOut: async () => {},
});

/** Khớp public.is_admin() (migration 20260428): quyền thao tác đầy đủ trên app. */
function isAdminViTri(viTri: string | null | undefined): boolean {
  const v = (viTri ?? '').toLowerCase().trim();
  if (!v) return false;
  if (v.includes('quản trị viên') || v.includes('admin')) return true;
  if (v.includes('quản lý') || v.includes('quan ly') || v === 'ql') return true;
  if (['chủ cửa hàng', 'quản lý', 'quản trị viên'].includes(v)) return true;
  if (v.includes('chủ cửa')) return true;
  return false;
}

function buildDemoNhanVien(demoRole: string): NhanVien {
  return {
    id: 'demo-nv-uuid',
    id_nhan_su: 'DEMO-001',
    ho_ten: 'Demo ' + (demoRole === 'admin' ? 'Quản trị viên' : 'Nhân viên'),
    vi_tri: demoRole === 'admin' ? 'Chủ cửa hàng' : 'Nhân viên',
    co_so: 'Cơ sở Bắc Ninh',
    email: 'demo@example.com',
    auth_user_id: 'demo-uuid',
  };
}

function sessionFromNhanVien(nhanVien: NhanVien): { session: AppSession; supabaseUser: AppUser } {
  const user: AppUser = {
    id: nhanVien.auth_user_id || nhanVien.id || 'local-uuid',
    email: nhanVien.email || 'local@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'local-nhan-su' },
    user_metadata: { ho_ten: nhanVien.ho_ten },
  };
  return {
    session: {
      access_token: 'local-token',
      refresh_token: 'local-refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user,
    },
    supabaseUser: user,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AppSession | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<AppUser | null>(null);
  const [nhanVien, setNhanVien] = useState<NhanVien | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [permVersion, setPermVersion] = useState(0);

  const applyNhanVien = useCallback((nv: NhanVien) => {
    const { session: nextSession, supabaseUser: nextUser } = sessionFromNhanVien(nv);
    setNhanVien(nv);
    setSession(nextSession);
    setSupabaseUser(nextUser);
  }, []);

  const persistLogin = useCallback(
    (nv: NhanVien) => {
      setStoredNhanVien(nv);
      applyNhanVien(nv);
    },
    [applyNhanVien]
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const demoRole = getStoredDemoRole();
      const stored = getStoredNhanVien();

      if (stored) {
        if (stored.id === 'demo-nv-uuid' || demoRole) {
          applyNhanVien(stored);
        } else {
          const fresh = await fetchNhanVienById(stored.id);
          if (cancelled) return;
          if (!fresh) {
            clearStoredAuth();
            setSession(null);
            setSupabaseUser(null);
            setNhanVien(null);
          } else {
            setStoredNhanVien(fresh);
            applyNhanVien(fresh);
          }
        }
      } else if (demoRole) {
        applyNhanVien(buildDemoNhanVien(demoRole));
      }

      if (!cancelled) setIsLoading(false);
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [applyNhanVien]);

  /** Định kỳ kiểm tra tài khoản còn tồn tại (sau khi admin xóa nhân sự). */
  useEffect(() => {
    if (!nhanVien?.id || nhanVien.id === 'demo-nv-uuid') return;

    let validating = false;
    const validateSession = async () => {
      if (validating || !nhanVien?.id) return;
      validating = true;
      try {
        const fresh = await fetchNhanVienById(nhanVien.id);
        if (!fresh) {
          clearStoredAuth();
          setSession(null);
          setSupabaseUser(null);
          setNhanVien(null);
          window.location.assign('/login?reason=account_deleted');
          return;
        }
        if (
          fresh.ho_ten !== nhanVien.ho_ten ||
          fresh.vi_tri !== nhanVien.vi_tri ||
          fresh.co_so !== nhanVien.co_so
        ) {
          setStoredNhanVien(fresh);
          applyNhanVien(fresh);
        }
      } finally {
        validating = false;
      }
    };

    const onFocus = () => void validateSession();
    const interval = window.setInterval(() => void validateSession(), 3 * 60_000);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [nhanVien?.id, nhanVien?.ho_ten, nhanVien?.vi_tri, nhanVien?.co_so, applyNhanVien]);

  useEffect(() => {
    const refresh = () => setPermVersion((v) => v + 1);
    window.addEventListener(VIEW_PERMISSIONS_UPDATED_EVENT, refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === VIEW_PERMISSION_STORAGE_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(VIEW_PERMISSIONS_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const signOut = async () => {
    clearStoredAuth();
    setSession(null);
    setSupabaseUser(null);
    setNhanVien(null);
    window.location.assign('/login');
  };

  const isAdmin = nhanVien ? isAdminViTri(nhanVien.vi_tri) : false;
  const isTechnician = nhanVien ? isTechnicianViTri(nhanVien.vi_tri) : false;
  const isQuanLy = nhanVien ? isQuanLyViTri(nhanVien.vi_tri) : false;
  const canModifyData = !isTechnician;
  const canManageCustomers = isAdmin || isTechnician || isQuanLy;
  const canManageOrders = isAdmin || isTechnician || isQuanLy;
  const canViewRevenue = !isTechnician;
  const canUseDataFilters = !isTechnician;

  const hasViewAccess = useCallback(
    (viewKey: ViewPermissionKey): boolean =>
      canAccessView(nhanVien?.vi_tri, viewKey, isAdmin, nhanVien?.co_so),
    [nhanVien?.vi_tri, nhanVien?.co_so, isAdmin, permVersion]
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        supabaseUser,
        nhanVien,
        isAdmin,
        isTechnician,
        canModifyData,
        canManageCustomers,
        canManageOrders,
        canViewRevenue,
        canUseDataFilters,
        isLoading,
        hasViewAccess,
        persistLogin,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
