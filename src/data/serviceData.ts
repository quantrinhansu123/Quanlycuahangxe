import { supabase } from '../lib/supabase';

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
  
  // Sanitize date fields to prevent "invalid input syntax for type date: ''" error
  if (cleanData.tu_ngay === '') cleanData.tu_ngay = null;
  if (cleanData.toi_ngay === '') cleanData.toi_ngay = null;

  const { data, error } = await supabase
    .from('dich_vu')
    .upsert(cleanData)
    .select()
    .single();

  if (error) {
    console.error('Error upserting service:', error);
    throw error;
  }
  return data as DichVu;
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

export const getNextServiceCode = async (): Promise<string> => {
  const { data, error } = await supabase
    .from('dich_vu')
    .select('id_dich_vu')
    .order('id_dich_vu', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching next service code:', error);
    return 'DV-0001';
  }

  if (!data || data.length === 0 || !data[0].id_dich_vu) {
    return 'DV-0001';
  }

  const lastCode = data[0].id_dich_vu;
  const match = lastCode.match(/^DV-(\d+)$/);
  
  if (match) {
    const nextNumber = parseInt(match[1]) + 1;
    return `DV-${nextNumber.toString().padStart(4, '0')}`;
  }

  // Fallback if the format doesn't match
  return `DV-${(data.length + 1).toString().padStart(4, '0')}`;
};
