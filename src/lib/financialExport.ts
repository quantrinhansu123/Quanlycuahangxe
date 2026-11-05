import type { ThuChi } from '../data/financialData';

export const FINANCIAL_EXPORT_HEADERS = [
  'Ngày', 'Giờ', 'Loại phiếu', 'Cơ sở', 'Số tiền', 'Danh mục', 'Trạng thái',
  'ID', 'ID Đơn', 'ID Khách hàng', 'Người chi', 'Người nhận', 'Ghi chú',
] as const;

export type FinancialExportRow = Record<(typeof FINANCIAL_EXPORT_HEADERS)[number], string | number>;

export function mapTransactionsForExcel(transactions: readonly ThuChi[]): FinancialExportRow[] {
  return transactions.map(transaction => ({
    'Ngày': transaction.ngay || '',
    'Giờ': transaction.gio || '',
    'Loại phiếu': transaction.loai_phieu || '',
    'Cơ sở': transaction.co_so || '',
    'Số tiền': Number(transaction.so_tien) || 0,
    'Danh mục': transaction.danh_muc || '',
    'Trạng thái': transaction.trang_thai || '',
    'ID': transaction.id || '',
    'ID Đơn': transaction.id_don || '',
    'ID Khách hàng': transaction.id_khach_hang || '',
    'Người chi': transaction.nguoi_chi || '',
    'Người nhận': transaction.nguoi_nhan || '',
    'Ghi chú': transaction.ghi_chu || '',
  }));
}

export async function loadAllExportPages<T>(
  loadPage: (page: number, pageSize: number) => Promise<{ data: T[]; totalCount: number }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let totalCount = 0;
  let page = 1;
  do {
    const result = await loadPage(page, pageSize);
    totalCount = result.totalCount;
    rows.push(...result.data);
    if (result.data.length === 0) break;
    page += 1;
  } while (rows.length < totalCount);
  return rows;
}
