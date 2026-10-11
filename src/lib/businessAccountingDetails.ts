import { isCompletedTransaction, isIncomeTransaction, normalizeBusinessText, type BusinessTransactionInput, type BusinessOrderInput, type BusinessPurchaseInput, type DebtMetricsRow } from './businessReportMetrics';

/** Virtual invoice lines are used only for debts/collections, never for cash totals. */
export function invoicePaymentLines<T extends BusinessTransactionInput>(transactions: T[]): T[] {
  return transactions.flatMap(t => t.payment_allocations?.length
    ? t.payment_allocations.map(a => ({ ...t, id_don: a.source_id, source_id: a.source_id, source_type: a.source_type === 'sales_order' ? 'sales_payment' : 'purchase_payment', so_tien: Number(a.amount), payment_allocations: [] }))
    : [t]);
}
export interface DebtMovement {
  date: string; code: string; invoiceCode: string; description: string; incurred: number; paid: number; balance: number; voucherId?: string;
}
export interface DebtLedger extends DebtMetricsRow {
  code: string; opening: number; periodIncurred: number; periodPaid: number; movements: DebtMovement[];
}
type DatedOrder = BusinessOrderInput & { ngay: string; ma_khach_hang?: string | null };
export function buildDebtLedgers(orders: DatedOrder[], purchases: BusinessPurchaseInput[], transactions: BusinessTransactionInput[], start: string, end: string): DebtLedger[] {
  const accounts = new Map<string, DebtLedger>();
  const invoiceAccounts = new Map<string, { key: string; code: string }>();
  const appendInvoice = (key: string, code: string, name: string, type: DebtMetricsRow['loai'], refs: string[], invoiceCode: string, date: string, total: number) => {
    if (date > end) return;
    const account = accounts.get(key) || { key, code, doi_tuong: name, loai: type, tong_phat_sinh: 0, da_thanh_toan: 0, con_no: 0, opening: 0, periodIncurred: 0, periodPaid: 0, movements: [] };
    account.movements.push({ date, code: invoiceCode, invoiceCode, description: type === 'Khách hàng' ? 'Bán hàng' : 'Nhập hàng', incurred: total, paid: 0, balance: 0 });
    accounts.set(key, account);
    for (const ref of refs.filter(Boolean)) invoiceAccounts.set(`${type}:${ref.toLowerCase()}`, { key, code: invoiceCode });
  };
  for (const order of orders) {
    const key = String(order.khach_hang_id || order.ten_khach_hang || order.id);
    appendInvoice(key, order.ma_khach_hang || order.khach_hang_id || 'Vãng lai', order.ten_khach_hang || 'Khách vãng lai', 'Khách hàng', [order.id, order.id_bh || ''], order.id_bh || order.id, order.ngay, Number(order.tong_tien || 0));
  }
  for (const p of purchases) {
    const name = p.nha_cung_cap?.trim() || 'Nhà cung cấp chưa xác định';
    const supplierCode = p.ma_nha_cung_cap?.trim();
    appendInvoice(`supplier:${supplierCode ? `code:${supplierCode}` : normalizeBusinessText(name)}`, supplierCode || 'Chưa có mã NCC', name, 'Nhà cung cấp', [p.id, p.ma_phieu], p.ma_phieu, p.ngay || '', Number(p.tong_tien || 0));
  }
  for (const t of invoicePaymentLines(transactions)) {
    if (!isCompletedTransaction(t.trang_thai) || (t.ngay || '') > end) continue;
    const type = isIncomeTransaction(t.loai_phieu) ? 'Khách hàng' : 'Nhà cung cấp';
    const invoice = invoiceAccounts.get(`${type}:${String(t.source_id || t.id_don || '').toLowerCase()}`);
    if (!invoice) continue;
    accounts.get(invoice.key)!.movements.push({ date: t.ngay || '', code: `${type === 'Khách hàng' ? 'PT' : 'PC'}-${String(t.id || '').slice(0, 8).toUpperCase()}`, invoiceCode: invoice.code, description: 'Thanh toán', incurred: 0, paid: Number(t.so_tien || 0), balance: 0, voucherId: t.id || undefined });
  }
  for (const account of accounts.values()) {
    account.movements.sort((a,b) => a.date.localeCompare(b.date) || (a.paid > 0 ? 1 : 0) - (b.paid > 0 ? 1 : 0) || a.code.localeCompare(b.code));
    let balance = 0;
    for (const movement of account.movements) {
      balance += movement.incurred - movement.paid; movement.balance = balance;
      account.tong_phat_sinh += movement.incurred; account.da_thanh_toan += movement.paid;
      if (movement.date < start) account.opening = balance;
      else { account.periodIncurred += movement.incurred; account.periodPaid += movement.paid; }
    }
    account.con_no = balance;
    account.movements = account.movements.filter(m => m.date >= start);
  }
  return [...accounts.values()].sort((a,b) => b.con_no - a.con_no || a.doi_tuong.localeCompare(b.doi_tuong, 'vi'));
}
