import { getStoredDemoRole } from '../lib/authStorage';
import {
  buildCashFlowReport,
  buildDebtReport,
  buildExpenseReport,
  buildPeriodBusinessMetrics,
  buildProductCostReport,
  buildReportSummary,
  previousBusinessRange,
  type CashFlowMetricsRow,
  type DebtMetricsRow,
  type ExpenseMetricsRow,
  type PeriodBusinessMetrics,
  type ProductCostMetricsRow,
} from '../lib/businessReportMetrics';
import { supabase } from '../lib/supabase';
import { getInventoryStockSummary, type InventoryStockSummaryRow } from './inventoryData';
import type { ReportSummary } from './reportData';

const PAGE_SIZE = 1000;
const isDemo = () => typeof window !== 'undefined' && !!getStoredDemoRole();

async function fetchAll<T>(buildPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

type TransactionRow = {
  id: string;
  loai_phieu: string;
  id_don: string | null;
  danh_muc: string | null;
  so_tien: number | null;
  nguoi_nhan: string | null;
  trang_thai: string;
  ngay: string;
  phuong_thuc?: string | null;
};

type OrderRow = {
  id: string;
  id_bh: string | null;
  ngay: string;
  khach_hang_id: string | null;
  ten_khach_hang: string | null;
  tong_tien: number | null;
};

type OrderDetailRow = {
  id_don_hang: string | null;
  san_pham: string | null;
  thanh_tien: number | null;
  gia_ban: number | null;
  gia_von: number | null;
  so_luong: number | null;
  ngay: string | null;
};

type PeriodRows = {
  transactions: TransactionRow[];
  orders: OrderRow[];
  details: OrderDetailRow[];
};

export type DebtReportRow = DebtMetricsRow;
export type ExpenseReportRow = ExpenseMetricsRow;
export type CashFlowReportRow = CashFlowMetricsRow;
export type ProductCostReportRow = ProductCostMetricsRow;

export type FinancialReportSummary = ReportSummary & PeriodBusinessMetrics & {
  total_cost: number;
  gross_margin: number;
};

export interface BusinessReportData {
  summary: FinancialReportSummary;
  previousSummary: ReportSummary & PeriodBusinessMetrics;
  previousStart: string;
  previousEnd: string;
  expenses: ExpenseReportRow[];
  totalExpenses: number;
  profitBeforeTax: number;
  preTaxMargin: number;
  debts: DebtReportRow[];
  cashFlow: CashFlowReportRow[];
  totalCashIn: number;
  totalCashOut: number;
  productCosts: ProductCostReportRow[];
  inventory: InventoryStockSummaryRow[];
}

function demoPeriodRows(date: string, previous = false): PeriodRows {
  const orderId = previous ? 'demo-order-previous' : 'demo-order-current';
  const orderCode = previous ? 'BH-DEMO-TRUOC' : 'BH-DEMO-NAY';
  const revenue = previous ? 4_000_000 : 5_000_000;
  const cost = previous ? 2_500_000 : 3_000_000;
  return {
    transactions: [
      { id: `${orderId}-receipt`, loai_phieu: 'phiếu thu', id_don: orderId, danh_muc: 'Doanh thu dịch vụ', so_tien: previous ? 3_500_000 : 4_500_000, nguoi_nhan: 'Thu ngân', trang_thai: 'Hoàn thành', ngay: date, phuong_thuc: 'Tiền mặt' },
      { id: `${orderId}-rent`, loai_phieu: 'phiếu chi', id_don: null, danh_muc: 'Thuê mặt bằng', so_tien: previous ? 1_500_000 : 2_000_000, nguoi_nhan: 'Chủ nhà', trang_thai: 'Hoàn thành', ngay: date, phuong_thuc: 'Ngân hàng' },
      { id: `${orderId}-utilities`, loai_phieu: 'phiếu chi', id_don: null, danh_muc: 'Tiền điện nước', so_tien: 500_000, nguoi_nhan: 'Điện lực', trang_thai: 'Chờ thanh toán', ngay: date, phuong_thuc: 'Ngân hàng' },
    ],
    orders: [{ id: orderId, id_bh: orderCode, ngay: date, khach_hang_id: previous ? 'demo-vehicle-previous' : 'demo-vehicle-current', ten_khach_hang: 'Nguyễn Văn A', tong_tien: revenue }],
    details: [{ id_don_hang: orderId, san_pham: 'Bảo dưỡng xe', thanh_tien: revenue, gia_ban: revenue, gia_von: cost, so_luong: 1, ngay: date }],
  };
}

async function fetchPeriodRows(startDate: string, endDate: string): Promise<PeriodRows> {
  const [transactions, orders, details] = await Promise.all([
    fetchAll<TransactionRow>(async (from, to) => {
      const result = await supabase.from('thu_chi').select('id, loai_phieu, id_don, danh_muc, so_tien, nguoi_nhan, trang_thai, ngay, phuong_thuc').gte('ngay', startDate).lte('ngay', endDate).order('ngay').order('id').range(from, to);
      return { data: result.data as TransactionRow[] | null, error: result.error };
    }),
    fetchAll<OrderRow>(async (from, to) => {
      const result = await supabase.from('the_ban_hang').select('id, id_bh, ngay, khach_hang_id, ten_khach_hang, tong_tien').gte('ngay', startDate).lte('ngay', endDate).order('ngay').order('id').range(from, to);
      return { data: result.data as OrderRow[] | null, error: result.error };
    }),
    fetchAll<OrderDetailRow>(async (from, to) => {
      const result = await supabase.from('the_ban_hang_ct').select('id_don_hang, san_pham, thanh_tien, gia_ban, gia_von, so_luong, ngay').gte('ngay', startDate).lte('ngay', endDate).order('id').range(from, to);
      return { data: result.data as OrderDetailRow[] | null, error: result.error };
    }),
  ]);
  return { transactions, orders, details };
}

export async function getBusinessReportData(startDate: string, endDate: string): Promise<BusinessReportData> {
  const prior = previousBusinessRange(startDate, endDate);
  const demo = isDemo();
  const [current, previous, inventory] = await Promise.all([
    demo ? Promise.resolve(demoPeriodRows(startDate)) : fetchPeriodRows(startDate, endDate),
    demo ? Promise.resolve(demoPeriodRows(prior.start, true)) : fetchPeriodRows(prior.start, prior.end),
    demo ? Promise.resolve([] as InventoryStockSummaryRow[]) : getInventoryStockSummary(startDate, endDate),
  ]);

  const baseSummary = buildReportSummary(current.details);
  const basePreviousSummary = buildReportSummary(previous.details);
  const currentMetrics = buildPeriodBusinessMetrics(current.orders, current.transactions);
  const previousMetrics = buildPeriodBusinessMetrics(previous.orders, previous.transactions);
  const total_cost = baseSummary.total_revenue - baseSummary.total_profit;
  const summary: FinancialReportSummary = {
    ...baseSummary,
    ...currentMetrics,
    total_cost,
    gross_margin: baseSummary.total_revenue > 0 ? baseSummary.total_profit / baseSummary.total_revenue : 0,
  };
  const previousSummary = { ...basePreviousSummary, ...previousMetrics };

  const expenseReport = buildExpenseReport(current.transactions);
  const cashFlow = buildCashFlowReport(current.transactions);
  const productSources = demo
    ? [{ ma_san_pham: 'DV-0001', ten_san_pham: 'Bảo dưỡng xe' }]
    : inventory.map((row) => ({ ma_san_pham: row.ma_hang, ten_san_pham: row.ten_hang }));
  const profitBeforeTax = summary.total_profit - expenseReport.total;

  return {
    summary,
    previousSummary,
    previousStart: prior.start,
    previousEnd: prior.end,
    expenses: expenseReport.rows,
    totalExpenses: expenseReport.total,
    profitBeforeTax,
    preTaxMargin: summary.total_revenue > 0 ? profitBeforeTax / summary.total_revenue : 0,
    debts: buildDebtReport(current.orders, current.details, current.transactions),
    cashFlow,
    totalCashIn: cashFlow.reduce((sum, row) => sum + row.thu, 0),
    totalCashOut: cashFlow.reduce((sum, row) => sum + row.chi, 0),
    productCosts: buildProductCostReport(current.details, productSources),
    inventory,
  };
}
