import type { Candidate, FilterOption, InterviewSession } from './types';

export const candidatesData: Candidate[] = [];

export const statusConfig: Record<Candidate['status'], { label: string; classes: string }> = {
  new: { label: 'Mới', classes: 'bg-blue-500/10 text-blue-600 border-blue-200' },
  reviewing: { label: 'Đang xem xét', classes: 'bg-orange-500/10 text-orange-600 border-orange-200' },
  interviewing: { label: 'Mời phỏng vấn', classes: 'bg-sky-500/10 text-sky-600 border-sky-100' },
  interviewed: { label: 'Đã phỏng vấn', classes: 'bg-purple-500/10 text-purple-600 border-purple-200' },
  hired: { label: 'Nhận việc', classes: 'bg-indigo-500/10 text-indigo-600 border-indigo-100' },
  rejected: { label: 'Từ chối', classes: 'bg-emerald-500/10 text-emerald-600 border-emerald-100' },
};

export const sourceConfig: Record<string, { label: string; classes: string }> = {
  'Website công ty': { label: 'Website công ty', classes: 'bg-sky-500/10 text-sky-500 border-sky-100' },
  'Giới thiệu nội bộ': { label: 'Giới thiệu nội bộ', classes: 'bg-indigo-500/10 text-indigo-500 border-indigo-100' },
  'Vieclam24h / Job board': { label: 'Vieclam24h / Job board', classes: 'bg-orange-500/10 text-orange-500 border-orange-100' },
  'LinkedIn': { label: 'LinkedIn', classes: 'bg-purple-500/10 text-purple-500 border-purple-100' },
};

export const statusOptions: FilterOption[] = [
  { id: 'new', label: 'Mới', count: 1 },
  { id: 'interviewing', label: 'Mời phỏng vấn', count: 1 },
  { id: 'rejected', label: 'Từ chối', count: 1 },
  { id: 'hired', label: 'Nhận việc', count: 1 },
];

export const positionOptions: FilterOption[] = [
  { id: 'DX-2025-001', label: 'DX-2025-001 · Lập trình viên Senior', count: 2 },
  { id: 'DX-2025-002', label: 'DX-2025-002 · Chuyên viên Tuyển dụng', count: 1 },
  { id: 'DX-2025-004', label: 'DX-2025-004 · Lập trình viên Frontend', count: 1 },
];

export const sourceOptions: FilterOption[] = [
  { id: 'Website công ty', label: 'Website công ty', count: 1 },
  { id: 'LinkedIn', label: 'LinkedIn', count: 1 },
  { id: 'Giới thiệu nội bộ', label: 'Giới thiệu nội bộ', count: 1 },
  { id: 'Vieclam24h / Job board', label: 'Vieclam24h / Job board', count: 1 },
];

export const mockInterviewSessions: InterviewSession[] = [];
