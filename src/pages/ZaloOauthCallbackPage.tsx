import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Copy, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { exchangeOauthCode } from '../data/znsData';

const ZALO_APP_ID = import.meta.env.VITE_ZALO_APP_ID as string | undefined;

/**
 * Trang nhận redirect từ Zalo sau khi admin đồng ý cấp quyền OA (?code=...&oa_id=...).
 * Tự động đổi code lấy token; nếu lỗi thì cho phép copy code / thử lại thủ công.
 */
const ZaloOauthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const code = searchParams.get('code') || '';
  const oaId = searchParams.get('oa_id') || undefined;

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const runExchange = React.useCallback(async () => {
    if (!code || !ZALO_APP_ID) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      await exchangeOauthCode(code, ZALO_APP_ID, oaId);
      setStatus('success');
      showToast('Đã kết nối Zalo OA thành công', 'success');
      setTimeout(() => navigate('/zns/gui-hang-loat', { replace: true }), 1200);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Kết nối Zalo OA thất bại');
    }
  }, [code, oaId, navigate, showToast]);

  useEffect(() => {
    if (!isAdmin) return;
    void runExchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showToast('Đã sao chép code', 'success');
    } catch {
      /* trình duyệt không hỗ trợ clipboard — bỏ qua */
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-4 lg:p-6">
        <div className="bg-card border border-border rounded-2xl p-6 max-w-lg mx-auto text-center">
          <XCircle className="mx-auto text-red-500 mb-3" size={32} />
          <p className="text-foreground font-semibold">Chỉ quản trị viên mới được kết nối Zalo OA.</p>
        </div>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="p-4 lg:p-6">
        <div className="bg-card border border-border rounded-2xl p-6 max-w-lg mx-auto text-center">
          <XCircle className="mx-auto text-red-500 mb-3" size={32} />
          <p className="text-foreground font-semibold">Không tìm thấy tham số "code" trong đường dẫn.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Vui lòng thử lại từ nút "Kết nối Zalo OA" trên trang Gửi ZNS hàng loạt.
          </p>
        </div>
      </div>
    );
  }

  if (!ZALO_APP_ID) {
    return (
      <div className="p-4 lg:p-6">
        <div className="bg-card border border-border rounded-2xl p-6 max-w-lg mx-auto text-center">
          <XCircle className="mx-auto text-red-500 mb-3" size={32} />
          <p className="text-foreground font-semibold">Thiếu cấu hình VITE_ZALO_APP_ID trong .env</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-lg mx-auto text-center space-y-4">
        {status !== 'error' && (
          <>
            <Loader2 className="mx-auto text-primary animate-spin" size={32} />
            <p className="text-foreground font-semibold">Đang xác thực kết nối Zalo OA...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto text-green-600" size={32} />
            <p className="text-foreground font-semibold">Kết nối thành công. Đang chuyển hướng...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="mx-auto text-red-500 mb-1" size={32} />
            <p className="text-foreground font-semibold">Kết nối thất bại</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted"
              >
                <Copy size={14} />
                Sao chép code
              </button>
              <button
                type="button"
                onClick={() => void runExchange()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90"
              >
                Thử lại
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ZaloOauthCallbackPage;
