import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Chuyển SĐT VN dạng "0xxxxxxxxx" sang dạng Zalo ZNS yêu cầu: "84xxxxxxxxx" (bỏ số 0 đầu).
 * [VERIFY] đối chiếu lại định dạng chính xác trong tài liệu Zalo khi có tài khoản thật.
 */
export function toZaloPhone(vnPhone: string): string | null {
  const digits = (vnPhone || "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return "84" + digits.slice(1);
  if (digits.startsWith("84") && digits.length === 11) return digits;
  return null;
}

export interface OaTokenRow {
  id: string;
  oa_id: string;
  app_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
}

/**
 * Đọc token OA hiện tại; nếu còn hạn dưới 5 phút (hoặc đã hết hạn) thì gọi Zalo
 * để làm mới, lưu lại DB rồi trả về token còn hiệu lực.
 * [VERIFY] endpoint/tham số refresh token chính xác theo tài liệu Zalo OAuth hiện hành.
 */
export async function getValidAccessToken(
  supabaseAdmin: SupabaseClient,
): Promise<{ token: string; oaId: string } | { error: string }> {
  const { data: row, error } = await supabaseAdmin
    .from("zns_oa_token")
    .select("*")
    .limit(1)
    .maybeSingle<OaTokenRow>();

  if (error) return { error: `Lỗi đọc cấu hình Zalo OA: ${error.message}` };
  if (!row) return { error: "Chưa kết nối Zalo OA. Vui lòng kết nối trước khi gửi." };

  const expiresAt = new Date(row.access_token_expires_at).getTime();
  const bufferMs = 5 * 60 * 1000;
  if (Date.now() < expiresAt - bufferMs) {
    return { token: row.access_token, oaId: row.oa_id };
  }

  const appSecret = Deno.env.get("ZALO_APP_SECRET");
  if (!appSecret) return { error: "Thiếu cấu hình ZALO_APP_SECRET trên server (Supabase Edge Function secret)." };

  let resp: Response;
  try {
    resp = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        secret_key: appSecret,
      },
      body: new URLSearchParams({
        refresh_token: row.refresh_token,
        app_id: row.app_id,
        grant_type: "refresh_token",
      }),
    });
  } catch (err) {
    return { error: `Không thể kết nối tới Zalo để làm mới token: ${String(err)}` };
  }

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.access_token) {
    return { error: `Làm mới token Zalo thất bại: ${json.error_description ?? json.error ?? resp.status}` };
  }

  const expiresInSec = Number(json.expires_in ?? 3600);
  const newExpiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

  await supabaseAdmin
    .from("zns_oa_token")
    .update({
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? row.refresh_token,
      access_token_expires_at: newExpiresAt,
      last_refreshed_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  return { token: json.access_token, oaId: row.oa_id };
}

export interface ZaloSendResult {
  ok: boolean;
  msgId?: string;
  sentTime?: string;
  errorCode?: string;
  errorMessage?: string;
}

const ZALO_SEND_TIMEOUT_MS = 15_000;

export function zaloErrorMessage(code: unknown, message: unknown): string {
  if (String(code ?? "") === "-120") {
    return "Zalo từ chối quyền gửi ZBS/ZNS (-120). Ứng dụng hoặc OA chưa được cấp quyền ZBS Template Message, hoặc OA không thuộc tài khoản ZBS đang sở hữu template. Hãy cấu hình quyền/liên kết trên Zalo rồi kết nối lại OA.";
  }
  return String(message || "Gửi ZNS thất bại (không rõ nguyên nhân)");
}

/**
 * Gọi Zalo ZNS send-template API cho 1 người nhận.
 * [VERIFY] endpoint/tên trường request-response chính xác theo tài liệu Zalo ZNS hiện hành —
 * cần kiểm thử thật với 1 SĐT thật trước khi gửi hàng loạt.
 */
export async function sendZnsMessage(
  accessToken: string,
  phone84: string,
  templateId: string,
  templateData: Record<string, string>,
  trackingId?: string,
): Promise<ZaloSendResult> {
  const safeTrackingId = (trackingId || crypto.randomUUID())
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 48);
  let resp: Response;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), ZALO_SEND_TIMEOUT_MS);
  try {
    resp = await fetch("https://business.openapi.zalo.me/message/template", {
      method: "POST",
      headers: { access_token: accessToken, "Content-Type": "application/json" },
      signal: abortController.signal,
      body: JSON.stringify({
        phone: phone84,
        template_id: templateId,
        template_data: templateData,
        tracking_id: safeTrackingId,
      }),
    });
  } catch (err) {
    if (abortController.signal.aborted) {
      return {
        ok: false,
        errorCode: "ZALO_TIMEOUT",
        errorMessage: `Zalo không phản hồi sau ${ZALO_SEND_TIMEOUT_MS / 1000} giây`,
      };
    }
    return { ok: false, errorMessage: `Không thể kết nối tới Zalo: ${String(err)}` };
  } finally {
    clearTimeout(timeoutId);
  }

  const json = await resp.json().catch(() => ({}));
  if (resp.ok && (json?.error === 0 || json?.error === undefined)) {
    return { ok: true, msgId: json?.data?.msg_id, sentTime: json?.data?.sent_time };
  }
  return {
    ok: false,
    errorCode: String(json?.error ?? resp.status),
    errorMessage: zaloErrorMessage(json?.error ?? resp.status, json?.message),
  };
}
