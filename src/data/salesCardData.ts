import { supabase } from '../lib/supabase';
import type { KhachHang } from './customerData';
import type { NhanSu } from './personnelData';
import type { DichVu } from './serviceData';

export interface SalesCard {
  id: string;
  ngay: string;
  gio: string;
  khach_hang_id: string | null;
  nhan_vien_id: string | null;
  dich_vu_id: string | null;
  danh_gia: string | null;
  so_km: number;
  ngay_nhac_thay_dau: string | null;
  created_at?: string;
  
  // Joined fields
  khach_hang?: Partial<KhachHang>;
  nhan_su?: Partial<NhanSu>;
  dich_vu?: Partial<DichVu>;
}

export const getSalesCards = async (): Promise<SalesCard[]> => {
  const { data, error } = await supabase
    .from('the_ban_hang')
    .select(`
      *,
      khach_hang:khach_hang_id(ho_va_ten, so_dien_thoai),
      nhan_su:nhan_vien_id(ho_ten),
      dich_vu:dich_vu_id(ten_dich_vu)
    `)
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false });

  if (error) {
    console.error('Error fetching sales cards:', error);
    throw error;
  }
  return data as SalesCard[];
};

export const upsertSalesCard = async (card: Partial<SalesCard>): Promise<SalesCard> => {
  const { data, error } = await supabase
    .from('the_ban_hang')
    .upsert(card)
    .select()
    .single();

  if (error) {
    console.error('Error upserting sales card:', error);
    throw error;
  }
  return data as SalesCard;
};

export const bulkUpsertSalesCards = async (cards: Partial<SalesCard>[]): Promise<void> => {
  const { error } = await supabase
    .from('the_ban_hang')
    .upsert(cards);

  if (error) {
    console.error('Error bulk upserting sales cards:', error);
    throw error;
  }
};

export const deleteSalesCard = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('the_ban_hang')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting sales card:', error);
    throw error;
  }
};
