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

const IN_CHUNK_SIZE = 100;

// PostgREST nhận .in() qua URL: danh sách dài (vài trăm UUID) làm request bị 400.
async function selectInChunks<T>(
  values: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK_SIZE) {
    const { data, error } = await run(values.slice(i, i + IN_CHUNK_SIZE));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function syncQueueCustomerSnapshots(rows: OrderMessageQueueItem[]): Promise<OrderMessageQueueItem[]> {
  const orderIds = [...new Set(rows.map((row) => row.order_id).filter(Boolean))];
  if (orderIds.length === 0) return rows;

  const orders = await selectInChunks<OrderCustomerSnapshot>(orderIds, (chunk) => supabase
    .from('the_ban_hang')
    .select('id, id_bh, khach_hang_id, ten_khach_hang, so_dien_thoai')
    .in('id', chunk));
  const customerRefs = [...new Set(orders.map((order) => order.khach_hang_id?.trim()).filter(Boolean))] as string[];
  const customerByRef = new Map<string, CustomerSnapshot>();
  if (customerRefs.length > 0) {
    const uuidRefs = customerRefs.filter((ref) => UUID_PATTERN.test(ref));
    const codeRefs = customerRefs.filter((ref) => !UUID_PATTERN.test(ref));
    const customerRows: CustomerSnapshot[] = [];
    if (uuidRefs.length > 0) {
      customerRows.push(...await selectInChunks<CustomerSnapshot>(uuidRefs, (chunk) => supabase
        .from('khach_hang')
        .select('id, ma_khach_hang, ho_va_ten, so_dien_thoai')
        .in('id', chunk)));
    }
    if (codeRefs.length > 0) {
      customerRows.push(...await selectInChunks<CustomerSnapshot>(codeRefs, (chunk) => supabase
        .from('khach_hang')
        .select('id, ma_khach_hang, ho_va_ten, so_dien_thoai')
        .in('ma_khach_hang', chunk)));
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

/** date: 'YYYY-MM-DD' theo giờ máy; lọc ở server để không kéo cả lịch sử hàng đợi. */
export async function listOrderMessageQueue(date?: string): Promise<OrderMessageQueueItem[]> {
  let query = supabase
    .from('zns_order_message_queue')
    .select('*')
    .order('created_at', { ascending: false });
  if (date) {
    const start = new Date(`${date}T00:00:00`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      query = query.gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
    }
  }
  const { data, error } = await query;
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
