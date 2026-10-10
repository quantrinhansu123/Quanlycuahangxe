import { createClient } from '@supabase/supabase-js';
import { getStoredSessionToken } from './authStorage';
import { supabaseFetch } from './supabaseFetch';
import { hideCustomerPhones, isStoredTechnician, technicianReadUrl } from './customerPrivacy';

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
      fetch: async (input, init = {}) => {
        const headers = new Headers(init.headers);
        const sessionToken = getStoredSessionToken();
        if (sessionToken) headers.set('x-app-session', sessionToken);
        const technician = isStoredTechnician();
        const url = new URL(input instanceof Request ? input.url : String(input));
        const method = init.method || (input instanceof Request ? input.method : 'GET');
        const target = technician && ['GET', 'HEAD'].includes(method.toUpperCase()) ? technicianReadUrl(url) : url;
        const requestInput = input instanceof Request ? new Request(target, input) : target;
        const response = await supabaseFetch(requestInput, { ...init, headers });
        if ((technician || isStoredTechnician()) && response.ok && response.headers.get('content-type')?.includes('application/json')
          && /\/rest\/v1\/(?:rpc\/)?(?:khach_hang(?:_visible)?|the_ban_hang(?:_visible)?|nhan_su(?:_visible)?|customers_query|sales_query|sales_lookup|customer_order_stats|create_technician_customer|create_technician_sales_order)$/.test(url.pathname)) {
          const safeHeaders = new Headers(response.headers);
          safeHeaders.delete('content-length');
          return new Response(JSON.stringify(hideCustomerPhones(await response.json())), { status: response.status, statusText: response.statusText, headers: safeHeaders });
        }
        return response;
      },
    },
  },
);
