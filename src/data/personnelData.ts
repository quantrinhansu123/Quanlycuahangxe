import { supabase } from '../lib/supabase';

export interface NhanSu {
  id: string;
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
  const { error } = await supabase
    .from('nhan_su')
    .upsert(personnel);

  if (error) {
    console.error('Error bulk upserting personnel:', error);
    throw error;
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
