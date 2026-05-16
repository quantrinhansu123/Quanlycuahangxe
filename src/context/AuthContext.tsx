import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  canAccessView,
  isTechnicianViTri,
  type ViewPermissionKey,
} from '../data/viewPermissions';
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
  /** false = kỹ thuật viên (chỉ xem, không sửa/xóa) */
  canModifyData: boolean;
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
    const demoRole = getStoredDemoRole();
    const stored = getStoredNhanVien();

    if (stored) {
      applyNhanVien(stored);
    } else if (demoRole) {
      applyNhanVien(buildDemoNhanVien(demoRole));
    }

    setIsLoading(false);
  }, [applyNhanVien]);

  const signOut = async () => {
    clearStoredAuth();
    setSession(null);
    setSupabaseUser(null);
    setNhanVien(null);
    window.location.assign('/login');
  };

  const isAdmin = nhanVien ? isAdminViTri(nhanVien.vi_tri) : false;
  const isTechnician = nhanVien ? isTechnicianViTri(nhanVien.vi_tri) : false;
  const canModifyData = !isTechnician;

  const hasViewAccess = (viewKey: ViewPermissionKey): boolean =>
    canAccessView(nhanVien?.vi_tri, viewKey, isAdmin);

  return (
    <AuthContext.Provider
      value={{
        session,
        supabaseUser,
        nhanVien,
        isAdmin,
        isTechnician,
        canModifyData,
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
