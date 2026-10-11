import { getStoredDemoRole } from '../lib/authStorage';
import {
  buildCashFlowReport, buildDebtReport, buildExpenseReport, buildPeriodBusinessMetrics,
  buildProductCostReport, buildReportSummary, previousBusinessRange,
  type CashFlowMetricsRow, type DebtMetricsRow, type ExpenseMetricsRow,
  type PeriodBusinessMetrics, type ProductCostMetricsRow, type BusinessPurchaseInput, type PaymentAllocation,
} from '../lib/businessReportMetrics';
import { buildDebtLedgers, invoicePaymentLines, type DebtLedger } from '../lib/businessAccountingDetails';
import { belongsToReportBranch, scopeBusinessOrders } from '../lib/businessReportScope';
import { supabase } from '../lib/supabase';
import { calculateInventoryStockSummary, type ProductRecord, type InventoryRecord, type InventoryStockSummaryRow } from './inventoryData';
import { fetchAllCTRecords, type ReportCTRecords, type ReportSummary } from './reportData';
import { readRequest } from '../lib/readRequest';

const isDemo = () => typeof window !== 'undefined' && !!getStoredDemoRole();

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
async function fetchHistoricalSources(start: string,end: string,signal?: AbortSignal): Promise<HistoricalSources> {
  const { data,error } = await readRequest('report_financial_snapshot', s => supabase.rpc('business_report_snapshot', { p_start:start,p_end:end }).abortSignal(s),signal);
  if (error) throw error;
  return decodeFinancialSnapshot(data);
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
