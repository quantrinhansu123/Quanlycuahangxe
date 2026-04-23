import { createClient } from '@supabase/supabase-js';

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
);
