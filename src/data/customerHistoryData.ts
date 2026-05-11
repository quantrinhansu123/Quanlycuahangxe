import { supabase } from '../lib/supabase';

export interface FieldChange {
  field: string;
  label: string;
  old_value: string | number | null;
  new_value: string | number | null;
}

export interface CustomerEditHistory {
  id: string;
  customer_id: string;
  nguoi_sua: string;
  thoi_gian: string;
  thay_doi: FieldChange[];
  created_at: string;
}

const CUSTOMER_FIELD_LABELS: Record<string, string> = {
  ho_va_ten: 'Họ và tên',
  so_dien_thoai: 'Số điện thoại',
  dia_chi_hien_tai: 'Địa chỉ',
  bien_so_xe: 'Biển số xe',
  ma_khach_hang: 'Mã khách hàng',
  ngay_dang_ky: 'Ngày đăng ký',
  so_km: 'Số KM',
  so_ngay_thay_dau: 'Chu kỳ',
  ngay_thay_dau: 'Ngày thay dầu',
};

const TRACKED_FIELDS = Object.keys(CUSTOMER_FIELD_LABELS);

export function computeCustomerChanges(
  oldData: Record<string, any>,
  newData: Record<string, any>
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of TRACKED_FIELDS) {
    const oldVal = oldData[field] ?? null;
    const newVal = newData[field] ?? null;

    const oldStr = String(oldVal ?? '').trim();
    const newStr = String(newVal ?? '').trim();

    if (oldStr !== newStr) {
      changes.push({
        field,
        label: CUSTOMER_FIELD_LABELS[field] || field,
        old_value: oldVal,
        new_value: newVal,
      });
    }
  }

  return changes;
}

export async function saveCustomerEditHistory(
  customerId: string,
  nguoiSua: string,
  changes: FieldChange[]
): Promise<void> {
  if (changes.length === 0) return;

  const { error } = await supabase
    .from('khach_hang_lich_su')
    .insert({
      customer_id: customerId,
      nguoi_sua: nguoiSua,
      thay_doi: changes,
    });

  if (error) {
    console.error('Error saving customer edit history:', error);
    if (error.code === '42P01') {
       // Table doesn't exist - silent fail or log
       console.warn('Table khach_hang_lich_su does not exist.');
    }
  }
}

export async function getCustomerEditHistory(customerId: string): Promise<CustomerEditHistory[]> {
  const { data, error } = await supabase
    .from('khach_hang_lich_su')
    .select('*')
    .eq('customer_id', customerId)
    .order('thoi_gian', { ascending: false });

  if (error) {
    console.error('Error fetching customer edit history:', error);
    return [];
  }

  return (data || []) as CustomerEditHistory[];
}
