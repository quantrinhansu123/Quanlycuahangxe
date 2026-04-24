import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

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
  session: Session | null;
  supabaseUser: SupabaseUser | null;
  nhanVien: NhanVien | null;
  isAdmin: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  supabaseUser: null,
  nhanVien: null,
  isAdmin: false,
  isLoading: true,
  signOut: async () => {},
});

const ADMIN_ROLES = ['Quản trị viên', 'Chủ cửa hàng', 'quản lý'];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const demoRole = sessionStorage.getItem('demo_role');
  const localNhanVienRaw = sessionStorage.getItem('local_nhan_vien');
  let localNhanVien: NhanVien | null = null;
  if (localNhanVienRaw) {
    try {
      localNhanVien = JSON.parse(localNhanVienRaw) as NhanVien;
    } catch {
      sessionStorage.removeItem('local_nhan_vien');
    }
  }

  const [session, setSession] = useState<Session | null>(
    (demoRole || localNhanVien) ? ({
      access_token: 'demo-token',
      refresh_token: 'demo-refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: { 
        id: localNhanVien?.auth_user_id || 'demo-uuid', 
        email: localNhanVien?.email || 'demo@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { ho_ten: localNhanVien?.ho_ten || (demoRole === 'admin' ? 'Demo Admin' : 'Demo Staff') }
      } 
    } as any) : null
  );
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(
    (demoRole || localNhanVien) ? ({
      id: localNhanVien?.auth_user_id || 'demo-uuid', 
      aud: 'authenticated',
      role: 'authenticated',
      email: localNhanVien?.email || 'demo@example.com',
      app_metadata: { provider: 'email' },
      user_metadata: { ho_ten: localNhanVien?.ho_ten || (demoRole === 'admin' ? 'Demo Admin' : 'Demo Staff') }
    } as any) : null
  );
  const [nhanVien, setNhanVien] = useState<NhanVien | null>(
    localNhanVien ? localNhanVien : demoRole ? ({
      id: 'demo-nv-uuid',
      id_nhan_su: 'DEMO-001',
      ho_ten: 'Demo ' + (demoRole === 'admin' ? 'Quản trị viên' : 'Nhân viên'),
      vi_tri: demoRole === 'admin' ? 'Chủ cửa hàng' : 'Nhân viên',
      co_so: 'Cơ sở Bắc Ninh',
      email: 'demo@example.com',
      auth_user_id: 'demo-uuid'
    } as any) : null
  );
  const [isLoading] = useState(false);

  useEffect(() => {
    // Đồng bộ state khi local session thay đổi.
    const latestRaw = sessionStorage.getItem('local_nhan_vien');
    if (latestRaw) {
      try {
        const latest = JSON.parse(latestRaw) as NhanVien;
        setNhanVien(latest);
        setSession({
          access_token: 'local-token',
          refresh_token: 'local-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: latest.auth_user_id || latest.id || 'local-uuid',
            email: latest.email || 'local@example.com',
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: { provider: 'local-nhan-su' },
            user_metadata: { ho_ten: latest.ho_ten },
          },
        } as any);
        setSupabaseUser({
          id: latest.auth_user_id || latest.id || 'local-uuid',
          aud: 'authenticated',
          role: 'authenticated',
          email: latest.email || 'local@example.com',
          app_metadata: { provider: 'local-nhan-su' },
          user_metadata: { ho_ten: latest.ho_ten },
        } as any);
      } catch {
        setNhanVien(null);
      }
    }
  }, []);

  const signOut = async () => {
    if (demoRole || localNhanVien) {
      sessionStorage.removeItem('demo_role');
      sessionStorage.removeItem('local_nhan_vien');
      location.reload();
      return;
    }
    sessionStorage.removeItem('local_nhan_vien');
    location.reload();
  };

  const isAdmin = nhanVien
    ? ADMIN_ROLES.some(role => (nhanVien.vi_tri ?? '').toLowerCase().includes(role.toLowerCase()))
    : false;

  return (
    <AuthContext.Provider value={{ session, supabaseUser, nhanVien, isAdmin, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
