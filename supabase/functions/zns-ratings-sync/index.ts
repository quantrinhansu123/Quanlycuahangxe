import { adminClient, corsHeaders, getCustomerRatings, getValidAccessToken, jsonResponse } from "../_shared/zalo.ts";

const PAGE_LIMIT = 100;
const MAX_PAGES = 50; // chặn vòng lặp vô hạn nếu Zalo trả total sai lệch

/**
 * Đồng bộ thủ công đánh giá của 1 template (API "Lấy thông tin đánh giá của khách hàng"),
 * dùng để bù dữ liệu trước khi Webhook được cấu hình hoặc đối soát định kỳ.
 * Webhook (zns-webhook) vẫn là kênh nhận đánh giá theo thời gian thực chính thức.
 *
 * Request body: { template_id: string, from_time: number, to_time: number } (mốc thời gian: ms)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { template_id, from_time, to_time } = (await req.json().catch(() => ({}))) as {
      template_id?: string;
      from_time?: number;
      to_time?: number;
    };
    if (!template_id || !from_time || !to_time) {
      return jsonResponse({ error: "Thiếu template_id, from_time hoặc to_time" }, 400);
    }

    const supabaseAdmin = adminClient();
    const tokenResult = await getValidAccessToken(supabaseAdmin);
    if ("error" in tokenResult) return jsonResponse({ error: tokenResult.error }, 502);

    let offset = 0;
    let total = 0;
    let synced = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await getCustomerRatings(tokenResult.token, template_id, from_time, to_time, offset, PAGE_LIMIT);
      if ("error" in result) return jsonResponse({ error: result.error }, 502);
      total = result.total;

      for (const item of result.items) {
        if (!item.msgId) continue;

        const byMsgId = await supabaseAdmin
          .from("zns_gui_log")
          .select("id, chien_dich_id, khach_hang_id")
          .eq("zalo_msg_id", item.msgId)
          .maybeSingle();
        const guiLog = byMsgId.data;

        const submitMs = Number(item.submitDate);
        const { error } = await supabaseAdmin.from("zns_danh_gia").upsert(
          {
            gui_log_id: guiLog?.id ?? null,
            chien_dich_id: guiLog?.chien_dich_id ?? null,
            khach_hang_id: guiLog?.khach_hang_id ?? null,
            zalo_msg_id: item.msgId,
            tracking_id: item.trackingId || null,
            rate: item.rate,
            ghi_chu: item.note || null,
            nhan_xet_nhanh: item.feedback,
            thoi_diem_danh_gia: Number.isFinite(submitMs) ? new Date(submitMs).toISOString() : null,
            nguon: "dong_bo",
          },
          { onConflict: "zalo_msg_id" },
        );
        if (!error) synced++;
      }

      offset += PAGE_LIMIT;
      if (offset >= total) break;
    }

    return jsonResponse({ total, synced });
  } catch (err) {
    console.error("zns-ratings-sync error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
