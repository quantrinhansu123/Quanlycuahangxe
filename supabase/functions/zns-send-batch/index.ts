import { adminClient, corsHeaders, getValidAccessToken, jsonResponse, sendZnsMessage, toZaloPhone } from "../_shared/zalo.ts";

const MAX_BATCH = 30;
const DELAY_BETWEEN_SENDS_MS = 150; // [VERIFY] điều chỉnh theo giới hạn tốc độ thực tế của Zalo ZNS

interface RecipientInput {
  idempotency_key: string;
  khach_hang_id?: string | null;
  phone: string; // dạng 0xxxxxxxxx
  template_data: Record<string, string>;
}

/**
 * Gửi 1 lô (tối đa MAX_BATCH) tin ZNS cho 1 chiến dịch đã tồn tại.
 * Frontend chia danh sách người nhận lớn thành nhiều lô và gọi hàm này tuần tự,
 * tránh timeout Edge Function và cho phép hiển thị tiến trình gửi.
 *
 * Request body: { campaign_id: string, recipients: RecipientInput[] }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { campaign_id, recipients } = (await req.json()) as {
      campaign_id?: string;
      recipients?: RecipientInput[];
    };

    if (!campaign_id || !Array.isArray(recipients) || recipients.length === 0) {
      return jsonResponse({ error: "Thiếu campaign_id hoặc danh sách người nhận" }, 400);
    }
    if (recipients.length > MAX_BATCH) {
      return jsonResponse({ error: `Mỗi lần gọi tối đa ${MAX_BATCH} người nhận` }, 400);
    }

    const supabaseAdmin = adminClient();

    const { data: campaign, error: campErr } = await supabaseAdmin
      .from("zns_chien_dich")
      .select("template_id, trang_thai")
      .eq("id", campaign_id)
      .maybeSingle();
    if (campErr || !campaign) return jsonResponse({ error: "Không tìm thấy chiến dịch" }, 404);

    // Tạo log trước khi gọi Zalo để luôn có dấu vết kể cả khi API ngoài bị treo/lỗi.
    const initialLogs = recipients.map((recipient) => ({
      chien_dich_id: campaign_id,
      khach_hang_id: recipient.khach_hang_id ?? null,
      so_dien_thoai: recipient.phone,
      template_data: recipient.template_data,
      idempotency_key: recipient.idempotency_key,
      trang_thai: "cho_gui",
      zalo_msg_id: null,
      zalo_error_code: null,
      loi: null,
      gui_luc: null,
    }));
    const { error: initialLogError } = await supabaseAdmin
      .from("zns_gui_log")
      .upsert(initialLogs, {
        onConflict: "chien_dich_id,idempotency_key",
        ignoreDuplicates: true,
      });
    if (initialLogError) {
      console.error("Không thể tạo log ZNS:", initialLogError);
      return jsonResponse({ error: `Không thể tạo log gửi ZNS: ${initialLogError.message}` }, 500);
    }

    const tokenResult = await getValidAccessToken(supabaseAdmin);
    if ("error" in tokenResult) {
      await supabaseAdmin
        .from("zns_gui_log")
        .update({
          trang_thai: "that_bai",
          zalo_error_code: "OA_TOKEN_ERROR",
          loi: tokenResult.error,
        })
        .eq("chien_dich_id", campaign_id)
        .eq("trang_thai", "cho_gui");
      await supabaseAdmin.rpc("zns_bump_campaign_counters", {
        p_campaign_id: campaign_id,
        p_sent: 0,
        p_failed: recipients.length,
        p_skipped: 0,
      });
      return jsonResponse({
        summary: { requested: recipients.length, sent: 0, failed: recipients.length, skipped: 0 },
        results: recipients.map((recipient) => ({
          idempotency_key: recipient.idempotency_key,
          status: "that_bai",
          error: tokenResult.error,
        })),
      });
    }

    const results: Array<{ idempotency_key: string; status: string; error?: string }> = [];
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const r of recipients) {
      const phone84 = toZaloPhone(r.phone);
      if (!phone84) {
        skipped++;
        results.push({ idempotency_key: r.idempotency_key, status: "bo_qua", error: "Số điện thoại không hợp lệ" });
        await supabaseAdmin.from("zns_gui_log").upsert(
          {
            chien_dich_id: campaign_id,
            khach_hang_id: r.khach_hang_id ?? null,
            so_dien_thoai: r.phone,
            template_data: r.template_data,
            idempotency_key: r.idempotency_key,
            trang_thai: "bo_qua",
            loi: "Số điện thoại không hợp lệ",
          },
          { onConflict: "chien_dich_id,idempotency_key" },
        );
        continue;
      }

      // Nếu lô này đã được xử lý thành công trước đó (gọi lại do retry), bỏ qua để tránh gửi trùng.
      const { data: existing } = await supabaseAdmin
        .from("zns_gui_log")
        .select("trang_thai")
        .eq("chien_dich_id", campaign_id)
        .eq("idempotency_key", r.idempotency_key)
        .maybeSingle();
      if (existing?.trang_thai === "thanh_cong") {
        results.push({ idempotency_key: r.idempotency_key, status: "thanh_cong" });
        continue;
      }

      const sendResult = await sendZnsMessage(
        tokenResult.token,
        phone84,
        campaign.template_id,
        r.template_data,
        r.idempotency_key,
      );

      const status = sendResult.ok ? "thanh_cong" : "that_bai";
      if (sendResult.ok) sent++;
      else failed++;
      results.push({ idempotency_key: r.idempotency_key, status, error: sendResult.errorMessage });

      await supabaseAdmin.from("zns_gui_log").upsert(
        {
          chien_dich_id: campaign_id,
          khach_hang_id: r.khach_hang_id ?? null,
          so_dien_thoai: r.phone,
          template_data: r.template_data,
          idempotency_key: r.idempotency_key,
          trang_thai: status,
          zalo_msg_id: sendResult.msgId ?? null,
          zalo_error_code: sendResult.errorCode ?? null,
          loi: sendResult.errorMessage ?? null,
          gui_luc: sendResult.ok ? new Date().toISOString() : null,
        },
        { onConflict: "chien_dich_id,idempotency_key" },
      );

      await new Promise((res) => setTimeout(res, DELAY_BETWEEN_SENDS_MS));
    }

    await supabaseAdmin.rpc("zns_bump_campaign_counters", {
      p_campaign_id: campaign_id,
      p_sent: sent,
      p_failed: failed,
      p_skipped: skipped,
    });

    return jsonResponse({ summary: { requested: recipients.length, sent, failed, skipped }, results });
  } catch (err) {
    console.error("zns-send-batch error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
