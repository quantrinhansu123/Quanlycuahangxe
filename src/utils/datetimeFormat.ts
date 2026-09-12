/** Luôn dùng hệ 24 giờ (không AM/PM). Locale vi-VN. */

const LOCALE = 'vi-VN';

/** Ngày theo múi giờ local của thiết bị, dạng yyyy-mm-dd (không bị lệch ngày như UTC ISO). */
export function formatLocalIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calendarDateToIso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function assertSalesDateNotFuture(
  value: string | null | undefined,
  todayIso: string = formatLocalIsoDate()
): void {
  const date = String(value || '').trim().slice(0, 10);
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || calendarDateToIso(Number(match[1]), Number(match[2]), Number(match[3])) !== date) {
    throw new Error('Ngày lập phiếu bán hàng không hợp lệ.');
  }
  if (date > todayIso) {
    throw new Error('Ngày lập phiếu bán hàng không được lớn hơn ngày hiện tại.');
  }
}

/**
 * Chuẩn hóa ngày từ Excel. Với ngày bán hàng, truyền maxDate để chặn ngày
 * tương lai và tự sửa trường hợp Excel xuất tháng/ngày (7/12 -> 12/7).
 */
export function parseExcelDateValue(
  value: string | number | null | undefined,
  options: { maxDate?: string; preferNonFutureAmbiguous?: boolean } = {}
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  let primary: string | null = null;
  let alternate: string | null = null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const wholeDays = Math.floor(value);
    if (wholeDays <= 0) throw new Error(`Ngày Excel "${value}" không hợp lệ.`);
    primary = new Date((wholeDays - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  } else {
    const raw = String(value).trim();
    const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      primary = calendarDateToIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    } else {
      const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (slashMatch) {
        const first = Number(slashMatch[1]);
        const second = Number(slashMatch[2]);
        const year = Number(slashMatch[3]);
        const dayFirst = calendarDateToIso(year, second, first);
        const monthFirst = calendarDateToIso(year, first, second);
        primary = dayFirst || monthFirst; // dd/mm/yyyy mặc định; dùng mm/dd nếu dd/mm bất khả thi
        alternate = dayFirst ? monthFirst : null;
      }
    }

    if (!primary) throw new Error(`Ngày "${raw}" không hợp lệ. Dùng định dạng ngày/tháng/năm.`);
  }

  if (
    options.preferNonFutureAmbiguous &&
    options.maxDate &&
    primary > options.maxDate &&
    alternate &&
    alternate <= options.maxDate
  ) {
    primary = alternate;
  }

  if (options.maxDate && primary > options.maxDate) {
    throw new Error('Ngày bán hàng không được lớn hơn ngày hiện tại.');
  }

  return primary;
}

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
