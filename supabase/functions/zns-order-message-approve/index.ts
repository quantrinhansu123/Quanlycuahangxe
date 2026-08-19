import { adminClient, corsHeaders, getValidAccessToken, jsonResponse, sendZnsMessage, toZaloPhone } from "../_shared/zalo.ts";

const ORDER_CONFIRMATION_TEMPLATE_ID = "624663";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { queue_ids } = await req.json() as { queue_ids?: string[] };
    const queueIds = [...new Set((queue_ids || []).filter(Boolean))];
    if (!queueIds.length) return jsonResponse({ error: "Chưa chọn tin nhắn cần duyệt" }, 400);
    if (queueIds.length > 30) return jsonResponse({ error: "Mỗi lần duyệt tối đa 30 tin nhắn" }, 400);

    const db = adminClient();
    const { data: rows, error: queueError } = await db
      .from("zns_order_message_queue")
      .select("*")
      .in("id", queueIds);
    if (queueError) return jsonResponse({ error: queueError.message }, 500);

    const tokenResult = await getValidAccessToken(db);
    const results: Array<{ id: string; status: string; error?: string }> = [];
    let sent = 0;
    let failed = 0;

    for (const row of rows || []) {
      const phone84 = toZaloPhone(row.phone || "");
      if (!phone84) {
        failed++;
        const error = "Số điện thoại khách hàng không hợp lệ";
        await db.from("zns_order_message_queue").update({
          status: "that_bai", last_error: error, reviewed_at: new Date().toISOString(), send_count: (row.send_count || 0) + 1,
        }).eq("id", row.id);
        results.push({ id: row.id, status: "that_bai", error });
        continue;
      }

      if ("error" in tokenResult) {
        failed++;
        await db.from("zns_order_message_queue").update({
          status: "that_bai", last_error: tokenResult.error, reviewed_at: new Date().toISOString(), send_count: (row.send_count || 0) + 1,
        }).eq("id", row.id);
        results.push({ id: row.id, status: "that_bai", error: tokenResult.error });
        continue;
      }

      const response = await sendZnsMessage(
        tokenResult.token,
        phone84,
        ORDER_CONFIRMATION_TEMPLATE_ID,
        row.template_data || {},
        `order${String(row.order_code || row.id).replace(/[^a-zA-Z0-9]/g, "")}`,
      );
      const status = response.ok ? "da_gui" : "that_bai";
      if (response.ok) sent++; else failed++;
      await db.from("zns_order_message_queue").update({
        status,
        send_count: (row.send_count || 0) + 1,
        last_sent_at: response.ok ? new Date().toISOString() : row.last_sent_at,
        zalo_msg_id: response.msgId || row.zalo_msg_id,
        last_error: response.errorMessage || null,
        reviewed_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ id: row.id, status, error: response.errorMessage });
    }

    return jsonResponse({ sent, failed, results });
  } catch (error) {
    console.error("zns-order-message-approve error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
