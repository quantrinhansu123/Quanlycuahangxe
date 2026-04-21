import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { createClient } from '../utils/supabase/client';

const supabase = createClient();

// Thông tin nhân viên lấy từ bảng nhan_su
export interface NhanVien {
  id: string;
  id_nhan_su: string | null;
  ho_ten: string;
  vi_tri: string;
  co_so: string;
  email: string | null;
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

  const [session, setSession] = useState<Session | null>(
    demoRole ? ({ 
      access_token: 'demo-token',
      refresh_token: 'demo-refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: { 
        id: 'demo-uuid', 
        email: 'demo@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { ho_ten: demoRole === 'admin' ? 'Demo Admin' : 'Demo Staff' }
      } 
    } as any) : null
  );
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(
    demoRole ? ({
      id: 'demo-uuid', 
      aud: 'authenticated',
      role: 'authenticated',
      email: 'demo@example.com',
      app_metadata: { provider: 'email' },
      user_metadata: { ho_ten: demoRole === 'admin' ? 'Demo Admin' : 'Demo Staff' }
    } as any) : null
  );
  const [nhanVien, setNhanVien] = useState<NhanVien | null>(
    demoRole ? ({
      id: 'demo-nv-uuid',
      id_nhan_su: 'DEMO-001',
      ho_ten: 'Demo ' + (demoRole === 'admin' ? 'Quản trị viên' : 'Nhân viên'),
      vi_tri: demoRole === 'admin' ? 'Chủ cửa hàng' : 'Nhân viên',
      co_so: 'Cơ sở Bắc Ninh',
      email: 'demo@example.com',
      auth_user_id: 'demo-uuid'
    } as any) : null
  );
  const [isLoading, setIsLoading] = useState(!demoRole);

  // Lấy thông tin nhân viên từ DB theo auth_user_id
  const fetchNhanVien = async (userId: string) => {
    const { data, error } = await supabase
      .from('nhan_su')
      .select('id, id_nhan_su, ho_ten, vi_tri, co_so, email, auth_user_id')
      .eq('auth_user_id', userId)
      .single();

    if (error || !data) {
      console.warn('Không tìm thấy nhân viên với auth_user_id:', userId);
      setNhanVien(null);
    } else {
      setNhanVien(data as NhanVien);
    }
  };

  useEffect(() => {
    // Nếu trong chế độ Demo thì không chạy logic thực tế
    if (demoRole) return;

    // Lấy session hiện tại khi app khởi động
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSupabaseUser(session?.user ?? null);
      if (session?.user) {
        fetchNhanVien(session.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    // Lắng nghe thay đổi auth state (login/logout/token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setSupabaseUser(session?.user ?? null);
      if (session?.user) {
        fetchNhanVien(session.user.id).finally(() => setIsLoading(false));
      } else {
        setNhanVien(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [demoRole]);

  const signOut = async () => {
    if (demoRole) {
      sessionStorage.removeItem('demo_role');
      location.reload();
      return;
    }
    await supabase.auth.signOut();
  };

  const isAdmin = nhanVien ? ADMIN_ROLES.some(role => nhanVien.vi_tri.toLowerCase().includes(role.toLowerCase())) : false;

  return (
    <AuthContext.Provider value={{ session, supabaseUser, nhanVien, isAdmin, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
