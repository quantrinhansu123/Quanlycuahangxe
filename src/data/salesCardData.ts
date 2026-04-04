import { supabase } from '../lib/supabase';
import type { KhachHang } from './customerData';
import type { NhanSu } from './personnelData';
import type { DichVu } from './serviceData';
import type { SalesCardCT } from './salesCardCTData';
 
// Helper to split array into chunks to avoid "URL too long" (400 Bad Request)
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export interface SalesCard {
  id: string;
  id_bh?: string | null; // Mã phiếu bán hàng (BH-XXXXXX)
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
  nhan_su_list?: Partial<NhanSu>[]; // Support multiple staff members
  dich_vu?: Partial<DichVu>;
  dich_vu_ids?: string[]; // Frontend helper for multi-selection
  the_ban_hang_ct?: SalesCardCT[]; // Related detail items
}

export async function enrichSalesCards(cards: SalesCard[]) {
  await Promise.all([
    attachDetails(cards),
    attachCustomer(cards),
    attachPersonnel(cards),
    attachService(cards)
  ]);
}

async function attachDetails(cards: SalesCard[]) {
  const bhIds = [...new Set(cards.map(c => c.id_bh).filter(Boolean))] as string[];
  const uuids = [...new Set(cards.map(c => c.id))];
  
  const allSearchIds = [...new Set([...bhIds, ...uuids])];
  
  if (allSearchIds.length > 0) {
    const chunks = chunkArray(allSearchIds, 50);
    const allDetails: SalesCardCT[] = [];
    
    await Promise.all(chunks.map(async (chunk) => {
      const { data: details } = await supabase
        .from('the_ban_hang_ct')
        .select('*')
        .in('id_don_hang', chunk);
      if (details) allDetails.push(...details);
    }));
    
    if (allDetails.length > 0) {
      const detailMap = new Map<string, SalesCardCT[]>();
      allDetails.forEach((d: SalesCardCT) => {
        if (d.id_don_hang) {
          const lowerId = d.id_don_hang.toLowerCase();
          const list = detailMap.get(lowerId) || [];
          list.push(d);
          detailMap.set(lowerId, list);
        }
      });
      cards.forEach(card => {
        // Try linking by id_bh first, then by internal UUID
        const detailsForBh = card.id_bh ? detailMap.get(card.id_bh.toLowerCase()) : null;
        const detailsForUuid = detailMap.get(card.id.toLowerCase());
        card.the_ban_hang_ct = detailsForBh || detailsForUuid || [];
      });
    }
  }
}

async function attachCustomer(cards: SalesCard[]) {
  const custIds = [...new Set(cards.map(c => c.khach_hang_id).filter(Boolean))] as string[];
  if (custIds.length > 0) {
    const chunks = chunkArray(custIds, 50);
    const allCustomers: any[] = [];

    await Promise.all(chunks.map(async (chunk) => {
      // Filter the chunk into ma_khach_hang candidates and UUID candidates
      const maIds = chunk;
      const uuidIds = chunk.filter(id => id.length === 36);
      
      const { data: customers } = await supabase
        .from('khach_hang')
        .select('id, ma_khach_hang, ho_va_ten, so_dien_thoai')
        .or(`ma_khach_hang.in.(${maIds.map(id => `"${id}"`).join(',')}),id.in.(${uuidIds.map(id => `"${id}"`).join(',')})`);
      
      if (customers) allCustomers.push(...customers);
    }));
    
    const maMap = new Map(allCustomers.filter(c => !!c.ma_khach_hang).map(c => [c.ma_khach_hang!.toLowerCase(), c]));
    const idMap = new Map(allCustomers.map(c => [c.id.toLowerCase(), c]));

    cards.forEach(card => {
      if (card.khach_hang_id) {
        const key = card.khach_hang_id.toLowerCase();
        const cust = maMap.get(key) || idMap.get(key);
        if (cust) card.khach_hang = { ho_va_ten: cust.ho_va_ten, so_dien_thoai: cust.so_dien_thoai };
      }
    });
  }
}

async function attachPersonnel(cards: SalesCard[]) {
  const allStaffIdsRaw = cards.map(c => c.nhan_vien_id).filter(Boolean) as string[];
  const staffIds = [...new Set(allStaffIdsRaw.flatMap(id => id.split(',').map(s => s.trim())))];
  if (staffIds.length > 0) {
    const chunks = chunkArray(staffIds, 50);
    const allPersonnel: any[] = [];

    await Promise.all(chunks.map(async (chunk) => {
      const { data: personnel } = await supabase
        .from('nhan_su')
        .select('ho_ten, id_nhan_su, vi_tri, co_so')
        .or(`ho_ten.in.(${chunk.map(id => `"${id}"`).join(',')}),id_nhan_su.in.(${chunk.map(id => `"${id}"`).join(',')})`);
      if (personnel) allPersonnel.push(...personnel);
    }));
    
    const nameMap = new Map(allPersonnel.map(p => [p.ho_ten.toLowerCase(), p]));
    const idMap = new Map(allPersonnel.filter(p => !!p.id_nhan_su).map(p => [p.id_nhan_su!.toLowerCase(), p]));

    cards.forEach(card => {
      if (card.nhan_vien_id) {
        const ids = card.nhan_vien_id.split(',').map(s => s.trim().toLowerCase());
        const matchedList: Partial<NhanSu>[] = [];
        ids.forEach(id => {
          const p = idMap.get(id) || nameMap.get(id);
          if (p) matchedList.push({ ho_ten: p.ho_ten, vi_tri: p.vi_tri, co_so: p.co_so });
        });
        if (matchedList.length > 0) {
          card.nhan_su_list = matchedList;
          card.nhan_su = matchedList[0];
        }
      }
    });
  }
}

async function attachService(cards: SalesCard[]) {
  const serviceIds = [...new Set(cards.map(c => c.dich_vu_id).filter(Boolean))] as string[];
  if (serviceIds.length > 0) {
    const chunks = chunkArray(serviceIds, 50);
    const allServices: any[] = [];

    await Promise.all(chunks.map(async (chunk) => {
      const { data: services } = await supabase
        .from('dich_vu')
        .select('ten_dich_vu, id_dich_vu, gia_ban, gia_nhap, co_so')
        .or(`ten_dich_vu.in.(${chunk.map(id => `"${id}"`).join(',')}),id_dich_vu.in.(${chunk.map(id => `"${id}"`).join(',')})`);
      if (services) allServices.push(...services);
    }));
    
    const serviceNameMap = new Map(allServices.map(s => [s.ten_dich_vu.toLowerCase(), s]));
    const serviceIdMap = new Map(allServices.filter(s => !!s.id_dich_vu).map(s => [s.id_dich_vu!.toLowerCase(), s]));

    cards.forEach(card => {
      if (card.dich_vu_id) {
        const key = card.dich_vu_id.toLowerCase();
        const s = serviceIdMap.get(key) || serviceNameMap.get(key);
        if (s) card.dich_vu = { ten_dich_vu: s.ten_dich_vu, gia_ban: s.gia_ban, gia_nhap: s.gia_nhap, co_so: s.co_so };
      }
    });
  }
}

export const getSalesCards = async (): Promise<SalesCard[]> => {
  const { data } = await supabase
    .from('the_ban_hang')
    .select(`*`)
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false });

  const cards = (data as SalesCard[]) || [];
  
  await enrichSalesCards(cards);

  return cards;
};

export const getSalesCardsPaginated = async (
  page: number, 
  pageSize: number, 
  searchQuery?: string
): Promise<{ data: SalesCard[], totalCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('the_ban_hang')
    .select(`*`, { count: 'exact' });

  if (searchQuery && searchQuery.trim()) {
    const term = searchQuery.trim();
    
    const { data: matchedCustomers } = await supabase
      .from('khach_hang')
      .select('ma_khach_hang')
      .or(`ho_va_ten.ilike.%${term}%,so_dien_thoai.ilike.%${term}%,ma_khach_hang.ilike.%${term}%`);
    
    const customerCodes = (matchedCustomers || []).slice(0, 50).map(c => c.ma_khach_hang).filter(Boolean);

    // Find matching services
    const { data: matchedServices } = await supabase
      .from('dich_vu')
      .select('id')
      .ilike('ten_dich_vu', `%${term}%`);
    const serviceIds = (matchedServices || []).slice(0, 50).map(s => s.id);

    // Filter Sales Cards
    const orConditions: string[] = [];
    if (customerCodes.length > 0) orConditions.push(`khach_hang_id.in.(${customerCodes.join(',')})`);
    if (serviceIds.length > 0) orConditions.push(`dich_vu_id.in.(${serviceIds.join(',')})`);
    orConditions.push(`id_bh.ilike.%${term}%`);
    orConditions.push(`khach_hang_id.ilike.%${term}%`);

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(','));
    }
  }

  const { data, count, error } = await query
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching paginated sales cards:', error);
    throw error;
  }

  const cards = (data as SalesCard[]) || [];
  
  await enrichSalesCards(cards);

  return {
    data: cards,
    totalCount: count || 0
  };
};

export const normalizeSalesCards = async () => {
  // 1. Fetch all cards missing id_bh
  const { data: cards } = await supabase
    .from('the_ban_hang')
    .select('*')
    .is('id_bh', null);
  
  if (!cards || cards.length === 0) return;

  for (const card of cards) {
    const idBh = `BH-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    // Update main card
    await supabase.from('the_ban_hang').update({ id_bh: idBh }).eq('id', card.id);
    
    // Update details linked by UUID
    await supabase.from('the_ban_hang_ct').update({ id_don_hang: idBh }).eq('id_don_hang', card.id);
  }
};

export const createSalesCard = async (card: Partial<SalesCard>): Promise<SalesCard> => {
  const { data, error } = await supabase
    .from('the_ban_hang')
    .insert(card)
    .select()
    .single();

  if (error) {
    console.error('Error creating sales card:', error);
    throw error;
  }
  return data as SalesCard;
};

export const updateSalesCard = async (id: string, card: Partial<SalesCard>): Promise<SalesCard> => {
  const { data, error } = await supabase
    .from('the_ban_hang')
    .update(card)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating sales card:', error);
    throw error;
  }
  return data as SalesCard;
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

export const deleteAllSalesCards = async (): Promise<void> => {
  const { error } = await supabase
    .from('the_ban_hang')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('Error deleting all sales cards:', error);
    throw error;
  }
};

export const getNextSalesCardCode = async (): Promise<string> => {
  const { data, error } = await supabase
    .from('the_ban_hang')
    .select('id_bh')
    .is('id_bh', 'not.null')
    .order('id_bh', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching next sales card code:', error);
    return 'BH-000001';
  }

  if (!data || data.length === 0 || !data[0].id_bh) {
    return 'BH-000001';
  }

  const lastCode = data[0].id_bh;
  const match = lastCode.match(/^BH-(\d+)$/);
  
  if (match) {
    const nextNumber = parseInt(match[1]) + 1;
    return `BH-${nextNumber.toString().padStart(6, '0')}`;
  }

  return `BH-000001`;
};
