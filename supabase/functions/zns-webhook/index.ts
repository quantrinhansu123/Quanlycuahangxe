import { adminClient, computeZEventSignature, corsHeaders, jsonResponse } from "../_shared/zalo.ts";

interface FeedbackMessage {
  rating_type?: string;
  option?: string;
  note?: string;
  rate?: number;
  submit_time?: string;
  msg_id?: string;
  feedbacks?: string[];
  tracking_id?: string;
}

/**
 * Webhook nhận sự kiện từ Zalo cho ZBS Template Message.
 * Đăng ký URL này làm "Webhook URL" của App trên Zalo Developer (Quản lý Template → Template Webhook),
 * quyền cần cấp: "Nhận sự kiện quản lý Message Template".
 *
 * Chỉ xử lý sự kiện "user_feedback" (người dùng phản hồi template đánh giá dịch vụ) — các sự kiện
 * khác (đổi trạng thái template, chất lượng gửi...) được ghi log rồi bỏ qua.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const eventName = String(payload.event_name ?? "");
  const appId = String(payload.app_id ?? "");
  const oaId = String(payload.oa_id ?? "");
  const timestamp = String(payload.timestamp ?? "");

  // Xác minh chữ ký nếu đã cấu hình ZALO_OA_SECRET_KEY. Nếu chưa cấu hình, vẫn nhận và lưu
  // (để không chặn việc nối dây/kiểm thử ban đầu) — nên cấu hình sớm sau khi xác nhận đúng công thức.
  const secretKey = Deno.env.get("ZALO_OA_SECRET_KEY");
  const signatureHeader = req.headers.get("X-ZEvent-Signature") ?? "";
  if (secretKey) {
    const expected = await computeZEventSignature(appId, rawBody, timestamp, secretKey);
    if (expected !== signatureHeader) {
      console.error("zns-webhook: chữ ký không khớp", { eventName, appId });
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
  }

  if (eventName !== "user_feedback") {
    console.log("zns-webhook: bỏ qua sự kiện", eventName);
    return jsonResponse({ received: true });
  }

  const message = (payload.message ?? {}) as FeedbackMessage;
  const msgId = String(message.msg_id ?? "").trim();
  if (!msgId) return jsonResponse({ error: "Thiếu message.msg_id" }, 400);

  const supabaseAdmin = adminClient();

  // Map với log gửi ZNS trước đó qua msg_id (khớp chính xác nhất vì zns_gui_log.zalo_msg_id
  // được lưu từ chính kết quả gửi). Nếu không thấy, thử khớp theo tracking_id (= idempotency_key
  // đã gửi lên Zalo, có thể bị Zalo lược bớt ký tự không phải chữ/số).
  let guiLog: { id: string; chien_dich_id: string; khach_hang_id: string | null } | null = null;

  const byMsgId = await supabaseAdmin
    .from("zns_gui_log")
    .select("id, chien_dich_id, khach_hang_id")
    .eq("zalo_msg_id", msgId)
    .maybeSingle();
  guiLog = byMsgId.data ?? null;

  if (!guiLog && message.tracking_id) {
    const byTracking = await supabaseAdmin
      .from("zns_gui_log")
      .select("id, chien_dich_id, khach_hang_id")
      .eq("idempotency_key", message.tracking_id)
      .maybeSingle();
    guiLog = byTracking.data ?? null;
  }

  const submitMs = Number(message.submit_time);

  const { error } = await supabaseAdmin.from("zns_danh_gia").upsert(
    {
      gui_log_id: guiLog?.id ?? null,
      chien_dich_id: guiLog?.chien_dich_id ?? null,
      khach_hang_id: guiLog?.khach_hang_id ?? null,
      zalo_msg_id: msgId,
      tracking_id: message.tracking_id ?? null,
      rating_type: message.rating_type ?? null,
      thang_do: message.option ?? null,
      rate: message.rate ?? null,
      ghi_chu: message.note ?? null,
      nhan_xet_nhanh: message.feedbacks ?? [],
      thoi_diem_danh_gia: Number.isFinite(submitMs) ? new Date(submitMs).toISOString() : null,
      app_id: appId || null,
      oa_id: oaId || null,
      nguon: "webhook",
      raw_payload: payload,
    },
    { onConflict: "zalo_msg_id" },
  );

  if (error) {
    console.error("zns-webhook: lỗi lưu đánh giá:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }

  return jsonResponse({ received: true });
});
