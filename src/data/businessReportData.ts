import { getStoredDemoRole } from '../lib/authStorage';
import {
  buildCashFlowReport, buildDebtReport, buildExpenseReport, buildPeriodBusinessMetrics,
  buildProductCostReport, buildReportSummary, previousBusinessRange,
  type CashFlowMetricsRow, type DebtMetricsRow, type ExpenseMetricsRow,
  type PeriodBusinessMetrics, type ProductCostMetricsRow, type BusinessPurchaseInput,
} from '../lib/businessReportMetrics';
import { belongsToReportBranch, scopeBusinessOrders } from '../lib/businessReportScope';
import { supabase } from '../lib/supabase';
import { calculateInventoryStockSummary, type ProductRecord, type InventoryRecord, type InventoryStockSummaryRow } from './inventoryData';
import { fetchAllCTRecords, type ReportCTRecords, type ReportSummary } from './reportData';
import { readRequest } from '../lib/readRequest';

const PAGE_SIZE = 1000;
const isDemo = () => typeof window !== 'undefined' && !!getStoredDemoRole();

async function fetchAll<T>(buildPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export type BusinessTransactionRow = {
  id: string; loai_phieu: string; id_don: string | null; danh_muc: string | null;
  so_tien: number | null; nguoi_nhan: string | null; trang_thai: string; ngay: string;
  gio?: string | null; phuong_thuc?: string | null; co_so?: string | null;
  source_type?: string | null; source_id?: string | null; ghi_chu?: string | null;
};
type OrderRow = { id: string; id_bh: string | null; ngay: string; co_so?: string | null; khach_hang_id: string | null; ten_khach_hang: string | null; tong_tien: number | null };
type ServiceCodeRow = { id_dich_vu: string | null; ten_dich_vu: string };
export interface BusinessReportSources {
  startDate: string; endDate: string;
  transactions: BusinessTransactionRow[]; orders: OrderRow[]; purchases: BusinessPurchaseInput[];
  products: ProductRecord[]; services: ServiceCodeRow[]; movements: InventoryRecord[];
  details: ReportCTRecords; priorDetails: ReportCTRecords;
}
export type DebtReportRow = DebtMetricsRow;
export type ExpenseReportRow = ExpenseMetricsRow;
export type CashFlowReportRow = CashFlowMetricsRow;
export type ProductCostReportRow = ProductCostMetricsRow;
export type FinancialReportSummary = ReportSummary & PeriodBusinessMetrics & { total_cost: number; gross_margin: number };

export interface BusinessReportData {
  summary: FinancialReportSummary;
  previousSummary: ReportSummary & PeriodBusinessMetrics;
  previousStart: string; previousEnd: string;
  expenses: ExpenseReportRow[]; totalExpenses: number; profitBeforeTax: number; preTaxMargin: number;
  debts: DebtReportRow[]; cashFlow: CashFlowReportRow[]; totalCashIn: number; totalCashOut: number;
  productCosts: ProductCostReportRow[]; inventory: InventoryStockSummaryRow[];
  transactions: BusinessTransactionRow[]; inventoryMovements: InventoryRecord[];
  purchases: BusinessPurchaseInput[];
  missingCostLines: number;
  costLines: ReportCTRecords;
  orders: OrderRow[];
  sources: BusinessReportSources;
}

export async function getBusinessReportData(startDate: string, endDate: string, sharedDetails?: ReportCTRecords, signal?: AbortSignal, branch = '', sharedSources?: BusinessReportSources): Promise<BusinessReportData> {
  const prior = previousBusinessRange(startDate, endDate);
  const demo = isDemo();
  // Outstanding debt includes earlier invoices and payments through the end date.
  const reuse = sharedSources?.startDate === startDate && sharedSources.endDate === endDate ? sharedSources : undefined;
  const [transactions, orders, purchases, products, services, movements, details, priorDetails] = reuse
    ? [reuse.transactions, reuse.orders, reuse.purchases, reuse.products, reuse.services, reuse.movements, reuse.details, reuse.priorDetails]
    : await Promise.all([
    demo ? Promise.resolve([] as BusinessTransactionRow[]) : fetchAll<BusinessTransactionRow>(async (from, to) => {
      const result = await readRequest('report_transactions', s => supabase.from('thu_chi').select('id,loai_phieu,id_don,danh_muc,so_tien,nguoi_nhan,trang_thai,ngay,gio,phuong_thuc,co_so,source_type,source_id,ghi_chu').lte('ngay', endDate).order('ngay').order('id').range(from, to).abortSignal(s), signal);
      return { data: result.data, error: result.error };
    }),
    demo ? Promise.resolve([] as OrderRow[]) : fetchAll<OrderRow>(async (from, to) => {
      const result = await readRequest('report_business_headers', s => supabase.from('business_order_headers').select('id,id_bh,ngay,co_so,khach_hang_id,ten_khach_hang,tong_tien').lte('ngay', endDate).order('ngay').order('id').range(from, to).abortSignal(s), signal);
      return { data: result.data, error: result.error };
    }),
    demo ? Promise.resolve([] as BusinessPurchaseInput[]) : fetchAll<BusinessPurchaseInput>(async (from, to) => {
      const result = await readRequest('report_purchase_debt', s => supabase.from('phieu_nhap_hang').select('id,ma_phieu,nha_cung_cap,co_so,tong_tien,ngay').lte('ngay', endDate).order('ngay').order('id').range(from, to).abortSignal(s), signal);
      return { data: result.data, error: result.error };
    }),
    demo ? Promise.resolve([] as ProductRecord[]) : fetchAll<ProductRecord>(async (from, to) => {
      const result = await readRequest('report_product_catalog', s => supabase.from('ds_san_pham').select('id,ma_san_pham,ten_san_pham,don_vi_tinh,gia,ton_dau_ky').order('ten_san_pham').order('id').range(from, to).abortSignal(s), signal);
      return { data: result.data, error: result.error };
    }),
    demo ? Promise.resolve([] as ServiceCodeRow[]) : fetchAll<ServiceCodeRow>(async (from, to) => {
      const result = await readRequest('report_service_catalog', s => supabase.from('dich_vu').select('id,id_dich_vu,ten_dich_vu').order('id').range(from, to).abortSignal(s), signal);
      return { data: result.data, error: result.error };
    }),
    demo ? Promise.resolve([] as InventoryRecord[]) : fetchAll<InventoryRecord>(async (from, to) => {
      const result = await readRequest('report_inventory', s => supabase.from('nhap_xuat_kho').select('id,id_xuat_nhap_kho,loai_phieu,id_don_hang,co_so,ten_mat_hang,ton_dau_ky,so_luong,gia,tong_tien,ngay,gio,nguoi_thuc_hien').lte('ngay', endDate).order('ngay').order('id').range(from, to).abortSignal(s), signal);
      return { data: result.data, error: result.error };
    }),
    sharedDetails ?? (demo ? Promise.resolve([] as ReportCTRecords) : fetchAllCTRecords(startDate, endDate, signal)),
    demo ? Promise.resolve([] as ReportCTRecords) : fetchAllCTRecords(prior.start, prior.end, signal),
  ]);
  signal?.throwIfAborted();
  const scopedTransactions = transactions.filter(row => belongsToReportBranch(row.co_so, branch));
  const scopedMovements = movements.filter(row => belongsToReportBranch(row.co_so, branch));
  const currentDetails = [...details].filter(row => belongsToReportBranch(row.co_so, branch)).sort((a, b) => a.id.localeCompare(b.id));
  const previousDetails = [...priorDetails].filter(row => belongsToReportBranch(row.co_so, branch)).sort((a, b) => a.id.localeCompare(b.id));
  const scopedOrders = scopeBusinessOrders(orders, [...details, ...priorDetails], branch);
  const currentTransactions = scopedTransactions.filter(row => row.ngay >= startDate);
  const previousTransactions = scopedTransactions.filter(row => row.ngay >= prior.start && row.ngay <= prior.end);
  const currentOrders = scopedOrders.filter(row => row.ngay >= startDate);
  const previousOrders = scopedOrders.filter(row => row.ngay >= prior.start && row.ngay <= prior.end);
  const scopedPurchases = purchases.filter(row => belongsToReportBranch(row.co_so, branch));
  const baseSummary = buildReportSummary(currentDetails);
  const basePreviousSummary = buildReportSummary(previousDetails);
  const summary = { ...baseSummary, ...buildPeriodBusinessMetrics(currentOrders, currentTransactions), total_cost: baseSummary.total_revenue - baseSummary.total_profit, gross_margin: baseSummary.total_revenue ? baseSummary.total_profit / baseSummary.total_revenue : 0 };
  const expenseReport = buildExpenseReport(currentTransactions);
  const cashFlow = buildCashFlowReport(currentTransactions);
  const profitBeforeTax = summary.total_profit - expenseReport.total;
  // A global opening stock has no branch allocation. Never copy it into each branch.
  const inventory = calculateInventoryStockSummary(products.map(p => branch ? { ...p, ton_dau_ky: 0 } : p), scopedMovements, startDate, endDate);
  return {
    summary, previousSummary: { ...basePreviousSummary, ...buildPeriodBusinessMetrics(previousOrders, previousTransactions) },
    previousStart: prior.start, previousEnd: prior.end,
    expenses: expenseReport.rows, totalExpenses: expenseReport.total, profitBeforeTax,
    preTaxMargin: summary.total_revenue ? profitBeforeTax / summary.total_revenue : 0,
    debts: buildDebtReport(scopedOrders, [], scopedTransactions, scopedPurchases), cashFlow,
    totalCashIn: cashFlow.reduce((sum, row) => sum + row.thu, 0), totalCashOut: cashFlow.reduce((sum, row) => sum + row.chi, 0),
    productCosts: buildProductCostReport(currentDetails, [...products, ...services.map(service => ({ ma_san_pham: service.id_dich_vu, ten_san_pham: service.ten_dich_vu }))]), inventory,
    transactions: currentTransactions, inventoryMovements: scopedMovements.filter(row => row.ngay >= startDate), purchases: scopedPurchases,
    missingCostLines: currentDetails.filter(row => row.gia_von == null || Number(row.gia_von) === 0).length,
    costLines: currentDetails, orders: scopedOrders,
    sources: { startDate, endDate, transactions, orders, purchases, products, services, movements, details, priorDetails },
  };
}
