/** Luôn dùng hệ 24 giờ (không AM/PM). Locale vi-VN. */

const LOCALE = 'vi-VN';

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
