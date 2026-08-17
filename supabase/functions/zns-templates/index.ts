import { adminClient, corsHeaders, getValidAccessToken, jsonResponse, zaloErrorMessage } from "../_shared/zalo.ts";

type JsonRow = Record<string, unknown>;

const idOf = (row: JsonRow) => String(row.templateId ?? row.template_id ?? row.id ?? "").trim();
const nameOf = (row: JsonRow) => String(row.templateName ?? row.template_name ?? row.name ?? "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const tokenResult = await getValidAccessToken(adminClient());
    if ("error" in tokenResult) return jsonResponse({ error: tokenResult.error }, 502);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const templateId = String(body?.template_id ?? "").trim();

    if (templateId) {
      const url = new URL("https://business.openapi.zalo.me/template/info");
      url.searchParams.set("template_id", templateId);
      const response = await fetch(url, { headers: { access_token: tokenResult.token } });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || (json?.error !== undefined && Number(json.error) !== 0)) {
        return jsonResponse({ error: zaloErrorMessage(json?.error ?? response.status, json?.message ?? `Không tải được Template (${response.status})`) }, 502);
      }
      const data = (json?.data ?? {}) as JsonRow;
      const rawParams = Array.isArray(data.listParams)
        ? data.listParams
        : Array.isArray(data.list_params)
          ? data.list_params
          : [];
      return jsonResponse({
        template: {
          template_id: idOf(data) || templateId,
          template_name: nameOf(data),
          status: data.status ?? null,
          preview_url: String(data.previewUrl ?? data.preview_url ?? "").trim() || null,
          parameters: (rawParams as JsonRow[]).map((param) => ({
            name: String(param.name ?? param.paramName ?? param.key ?? "").replace(/[<>]/g, "").trim(),
            type: String(param.type ?? param.dataType ?? "string"),
          })).filter((param) => param.name),
        },
      });
    }

    const url = new URL("https://business.openapi.zalo.me/template/all");
    url.searchParams.set("offset", "0");
    url.searchParams.set("limit", "100");
    url.searchParams.set("status", "1");
    const response = await fetch(url, { headers: { access_token: tokenResult.token } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || (json?.error !== undefined && Number(json.error) !== 0)) {
      return jsonResponse({ error: zaloErrorMessage(json?.error ?? response.status, json?.message ?? `Không tải được danh sách Template (${response.status})`) }, 502);
    }
    const rawRows = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.data?.templates)
        ? json.data.templates
        : [];
    const templates = (rawRows as JsonRow[]).map((row) => ({
      template_id: idOf(row),
      template_name: nameOf(row),
      status: row.status ?? null,
    })).filter((row) => row.template_id && row.template_name);
    return jsonResponse({ templates });
  } catch (error) {
    console.error("zns-templates error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
