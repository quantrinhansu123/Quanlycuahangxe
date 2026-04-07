import { supabase } from '../lib/supabase';

export interface NhanSu {
  id: string;
  id_nhan_su?: string | null;
  ho_ten: string;
  email: string | null;
  sdt: string | null;
  hinh_anh: string | null;
  vi_tri: string;
  co_so: string;
  created_at?: string;
  updated_at?: string;
}

export const getPersonnel = async (): Promise<NhanSu[]> => {
  const { data, error } = await supabase
    .from('nhan_su')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching personnel:', error);
    throw error;
  }
  return data as NhanSu[];
};

export const upsertPersonnel = async (personnel: Partial<NhanSu>): Promise<NhanSu> => {
  const { data, error } = await supabase
    .from('nhan_su')
    .upsert(personnel)
    .select()
    .single();

  if (error) {
    console.error('Error upserting personnel:', error);
    throw error;
  }
  return data as NhanSu;
};

export const bulkUpsertPersonnel = async (personnel: Partial<NhanSu>[]): Promise<void> => {
  const toUpdate = personnel.filter(p => p.id);
  const toInsert = personnel.filter(p => !p.id);

  if (toUpdate.length > 0) {
    const { error } = await supabase.from('nhan_su').upsert(toUpdate);
    if (error) { console.error('Error upserting personnel:', error); throw error; }
  }
  if (toInsert.length > 0) {
    const cleanInserts = toInsert.map(({ id, ...rest }) => rest);
    const { error } = await supabase.from('nhan_su').insert(cleanInserts);
    if (error) { console.error('Error inserting personnel:', error); throw error; }
  }
};

export const deletePersonnel = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('nhan_su')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting personnel:', error);
    throw error;
  }
};

export const bulkDeletePersonnel = async (): Promise<void> => {
  const { error } = await supabase
    .from('nhan_su')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

  if (error) {
    console.error('Error bulk deleting personnel:', error);
    throw error;
  }
};

export const uploadPersonnelImage = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random()}.${fileExt}`;
  const filePath = `personnel/${fileName}`;

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

export interface PersonnelFilters {
  branches?: string[];
  positions?: string[];
}

export const getPersonnelPaginated = async (
  page: number,
  pageSize: number,
  searchQuery?: string,
  filters?: PersonnelFilters
): Promise<{ data: NhanSu[], totalCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('nhan_su')
    .select('*', { count: 'exact' });

  if (searchQuery) {
    query = query.or(`ho_ten.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,sdt.ilike.%${searchQuery}%,id_nhan_su.ilike.%${searchQuery}%`);
  }

  if (filters?.branches?.length) {
    query = query.in('co_so', filters.branches);
  }
  
  if (filters?.positions?.length) {
    query = query.in('vi_tri', filters.positions);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching paginated personnel:', error);
    throw error;
  }

  return {
    data: (data as NhanSu[]) || [],
    totalCount: count || 0
  };
};
export const getNextPersonnelCode = async (): Promise<string> => {
  const { data, error } = await supabase
    .from('nhan_su')
    .select('id_nhan_su')
    .order('id_nhan_su', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching next personnel code:', error);
    return 'NV-0001';
  }

  if (!data || data.length === 0 || !data[0].id_nhan_su) {
    return 'NV-0001';
  }

  const lastCode = data[0].id_nhan_su;
  const match = lastCode.match(/^NV-(\d+)$/);
  
  if (match) {
    const nextNumber = parseInt(match[1]) + 1;
    return `NV-${nextNumber.toString().padStart(4, '0')}`;
  }

  return `NV-${(data.length + 1).toString().padStart(4, '0')}`;
};
