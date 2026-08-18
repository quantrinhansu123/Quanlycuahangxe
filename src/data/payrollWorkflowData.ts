import { supabase } from '../lib/supabase';

export const PAYROLL_STATUSES = [
  'Bản nháp',
  'Chưa gửi',
  'Chờ nhân viên xác nhận',
  'Có phản hồi',
  'Đã xác nhận',
  'Đã khóa',
  'Đã chi trả',
] as const;

export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];
export type PayrollWorkflowAction = 'send' | 'view' | 'feedback' | 'confirm' | 'lock' | 'unlock' | 'pay';

export interface PayrollHistoryEntry {
  id: string;
  bang_luong_id: string;
  hanh_dong: string;
  trang_thai_truoc: string | null;
  trang_thai_sau: string | null;
  noi_dung: string | null;
  ly_do: string | null;
  phien_ban: number | null;
  created_at: string;
  nguoi_thao_tac?: { ho_ten: string } | null;
}

export async function performPayrollWorkflowAction(
  action: PayrollWorkflowAction,
  payrollIds: string[],
  content?: string
): Promise<number> {
  if (payrollIds.length === 0) return 0;
  const { data, error } = await supabase.rpc('payroll_workflow_action', {
    p_action: action,
    p_payroll_ids: payrollIds,
    p_content: content?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function getPayrollHistory(payrollIds: string[]): Promise<PayrollHistoryEntry[]> {
  if (payrollIds.length === 0) return [];
  const { data, error } = await supabase
    .from('bang_luong_lich_su')
    .select('id, bang_luong_id, hanh_dong, trang_thai_truoc, trang_thai_sau, noi_dung, ly_do, phien_ban, created_at, nguoi_thao_tac:nguoi_thao_tac_id(ho_ten)')
    .in('bang_luong_id', payrollIds)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PayrollHistoryEntry[];
}
