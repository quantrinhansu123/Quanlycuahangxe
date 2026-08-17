import { supabase } from '../lib/supabase';

export type ZnsRatingSource = 'webhook' | 'dong_bo';

export interface ZnsRating {
  id: string;
  gui_log_id: string | null;
  chien_dich_id: string | null;
  khach_hang_id: string | null;
  zalo_msg_id: string | null;
  tracking_id: string | null;
  rating_type: string | null;
  thang_do: string | null;
  rate: number | null;
  ghi_chu: string | null;
  nhan_xet_nhanh: string[];
  thoi_diem_danh_gia: string | null;
  nguon: ZnsRatingSource;
  created_at: string;
  khach_hang: { ho_va_ten: string; so_dien_thoai: string } | null;
  chien_dich: { ten_chien_dich: string; template_id: string } | null;
}

export async function listRatings(): Promise<ZnsRating[]> {
  const { data, error } = await supabase
    .from('zns_danh_gia')
    .select(
      '*, khach_hang:khach_hang_id(ho_va_ten, so_dien_thoai), chien_dich:chien_dich_id(ten_chien_dich, template_id)'
    )
    .order('thoi_diem_danh_gia', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data as ZnsRating[]) || [];
}

export interface SyncRatingsInput {
  template_id: string;
  from_time: number;
  to_time: number;
}

export interface SyncRatingsResult {
  total: number;
  synced: number;
}

/** Đồng bộ thủ công đánh giá của 1 template qua Edge Function zns-ratings-sync (API rating/get của Zalo). */
export async function syncRatings(input: SyncRatingsInput): Promise<SyncRatingsResult> {
  const { data, error } = await supabase.functions.invoke('zns-ratings-sync', { body: input });
  if (error) throw error;
  return data as SyncRatingsResult;
}
