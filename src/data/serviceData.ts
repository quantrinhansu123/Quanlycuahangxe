import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function formatServiceSaveError(error: unknown): string {
  const e = error as PostgrestError & { status?: number };
  const msg = (e?.message || '').toLowerCase();
  if (e?.code === '23505' || e?.status === 409) {
    if (msg.includes('id_dich_vu')) {
      return 'Mã dịch vụ đã tồn tại. Đóng form, mở lại để lấy mã mới hoặc sửa bản ghi cũ.';
    }
    if (msg.includes('ten_dich_vu')) {
      return 'Tên dịch vụ đã tồn tại tại cơ sở này. Vui lòng đổi tên hoặc sửa bản ghi cũ.';
    }
    return 'Dịch vụ trùng mã hoặc tên. Vui lòng kiểm tra lại.';
  }
  return e?.message ? `Không thể lưu dịch vụ: ${e.message}` : 'Không thể lưu dịch vụ.';
}

export interface DichVu {
  id: string;
  id_dich_vu?: string | null;
  co_so: string;
  ten_dich_vu: string;
  gia_nhap: number;
  gia_ban: number;
  anh: string | null;
  hoa_hong: number;
  tu_ngay: string | null;
  toi_ngay: string | null;
  created_at?: string;
  updated_at?: string;
}

export const getServices = async (): Promise<DichVu[]> => {
  const { data, error } = await supabase
    .from('dich_vu')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching services:', error);
    throw error;
  }
  return data as DichVu[];
};

export const upsertService = async (service: Partial<DichVu>): Promise<DichVu> => {
  const cleanData = { ...service };

  if (cleanData.tu_ngay === '') cleanData.tu_ngay = null;
  if (cleanData.toi_ngay === '') cleanData.toi_ngay = null;

  if (cleanData.id) {
    const { id, ...updatePayload } = cleanData;
    if (updatePayload.id_dich_vu?.trim()) {
      const codeFree = await isServiceCodeAvailable(updatePayload.id_dich_vu, id);
      if (!codeFree) {
        const err = { code: '23505', message: 'duplicate key id_dich_vu' } as PostgrestError;
        throw err;
      }
    }
    const { data, error } = await supabase
      .from('dich_vu')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating service:', error);
      throw error;
    }
    return data as DichVu;
  }

  const insertOnce = async (payload: Omit<Partial<DichVu>, 'id'>) => {
    const { data, error } = await supabase
      .from('dich_vu')
      .insert(payload)
      .select()
      .single();
    return { data: data as DichVu | null, error };
  };

  const { id: _omit, ...insertPayload } = cleanData;
  const reserved = new Set<string>();
  let code = await resolveInsertServiceCode(insertPayload.id_dich_vu);
  const maxAttempts = 6;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    reserved.add(code.toUpperCase());
    const { data, error } = await insertOnce({ ...insertPayload, id_dich_vu: code });

    if (!error && data) return data;

    if (error?.code === '23505' && isIdDichVuConflict(error)) {
      code = await getNextServiceCode(reserved);
      continue;
    }

    console.error('Error inserting service:', error);
    throw error;
  }

  const err = { code: '23505', message: 'duplicate key id_dich_vu' } as PostgrestError;
  throw err;
};

export const bulkUpsertServices = async (services: Partial<DichVu>[]): Promise<void> => {
  const toUpdate = services.filter(s => s.id);
  const toInsert = services.filter(s => !s.id);

  if (toUpdate.length > 0) {
    // Deduplicate by ID: if multiple items have the same ID, take the last one
    const uniqueToUpdate = Array.from(new Map(toUpdate.map(item => [item.id, item])).values());
    const { error } = await supabase.from('dich_vu').upsert(uniqueToUpdate);
    if (error) { console.error('Error upserting services:', error); throw error; }
  }
  if (toInsert.length > 0) {
    const cleanInserts = toInsert.map(({ id, ...rest }) => rest);
    const { error } = await supabase.from('dich_vu').insert(cleanInserts);
    if (error) { console.error('Error inserting services:', error); throw error; }
  }
};

export const deleteService = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('dich_vu')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting service:', error);
    throw error;
  }
};

export const uploadServiceImage = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random()}.${fileExt}`;
  const filePath = `services/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('images') // Use unified images bucket
    .upload(filePath, file);

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage
    .from('images')
    .getPublicUrl(filePath);

  return data.publicUrl;
};

export const deleteAllServices = async (): Promise<void> => {
  const { error } = await supabase
    .from('dich_vu')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('Error deleting all services:', error);
    throw error;
  }
};

export interface ServiceFilters {
  branches?: string[];
}

export const getServicesPaginated = async (
  page: number,
  pageSize: number,
  searchQuery?: string,
  filters?: ServiceFilters
): Promise<{ data: DichVu[], totalCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('dich_vu')
    .select('*', { count: 'exact' });

  if (searchQuery) {
    query = query.or(`ten_dich_vu.ilike.%${searchQuery}%,id_dich_vu.ilike.%${searchQuery}%`);
  }

  if (filters?.branches?.length) {
    query = query.in('co_so', filters.branches);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching paginated services:', error);
    throw error;
  }

  return {
    data: (data as DichVu[]) || [],
    totalCount: count || 0
  };
};

function isIdDichVuConflict(error: PostgrestError | null): boolean {
  return (error?.message || '').toLowerCase().includes('id_dich_vu');
}

async function isServiceCodeAvailable(code: string, excludeId?: string): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) return false;

  let query = supabase.from('dich_vu').select('id').eq('id_dich_vu', trimmed).limit(1);
  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
  if (error) {
    console.error('Error checking service code:', error);
    return false;
  }
  return !data?.length;
}

export const getNextServiceCode = async (reserved = new Set<string>()): Promise<string> => {
  const { data, error } = await supabase.from('dich_vu').select('id_dich_vu');

  if (error) {
    console.error('Error fetching next service code:', error);
    return 'DV-0001';
  }

  const used = new Set<string>(reserved);
  for (const row of data || []) {
    const code = String(row.id_dich_vu || '').trim().toUpperCase();
    if (code) used.add(code);
  }

  let max = 0;
  used.forEach((code) => {
    const match = code.match(/^DV-(\d+)$/i);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });

  for (let n = Math.max(max, 0) + 1; n < max + 500; n++) {
    const candidate = `DV-${String(n).padStart(4, '0')}`;
    if (!used.has(candidate.toUpperCase())) return candidate;
  }

  return `DV-${String(max + 1).padStart(4, '0')}`;
};

async function resolveInsertServiceCode(requested?: string | null): Promise<string> {
  const trimmed = (requested || '').trim();
  if (trimmed && (await isServiceCodeAvailable(trimmed))) return trimmed;
  return getNextServiceCode(trimmed ? new Set([trimmed.toUpperCase()]) : undefined);
}
