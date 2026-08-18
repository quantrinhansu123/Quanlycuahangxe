import { supabase } from '../lib/supabase';

export interface BangLuong {
  id: string;
  nhan_su_id: string;
  thang: number;
  nam: number;
  co_so: string;
  ngay_cong_chuan: number;
  ngay_cong_thuc_te: number;
  doanh_so: number;
  doanh_so_muc_tieu: number;
  luong_co_ban: number;
  luong_ngay_cong: number;
  luong_doanh_so: number;
  luong_lam_them: number;
  tong_phu_cap: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  thue_tncn: number;
  khau_tru_khac: number;
  tong_thu_nhap: number;
  tong_khau_tru: number;
  thuc_linh: number;
  trang_thai: string;
  phien_ban?: number;
  gui_luc?: string | null;
  gui_boi?: string | null;
  xem_luc?: string | null;
  phan_hoi_nhan_vien?: string | null;
  phan_hoi_luc?: string | null;
  xac_nhan_luc?: string | null;
  khoa_luc?: string | null;
  khoa_boi?: string | null;
  chi_tra_luc?: string | null;
  chi_tra_boi?: string | null;
  mo_khoa_luc?: string | null;
  mo_khoa_boi?: string | null;
  ly_do_mo_khoa?: string | null;
  ghi_chu: string | null;
  chi_tiet?: BangLuongChiTiet[];
  ngay_cong_them?: number;
  phu_cap_chuyen_can?: number;
  phu_cap_xang_dien_thoai?: number;
  phu_cap_tham_nien?: number;
  phu_cap_tro_ngoai?: number;
  tien_an?: number;
  tien_an_tang_ca?: number;
  hoa_hong?: number;
  phan_tram_hoa_hong?: number;
  so_gio_tang_ca?: number;
  loai_nhan_vien?: number;
  dieu_chinh_chuyen_can?: number;
  dieu_chinh_xang_dien_thoai?: number;
  dieu_chinh_tham_nien?: number;
  dieu_chinh_tien_an?: number;
  dieu_chinh_tien_an_tang_ca?: number;
  so_bua_an_thuong?: number;
  so_bua_an_tang_ca?: number;
  don_gia_tien_an?: number;
  don_gia_tien_an_tang_ca?: number;
  thuong_thang?: number;
  nhan_su?: {
    id: string;
    ho_ten: string;
    vi_tri: string;
    hinh_anh: string | null;
    ngay_vao_lam?: string | null;
  };
  created_at?: string;
  updated_at?: string;
}

export interface BangLuongChiTiet {
  id: string;
  bang_luong_id: string;
  thanh_phan_luong_id: string | null;
  ten_thanh_phan: string;
  loai: string;
  gia_tri: number;
  ghi_chu: string | null;
}

export interface PayrollBreakdownValues {
  ngay_cong_them: number;
  phu_cap_chuyen_can: number;
  phu_cap_xang_dien_thoai: number;
  phu_cap_tham_nien: number;
  phu_cap_tro_ngoai: number;
  tien_an: number;
  tien_an_tang_ca: number;
  hoa_hong: number;
  phan_tram_hoa_hong: number;
  so_gio_tang_ca: number;
  /** 1 = chính thức, 2 = thời vụ, 0 = dữ liệu cũ chưa xác định. */
  loai_nhan_vien: number;
  /** -1 = tự động; từ 0 trở lên = số tiền admin điều chỉnh. */
  dieu_chinh_chuyen_can: number;
  dieu_chinh_xang_dien_thoai: number;
  dieu_chinh_tham_nien: number;
  dieu_chinh_tien_an: number;
  dieu_chinh_tien_an_tang_ca: number;
  /** Số bữa đã chốt của kỳ lương. */
  so_bua_an_thuong: number;
  so_bua_an_tang_ca: number;
  /** Đơn giá được chốt tại thời điểm lưu kỳ lương. */
  don_gia_tien_an: number;
  don_gia_tien_an_tang_ca: number;
  thuong_thang: number;
}

export const PAYROLL_DETAIL_CODES = {
  ngay_cong_them: 'payroll:ngay_cong_them',
  phu_cap_chuyen_can: 'payroll:chuyen_can',
  phu_cap_xang_dien_thoai: 'payroll:xang_dien_thoai',
  phu_cap_tham_nien: 'payroll:tham_nien',
  phu_cap_tro_ngoai: 'payroll:tro_ngoai',
  tien_an: 'payroll:tien_an',
  tien_an_tang_ca: 'payroll:tien_an_tang_ca',
  hoa_hong: 'payroll:hoa_hong',
  phan_tram_hoa_hong: 'payroll:phan_tram_hoa_hong',
  so_gio_tang_ca: 'payroll:gio_tang_ca',
  loai_nhan_vien: 'payroll:loai_nhan_vien',
  dieu_chinh_chuyen_can: 'payroll:dieu_chinh_chuyen_can',
  dieu_chinh_xang_dien_thoai: 'payroll:dieu_chinh_xang_dien_thoai',
  dieu_chinh_tham_nien: 'payroll:dieu_chinh_tham_nien',
  dieu_chinh_tien_an: 'payroll:dieu_chinh_tien_an',
  dieu_chinh_tien_an_tang_ca: 'payroll:dieu_chinh_tien_an_tang_ca',
  so_bua_an_thuong: 'payroll:so_bua_an_thuong',
  so_bua_an_tang_ca: 'payroll:so_bua_an_tang_ca',
  don_gia_tien_an: 'payroll:don_gia_tien_an',
  don_gia_tien_an_tang_ca: 'payroll:don_gia_tien_an_tang_ca',
  thuong_thang: 'payroll:thuong_thang',
} as const satisfies Record<keyof PayrollBreakdownValues, string>;

const PAYROLL_DETAIL_DEFINITIONS: Array<{
  key: keyof PayrollBreakdownValues;
  name: string;
  type: 'thu_nhap' | 'tham_so';
}> = [
  { key: 'ngay_cong_them', name: 'Ngày công thêm', type: 'tham_so' },
  { key: 'phu_cap_chuyen_can', name: 'Chuyên cần', type: 'thu_nhap' },
  { key: 'phu_cap_xang_dien_thoai', name: 'Xăng xe điện thoại', type: 'thu_nhap' },
  { key: 'phu_cap_tham_nien', name: 'Thâm niên', type: 'thu_nhap' },
  { key: 'phu_cap_tro_ngoai', name: 'Trọ ngoài', type: 'thu_nhap' },
  { key: 'tien_an', name: 'Tiền ăn', type: 'thu_nhap' },
  { key: 'tien_an_tang_ca', name: 'Tiền ăn tăng ca', type: 'thu_nhap' },
  { key: 'hoa_hong', name: 'Tiền % hoa hồng', type: 'thu_nhap' },
  { key: 'phan_tram_hoa_hong', name: '% hoa hồng', type: 'tham_so' },
  { key: 'so_gio_tang_ca', name: 'Số giờ tăng ca', type: 'tham_so' },
  { key: 'loai_nhan_vien', name: 'Loại nhân viên', type: 'tham_so' },
  { key: 'dieu_chinh_chuyen_can', name: 'Điều chỉnh chuyên cần', type: 'tham_so' },
  { key: 'dieu_chinh_xang_dien_thoai', name: 'Điều chỉnh xăng xe điện thoại', type: 'tham_so' },
  { key: 'dieu_chinh_tham_nien', name: 'Điều chỉnh thâm niên', type: 'tham_so' },
  { key: 'dieu_chinh_tien_an', name: 'Điều chỉnh tiền ăn', type: 'tham_so' },
  { key: 'dieu_chinh_tien_an_tang_ca', name: 'Điều chỉnh tiền ăn tăng ca', type: 'tham_so' },
  { key: 'so_bua_an_thuong', name: 'Số bữa ăn thường', type: 'tham_so' },
  { key: 'so_bua_an_tang_ca', name: 'Số bữa ăn tăng ca', type: 'tham_so' },
  { key: 'don_gia_tien_an', name: 'Đơn giá tiền ăn', type: 'tham_so' },
  { key: 'don_gia_tien_an_tang_ca', name: 'Đơn giá tiền ăn tăng ca', type: 'tham_so' },
  { key: 'thuong_thang', name: 'Thưởng tháng', type: 'thu_nhap' },
];

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hasPayrollDetail(
  item: Partial<BangLuong>,
  key: keyof PayrollBreakdownValues
): boolean {
  return (item.chi_tiet ?? []).some(
    (detail) => detail.ghi_chu === PAYROLL_DETAIL_CODES[key]
  );
}

export function getPayrollBreakdown(item: Partial<BangLuong>): PayrollBreakdownValues {
  const byCode = new Map(
    (item.chi_tiet ?? []).map((detail) => [detail.ghi_chu ?? '', numberValue(detail.gia_tri)])
  );
  const value = (key: keyof PayrollBreakdownValues): number => {
    const direct = item[key];
    if (direct != null) return numberValue(direct);
    return byCode.get(PAYROLL_DETAIL_CODES[key]) ?? 0;
  };
  const overrideValue = (key: keyof PayrollBreakdownValues): number => {
    const direct = item[key];
    if (direct != null) return numberValue(direct);
    return byCode.has(PAYROLL_DETAIL_CODES[key])
      ? byCode.get(PAYROLL_DETAIL_CODES[key]) ?? -1
      : -1;
  };

  return {
    ngay_cong_them: value('ngay_cong_them'),
    phu_cap_chuyen_can: value('phu_cap_chuyen_can'),
    phu_cap_xang_dien_thoai: value('phu_cap_xang_dien_thoai'),
    phu_cap_tham_nien: value('phu_cap_tham_nien'),
    phu_cap_tro_ngoai: value('phu_cap_tro_ngoai'),
    tien_an: value('tien_an'),
    tien_an_tang_ca: value('tien_an_tang_ca'),
    hoa_hong:
      item.hoa_hong != null || hasPayrollDetail(item, 'hoa_hong')
        ? value('hoa_hong')
        : numberValue(item.luong_doanh_so),
    phan_tram_hoa_hong: value('phan_tram_hoa_hong'),
    so_gio_tang_ca: value('so_gio_tang_ca'),
    loai_nhan_vien: value('loai_nhan_vien'),
    dieu_chinh_chuyen_can: overrideValue('dieu_chinh_chuyen_can'),
    dieu_chinh_xang_dien_thoai: overrideValue('dieu_chinh_xang_dien_thoai'),
    dieu_chinh_tham_nien: overrideValue('dieu_chinh_tham_nien'),
    dieu_chinh_tien_an: overrideValue('dieu_chinh_tien_an'),
    dieu_chinh_tien_an_tang_ca: overrideValue('dieu_chinh_tien_an_tang_ca'),
    so_bua_an_thuong: value('so_bua_an_thuong'),
    so_bua_an_tang_ca: value('so_bua_an_tang_ca'),
    don_gia_tien_an: value('don_gia_tien_an'),
    don_gia_tien_an_tang_ca: value('don_gia_tien_an_tang_ca'),
    thuong_thang: value('thuong_thang'),
  };
}

function hydratePayrollBreakdown(item: BangLuong): BangLuong {
  return { ...item, ...getPayrollBreakdown(item) };
}

export const getPayrollBatch = async (thang: number, nam: number, coSo?: string): Promise<BangLuong[]> => {
  let query = supabase
    .from('bang_luong')
    .select('*, nhan_su:nhan_su_id(id, ho_ten, vi_tri, hinh_anh, ngay_vao_lam), chi_tiet:bang_luong_chi_tiet(*)');
    
  query = query.eq('thang', thang).eq('nam', nam);
  
  if (coSo && coSo !== 'Tất cả cơ sở') {
    query = query.eq('co_so', coSo);
  }

  const { data, error } = await query.order('created_at');

  if (error) {
    console.error('Error fetching payroll batch:', error);
    throw error;
  }
  return (data as BangLuong[]).map(hydratePayrollBreakdown);
};

/**
 * Thay các chi tiết lương do màn hình chấm công quản lý, nhưng giữ nguyên mọi
 * dòng chi tiết khác do kế toán hoặc chính sách lương tạo.
 */
export const replacePayrollBreakdowns = async (
  entries: Array<{ bang_luong_id: string; values: PayrollBreakdownValues }>
): Promise<void> => {
  if (entries.length === 0) return;

  const payrollIds = Array.from(new Set(entries.map((entry) => entry.bang_luong_id)));
  const managedCodes = Object.values(PAYROLL_DETAIL_CODES);
  const { error: deleteError } = await supabase
    .from('bang_luong_chi_tiet')
    .delete()
    .in('bang_luong_id', payrollIds)
    .in('ghi_chu', managedCodes);

  if (deleteError) {
    console.error('Error clearing payroll breakdown:', deleteError);
    throw deleteError;
  }

  const payload = entries.flatMap((entry) =>
    PAYROLL_DETAIL_DEFINITIONS.map((definition) => ({
      bang_luong_id: entry.bang_luong_id,
      ten_thanh_phan: definition.name,
      loai: definition.type,
      gia_tri: numberValue(entry.values[definition.key]),
      ghi_chu: PAYROLL_DETAIL_CODES[definition.key],
    }))
  );
  const { error: insertError } = await supabase.from('bang_luong_chi_tiet').insert(payload);

  if (insertError) {
    console.error('Error saving payroll breakdown:', insertError);
    throw insertError;
  }
};

export const upsertPayrollItem = async (item: Partial<BangLuong>): Promise<BangLuong> => {
  const { data, error } = await supabase
    .from('bang_luong')
    .upsert(item)
    .select()
    .single();

  if (error) {
    console.error('Error upserting payroll item:', error);
    throw error;
  }
  return data as BangLuong;
};

export const deletePayrollBatch = async (thang: number, nam: number, coSo: string): Promise<void> => {
  let query = supabase
    .from('bang_luong')
    .delete()
    .eq('thang', thang)
    .eq('nam', nam);
    
  if (coSo && coSo !== 'Tất cả cơ sở') {
    query = query.eq('co_so', coSo);
  }

  const { error } = await query;

  if (error) {
    console.error('Error deleting payroll batch:', error);
    throw error;
  }
};

export const updatePayrollStatus = async (ids: string[], status: string): Promise<void> => {
  const { error } = await supabase
    .from('bang_luong')
    .update({ trang_thai: status })
    .in('id', ids);

  if (error) {
    console.error('Error updating payroll status:', error);
    throw error;
  }
};

export const bulkCreatePayrollItems = async (items: Partial<BangLuong>[]): Promise<void> => {
  const { error } = await supabase
    .from('bang_luong')
    .insert(items);

  if (error) {
    console.error('Error bulk creating payroll items:', error);
    throw error;
  }
};

/**
 * Tạo mới hoặc cập nhật bảng lương theo khóa duy nhất nhân sự + tháng + năm.
 * Dùng cho luồng đồng bộ chấm công để không sinh bản ghi trùng kỳ lương.
 */
export const bulkUpsertPayrollItems = async (items: Partial<BangLuong>[]): Promise<void> => {
  if (items.length === 0) return;

  // Không gửi `id`: trong cùng một batch có cả dòng cũ (có id) và dòng mới
  // (DB phải tự sinh id). Nếu trộn hai dạng, PostgREST sẽ điền NULL cho id của
  // dòng mới và vi phạm khóa chính. Khóa nghiệp vụ dưới đây đủ để update dòng cũ.
  const payload = items.map((item) => {
    const cleanItem = { ...item };
    delete cleanItem.id;
    return cleanItem;
  });

  const { error } = await supabase
    .from('bang_luong')
    .upsert(payload, {
      onConflict: 'nhan_su_id,thang,nam',
      defaultToNull: false,
    });

  if (error) {
    console.error('Error syncing payroll items:', error);
    throw error;
  }
};

/** Chỉ điều chỉnh các tổng tiền chịu ảnh hưởng bởi tiền ăn, không chạm trạng thái hay khoản lương khác. */
export const updatePayrollMealTotals = async (
  entries: Array<{
    id: string;
    tong_phu_cap: number;
    tong_thu_nhap: number;
    thuc_linh: number;
  }>
): Promise<void> => {
  await Promise.all(
    entries.map(async ({ id, ...values }) => {
      const { error } = await supabase.from('bang_luong').update(values).eq('id', id);
      if (error) {
        console.error('Error updating payroll meal totals:', error);
        throw error;
      }
    })
  );
};
