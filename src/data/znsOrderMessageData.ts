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

type OrderCustomerSnapshot = {
  id: string;
  id_bh: string | null;
  khach_hang_id: string | null;
  ten_khach_hang: string | null;
  so_dien_thoai: string | null;
};

type CustomerSnapshot = {
  id: string;
  ma_khach_hang: string | null;
  ho_va_ten: string | null;
  so_dien_thoai: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function syncQueueCustomerSnapshots(rows: OrderMessageQueueItem[]): Promise<OrderMessageQueueItem[]> {
  const orderIds = [...new Set(rows.map((row) => row.order_id).filter(Boolean))];
  if (orderIds.length === 0) return rows;

  const { data: orderData, error: orderError } = await supabase
    .from('the_ban_hang')
    .select('id, id_bh, khach_hang_id, ten_khach_hang, so_dien_thoai')
    .in('id', orderIds);
  if (orderError) throw orderError;

  const orders = (orderData || []) as OrderCustomerSnapshot[];
  const customerRefs = [...new Set(orders.map((order) => order.khach_hang_id?.trim()).filter(Boolean))] as string[];
  const customerByRef = new Map<string, CustomerSnapshot>();
  if (customerRefs.length > 0) {
    const uuidRefs = customerRefs.filter((ref) => UUID_PATTERN.test(ref));
    const codeRefs = customerRefs.filter((ref) => !UUID_PATTERN.test(ref));
    const customerRows: CustomerSnapshot[] = [];
    if (uuidRefs.length > 0) {
      const { data, error } = await supabase
        .from('khach_hang')
        .select('id, ma_khach_hang, ho_va_ten, so_dien_thoai')
        .in('id', uuidRefs);
      if (error) throw error;
      customerRows.push(...((data || []) as CustomerSnapshot[]));
    }
    if (codeRefs.length > 0) {
      const { data, error } = await supabase
        .from('khach_hang')
        .select('id, ma_khach_hang, ho_va_ten, so_dien_thoai')
        .in('ma_khach_hang', codeRefs);
      if (error) throw error;
      customerRows.push(...((data || []) as CustomerSnapshot[]));
    }
    for (const customer of customerRows) {
      customerByRef.set(customer.id, customer);
      if (customer.ma_khach_hang) customerByRef.set(customer.ma_khach_hang, customer);
    }
  }

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const changedRows: OrderMessageQueueItem[] = [];
  const syncedRows = rows.map((row) => {
    const order = orderById.get(row.order_id);
    if (!order) return row;
    const customer = order.khach_hang_id ? customerByRef.get(order.khach_hang_id) : undefined;
    const customerName = customer?.ho_va_ten || order.ten_khach_hang || row.customer_name;
    const phone = customer?.so_dien_thoai || order.so_dien_thoai || row.phone;
    if (customerName === row.customer_name && phone === row.phone) return row;

    const synced = {
      ...row,
      customer_name: customerName,
      phone,
      template_data: { ...row.template_data, name: customerName, order_code: order.id_bh || row.order_code },
    };
    changedRows.push(synced);
    return synced;
  });

  await Promise.all(changedRows.map(async (row) => {
    const { error } = await supabase
      .from('zns_order_message_queue')
      .update({
        customer_name: row.customer_name,
        phone: row.phone,
        template_data: row.template_data,
      })
      .eq('id', row.id);
    if (error) throw error;
  }));

  return syncedRows;
}

export async function listOrderMessageQueue(): Promise<OrderMessageQueueItem[]> {
  const { data, error } = await supabase
    .from('zns_order_message_queue')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return syncQueueCustomerSnapshots((data as OrderMessageQueueItem[]) || []);
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

export async function deleteFailedOrderMessage(queueId: string): Promise<void> {
  const { data, error } = await supabase
    .from('zns_order_message_queue')
    .delete()
    .eq('id', queueId)
    .eq('status', 'that_bai')
    .select('id');

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Tin nhắn này không còn ở trạng thái gửi lại nên không thể xóa.');
  }
}

export async function deleteFailedOrderMessages(queueIds: string[]): Promise<number> {
  const ids = [...new Set(queueIds.filter(Boolean))];
  if (ids.length === 0) return 0;
  const { data, error } = await supabase
    .from('zns_order_message_queue')
    .delete()
    .in('id', ids)
    .eq('status', 'that_bai')
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}
