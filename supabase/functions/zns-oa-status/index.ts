import { adminClient, corsHeaders, jsonResponse } from "../_shared/zalo.ts";

/**
 * Trả về trạng thái kết nối Zalo OA cho giao diện (banner "Đã kết nối"/"Chưa kết nối").
 * Không bao giờ trả access_token/refresh_token — chỉ metadata an toàn để hiển thị.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = adminClient();
    const { data, error } = await supabaseAdmin
      .from("zns_oa_token")
      .select("oa_id, access_token_expires_at, last_refreshed_at, created_at")
      .limit(1)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!data) return jsonResponse({ connected: false });

    return jsonResponse({
      connected: true,
      oa_id: data.oa_id,
      access_token_expires_at: data.access_token_expires_at,
      last_refreshed_at: data.last_refreshed_at,
      connected_at: data.created_at,
    });
  } catch (err) {
    console.error("zns-oa-status error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
