import type { CustomerLinkInput } from './customerOrderLink';
import { getCustomerLinkKeys } from './customerOrderLink';
import { phoneLookupVariants } from './phoneUtils';
import { supabase } from './supabase';

export function parseOrderTimestamp(ngay?: string | null, gio?: string | null): string | null {
  const d = (ngay || '').trim();
  if (!d) return null;
  let time = (gio || '00:00:00').trim();
  if (/^\d{1,2}:\d{2}$/.test(time)) time += ':00';
  if (!/^\d{1,2}:\d{2}/.test(time)) time = '00:00:00';
  const parsed = new Date(`${d}T${time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isMissingLastOrderAtColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42703' ||
    /last_order_at|column.*does not exist|schema cache/i.test(error.message || '')
  );
}

/** Cập nhật last_order_at khi khách phát sinh hoá đơn mới. */
export async function touchCustomerLastOrderAt(
  link: CustomerLinkInput & { khach_hang_id?: string | null },
  ngay?: string | null,
  gio?: string | null
): Promise<void> {
  const ts = parseOrderTimestamp(ngay, gio);
  if (!ts) return;

  const orParts = new Set<string>();
  const khId = (link.khach_hang_id || '').trim();
  if (khId) orParts.add(`ma_khach_hang.eq.${khId}`);
  if (khId) orParts.add(`id.eq.${khId}`);
  for (const key of getCustomerLinkKeys(link)) {
    orParts.add(`ma_khach_hang.eq.${key}`);
    orParts.add(`id.eq.${key}`);
  }
  for (const p of phoneLookupVariants(link.so_dien_thoai)) {
    orParts.add(`so_dien_thoai.eq.${p}`);
  }

  if (orParts.size === 0) return;

  const { data, error } = await supabase
    .from('khach_hang')
    .select('id, last_order_at')
    .or([...orParts].join(','));

  if (error) {
    if (!isMissingLastOrderAtColumn(error)) {
      console.error('touchCustomerLastOrderAt:', error);
    }
    return;
  }

  const tsMs = new Date(ts).getTime();
  const toUpdate = (data || []).filter((row) => {
    if (!row.last_order_at) return true;
    return tsMs > new Date(row.last_order_at).getTime();
  });

  await Promise.all(
    toUpdate.map((row) =>
      supabase.from('khach_hang').update({ last_order_at: ts }).eq('id', row.id)
    )
  );
}
