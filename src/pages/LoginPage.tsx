import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type NhanVien } from '../context/AuthContext';
import { getLoginRedirectPath } from '../data/viewPermissions';
import { supabase } from '../lib/supabase';
import { getReadErrorMessage, isAbortError } from '../lib/errorDetails';

interface PhoneLoginResult {
  id: string;
  id_nhan_su: string | null;
  ho_ten: string;
  vi_tri: string;
  co_so: string;
  email: string | null;
  sdt: string | null;
  auth_user_id: string | null;
  session_token?: string;
  session_expires_at?: string;
}

/** Same canonical VN phone form as public.app_login_phone — one RPC, no signature probing. */
const toLoginPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (/^0084[0-9]{9}$/.test(digits)) return `0${digits.slice(4)}`;
  if (/^84[0-9]{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^[0-9]{9}$/.test(digits)) return `0${digits}`;
  return digits;
};

const callPhoneLoginRpc = async (
  phone: string,
  password: string,
  signal: AbortSignal,
): Promise<{
  data: PhoneLoginResult[] | null;
  error: {
    code?: string;
    message: string;
    details?: string;
    hint?: string;
  } | null;
}> => {
  const p_sdt = toLoginPhone(phone);
  if (!p_sdt || !password) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .rpc('login_with_phone', { p_sdt, p_password: password })
    .abortSignal(signal);

  // A finished RPC wins over an abort that raced after the response arrived.
  // Discarding success here was turning a completed login into "Login request aborted".
  if (!error) {
    return { data: data as PhoneLoginResult[] | null, error: null };
  }

  if (signal.aborted || isAbortError(error)) {
    throw new DOMException('Login request aborted', 'AbortError');
  }

  return {
    data: null,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    },
  };
};

const LoginPage: React.FC = () => {
  const { session, isLoading, nhanVien, isAdmin, persistLogin } = useAuth();
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const loginRequest = useRef<AbortController | null>(null);
  const loginGeneration = useRef(0);

  useEffect(() => () => {
    loginGeneration.current += 1;
    loginRequest.current?.abort();
    loginRequest.current = null;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reason') === 'account_deleted') {
      const timer = window.setTimeout(
        () => setError('Tài khoản đã bị xóa hoặc vô hiệu hóa. Vui lòng liên hệ quản trị viên.'),
        0
      );
      return () => window.clearTimeout(timer);
    }
  }, []);

  // Wait for auth bootstrap so we never race login_with_phone against
  // current_app_nhan_su_uuid / nhan_su reads on a stale stored session.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Đang kiểm tra phiên đăng nhập...</p>
      </div>
    );
  }

  if (session) {
    const fromPath = (routeLocation.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    const redirectTo =
      fromPath ?? getLoginRedirectPath(nhanVien?.vi_tri, isAdmin, nhanVien?.co_so);
    return <Navigate to={redirectTo} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginRequest.current) return;
    const controller = new AbortController();
    const generation = ++loginGeneration.current;
    loginRequest.current = controller;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
    setError('');
    setLoading(true);

    try {
      const { data: rpcData, error: rpcError } = await callPhoneLoginRpc(phone, password, controller.signal);

      if (generation !== loginGeneration.current) return;

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

      persistLogin(matchedUser as NhanVien, matchedUser.session_token);
      const homePath = getLoginRedirectPath(
        matchedUser.vi_tri,
        /quản trị|admin|chủ cửa|quản lý/i.test(matchedUser.vi_tri),
        matchedUser.co_so
      );
      navigate(homePath, { replace: true });
    } catch (err) {
      if (generation !== loginGeneration.current) return;
      if (isAbortError(err) && !timedOut) return;
      if (timedOut) {
        console.warn('Login deadline reached:', err);
        setError('Máy chủ phản hồi chậm. Vui lòng thử lại.');
        return;
      }
      console.error('Unexpected login error:', err);
      setError(getReadErrorMessage(err, 'Không thể kết nối tới server. Vui lòng kiểm tra kết nối mạng.'));
    } finally {
      window.clearTimeout(timer);
      if (loginRequest.current === controller) loginRequest.current = null;
      if (generation === loginGeneration.current) setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="Logo Anh Công Nhân" className="w-32 h-32 object-contain mb-3" />
          <h1 className="px-4 text-center text-2xl font-black text-foreground">
            Anh Công Nhân
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Trung tâm sửa chữa xe</p>
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
