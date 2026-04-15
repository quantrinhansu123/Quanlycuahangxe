import { supabase } from '../lib/supabase';

export interface FieldChange {
  field: string;
  label: string;
  old_value: string | number | null;
  new_value: string | number | null;
}

export interface EditHistoryRecord {
  id: string;
  phieu_id: string;
  nguoi_sua: string;
  thoi_gian: string;
  thay_doi: FieldChange[];
  created_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  ngay: 'Ngày lập',
  gio: 'Giờ lập',
  khach_hang_id: 'Khách hàng',
  nhan_vien_id: 'Người phụ trách',
  dich_vu_id: 'Dịch vụ chính',
  so_km: 'Số Km',
  ngay_nhac_thay_dau: 'Ngày nhắc thay dầu',
  ghi_chu: 'Ghi chú',
  id_bh: 'Mã phiếu',
};

const TRACKED_FIELDS = Object.keys(FIELD_LABELS);

export function computeChanges(
  oldData: Record<string, any>,
  newData: Record<string, any>,
  oldItems: any[] = [],
  newItems: any[] = []
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of TRACKED_FIELDS) {
    const oldVal = oldData[field] ?? null;
    const newVal = newData[field] ?? null;

    const oldStr = String(oldVal ?? '');
    const newStr = String(newVal ?? '');

    if (oldStr !== newStr) {
      changes.push({
        field,
        label: FIELD_LABELS[field] || field,
        old_value: oldVal,
        new_value: newVal,
      });
    }
  }

  // Check items changes
  if (oldItems && newItems) {
    const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

    const oldMap = new Map();
    oldItems.forEach(item => {
      const key = (item.san_pham || '').trim().toLowerCase();
      if (key) oldMap.set(key, { ...item, name_display: item.san_pham });
    });

    const newMap = new Map();
    newItems.forEach(item => {
      const key = (item.ten_dich_vu || item.san_pham || '').trim().toLowerCase();
      if (key) newMap.set(key, { ...item, name_display: item.ten_dich_vu || item.san_pham });
    });

    // Check for removed items
    oldMap.forEach((oldIt, key) => {
      if (!newMap.has(key)) {
        changes.push({
          field: 'service_removed',
          label: 'Xóa dịch vụ',
          old_value: oldIt.name_display,
          new_value: 'Đã xóa',
        });
      }
    });

    // Check for new items and updated items
    newMap.forEach((newIt, key) => {
      if (!oldMap.has(key)) {
        changes.push({
          field: 'service_added',
          label: 'Thêm dịch vụ',
          old_value: 'Trống',
          new_value: `${newIt.name_display} (SL: ${newIt.so_luong || 1}, Giá: ${formatCurrency(newIt.gia_ban || 0)})`,
        });
      } else {
        const oldIt = oldMap.get(key);
        const oldQty = oldIt.so_luong || 1;
        const newQty = newIt.so_luong || 1;
        const oldPrice = oldIt.gia_ban || 0;
        const newPrice = newIt.gia_ban || 0;

        if (oldQty !== newQty) {
          changes.push({
            field: 'qty_changed',
            label: `Sửa số lượng (${newIt.name_display})`,
            old_value: oldQty.toString(),
            new_value: newQty.toString(),
          });
        }
        if (oldPrice !== newPrice) {
          changes.push({
            field: 'price_changed',
            label: `Sửa giá bán (${newIt.name_display})`,
            old_value: formatCurrency(oldPrice),
            new_value: formatCurrency(newPrice),
          });
        }
      }
    });
  }

  return changes;
}

export async function saveEditHistory(
  phieuId: string,
  nguoiSua: string,
  changes: FieldChange[]
): Promise<void> {
  if (changes.length === 0) return;

  const { error } = await supabase
    .from('the_ban_hang_lich_su')
    .insert({
      phieu_id: phieuId,
      nguoi_sua: nguoiSua,
      thay_doi: changes,
    });

  if (error) {
    console.error('Error saving edit history:', error);
    if (error.code === '42P01') {
      alert('⚠️ Lỗi: Bảng "the_ban_hang_lich_su" chưa được tạo trên Supabase!\nVui lòng copy nội dung file sql/create_edit_history_table.sql và chạy trong mục SQL Editor của Supabase.');
    }
  }
}

export async function getEditHistory(phieuId: string): Promise<EditHistoryRecord[]> {
  const { data, error } = await supabase
    .from('the_ban_hang_lich_su')
    .select('*')
    .eq('phieu_id', phieuId)
    .order('thoi_gian', { ascending: false });

  if (error) {
    console.error('Error fetching edit history:', error);
    return [];
  }

  return (data || []) as EditHistoryRecord[];
}
