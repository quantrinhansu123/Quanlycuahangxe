import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface PhoneLoginResult {
  id: string;
  id_nhan_su: string | null;
  ho_ten: string;
  vi_tri: string;
  co_so: string;
  email: string | null;
  sdt: string | null;
  auth_user_id: string | null;
}

const normalizePhone = (value: string) => value.replace(/\D/g, '');

const getPhoneCandidates = (value: string): string[] => {
  const digits = normalizePhone(value);
  if (!digits) return [];

  const candidates = new Set<string>([digits]);
  if (digits.startsWith('0')) {
    candidates.add(digits.slice(1));
  } else {
    candidates.add(`0${digits}`);
  }
  return Array.from(candidates).filter(Boolean);
};

const callPhoneLoginRpc = async (phone: string, password: string): Promise<{
  data: PhoneLoginResult[] | null;
  error: {
    code?: string;
    message: string;
    details?: string;
    hint?: string;
  } | null;
}> => {
  const phoneCandidates = getPhoneCandidates(phone);
  const attempts: Array<Record<string, string>> = [];

  for (const phoneCandidate of phoneCandidates) {
    attempts.push(
      { p_sdt: phoneCandidate, p_password: password },
      { p_password: password, p_sdt: phoneCandidate },
      { sdt: phoneCandidate, password },
      { phone: phoneCandidate, password },
    );
  }

  let lastError: {
    code?: string;
    message: string;
    details?: string;
    hint?: string;
  } | null = null;

  for (const args of attempts) {
    const { data, error } = await supabase.rpc('login_with_phone', args);
    if (!error) {
      return { data: data as PhoneLoginResult[] | null, error: null };
    }

    lastError = {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    };

    // Nếu function tồn tại nhưng sai credentials thì không cần thử signature khác.
    if (error.code !== 'PGRST202') {
      break;
    }
  }

  return { data: null, error: lastError };
};

const LoginPage: React.FC = () => {
  const { session, isLoading } = useAuth();
  const routeLocation = useLocation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoading && session) {
    const redirectTo = (routeLocation.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';
    return <Navigate to={redirectTo} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data: rpcData, error: rpcError } = await callPhoneLoginRpc(phone, password);

      if (rpcError) {
        console.error('Phone login rpc error detail:', {
          code: rpcError.code,
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint,
        });

        if (rpcError.code === 'PGRST202') {
          setError('DB chưa có function login_with_phone đúng tham số. Vui lòng chạy SQL migration mới nhất.');
        } else {
          setError('Đăng nhập thất bại. Vui lòng thử lại. (' + rpcError.message + ')');
        }
        return;
      }

      const matchedUser = (rpcData as PhoneLoginResult[] | null)?.[0];
      if (!matchedUser) {
        setError('Số điện thoại hoặc mật khẩu không đúng.');
        return;
      }

      // Bỏ Auth email: chỉ cần khớp SĐT + password trong bảng nhan_su là đăng nhập.
      sessionStorage.setItem('local_nhan_vien', JSON.stringify(matchedUser));
      window.location.assign('/');
    } catch (err) {
      console.error('Unexpected login error:', err);
      setError('Không thể kết nối tới server. Vui lòng kiểm tra kết nối mạng.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="Logo" className="w-16 h-16 object-contain mb-3" />
          <h1 className="text-2xl font-extrabold bg-linear-to-r from-[#D4AF37] via-[#FFD700] to-[#B8860B] bg-clip-text text-transparent">
            Hệ thống VH
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Cửa hàng sửa xe</p>
        </div>

        {/* Form */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
          <h2 className="text-xl font-semibold text-foreground mb-6">Đăng nhập</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Số điện thoại
              </label>
              <input
                id="login-phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="VD: 0866049866"
                required
                autoComplete="username"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                           transition-colors placeholder:text-muted-foreground"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Mật khẩu
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                           transition-colors placeholder:text-muted-foreground"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold text-sm
                         hover:bg-primary/90 active:scale-[0.98] transition-all duration-200
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Liên hệ quản trị viên nếu bạn chưa có tài khoản
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
