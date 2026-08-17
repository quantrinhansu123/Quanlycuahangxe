import { supabase } from '../lib/supabase';
import { normalizeVnPhoneDigits } from '../lib/phoneUtils';
import { getCustomerServiceHistory } from './customerData';
import { chunkArray } from './salesCardData';

export type ZnsCampaignStatus = 'nhap' | 'dang_gui' | 'hoan_thanh' | 'hoan_thanh_co_loi' | 'huy';
export type ZnsLogStatus = 'cho_gui' | 'thanh_cong' | 'that_bai' | 'bo_qua';

export type ZnsFieldSource = 'ho_va_ten' | 'last_order.id_bh' | 'last_order.ngay' | 'static';

export interface ZnsFieldMappingEntry {
  source: ZnsFieldSource;
  /** Chỉ dùng khi source === 'static'. */
  value?: string;
}

export interface ZnsCampaign {
  id: string;
  ten_chien_dich: string;
  template_id: string;
  template_ten: string | null;
  mo_ta: string | null;
  field_mapping: Record<string, ZnsFieldMappingEntry>;
  tong_so_nguoi_nhan: number;
  so_luong_thanh_cong: number;
  so_luong_that_bai: number;
  so_luong_dang_gui: number;
  trang_thai: ZnsCampaignStatus;
  nguoi_tao: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZnsLogEntry {
  id: string;
  chien_dich_id: string;
  khach_hang_id: string | null;
  so_dien_thoai: string;
  template_data: Record<string, string>;
  trang_thai: ZnsLogStatus;
  zalo_msg_id: string | null;
  zalo_error_code: string | null;
  loi: string | null;
  gui_luc: string | null;
  created_at: string;
}

export interface OaStatus {
  connected: boolean;
  oa_id?: string;
  access_token_expires_at?: string;
  last_refreshed_at?: string;
  connected_at?: string;
  error?: string;
}

export interface ZnsTemplateSummary {
  template_id: string;
  template_name: string;
  status: string | number | null;
}

export interface ZnsTemplateDetail extends ZnsTemplateSummary {
  preview_url?: string | null;
  parameters?: Array<{ name: string; type: string }>;
}

async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.clone === 'function') {
    try {
      const body = await context.clone().json() as { error?: string; message?: string };
      if (body.error || body.message) return body.error || body.message || fallback;
    } catch {
      // Phản hồi không phải JSON: dùng thông báo mặc định phía dưới.
    }
  }
  return error instanceof Error ? error.message : fallback;
}

/** Trạng thái kết nối Zalo OA — dùng cho banner trên trang gửi ZNS. */
export async function getOaStatus(): Promise<OaStatus> {
  const { data, error } = await supabase.functions.invoke<OaStatus>('zns-oa-status');
  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Không lấy được trạng thái Zalo OA'));
  return data as OaStatus;
}

export async function listZnsTemplates(): Promise<ZnsTemplateSummary[]> {
  const { data, error } = await supabase.functions.invoke<{ templates?: ZnsTemplateSummary[]; error?: string }>(
    'zns-templates',
    { body: {} }
  );
  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Không tải được danh sách mẫu Zalo'));
  if (data?.error) throw new Error(data.error);
  return data?.templates || [];
}

export async function getZnsTemplateDetail(templateId: string): Promise<ZnsTemplateDetail> {
  const { data, error } = await supabase.functions.invoke<{ template?: ZnsTemplateDetail; error?: string }>(
    'zns-templates',
    { body: { template_id: templateId } }
  );
  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Không tải được chi tiết mẫu Zalo'));
  if (data?.error) throw new Error(data.error);
  if (!data?.template) throw new Error('Không tìm thấy Template');
  return data.template;
}

/** Đổi authorization code (từ redirect Zalo OAuth) lấy access/refresh token, lưu về DB. */
export async function exchangeOauthCode(
  code: string,
  appId: string,
  oaId?: string
): Promise<{ success: boolean; oa_id: string; expires_at: string }> {
  const { data, error } = await supabase.functions.invoke('zns-oauth-exchange', {
    body: { code, app_id: appId, oa_id: oaId },
  });
  if (error) throw error;
  return data;
}

export interface CreateCampaignInput {
  ten_chien_dich: string;
  template_id: string;
  template_ten?: string;
  mo_ta?: string;
  field_mapping: Record<string, ZnsFieldMappingEntry>;
  nguoi_tao: string | null;
}

export async function createCampaign(input: CreateCampaignInput): Promise<ZnsCampaign> {
  const { data, error } = await supabase
    .from('zns_chien_dich')
    .insert({
      ten_chien_dich: input.ten_chien_dich,
      template_id: input.template_id,
      template_ten: input.template_ten || null,
      mo_ta: input.mo_ta || null,
      field_mapping: input.field_mapping,
      nguoi_tao: input.nguoi_tao,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ZnsCampaign;
}

export async function setCampaignTotals(campaignId: string, tongSoNguoiNhan: number): Promise<void> {
  const { error } = await supabase
    .from('zns_chien_dich')
    .update({ tong_so_nguoi_nhan: tongSoNguoiNhan, so_luong_dang_gui: tongSoNguoiNhan, trang_thai: 'dang_gui' })
    .eq('id', campaignId);
  if (error) throw error;
}

export async function updateCampaignStatus(campaignId: string, status: ZnsCampaignStatus): Promise<void> {
  const { error } = await supabase.from('zns_chien_dich').update({ trang_thai: status }).eq('id', campaignId);
  if (error) throw error;
}

export async function listCampaigns(): Promise<ZnsCampaign[]> {
  const { data, error } = await supabase
    .from('zns_chien_dich')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ZnsCampaign[]) || [];
}

export async function getCampaignLogs(campaignId: string): Promise<ZnsLogEntry[]> {
  const { data, error } = await supabase
    .from('zns_gui_log')
    .select('*')
    .eq('chien_dich_id', campaignId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ZnsLogEntry[]) || [];
}

export interface RenderedRecipient {
  idempotency_key: string;
  khach_hang_id: string | null;
  phone: string; // dạng 0xxxxxxxxx
  template_data: Record<string, string>;
}

/** idempotency_key ổn định cho 1 người nhận trong 1 chiến dịch — ưu tiên id khách hàng. */
export function buildIdempotencyKey(customerId: string | null | undefined, phone: string): string {
  return customerId || `phone:${normalizeVnPhoneDigits(phone)}`;
}

/** ZBS yêu cầu tham số kiểu thời gian theo dạng dd/mm/yyyy (hoặc kèm giờ). */
export function formatZbsDate(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Ngày trong bảng the_ban_hang được lưu theo ISO (yyyy-mm-dd), đôi khi có cả thời gian.
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }

  // Giữ nguyên ngày đã ở định dạng ZBS, đồng thời chuẩn hoá phần 0 đứng đầu nếu thiếu.
  const zbsMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (zbsMatch) {
    const [, day, month, year] = zbsMatch;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }

  return raw;
}

/** Render field_mapping thành template_data cho 1 khách hàng cụ thể. */
export async function renderTemplateDataForCustomer(
  customer: { id: string; ho_va_ten: string; so_dien_thoai: string },
  fieldMapping: Record<string, ZnsFieldMappingEntry>
): Promise<Record<string, string>> {
  const needsOrder = Object.values(fieldMapping).some((m) => m.source.startsWith('last_order.'));
  let lastOrderIdBh = '';
  let lastOrderNgay = '';

  if (needsOrder) {
    const history = await getCustomerServiceHistory({ id: customer.id, so_dien_thoai: customer.so_dien_thoai });
    const latest = history[0];
    lastOrderIdBh = latest?.id_bh || '';
    lastOrderNgay = latest?.ngay || '';
  }

  const out: Record<string, string> = {};
  for (const [key, mapping] of Object.entries(fieldMapping)) {
    switch (mapping.source) {
      case 'ho_va_ten':
        out[key] = customer.ho_va_ten || '';
        break;
      case 'last_order.id_bh':
        out[key] = lastOrderIdBh;
        break;
      case 'last_order.ngay':
        out[key] = formatZbsDate(lastOrderNgay);
        break;
      case 'static':
        out[key] = mapping.value || '';
        break;
      default:
        out[key] = '';
    }
  }
  return out;
}

/** Render field_mapping cho nhiều khách hàng cùng lúc (dùng trước khi gửi hàng loạt). */
export async function renderTemplateDataForCustomers(
  customers: Array<{ id: string; ho_va_ten: string; so_dien_thoai: string }>,
  fieldMapping: Record<string, ZnsFieldMappingEntry>
): Promise<RenderedRecipient[]> {
  const out: RenderedRecipient[] = [];
  for (const chunk of chunkArray(customers, 20)) {
    const rendered = await Promise.all(
      chunk.map(async (c) => ({
        idempotency_key: buildIdempotencyKey(c.id, c.so_dien_thoai),
        khach_hang_id: c.id,
        phone: normalizeVnPhoneDigits(c.so_dien_thoai),
        template_data: await renderTemplateDataForCustomer(c, fieldMapping),
      }))
    );
    out.push(...rendered);
  }
  return out;
}

export interface SendBatchResult {
  summary: { requested: number; sent: number; failed: number; skipped: number };
  results: Array<{ idempotency_key: string; status: ZnsLogStatus; error?: string }>;
}

/** Gửi 1 lô (≤30) người nhận qua Edge Function zns-send-batch. */
export async function sendZnsBatch(campaignId: string, recipients: RenderedRecipient[]): Promise<SendBatchResult> {
  const { data, error } = await supabase.functions.invoke('zns-send-batch', {
    body: { campaign_id: campaignId, recipients },
  });
  if (error) throw error;
  return data as SendBatchResult;
}

export { chunkArray };
