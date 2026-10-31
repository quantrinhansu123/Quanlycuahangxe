import { getStoredDemoRole } from '../lib/authStorage';
import {
  buildCashFlowReport, buildDebtReport, buildExpenseReport, buildPeriodBusinessMetrics,
  buildProductCostReport, buildReportSummary, previousBusinessRange,
  type CashFlowMetricsRow, type DebtMetricsRow, type ExpenseMetricsRow,
  type PeriodBusinessMetrics, type ProductCostMetricsRow, type BusinessPurchaseInput, type PaymentAllocation,
} from '../lib/businessReportMetrics';
import { buildDebtLedgers, invoicePaymentLines, type DebtLedger } from '../lib/businessAccountingDetails';
import { belongsToReportBranch, scopeBusinessOrders } from '../lib/businessReportScope';
import { getErrorDetails } from '../lib/errorDetails';
import { supabase } from '../lib/supabase';
import { calculateInventoryStockSummary, type ProductRecord, type InventoryRecord, type InventoryStockSummaryRow } from './inventoryData';
import { fetchAllCTRecords, type ReportCTRecords, type ReportSummary } from './reportData';
import { readRequest } from '../lib/readRequest';

const isDemo = () => typeof window !== 'undefined' && !!getStoredDemoRole();
const HISTORY_PAGE = 1000;

function isStatementTimeout(error: unknown): boolean {
  const details = getErrorDetails(error);
  const text = [details.message, details.details, details.hint, error instanceof Error ? error.message : '']
    .filter(Boolean)
    .join(' ');
  return details.code === '57014' || /statement timeout|canceling statement/i.test(text);
}

async function fetchPagedRows<T>(
  name: string,
  build: (signal: AbortSignal, from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += HISTORY_PAGE) {
    signal?.throwIfAborted();
    const { data, error } = await readRequest(name, requestSignal => build(requestSignal, from, from + HISTORY_PAGE - 1), signal);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < HISTORY_PAGE) return rows;
  }
}

export type BusinessTransactionRow = {
  id: string; loai_phieu: string; id_don: string | null; danh_muc: string | null;
  so_tien: number | null; nguoi_nhan: string | null; trang_thai: string; ngay: string;
  gio?: string | null; phuong_thuc?: string | null; co_so?: string | null;
  source_type?: string | null; source_id?: string | null; ghi_chu?: string | null;
  payment_allocations?: PaymentAllocation[]; expense_start_month?: string | null; expense_months?: number;
  payroll_employee_id?: string | null; payroll_month?: number | null; payroll_year?: number | null; payroll_payment_kind?: 'salary' | 'advance' | null;
};
type OrderRow = { id: string; id_bh: string | null; ngay: string; co_so?: string | null; khach_hang_id: string | null; ten_khach_hang: string | null; tong_tien: number | null; ma_khach_hang?: string | null };
type ServiceCodeRow = { id_dich_vu: string | null; ten_dich_vu: string };
type HistoricalSources = Pick<BusinessReportSources, 'transactions' | 'orders' | 'purchases' | 'products' | 'services' | 'movements'>;
const historicalKeys = ['transactions','orders','purchases','products','services','movements'] as const;
export function decodeFinancialSnapshot(payload: unknown): HistoricalSources {
  if(!payload || typeof payload!=='object')throw new Error('Dữ liệu báo cáo tài chính không đầy đủ. Vui lòng thử lại.');
  const result: Record<string,unknown[]>={};
  for(const key of historicalKeys){
    const value=(payload as Record<string,unknown>)[key];
    // Accept the first snapshot format during a frontend/database rolling update.
    if(Array.isArray(value)){result[key]=value;continue;}
    const packed=value as {columns?: unknown;rows?: unknown} | undefined;
    if(!packed || !Array.isArray(packed.columns) || !packed.columns.every(c=>typeof c==='string') || !Array.isArray(packed.rows))throw new Error('Dữ liệu báo cáo tài chính không đầy đủ. Vui lòng thử lại.');
    const columns=packed.columns as string[];
    result[key]=packed.rows.map(row=>{
      if(!Array.isArray(row) || row.length!==columns.length)throw new Error('Dòng dữ liệu báo cáo không hợp lệ. Vui lòng thử lại.');
      return Object.fromEntries(columns.map((column,i)=>[column,row[i]]));
    });
  }
  return result as unknown as HistoricalSources;
}
async function fetchHistoricalSourcesPaged(start: string, end: string, signal?: AbortSignal): Promise<HistoricalSources> {
  // Bound pages stay under role statement_timeout when the single snapshot RPC
  // still times out (migration pending or cold cache). Keep prepaid vouchers
  // whose allocation window overlaps the selected period.
  const [cashThroughEnd, prepaidOverlapping, orders, purchases, products, services, movements] = await Promise.all([
    fetchPagedRows<BusinessTransactionRow>('report_financial_tx_page', (s, from, to) =>
      supabase.from('thu_chi').select('id,loai_phieu,id_don,danh_muc,so_tien,nguoi_nhan,trang_thai,ngay,gio,phuong_thuc,co_so,source_type,source_id,ghi_chu,payment_allocations,expense_start_month,expense_months,payroll_employee_id,payroll_month,payroll_year,payroll_payment_kind')
        .lte('ngay', end).order('ngay').order('id').range(from, to).abortSignal(s), signal),
    fetchPagedRows<BusinessTransactionRow>('report_financial_prepaid_page', (s, from, to) =>
      supabase.from('thu_chi').select('id,loai_phieu,id_don,danh_muc,so_tien,nguoi_nhan,trang_thai,ngay,gio,phuong_thuc,co_so,source_type,source_id,ghi_chu,payment_allocations,expense_start_month,expense_months,payroll_employee_id,payroll_month,payroll_year,payroll_payment_kind')
        .not('expense_start_month', 'is', null).lte('expense_start_month', end).gt('ngay', end)
        .order('ngay').order('id').range(from, to).abortSignal(s), signal),
    fetchPagedRows<OrderRow>('report_financial_orders_page', (s, from, to) =>
      supabase.from('the_ban_hang').select('id,id_bh,ngay,co_so,khach_hang_id,ten_khach_hang,tong_tien')
        .lte('ngay', end).order('ngay').order('id').range(from, to).abortSignal(s), signal),
    fetchPagedRows<BusinessPurchaseInput>('report_financial_purchases_page', (s, from, to) =>
      supabase.from('phieu_nhap_hang').select('id,ma_phieu,nha_cung_cap,ma_nha_cung_cap,co_so,tong_tien,ngay')
        .lte('ngay', end).order('ngay').order('id').range(from, to).abortSignal(s), signal),
    fetchPagedRows<ProductRecord>('report_financial_products_page', (s, from, to) =>
      supabase.from('ds_san_pham').select('id,ma_san_pham,ten_san_pham,don_vi_tinh,gia,ton_dau_ky,canh_bao_ton')
        .order('ten_san_pham').order('id').range(from, to).abortSignal(s), signal),
    fetchPagedRows<ServiceCodeRow & { id: string }>('report_financial_services_page', (s, from, to) =>
      supabase.from('dich_vu').select('id,id_dich_vu,ten_dich_vu').order('id').range(from, to).abortSignal(s), signal),
    fetchPagedRows<InventoryRecord>('report_financial_movements_page', (s, from, to) =>
      supabase.from('nhap_xuat_kho').select('id,id_xuat_nhap_kho,loai_phieu,id_don_hang,co_so,ten_mat_hang,ton_dau_ky,so_luong,gia,tong_tien,ngay,gio,nguoi_thuc_hien')
        .lte('ngay', end).order('ngay').order('id').range(from, to).abortSignal(s), signal),
  ]);

  const transactionMap = new Map<string, BusinessTransactionRow>();
  for (const row of cashThroughEnd) transactionMap.set(row.id, row);
  for (const row of prepaidOverlapping) {
    if (!row.expense_start_month || transactionMap.has(row.id)) continue;
    const months = Math.max(1, Number(row.expense_months) || 1);
    const allocEnd = new Date(`${String(row.expense_start_month).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(allocEnd.getTime())) continue;
    allocEnd.setUTCMonth(allocEnd.getUTCMonth() + months);
    if (allocEnd.toISOString().slice(0, 10) > start) transactionMap.set(row.id, row);
  }

  return {
    transactions: [...transactionMap.values()],
    orders: orders.map(row => ({ ...row, ma_khach_hang: row.ma_khach_hang || row.khach_hang_id })),
    purchases,
    products,
    services,
    movements,
  };
}

async function fetchHistoricalSources(start: string, end: string, signal?: AbortSignal): Promise<HistoricalSources> {
  try {
    const { data, error } = await readRequest(
      'report_financial_snapshot',
      s => supabase.rpc('business_report_snapshot', { p_start: start, p_end: end }).abortSignal(s),
      signal,
    );
    if (error) throw error;
    return decodeFinancialSnapshot(data);
  } catch (error) {
    if (signal?.aborted || !isStatementTimeout(error)) throw error;
    console.warn('[business-report] snapshot timed out; loading history in pages');
    return fetchHistoricalSourcesPaged(start, end, signal);
  }
}
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
  debtLedgers: DebtLedger[];
  expenseTransactions: BusinessTransactionRow[];
}

export async function getBusinessReportData(startDate: string, endDate: string, sharedDetails?: ReportCTRecords, signal?: AbortSignal, branch = '', sharedSources?: BusinessReportSources): Promise<BusinessReportData> {
  const prior = previousBusinessRange(startDate, endDate);
  const demo = isDemo();
  // Outstanding debt includes earlier invoices and payments through the end date.
  const reuse = sharedSources?.startDate === startDate && sharedSources.endDate === endDate ? sharedSources : undefined;
  const [history, details, priorDetails] = reuse
    ? [reuse, reuse.details, reuse.priorDetails]
    : await Promise.all([
    demo ? Promise.resolve({ transactions:[],orders:[],purchases:[],products:[],services:[],movements:[] } as HistoricalSources) : fetchHistoricalSources(startDate,endDate,signal),
    sharedDetails ?? (demo ? Promise.resolve([] as ReportCTRecords) : fetchAllCTRecords(startDate, endDate, signal)),
    demo ? Promise.resolve([] as ReportCTRecords) : fetchAllCTRecords(prior.start, prior.end, signal),
  ]);
  const { transactions,orders,purchases,products,services,movements } = history;
  signal?.throwIfAborted();
  const scopedTransactions = transactions.filter(row => belongsToReportBranch(row.co_so, branch));
  const scopedMovements = movements.filter(row => belongsToReportBranch(row.co_so, branch));
  const currentDetails = [...details].filter(row => belongsToReportBranch(row.co_so, branch)).sort((a, b) => a.id.localeCompare(b.id));
  const previousDetails = [...priorDetails].filter(row => belongsToReportBranch(row.co_so, branch)).sort((a, b) => a.id.localeCompare(b.id));
  const scopedOrders = scopeBusinessOrders(orders, [...details, ...priorDetails], branch);
  const currentTransactions = scopedTransactions.filter(row => row.ngay >= startDate && row.ngay <= endDate);
  const previousTransactions = scopedTransactions.filter(row => row.ngay >= prior.start && row.ngay <= prior.end);
  const currentOrders = scopedOrders.filter(row => row.ngay >= startDate);
  const previousOrders = scopedOrders.filter(row => row.ngay >= prior.start && row.ngay <= prior.end);
  const scopedPurchases = purchases.filter(row => belongsToReportBranch(row.co_so, branch));
  const baseSummary = buildReportSummary(currentDetails);
  const basePreviousSummary = buildReportSummary(previousDetails);
  const summary = { ...baseSummary, ...buildPeriodBusinessMetrics(currentOrders, invoicePaymentLines(currentTransactions)), total_cost: baseSummary.total_revenue - baseSummary.total_profit, gross_margin: baseSummary.total_revenue ? baseSummary.total_profit / baseSummary.total_revenue : 0 };
  const expenseReport = buildExpenseReport(scopedTransactions, startDate, endDate);
  const cashFlow = buildCashFlowReport(currentTransactions);
  const profitBeforeTax = summary.total_profit - expenseReport.total;
  // A global opening stock has no branch allocation. Never copy it into each branch.
  const inventory = calculateInventoryStockSummary(products.map(p => branch ? { ...p, ton_dau_ky: 0 } : p), scopedMovements, startDate, endDate);
  return {
    summary, previousSummary: { ...basePreviousSummary, ...buildPeriodBusinessMetrics(previousOrders, invoicePaymentLines(previousTransactions)) },
    previousStart: prior.start, previousEnd: prior.end,
    expenses: expenseReport.rows, totalExpenses: expenseReport.total, profitBeforeTax,
    preTaxMargin: summary.total_revenue ? profitBeforeTax / summary.total_revenue : 0,
    debts: buildDebtReport(scopedOrders, [], invoicePaymentLines(scopedTransactions.filter(row => row.ngay <= endDate)), scopedPurchases), cashFlow,
    debtLedgers: buildDebtLedgers(scopedOrders, scopedPurchases, scopedTransactions, startDate, endDate), expenseTransactions: scopedTransactions,
    totalCashIn: cashFlow.reduce((sum, row) => sum + row.thu, 0), totalCashOut: cashFlow.reduce((sum, row) => sum + row.chi, 0),
    productCosts: buildProductCostReport(currentDetails, [...products, ...services.map(service => ({ ma_san_pham: service.id_dich_vu, ten_san_pham: service.ten_dich_vu }))]), inventory,
    transactions: currentTransactions, inventoryMovements: scopedMovements.filter(row => row.ngay >= startDate), purchases: scopedPurchases,
    missingCostLines: currentDetails.filter(row => row.gia_von == null || Number(row.gia_von) === 0).length,
    costLines: currentDetails, orders: scopedOrders,
    sources: { startDate, endDate, transactions, orders, purchases, products, services, movements, details, priorDetails },
  };
}
