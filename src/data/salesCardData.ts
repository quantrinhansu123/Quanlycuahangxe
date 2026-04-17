import { supabase } from '../lib/supabase';
import type { KhachHang } from './customerData';
import type { NhanSu } from './personnelData';
import type { SalesCardCT } from './salesCardCTData';
import type { DichVu } from './serviceData';
import type { ThuChi } from './financialData';
import { getTransactionsByOrderIds } from './financialData';

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
  ghi_chu: string | null;
  ten_khach_hang: string | null;
  so_dien_thoai: string | null;
  phuong_thuc_thanh_toan?: string | null;
  created_at?: string;

  // Joined fields
  khach_hang?: Partial<KhachHang>;
  nhan_su?: Partial<NhanSu>;
  nhan_su_list?: Partial<NhanSu>[]; // Support multiple staff members
  dich_vu?: Partial<DichVu>;
  dich_vu_ids?: string[]; // Frontend helper for multi-selection
  the_ban_hang_ct?: SalesCardCT[]; // Related detail items
  thu_chi?: Partial<ThuChi>;
}

export async function enrichSalesCards(cards: SalesCard[]) {
  await Promise.all([
    attachDetails(cards),
    attachCustomer(cards),
    attachPersonnel(cards),
    attachService(cards),
    attachFinancialRecord(cards)
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
        .select('id, ma_khach_hang, ho_va_ten, so_dien_thoai, dia_chi_hien_tai')
        .or(`ma_khach_hang.in.(${maIds.map(id => `"${id}"`).join(',')}),id.in.(${uuidIds.map(id => `"${id}"`).join(',')})`);

      if (customers) allCustomers.push(...customers);
    }));

    const maMap = new Map(allCustomers.filter(c => !!c.ma_khach_hang).map(c => [c.ma_khach_hang!.toLowerCase(), c]));
    const idMap = new Map(allCustomers.map(c => [c.id.toLowerCase(), c]));

    cards.forEach(card => {
      if (card.khach_hang_id) {
        const key = card.khach_hang_id.toLowerCase();
        const cust = maMap.get(key) || idMap.get(key);
        if (cust) card.khach_hang = {
          ho_va_ten: cust.ho_va_ten,
          so_dien_thoai: cust.so_dien_thoai,
          dia_chi_hien_tai: cust.dia_chi_hien_tai
        };
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

async function attachFinancialRecord(cards: SalesCard[]) {
  const ids = cards.map(c => c.id).filter(Boolean);
  if (ids.length > 0) {
    const chunks = chunkArray(ids, 50);
    const allFinancials: ThuChi[] = [];
    
    await Promise.all(chunks.map(async (chunk) => {
      const records = await getTransactionsByOrderIds(chunk);
      if (records && records.length > 0) allFinancials.push(...records);
    }));

    const finMap = new Map(allFinancials.map(f => [f.id_don, f]));

    cards.forEach(card => {
      const fin = finMap.get(card.id);
      if (fin) {
        card.thu_chi = fin;
      }
    });
  }
}

export const getSalesCards = async (staffId?: string): Promise<SalesCard[]> => {
  let query = supabase
    .from('the_ban_hang')
    .select(`*`)
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false });

  if (staffId) {
    query = query.ilike('nhan_vien_id', `%${staffId}%`);
  }

  const { data } = await query;

  const cards = (data as SalesCard[]) || [];

  await enrichSalesCards(cards);

  return cards;
};

export const getSalesCardsPaginated = async (
  page: number,
  pageSize: number,
  searchQuery?: string,
  startDate?: string,
  endDate?: string,
  staffId?: string,
  branch?: string
): Promise<{ data: SalesCard[], totalCount: number, totalAmount: number, totalCustomers: number, newCustomersCount: number, returningCustomersCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 1. Build the base filter query for the main table (without range yet)
  let baseQuery = supabase
    .from('the_ban_hang')
    .select(`id, id_bh, dich_vu_id, ngay, gio, khach_hang_id, nhan_vien_id, ten_khach_hang, so_dien_thoai`, { count: 'exact' });

  if (searchQuery && searchQuery.trim()) {
    const term = searchQuery.trim();

    const { data: matchedCustomers } = await supabase
      .from('khach_hang')
      .select('ma_khach_hang')
      .or(`ho_va_ten.ilike.%${term}%,so_dien_thoai.ilike.%${term}%,ma_khach_hang.ilike.%${term}%`);

    const customerCodes = (matchedCustomers || []).slice(0, 50).map(c => c.ma_khach_hang).filter(Boolean);

    const { data: matchedServices } = await supabase
      .from('dich_vu')
      .select('id')
      .ilike('ten_dich_vu', `%${term}%`);
    const serviceIds = (matchedServices || []).slice(0, 50).map(s => s.id);

    const orConditions: string[] = [];
    if (customerCodes.length > 0) orConditions.push(`khach_hang_id.in.(${customerCodes.map(c => `"${c}"`).join(',')})`);
    if (serviceIds.length > 0) orConditions.push(`dich_vu_id.in.(${serviceIds.map(s => `"${s}"`).join(',')})`);
    orConditions.push(`id_bh.ilike.%${term}%`);
    orConditions.push(`khach_hang_id.ilike.%${term}%`);

    if (orConditions.length > 0) {
      baseQuery = baseQuery.or(orConditions.join(','));
    }
  }

  if (startDate) baseQuery = baseQuery.gte('ngay', startDate);
  if (endDate) baseQuery = baseQuery.lte('ngay', endDate);
  if (staffId) baseQuery = baseQuery.ilike('nhan_vien_id', `%${staffId}%`);

  if (branch) {
    // 1. Search in Customers table strictly by branch (Address = Branch Location)
    const branchNameOnly = branch.replace('Cơ sở ', '');
    const { data: matchedCustomers } = await supabase
      .from('khach_hang')
      .select('id, ma_khach_hang')
      .or(`dia_chi_hien_tai.eq."${branch}",dia_chi_hien_tai.eq."${branchNameOnly}"`)
      .limit(300); // Max 300 IDs to keep query length safe but cover more ground

    const customerIds = (matchedCustomers || []).map(c => c.id);
    const customerCodes = (matchedCustomers || []).map(c => c.ma_khach_hang).filter(Boolean);
    
    const branchOrConditions: string[] = [];
    
    if (customerIds.length > 0) {
      branchOrConditions.push(`khach_hang_id.in.(${customerIds.map(id => `"${id}"`).join(',')})`);
    }
    if (customerCodes.length > 0) {
      branchOrConditions.push(`khach_hang_id.in.(${customerCodes.map(id => `"${id}"`).join(',')})`);
    }

    if (branchOrConditions.length > 0) {
      baseQuery = baseQuery.or(branchOrConditions.join(','));
    } else {
      // No recent customers found for this branch address
      baseQuery = baseQuery.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }

  // 2. Fetch all matching cards to calculate the true total (for up to 1000 items at once)
  const { data: allMatchingCards, count, error } = await baseQuery
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === 'PGRST103') return { data: [], totalCount: count || 0, totalAmount: 0, totalCustomers: 0, newCustomersCount: 0, returningCustomersCount: 0 };
    throw error;
  }

  const allCards = (allMatchingCards as SalesCard[]) || [];
  const pagedCards = allCards.slice(from, to + 1);

  await enrichSalesCards(pagedCards);

  // 3. Calculate Grand Totals across ALL matching results
  let grandTotal = 0;
  let totalCustomersCount = 0;
  let newCustomersCount = 0;
  let returningCustomersCount = 0;

  if (allCards.length > 0) {
    // Unique customers identification
    const uniqueCustomerNames = [...new Set(
      allCards.map(c => c.khach_hang?.ho_va_ten || c.ten_khach_hang || '').filter(Boolean)
    )];
    totalCustomersCount = uniqueCustomerNames.length;

    // Categorize New vs Returning
    if (uniqueCustomerNames.length > 0) {
      const firstDatesMap = await getCustomerFirstSaleDates(uniqueCustomerNames);
      
      uniqueCustomerNames.forEach(name => {
        const key = name.trim().toLowerCase();
        const firstDate = firstDatesMap[key];
        
        if (startDate && firstDate) {
          if (firstDate < startDate) {
            returningCustomersCount++;
          } else {
            newCustomersCount++;
          }
        } else {
          // If no filter, treat everyone as 'New' for the view, or we can just say newCustomersCount = total
          newCustomersCount++;
        }
      });
    }

    const allIds = allCards.map(c => c.id).filter(Boolean);
    const allOrderCodes = allCards.map(c => c.id_bh).filter(Boolean) as string[];
    const allRefs = [...new Set([...allIds, ...allOrderCodes])];

    const chunks = chunkArray(allRefs, 100);
    const totalDetails: { thanh_tien: number, gia_ban: number, so_luong: number, id_don_hang: string }[] = [];

    await Promise.all(chunks.map(async (chunk) => {
      const { data: details } = await supabase
        .from('the_ban_hang_ct')
        .select('thanh_tien, gia_ban, so_luong, id_don_hang')
        .in('id_don_hang', chunk);
      if (details) totalDetails.push(...details);
    }));

    // Sum up
    grandTotal = totalDetails.reduce((sum, d) => sum + (d.thanh_tien || ((d.gia_ban || 0) * (d.so_luong || 1))), 0);

    // Legacy fallback for cards with dich_vu_id but NO details in the_ban_hang_ct
    const cardsWithDetails = new Set(totalDetails.map(d => d.id_don_hang.toLowerCase()));
    const legacyCards = allCards.filter(c => 
      c.dich_vu_id && 
      !cardsWithDetails.has(c.id.toLowerCase()) && 
      (!c.id_bh || !cardsWithDetails.has(c.id_bh.toLowerCase()))
    );

    if (legacyCards.length > 0) {
      const legacyServiceIds = [...new Set(legacyCards.map(c => c.dich_vu_id).filter(Boolean) as string[])];
      const { data: services } = await supabase
        .from('dich_vu')
        .select('id, gia_ban, ten_dich_vu')
        .or(`id.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')}),ten_dich_vu.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')})`);
      
      if (services) {
        const priceMap = new Map();
        services.forEach(s => {
          if (s.id) priceMap.set(s.id.toLowerCase(), s.gia_ban || 0);
          if (s.ten_dich_vu) priceMap.set(s.ten_dich_vu.toLowerCase(), s.gia_ban || 0);
        });
        legacyCards.forEach(c => {
          const price = priceMap.get(c.dich_vu_id!.toLowerCase()) || 0;
          grandTotal += price;
        });
      }
    }
  }

  return {
    data: pagedCards,
    totalCount: count || 0,
    totalAmount: grandTotal,
    totalCustomers: totalCustomersCount,
    newCustomersCount,
    returningCustomersCount
  };
};

export const getSalesCardsByCustomer = async (
  customerId: string,
  startDate?: string,
  endDate?: string
): Promise<SalesCard[]> => {
  let query = supabase
    .from('the_ban_hang')
    .select(`*`)
    .eq('khach_hang_id', customerId);

  if (startDate) {
    query = query.gte('ngay', startDate);
  }
  if (endDate) {
    query = query.lte('ngay', endDate);
  }

  const { data, error } = await query
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching customer sales cards:', error);
    throw error;
  }

  const cards = (data as SalesCard[]) || [];

  await enrichSalesCards(cards);

  return cards;
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
  // Use `upsertSalesCard` which has retry logic built-in to prevent unique key violations
  return await upsertSalesCard(card, true);
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

export const upsertSalesCard = async (card: Partial<SalesCard>, isNew: boolean = false): Promise<SalesCard> => {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    if (isNew || !card.id) {
      // For new records, use insert to prevent accidental overwrites if the generated ID somehow exists
      const { data, error } = await supabase
        .from('the_ban_hang')
        .insert(card)
        .select()
        .single();

      if (error) {
        if (error.code === '23505' && attempts < maxAttempts - 1) { // Unique violation
          console.warn(`Unique constraint violation for ID ${card.id_bh}. Retrying...`);
          card.id_bh = await getNextSalesCardCode();
          attempts++;
          continue;
        }
        console.error('Error creating sales card (Insert):', error);
        throw error;
      }
      return data as SalesCard;
    }

    // Update mode
    // We already know it has an ID because `!card.id` is handled above
    const { data, error } = await supabase
      .from('the_ban_hang')
      .update(card)
      .eq('id', card.id as string)
      .select()
      .single();

    if (error) {
      console.error('Error upserting sales card:', error);
      throw error;
    }
    return data as SalesCard;
  }

  throw new Error("Failed to insert after multiple attempts due to ID collision.");
};

export const bulkUpsertSalesCards = async (cards: Partial<SalesCard>[]): Promise<void> => {
  const toUpdate = cards.filter(c => c.id);
  const toInsert = cards.filter(c => !c.id);

  if (toUpdate.length > 0) {
    const { error } = await supabase.from('the_ban_hang').upsert(toUpdate);
    if (error) { console.error('Error upserting sales cards:', error); throw error; }
  }
  if (toInsert.length > 0) {
    const cleanInserts = toInsert.map(({ id, ...rest }) => rest);
    const { error } = await supabase.from('the_ban_hang').insert(cleanInserts);
    if (error) { console.error('Error inserting sales cards:', error); throw error; }
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
  // Fetch newest 1000 records to ensure we find the latest numeric maximum
  // sorted by created_at so we don't just fetch old alphanumeric IDs
  const { data, error } = await supabase
    .from('the_ban_hang')
    .select('id_bh')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('Error fetching sales card codes:', error);
    return `BH-${Date.now().toString().slice(-6)}`; // Fallback to timestamp to avoid collision
  }

  if (!data || data.length === 0) {
    return 'BH-000001';
  }

  // Find the highest numeric value from valid BH-xxxxxx patterns
  let maxNum = 0;
  let hasValidCode = false;

  data.forEach(item => {
    if (item.id_bh) {
      const match = item.id_bh.match(/^BH-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
          hasValidCode = true;
        }
      }
    }
  });

  if (!hasValidCode) {
    // If no records match the pattern, it's the first one
    return 'BH-000001';
  }

  const nextNumber = maxNum + 1;
  return `BH-${nextNumber.toString().padStart(6, '0')}`;
};

/**
 * Lấy ngày mua hàng đầu tiên theo TÊN KHÁCH HÀNG để phân loại mới/cũ.
 * Dò toàn bộ lịch sử đơn hàng bằng tên khách.
 * Key kết quả được normalize (trim + lowercase) để so khớp chính xác.
 */
export async function getCustomerFirstSaleDates(customerNames: string[]): Promise<Record<string, string>> {
  if (customerNames.length === 0) return {};
  
  const uniqueNames = [...new Set(customerNames.filter(n => n && n.trim()))];
  if (uniqueNames.length === 0) return {};

  const results: Record<string, string> = {};
  const chunks = chunkArray(uniqueNames, 100);

  await Promise.all(chunks.map(async (chunk) => {
    const { data } = await supabase
      .from('the_ban_hang')
      .select('ten_khach_hang, ngay')
      .in('ten_khach_hang', chunk);

    if (data) {
      data.forEach(sale => {
        const name = sale.ten_khach_hang;
        if (name) {
          const key = name.trim().toLowerCase();
          if (!results[key] || sale.ngay < results[key]) {
            results[key] = sale.ngay;
          }
        }
      });
    }
  }));

  return results;
}

/**
 * Lấy ngày mua hàng gần nhất của danh sách khách hàng.
 * Trả về Map giữa ID khách hàng (UUID hoặc mã KH) và ngày gần nhất.
 */
export async function getCustomerLastSaleDates(identifiers: string[]): Promise<Record<string, string>> {
  if (identifiers.length === 0) return {};
  
  const uniqueIds = [...new Set(identifiers.filter(id => id && id.trim()))];
  if (uniqueIds.length === 0) return {};

  const results: Record<string, string> = {};
  const chunks = chunkArray(uniqueIds, 100);

  await Promise.all(chunks.map(async (chunk) => {
    const { data } = await supabase
      .from('the_ban_hang')
      .select('khach_hang_id, ngay')
      .in('khach_hang_id', chunk)
      .order('ngay', { ascending: false });

    if (data) {
      data.forEach(sale => {
        const id = sale.khach_hang_id;
        if (id && !results[id]) {
          results[id] = sale.ngay;
        }
      });
    }
  }));

  return results;
}

/**
 * Lấy tổng doanh số của danh sách khách hàng.
 * Trả về Map giữa ID khách hàng (UUID hoặc mã KH) và tổng số tiền đã chi tiêu.
 */
export async function getCustomerTotalRevenues(identifiers: string[]): Promise<Record<string, number>> {
  if (identifiers.length === 0) return {};
  
  const uniqueIds = [...new Set(identifiers.filter(id => id && id.trim()))];
  if (uniqueIds.length === 0) return {};

  const revenues: Record<string, number> = {};
  const chunks = chunkArray(uniqueIds, 50);

  for (const chunk of chunks) {
    // 1. Lấy tất cả các đơn hàng của nhóm khách hàng này
    const { data: salesCards } = await supabase
      .from('the_ban_hang')
      .select('id, id_bh, khach_hang_id, dich_vu_id')
      .in('khach_hang_id', chunk);

    if (!salesCards || salesCards.length === 0) continue;

    const orderIds = salesCards.map(c => c.id);
    const orderCodes = salesCards.map(c => c.id_bh).filter(Boolean) as string[];
    const allOrderRefs = [...new Set([...orderIds, ...orderCodes])];

    // 2. Lấy chi tiết các đơn hàng (the_ban_hang_ct)
    const { data: details } = await supabase
      .from('the_ban_hang_ct')
      .select('id_don_hang, thanh_tien')
      .in('id_don_hang', allOrderRefs);

    const orderTotalsFromDetails = new Map<string, number>();
    if (details) {
      details.forEach(d => {
        if (d.id_don_hang) {
          const key = d.id_don_hang.toLowerCase();
          orderTotalsFromDetails.set(key, (orderTotalsFromDetails.get(key) || 0) + (d.thanh_tien || 0));
        }
      });
    }

    // 3. Xử lý các đơn hàng dùng dich_vu_id (legacy)
    const legacyServiceIds = [...new Set(salesCards.filter(c => c.dich_vu_id).map(c => c.dich_vu_id!))];
    const servicePrices = new Map<string, number>();
    if (legacyServiceIds.length > 0) {
      const { data: services } = await supabase
        .from('dich_vu')
        .select('ten_dich_vu, id_dich_vu, gia_ban')
        .or(`ten_dich_vu.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')}),id_dich_vu.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')})`);
      if (services) {
        services.forEach(s => {
          if (s.id_dich_vu) servicePrices.set(s.id_dich_vu.toLowerCase(), s.gia_ban || 0);
          servicePrices.set(s.ten_dich_vu.toLowerCase(), s.gia_ban || 0);
        });
      }
    }

    // 4. Tổng hợp doanh số theo từng khách hàng
    salesCards.forEach(card => {
      const khId = card.khach_hang_id;
      if (!khId) return;

      // Ưu tiên tổng từ chi tiết đơn hàng
      let cardTotal = (card.id_bh && orderTotalsFromDetails.get(card.id_bh.toLowerCase())) || 
                      orderTotalsFromDetails.get(card.id.toLowerCase()) || 0;

      // Nếu không có chi tiết, thử dùng dich_vu_id
      if (cardTotal === 0 && card.dich_vu_id) {
        cardTotal = servicePrices.get(card.dich_vu_id.toLowerCase()) || 0;
      }

      revenues[khId] = (revenues[khId] || 0) + cardTotal;
    });
  }

  return revenues;
}

/**
 * Lấy thống kê tổng hợp (doanh số và số lần ghé) của danh sách khách hàng.
 */
export async function getCustomerStats(identifiers: string[]): Promise<Record<string, { totalRevenue: number, visitCount: number }>> {
  if (identifiers.length === 0) return {};
  
  const uniqueIds = [...new Set(identifiers.filter(id => id && id.trim()))];
  if (uniqueIds.length === 0) return {};

  const stats: Record<string, { totalRevenue: number, visitCount: number }> = {};
  const chunks = chunkArray(uniqueIds, 50);

  for (const chunk of chunks) {
    const { data: salesCards } = await supabase
      .from('the_ban_hang')
      .select('id, id_bh, khach_hang_id, dich_vu_id')
      .in('khach_hang_id', chunk);

    if (!salesCards || salesCards.length === 0) continue;

    const allOrderRefs = [...new Set([
      ...salesCards.map(c => c.id),
      ...salesCards.map(c => c.id_bh).filter(Boolean) as string[]
    ])];

    const { data: details } = await supabase
      .from('the_ban_hang_ct')
      .select('id_don_hang, thanh_tien')
      .in('id_don_hang', allOrderRefs);

    const orderTotalsMap = new Map<string, number>();
    if (details) {
      details.forEach(d => {
        if (d.id_don_hang) {
          const key = d.id_don_hang.toLowerCase();
          orderTotalsMap.set(key, (orderTotalsMap.get(key) || 0) + (d.thanh_tien || 0));
        }
      });
    }

    const legacyServiceIds = [...new Set(salesCards.filter(c => c.dich_vu_id).map(c => c.dich_vu_id!))];
    const servicePrices = new Map<string, number>();
    if (legacyServiceIds.length > 0) {
      const { data: services } = await supabase
        .from('dich_vu')
        .select('ten_dich_vu, id_dich_vu, gia_ban')
        .or(`ten_dich_vu.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')}),id_dich_vu.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')})`);
      if (services) {
        services.forEach(s => {
          if (s.id_dich_vu) servicePrices.set(s.id_dich_vu.toLowerCase(), s.gia_ban || 0);
          servicePrices.set(s.ten_dich_vu.toLowerCase(), s.gia_ban || 0);
        });
      }
    }

    salesCards.forEach(card => {
      const khId = card.khach_hang_id;
      if (!khId) return;

      if (!stats[khId]) stats[khId] = { totalRevenue: 0, visitCount: 0 };
      
      let cardTotal = (card.id_bh && orderTotalsMap.get(card.id_bh.toLowerCase())) || 
                      orderTotalsMap.get(card.id.toLowerCase()) || 0;

      if (cardTotal === 0 && card.dich_vu_id) {
        cardTotal = servicePrices.get(card.dich_vu_id.toLowerCase()) || 0;
      }

      stats[khId].totalRevenue += cardTotal;
      stats[khId].visitCount += 1;
    });
  }

  return stats;
}





