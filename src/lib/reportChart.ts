export type ReportChartVariant = 'line' | 'bar' | 'area';
export type ReportChartUnit = 'million' | 'dong';

export const REPORT_CHART_COLORS = ['#eab308', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16'];

export function buildReportDateRange(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  if (start.toISOString().slice(0, 10) !== startDate || end.toISOString().slice(0, 10) !== endDate) return [];
  const days: string[] = [];
  // Date-only report keys must not move when the browser's timezone changes.
  for (const cursor = start; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

export function formatReportChartValue(value: number, unit: ReportChartUnit): string {
  const amount = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: unit === 'dong' ? 0 : Math.abs(amount) < 10000 ? 6 : 2,
  }).format(unit === 'dong' ? amount : amount / 1000000);
}

export function reportChartDayWidth(labelLength: number, seriesCount: number): number {
  const labelWidth = Math.max(32, labelLength * 7);
  return Math.max(58, (labelWidth + 16) * Math.max(1, seriesCount) + 20);
}
