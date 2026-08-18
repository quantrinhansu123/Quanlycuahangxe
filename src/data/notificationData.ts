import { supabase } from '../lib/supabase';

export type AppNotificationType = 'info' | 'warning' | 'success';

export interface AppNotification {
  id: string;
  nguoi_nhan_id: string;
  loai: AppNotificationType;
  tieu_de: string;
  noi_dung: string;
  duong_dan: string | null;
  loai_doi_tuong: string | null;
  doi_tuong_id: string | null;
  da_doc_luc: string | null;
  created_at: string;
}

export async function getAppNotifications(
  recipientId: string,
  limit = 50
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('thong_bao_ung_dung')
    .select('*')
    .eq('nguoi_nhan_id', recipientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function markAppNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('thong_bao_ung_dung')
    .update({ da_doc_luc: new Date().toISOString() })
    .eq('id', id)
    .is('da_doc_luc', null);
  if (error) throw error;
}

export async function markAllAppNotificationsRead(recipientId: string): Promise<void> {
  const { error } = await supabase
    .from('thong_bao_ung_dung')
    .update({ da_doc_luc: new Date().toISOString() })
    .eq('nguoi_nhan_id', recipientId)
    .is('da_doc_luc', null);
  if (error) throw error;
}

export async function clearAppNotifications(recipientId: string): Promise<void> {
  const { error } = await supabase
    .from('thong_bao_ung_dung')
    .delete()
    .eq('nguoi_nhan_id', recipientId);
  if (error) throw error;
}

