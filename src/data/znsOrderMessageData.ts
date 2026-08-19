import { supabase } from '../lib/supabase';

export type OrderMessageStatus = 'cho_duyet' | 'da_gui' | 'that_bai';

export interface OrderMessageQueueItem {
  id: string;
  order_id: string;
  order_code: string;
  customer_name: string;
  phone: string | null;
  service_name: string;
  total_amount: number;
  completed_at: string | null;
  template_data: Record<string, string | number>;
  status: OrderMessageStatus;
  send_count: number;
  last_sent_at: string | null;
  zalo_msg_id: string | null;
  last_error: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface QueueOrderMessageInput {
  order_id: string;
  order_code: string;
  customer_name: string;
  phone?: string | null;
  service_name: string;
  total_amount: number;
  completed_at?: string | null;
  template_data: Record<string, string | number>;
  created_by?: string | null;
}

export async function queueOrderMessage(input: QueueOrderMessageInput): Promise<void> {
  const { error } = await supabase.from('zns_order_message_queue').upsert(input, { onConflict: 'order_id' });
  if (error) throw error;
}

export async function listOrderMessageQueue(): Promise<OrderMessageQueueItem[]> {
  const { data, error } = await supabase
    .from('zns_order_message_queue')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as OrderMessageQueueItem[]) || [];
}

export async function approveOrderMessages(queueIds: string[]): Promise<{
  sent: number;
  failed: number;
  results: Array<{ id: string; status: OrderMessageStatus; error?: string }>;
}> {
  const { data, error } = await supabase.functions.invoke('zns-order-message-approve', {
    body: { queue_ids: queueIds },
  });
  if (error) throw error;
  return data;
}
