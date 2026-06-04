/** Luôn dùng hệ 24 giờ (không AM/PM). Locale vi-VN. */

const LOCALE = 'vi-VN';

/** Hiển thị ngày dạng dd/mm/yyyy (ISO, Date, hoặc chuỗi dd/mm/yyyy). */
export function formatDateVi(dateStr: string | null | undefined): string {
  if (dateStr == null || dateStr === '') return '—';
  const s = String(dateStr).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return s;
}

/** Chuyển dd/mm/yyyy hoặc yyyy-mm-dd → yyyy-mm-dd (lưu DB). */
export function parseDateViToIso(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  const year = m[3];
  return `${year}-${month}-${day}`;
}

/** ISO → chuỗi dd/mm/yyyy cho ô nhập (rỗng nếu không hợp lệ). */
export function isoToDateViInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const formatted = formatDateVi(iso);
  return formatted === '—' ? '' : formatted;
}

/** Số tháng từ ngày bắt đầu (ISO) đến hôm nay (làm tròn xuống nếu chưa đủ ngày). */
export function monthsFromStartDateToNow(startDateStr: string | null | undefined): number | null {
  if (!startDateStr?.trim()) return null;
  const iso = startDateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  if (Number.isNaN(start.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  if (start > today) return 0;
  let months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  if (today.getDate() < start.getDate()) months--;
  return Math.max(0, months);
}

/** Giờ hiển thị: HH:mm hoặc HH:mm:ss. */
export function formatTime24h(date: Date, withSeconds = false): string {
  return date.toLocaleTimeString(LOCALE, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' as const } : {}),
  });
}

/** Ngày + giờ 24h (lịch sử sửa, log). */
export function formatDateTime24h(date: Date): string {
  return date.toLocaleString(LOCALE, {
    hour12: false,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
