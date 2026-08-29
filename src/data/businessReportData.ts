import { getStoredDemoRole } from '../lib/authStorage';
import { supabase } from '../lib/supabase';
import { getInventoryStockSummary, type InventoryStockSummaryRow } from './inventoryData';
import { getReportSummary, type ReportSummary } from './reportData';

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
  nguoi_chi: string | null;
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
  thanh_tien: number | null;
  gia_ban: number | null;
  so_luong: number | null;
};

export interface DebtReportRow {
  key: string;
  doi_tuong: string;
  loai: 'Khách hàng' | 'Nhà cung cấp';
  tong_phat_sinh: number;
  da_thanh_toan: number;
  con_no: number;
}

export interface ExpenseReportRow {
  danh_muc: string;
  so_tien: number;
  ty_trong: number;
}

export interface CashFlowReportRow {
  phuong_thuc: string;
  thu: number;
  chi: number;
  dong_tien_thuan: number;
}

export interface BusinessReportData {
  summary: ReportSummary & { total_cost: number; gross_margin: number };
  previousSummary: ReportSummary;
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
  inventory: InventoryStockSummaryRow[];
}

function completed(status: string | null | undefined): boolean {
  const value = String(status || '').trim().toLowerCase();
  return value === 'hoàn thành' || value === 'hoan thanh' || value === 'completed';
}

function isIncome(type: string): boolean {
  return String(type || '').trim().toLowerCase().includes('thu');
}

function previousRange(startDate: string, endDate: string): { start: string; end: string } {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - duration + 1);
  return {
    start: previousStart.toISOString().slice(0, 10),
    end: previousEnd.toISOString().slice(0, 10),
  };
}

function demoTransactions(startDate: string): TransactionRow[] {
  return [
    { id: 't1', loai_phieu: 'phiếu thu', id_don: 'o1', danh_muc: 'Doanh thu dịch vụ', so_tien: 4_500_000, nguoi_nhan: 'Thu ngân', nguoi_chi: 'Nguyễn Văn A', trang_thai: 'Hoàn thành', ngay: startDate, phuong_thuc: 'Tiền mặt' },
    { id: 't2', loai_phieu: 'phiếu chi', id_don: null, danh_muc: 'Thuê nhà', so_tien: 2_000_000, nguoi_nhan: 'Chủ nhà', nguoi_chi: 'Kế toán', trang_thai: 'Hoàn thành', ngay: startDate, phuong_thuc: 'Ngân hàng' },
    { id: 't3', loai_phieu: 'phiếu chi', id_don: null, danh_muc: 'Tiền điện nước', so_tien: 500_000, nguoi_nhan: 'Điện lực', nguoi_chi: 'Kế toán', trang_thai: 'Chờ thanh toán', ngay: startDate, phuong_thuc: 'Ngân hàng' },
  ];
}

export async function getBusinessReportData(startDate: string, endDate: string): Promise<BusinessReportData> {
  const prior = previousRange(startDate, endDate);

  let transactions: TransactionRow[];
  let orders: OrderRow[];
  let details: OrderDetailRow[];

  if (isDemo()) {
    transactions = demoTransactions(startDate);
    orders = [{ id: 'o1', id_bh: 'BH-001', ngay: startDate, khach_hang_id: 'kh1', ten_khach_hang: 'Nguyễn Văn A', tong_tien: 5_000_000 }];
    details = [];
  } else {
    [transactions, orders, details] = await Promise.all([
      fetchAll<TransactionRow>(async (from, to) => {
        const result = await supabase.from('thu_chi').select('id, loai_phieu, id_don, danh_muc, so_tien, nguoi_nhan, nguoi_chi, trang_thai, ngay, phuong_thuc').gte('ngay', startDate).lte('ngay', endDate).order('ngay').order('id').range(from, to);
        return { data: result.data as TransactionRow[] | null, error: result.error };
      }),
      fetchAll<OrderRow>(async (from, to) => {
        const result = await supabase.from('the_ban_hang').select('id, id_bh, ngay, khach_hang_id, ten_khach_hang, tong_tien').gte('ngay', startDate).lte('ngay', endDate).order('ngay').order('id').range(from, to);
        return { data: result.data as OrderRow[] | null, error: result.error };
      }),
      fetchAll<OrderDetailRow>(async (from, to) => {
        const result = await supabase.from('the_ban_hang_ct').select('id_don_hang, thanh_tien, gia_ban, so_luong').gte('ngay', startDate).lte('ngay', endDate).order('id').range(from, to);
        return { data: result.data as OrderDetailRow[] | null, error: result.error };
      }),
    ]);
  }

  const [baseSummary, previousSummary, inventory] = await Promise.all([
    getReportSummary(startDate, endDate),
    getReportSummary(prior.start, prior.end),
    isDemo() ? Promise.resolve([] as InventoryStockSummaryRow[]) : getInventoryStockSummary(startDate, endDate),
  ]);

  const totalCost = baseSummary.total_revenue - baseSummary.total_profit;
  const summary = {
    ...baseSummary,
    total_cost: totalCost,
    gross_margin: baseSummary.total_revenue > 0 ? baseSummary.total_profit / baseSummary.total_revenue : 0,
  };

  const valid = transactions.filter((row) => completed(row.trang_thai));
  const expenseMap = new Map<string, number>();
  for (const row of valid) {
    if (isIncome(row.loai_phieu)) continue;
    const key = row.danh_muc?.trim() || 'Chi phí khác';
    expenseMap.set(key, (expenseMap.get(key) || 0) + Number(row.so_tien || 0));
  }
  const totalExpenses = [...expenseMap.values()].reduce((sum, value) => sum + value, 0);
  const expenses = [...expenseMap.entries()]
    .map(([danh_muc, so_tien]) => ({ danh_muc, so_tien, ty_trong: totalExpenses > 0 ? so_tien / totalExpenses : 0 }))
    .sort((a, b) => b.so_tien - a.so_tien);

  const cashMap = new Map<string, { thu: number; chi: number }>();
  for (const row of valid) {
    const method = row.phuong_thuc?.trim() || (isIncome(row.loai_phieu) ? 'Tiền mặt' : 'Chưa phân loại');
    const current = cashMap.get(method) || { thu: 0, chi: 0 };
    if (isIncome(row.loai_phieu)) current.thu += Number(row.so_tien || 0);
    else current.chi += Number(row.so_tien || 0);
    cashMap.set(method, current);
  }
  const cashFlow = [...cashMap.entries()].map(([phuong_thuc, value]) => ({
    phuong_thuc,
    ...value,
    dong_tien_thuan: value.thu - value.chi,
  })).sort((a, b) => b.thu + b.chi - (a.thu + a.chi));

  const detailTotals = new Map<string, number>();
  for (const detail of details) {
    const key = String(detail.id_don_hang || '').trim().toLowerCase();
    if (!key) continue;
    const total = Number(detail.thanh_tien ?? (Number(detail.gia_ban || 0) * Number(detail.so_luong || 1)));
    detailTotals.set(key, (detailTotals.get(key) || 0) + total);
  }
  const paidByOrder = new Map<string, number>();
  for (const row of valid) {
    if (!isIncome(row.loai_phieu) || !row.id_don) continue;
    const key = String(row.id_don).trim().toLowerCase();
    paidByOrder.set(key, (paidByOrder.get(key) || 0) + Number(row.so_tien || 0));
  }
  const customerDebt = new Map<string, DebtReportRow>();
  for (const order of orders) {
    const refs = [order.id, order.id_bh].filter(Boolean).map((value) => String(value).trim().toLowerCase());
    const total = refs.map((key) => detailTotals.get(key) || 0).find((value) => value > 0) || Number(order.tong_tien || 0);
    const paid = refs.reduce((max, key) => Math.max(max, paidByOrder.get(key) || 0), 0);
    const debt = Math.max(0, total - paid);
    if (debt <= 0) continue;
    const key = order.khach_hang_id || order.ten_khach_hang || 'khach-vang-lai';
    const current = customerDebt.get(key) || { key, doi_tuong: order.ten_khach_hang || 'Khách vãng lai', loai: 'Khách hàng' as const, tong_phat_sinh: 0, da_thanh_toan: 0, con_no: 0 };
    current.tong_phat_sinh += total;
    current.da_thanh_toan += paid;
    current.con_no += debt;
    customerDebt.set(key, current);
  }

  const supplierDebt = new Map<string, DebtReportRow>();
  for (const row of transactions) {
    if (isIncome(row.loai_phieu) || completed(row.trang_thai)) continue;
    const name = row.nguoi_nhan?.trim() || row.danh_muc?.trim() || 'Nhà cung cấp chưa xác định';
    const key = `supplier:${name.toLowerCase()}`;
    const current = supplierDebt.get(key) || { key, doi_tuong: name, loai: 'Nhà cung cấp' as const, tong_phat_sinh: 0, da_thanh_toan: 0, con_no: 0 };
    const amount = Number(row.so_tien || 0);
    current.tong_phat_sinh += amount;
    current.con_no += amount;
    supplierDebt.set(key, current);
  }

  const profitBeforeTax = summary.total_profit - totalExpenses;
  return {
    summary,
    previousSummary,
    previousStart: prior.start,
    previousEnd: prior.end,
    expenses,
    totalExpenses,
    profitBeforeTax,
    preTaxMargin: summary.total_revenue > 0 ? profitBeforeTax / summary.total_revenue : 0,
    debts: [...customerDebt.values(), ...supplierDebt.values()].sort((a, b) => b.con_no - a.con_no),
    cashFlow,
    totalCashIn: cashFlow.reduce((sum, row) => sum + row.thu, 0),
    totalCashOut: cashFlow.reduce((sum, row) => sum + row.chi, 0),
    inventory,
  };
}
