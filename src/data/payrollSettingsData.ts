import { supabase } from '../lib/supabase';

export const DEFAULT_MEAL_UNIT_PRICE = 35_000;
export const MEAL_UNIT_PRICE_SETTING_TYPE = 'don_gia_tien_an';

export interface ThongSoLuong {
  id: string;
  loai: string;
  co_so: string | null;
  gia_tri: number;
  mo_ta: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BieuThueTNCN {
  id: string;
  bac_thue: number;
  tu_nam: number | null;
  den_nam: number | null;
  tu_thang: number | null;
  den_thang: number | null;
  thue_suat: number;
}

export const getPayrollSettings = async (): Promise<ThongSoLuong[]> => {
  const { data, error } = await supabase
    .from('thong_so_luong')
    .select('*')
    .order('loai');

  if (error) { console.error('Error fetching payroll settings:', error); throw error; }
  return data as ThongSoLuong[];
};

export const upsertPayrollSetting = async (setting: Partial<ThongSoLuong>): Promise<ThongSoLuong> => {
  const { data, error } = await supabase
    .from('thong_so_luong')
    .upsert(setting)
    .select()
    .single();

  if (error) { console.error('Error upserting payroll setting:', error); throw error; }
  return data as ThongSoLuong;
};

/** Lấy đơn giá tiền ăn đang áp dụng cho các kỳ lương tạo mới. */
export const getDefaultMealUnitPrice = async (): Promise<number> => {
  const { data, error } = await supabase
    .from('thong_so_luong')
    .select('*')
    .eq('loai', MEAL_UNIT_PRICE_SETTING_TYPE)
    .is('co_so', null)
    .order('created_at')
    .limit(1);

  if (error) {
    console.error('Error fetching default meal unit price:', error);
    throw error;
  }
  const value = Number((data?.[0] as ThongSoLuong | undefined)?.gia_tri);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MEAL_UNIT_PRICE;
};

/**
 * Chỉnh đơn giá mặc định. Các kỳ cũ không đổi vì đơn giá thực tế được chốt
 * trong chi tiết của từng bảng lương khi lưu.
 */
export const saveDefaultMealUnitPrice = async (value: number): Promise<ThongSoLuong> => {
  const normalized = Math.max(0, Math.round(Number(value) || 0));
  const { data: existing, error: findError } = await supabase
    .from('thong_so_luong')
    .select('*')
    .eq('loai', MEAL_UNIT_PRICE_SETTING_TYPE)
    .is('co_so', null)
    .order('created_at')
    .limit(1);

  if (findError) {
    console.error('Error finding default meal unit price:', findError);
    throw findError;
  }

  const current = existing?.[0] as ThongSoLuong | undefined;
  return upsertPayrollSetting({
    ...(current?.id ? { id: current.id } : {}),
    loai: MEAL_UNIT_PRICE_SETTING_TYPE,
    co_so: null,
    gia_tri: normalized,
    mo_ta: 'Đơn giá tiền ăn mặc định cho kỳ lương mới (VND/bữa)',
  });
};

export const getTaxBrackets = async (): Promise<BieuThueTNCN[]> => {
  const { data, error } = await supabase
    .from('bieu_thue_tncn')
    .select('*')
    .order('bac_thue');

  if (error) { console.error('Error fetching tax brackets:', error); throw error; }
  return data as BieuThueTNCN[];
};

export const upsertTaxBracket = async (bracket: Partial<BieuThueTNCN>): Promise<BieuThueTNCN> => {
  const { data, error } = await supabase
    .from('bieu_thue_tncn')
    .upsert(bracket)
    .select()
    .single();

  if (error) { console.error('Error upserting tax bracket:', error); throw error; }
  return data as BieuThueTNCN;
};
