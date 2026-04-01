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
