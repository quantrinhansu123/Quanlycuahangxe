import { createClient } from '@supabase/supabase-js';
import { getStoredSessionToken } from './authStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Thiếu biến môi trường Supabase. Thêm VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY (hoặc PUBLISHABLE) vào .env rồi chạy lại dev server.",
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "invalid-anon-key",
  {
    global: {
      // Đọc token ở thời điểm gửi từng request để lần đăng nhập đầu tiên có
      // hiệu lực ngay, không cần tạo lại Supabase client hay F5 trang.
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers);
        const sessionToken = getStoredSessionToken();
        if (sessionToken) headers.set('x-app-session', sessionToken);
        return fetch(input, { ...init, headers });
      },
    },
  },
);
