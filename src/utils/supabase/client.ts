import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const createClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY trong .env — khởi động lại npm run dev sau khi thêm file.",
    );
  }
  return createBrowserClient(
    supabaseUrl || "https://placeholder.supabase.co",
    supabaseKey || "invalid-anon-key",
  );
};