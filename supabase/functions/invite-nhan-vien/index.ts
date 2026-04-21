import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, ho_ten, nhan_su_id } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Thiếu email nhân viên" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Dùng service role key để gọi Admin API
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Invite nhân viên qua email — họ sẽ tự đặt mật khẩu
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        ho_ten: ho_ten ?? "",
        nhan_su_id: nhan_su_id ?? "",
      },
      redirectTo: `${Deno.env.get("SITE_URL") ?? "http://localhost:5173"}/`,
    });

    if (error) {
      // Nếu user đã tồn tại thì không phải lỗi nghiêm trọng
      if (error.message?.includes("already been registered")) {
        return new Response(
          JSON.stringify({ message: "User đã tồn tại, bỏ qua invite", email }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.error("Lỗi invite user:", error.message);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`✅ Đã invite ${email} (${ho_ten}) thành công`);

    return new Response(
      JSON.stringify({ success: true, user_id: data.user?.id, email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Lỗi không xác định:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
