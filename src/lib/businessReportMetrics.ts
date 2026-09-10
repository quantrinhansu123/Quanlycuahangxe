export const EXPENSE_CATEGORIES = ['Thuê nhà', 'Lương', 'Điện nước', 'Chi phí khác'] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export interface BusinessTransactionInput {
  id?: string | null;
  loai_phieu?: string | null;
  id_don?: string | null;
  danh_muc?: string | null;
  so_tien?: number | null;
  nguoi_nhan?: string | null;
  trang_thai?: string | null;
  phuong_thuc?: string | null;
}

export interface BusinessOrderInput {
  id: string;
  id_bh?: string | null;
  khach_hang_id?: string | null;
  ten_khach_hang?: string | null;
  tong_tien?: number | null;
}

export interface BusinessOrderDetailInput {
  id_don_hang?: string | null;
  san_pham?: string | null;
  thanh_tien?: number | null;
  gia_ban?: number | null;
  gia_von?: number | null;
  so_luong?: number | null;
  ngay?: string | null;
}

export interface BusinessProductInput {
  ma_san_pham?: string | null;
  ten_san_pham?: string | null;
}

export interface ReportSummaryMetrics {
  total_revenue: number;
  total_profit: number;
  total_orders: number;
  avg_per_day: number;
  avg_per_order: number;
  date_range_days: number;
}

export interface PeriodBusinessMetrics {
  total_vehicles: number;
  total_collected: number;
}

export interface ExpenseMetricsRow {
  danh_muc: ExpenseCategory;
  so_tien: number;
  ty_trong: number;
}

export interface CashFlowMetricsRow {
  phuong_thuc: 'Tiền mặt' | 'Ngân hàng' | 'Chưa phân loại';
  thu: number;
  chi: number;
  dong_tien_thuan: number;
}

export interface DebtMetricsRow {
  key: string;
  doi_tuong: string;
  loai: 'Khách hàng' | 'Nhà cung cấp';
  tong_phat_sinh: number;
  da_thanh_toan: number;
  con_no: number;
}

export interface ProductCostMetricsRow {
  key: string;
  ma_san_pham: string;
  san_pham: string;
  so_luong: number;
  doanh_thu: number;
  gia_von: number;
  loi_nhuan_gop: number;
  bien_loi_nhuan: number;
}

const CASH_FLOW_METHODS = ['Tiền mặt', 'Ngân hàng', 'Chưa phân loại'] as const;

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedKey(value: unknown): string {
  return normalizeBusinessText(value).replace(/[^a-z0-9]+/g, '');
}

function refsForOrder(order: BusinessOrderInput): string[] {
  return Array.from(new Set([order.id, order.id_bh]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)));
}

function lineQuantity(detail: BusinessOrderDetailInput): number {
  return detail.so_luong == null ? 1 : Math.max(0, numberValue(detail.so_luong));
}

export function lineRevenue(detail: BusinessOrderDetailInput): number {
  return detail.thanh_tien == null
    ? numberValue(detail.gia_ban) * lineQuantity(detail)
    : numberValue(detail.thanh_tien);
}

export function lineCost(detail: BusinessOrderDetailInput): number {
  return numberValue(detail.gia_von) * lineQuantity(detail);
}

/** Bỏ dấu và chuẩn hóa khoảng trắng để nhóm dữ liệu người dùng nhập tự do. */
export function normalizeBusinessText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCompletedTransaction(status: unknown): boolean {
  const value = normalizeBusinessText(status);
  return ['hoan thanh', 'completed', 'da thanh toan', 'da thu', 'paid'].includes(value);
}

export function isIncomeTransaction(type: unknown): boolean {
  return normalizeBusinessText(type).includes('thu');
}

export function normalizeExpenseCategory(value: unknown): ExpenseCategory {
  const raw = String(value ?? '').normalize('NFC').toLocaleLowerCase('vi-VN');
  const key = normalizedKey(value);
  if (raw.includes('thuế')) return 'Chi phí khác';
  if (key.includes('thue') || key.includes('matbang')) return 'Thuê nhà';
  if (key.includes('luong') || key.includes('salary') || key.includes('payroll') || key.includes('nhancong') || key.includes('nhanvien')) return 'Lương';
  if (key.includes('dien') || key.includes('nuoc') || key.includes('electric') || key.includes('utility')) return 'Điện nước';
  return 'Chi phí khác';
}

export function normalizeCashFlowMethod(value: unknown): CashFlowMetricsRow['phuong_thuc'] {
  const key = normalizedKey(value);
  if (key.includes('tienmat') || key.includes('cash')) return 'Tiền mặt';
  if (key.includes('chuyenkhoan') || key.includes('nganhang') || key.includes('bank') || key.includes('the')) return 'Ngân hàng';
  return 'Chưa phân loại';
}

/** Kỳ trước có đúng số ngày bằng kỳ đang xem; dùng UTC để không lệch ngày theo múi giờ. */
export function previousBusinessRange(startDate: string, endDate: string): { start: string; end: string } {
  const parseDate = (value: string): Date => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error('Khoảng ngày báo cáo không hợp lệ.');
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
      throw new Error('Khoảng ngày báo cáo không hợp lệ.');
    }
    return date;
  };
  const formatDate = (date: Date) => date.toISOString().slice(0, 10);
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const duration = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - duration + 1);
  return { start: formatDate(previousStart), end: formatDate(previousEnd) };
}

export function buildReportSummary(details: BusinessOrderDetailInput[]): ReportSummaryMetrics {
  const total_revenue = details.reduce((sum, detail) => sum + lineRevenue(detail), 0);
  const total_profit = details.reduce((sum, detail) => sum + lineRevenue(detail) - lineCost(detail), 0);
  const uniqueOrders = new Set(details.map((detail) => String(detail.id_don_hang || '').trim()).filter(Boolean));
  const uniqueDates = new Set(details.map((detail) => String(detail.ngay || '').slice(0, 10)).filter(Boolean));
  const total_orders = uniqueOrders.size;
  const date_range_days = uniqueDates.size || 1;
  return {
    total_revenue,
    total_profit,
    total_orders,
    avg_per_day: total_revenue / date_range_days,
    avg_per_order: total_orders > 0 ? total_revenue / total_orders : 0,
    date_range_days,
  };
}

/** Số xe là số hồ sơ khách/xe khác nhau có đơn trong kỳ; chỉ tính phiếu thu đã hoàn thành và gắn đơn. */
export function buildPeriodBusinessMetrics(
  orders: BusinessOrderInput[],
  transactions: BusinessTransactionInput[]
): PeriodBusinessMetrics {
  const vehicles = new Set<string>();
  const orderRefs = new Set<string>();
  for (const order of orders) {
    refsForOrder(order).forEach((ref) => orderRefs.add(ref));
    const customerId = String(order.khach_hang_id || '').trim().toLowerCase();
    const customerName = normalizeBusinessText(order.ten_khach_hang);
    const fallbackOrder = String(order.id || order.id_bh || '').trim().toLowerCase();
    if (customerId) vehicles.add(`customer:${customerId}`);
    else if (customerName) vehicles.add(`name:${customerName}`);
    else if (fallbackOrder) vehicles.add(`order:${fallbackOrder}`);
  }
  const total_collected = transactions.reduce((sum, transaction) => {
    if (!isCompletedTransaction(transaction.trang_thai) || !isIncomeTransaction(transaction.loai_phieu)) return sum;
    const ref = String(transaction.id_don || '').trim().toLowerCase();
    return ref && orderRefs.has(ref) ? sum + numberValue(transaction.so_tien) : sum;
  }, 0);
  return { total_vehicles: vehicles.size, total_collected };
}

export function buildExpenseReport(transactions: BusinessTransactionInput[]): { rows: ExpenseMetricsRow[]; total: number } {
  const totals = new Map<ExpenseCategory, number>(EXPENSE_CATEGORIES.map((category) => [category, 0]));
  for (const transaction of transactions) {
    if (!isCompletedTransaction(transaction.trang_thai) || isIncomeTransaction(transaction.loai_phieu)) continue;
    const category = normalizeExpenseCategory(transaction.danh_muc);
    totals.set(category, (totals.get(category) || 0) + numberValue(transaction.so_tien));
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return {
    total,
    rows: EXPENSE_CATEGORIES.map((danh_muc) => {
      const so_tien = totals.get(danh_muc) || 0;
      return { danh_muc, so_tien, ty_trong: total > 0 ? so_tien / total : 0 };
    }),
  };
}

export function buildCashFlowReport(transactions: BusinessTransactionInput[]): CashFlowMetricsRow[] {
  const totals = new Map<CashFlowMetricsRow['phuong_thuc'], { thu: number; chi: number }>();
  for (const transaction of transactions) {
    if (!isCompletedTransaction(transaction.trang_thai)) continue;
    const method = normalizeCashFlowMethod(transaction.phuong_thuc);
    const current = totals.get(method) || { thu: 0, chi: 0 };
    if (isIncomeTransaction(transaction.loai_phieu)) current.thu += numberValue(transaction.so_tien);
    else current.chi += numberValue(transaction.so_tien);
    totals.set(method, current);
  }
  if (totals.size === 0) return [];
  return CASH_FLOW_METHODS.map((phuong_thuc) => {
    const value = totals.get(phuong_thuc) || { thu: 0, chi: 0 };
    return { phuong_thuc, ...value, dong_tien_thuan: value.thu - value.chi };
  });
}

/** Công nợ khách hàng từ đơn chưa thu đủ; công nợ nhà cung cấp từ phiếu chi chưa hoàn thành. */
export function buildDebtReport(
  orders: BusinessOrderInput[],
  details: BusinessOrderDetailInput[],
  transactions: BusinessTransactionInput[]
): DebtMetricsRow[] {
  const detailTotals = new Map<string, number>();
  for (const detail of details) {
    const key = String(detail.id_don_hang || '').trim().toLowerCase();
    if (!key) continue;
    detailTotals.set(key, (detailTotals.get(key) || 0) + lineRevenue(detail));
  }
  const paidByOrder = new Map<string, number>();
  for (const transaction of transactions) {
    if (!isCompletedTransaction(transaction.trang_thai) || !isIncomeTransaction(transaction.loai_phieu)) continue;
    const key = String(transaction.id_don || '').trim().toLowerCase();
    if (!key) continue;
    paidByOrder.set(key, (paidByOrder.get(key) || 0) + numberValue(transaction.so_tien));
  }

  const customerDebt = new Map<string, DebtMetricsRow>();
  for (const order of orders) {
    const refs = refsForOrder(order);
    const detailAmount = refs.map((ref) => detailTotals.get(ref)).find((value) => value !== undefined);
    const total = detailAmount ?? numberValue(order.tong_tien);
    const paid = refs.reduce((sum, ref) => sum + (paidByOrder.get(ref) || 0), 0);
    const debt = Math.max(0, total - paid);
    if (debt <= 0) continue;
    const key = String(order.khach_hang_id || order.ten_khach_hang || 'khach-vang-lai').trim();
    const current = customerDebt.get(key) || {
      key,
      doi_tuong: String(order.ten_khach_hang || 'Khách vãng lai').trim() || 'Khách vãng lai',
      loai: 'Khách hàng' as const,
      tong_phat_sinh: 0,
      da_thanh_toan: 0,
      con_no: 0,
    };
    current.tong_phat_sinh += total;
    current.da_thanh_toan += paid;
    current.con_no += debt;
    customerDebt.set(key, current);
  }

  const supplierDebt = new Map<string, DebtMetricsRow>();
  for (const transaction of transactions) {
    if (isIncomeTransaction(transaction.loai_phieu) || isCompletedTransaction(transaction.trang_thai)) continue;
    const name = String(transaction.nguoi_nhan || transaction.danh_muc || 'Nhà cung cấp chưa xác định').trim() || 'Nhà cung cấp chưa xác định';
    const key = `supplier:${normalizeBusinessText(name) || 'unknown'}`;
    const current = supplierDebt.get(key) || {
      key,
      doi_tuong: name,
      loai: 'Nhà cung cấp' as const,
      tong_phat_sinh: 0,
      da_thanh_toan: 0,
      con_no: 0,
    };
    const amount = numberValue(transaction.so_tien);
    current.tong_phat_sinh += amount;
    current.con_no += amount;
    supplierDebt.set(key, current);
  }
  return [...customerDebt.values(), ...supplierDebt.values()].sort((a, b) => b.con_no - a.con_no);
}

export function buildProductCostReport(
  details: BusinessOrderDetailInput[],
  products: BusinessProductInput[]
): ProductCostMetricsRow[] {
  const productByName = new Map<string, BusinessProductInput>();
  for (const product of products) {
    const key = normalizeBusinessText(product.ten_san_pham);
    if (key && !productByName.has(key)) productByName.set(key, product);
  }
  const rows = new Map<string, ProductCostMetricsRow>();
  for (const detail of details) {
    const san_pham = String(detail.san_pham || '').trim() || 'Sản phẩm chưa xác định';
    const product = productByName.get(normalizeBusinessText(san_pham));
    const ma_san_pham = String(product?.ma_san_pham || '').trim() || '—';
    const key = ma_san_pham === '—' ? `name:${normalizeBusinessText(san_pham)}` : `sku:${ma_san_pham.toLowerCase()}`;
    const current = rows.get(key) || {
      key,
      ma_san_pham,
      san_pham: String(product?.ten_san_pham || san_pham).trim() || san_pham,
      so_luong: 0,
      doanh_thu: 0,
      gia_von: 0,
      loi_nhuan_gop: 0,
      bien_loi_nhuan: 0,
    };
    current.so_luong += lineQuantity(detail);
    current.doanh_thu += lineRevenue(detail);
    current.gia_von += lineCost(detail);
    current.loi_nhuan_gop = current.doanh_thu - current.gia_von;
    current.bien_loi_nhuan = current.doanh_thu > 0 ? current.loi_nhuan_gop / current.doanh_thu : 0;
    rows.set(key, current);
  }
  return [...rows.values()].sort((a, b) => b.doanh_thu - a.doanh_thu || a.san_pham.localeCompare(b.san_pham, 'vi'));
}
