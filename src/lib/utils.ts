import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function removeVietnameseTones(str: string) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (char) => (char === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

/** Bỏ dấu, chữ thường, gộp khoảng trắng thừa — dùng so khớp tìm kiếm / cơ sở. */
export function normalizeForCompare(str: string): string {
  return removeVietnameseTones(str).replace(/\s+/g, ' ').trim();
}

export function formatNumberVietnamese(val: number | string) {
  if (val === undefined || val === null || val === '') return '';
  const num = typeof val === 'number' ? val : parseInt(val.replace(/\D/g, ''), 10);
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('vi-VN').format(num);
}

export function parseNumberVietnamese(str: string) {
  if (!str) return 0;
  return parseInt(str.replace(/\D/g, ''), 10) || 0;
}

/** YYYY-MM-DD theo giờ local (tránh lệch ngày do `toISOString()` UTC). */
export function formatLocalDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Số tháng tròn đã trôi qua kể từ một ngày (null nếu ngày không hợp lệ). */
export function monthsSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const past = new Date(dateStr);
  if (Number.isNaN(past.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - past.getFullYear()) * 12 + (now.getMonth() - past.getMonth());
  if (now.getDate() < past.getDate()) months -= 1;
  return Math.max(0, months);
}
