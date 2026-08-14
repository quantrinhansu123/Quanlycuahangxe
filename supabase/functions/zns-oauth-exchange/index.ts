import { adminClient, corsHeaders, jsonResponse } from "../_shared/zalo.ts";

/**
 * Đổi authorization code (Zalo OAuth) lấy access_token/refresh_token và lưu vào
 * bảng zns_oa_token. Gọi 1 lần khi admin kết nối (hoặc kết nối lại) Zalo OA.
 *
 * Request body: { code: string, app_id: string, oa_id?: string }
 * [VERIFY] Zalo có trả oa_id trực tiếp trong redirect callback không — nếu không,
 * dùng tạm oa_id mặc định "default" (đủ dùng vì v1 chỉ hỗ trợ 1 OA kết nối).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { code, app_id, oa_id } = await req.json();
    if (!code) return jsonResponse({ error: "Thiếu tham số code" }, 400);
    if (!app_id) return jsonResponse({ error: "Thiếu tham số app_id" }, 400);

    const appSecret = Deno.env.get("ZALO_APP_SECRET");
    if (!appSecret) {
      return jsonResponse({ error: "Thiếu cấu hình ZALO_APP_SECRET trên server (Supabase Edge Function secret)." }, 500);
    }

    const resp = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", secret_key: appSecret },
      body: new URLSearchParams({ code, app_id, grant_type: "authorization_code" }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json.access_token) {
      return jsonResponse(
        { error: `Xác thực Zalo thất bại: ${json.error_description ?? json.error ?? resp.status}` },
        400,
      );
    }

    const expiresAt = new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000).toISOString();
    const supabaseAdmin = adminClient();
    const resolvedOaId = oa_id || "default";

    const { error: dbError } = await supabaseAdmin
      .from("zns_oa_token")
      .upsert(
        {
          oa_id: resolvedOaId,
          app_id,
          access_token: json.access_token,
          refresh_token: json.refresh_token,
          access_token_expires_at: expiresAt,
          last_refreshed_at: new Date().toISOString(),
        },
        { onConflict: "oa_id" },
      );

    if (dbError) return jsonResponse({ error: dbError.message }, 500);

    return jsonResponse({ success: true, oa_id: resolvedOaId, expires_at: expiresAt });
  } catch (err) {
    console.error("zns-oauth-exchange error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
