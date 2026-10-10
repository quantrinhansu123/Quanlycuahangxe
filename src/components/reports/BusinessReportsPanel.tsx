import { AlertCircle, Banknote, Boxes, Download, Landmark, Loader2, ReceiptText, Scale } from 'lucide-react';
import React, { useEffect, useState, type ReactNode } from 'react';
import { getBusinessReportData, type BusinessReportData, type BusinessTransactionRow } from '../../data/businessReportData';
import { normalizeBusinessText, normalizeCashFlowMethod, isIncomeTransaction } from '../../lib/businessReportMetrics';
import { useAuth } from '../../context/AuthContext';
import ReportDetailsModal, { type ReportDetail } from './ReportDetailsModal';
import ProductCostModal from './ProductCostModal';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0);
const number = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value || 0);
const dateVi = (value: string) => value.split('-').reverse().join('/');
const percent = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value || 0);
const voucherCode = (row: BusinessTransactionRow) => `${isIncomeTransaction(row.loai_phieu) ? 'PT' : 'PC'}-${row.id.slice(0, 8).toUpperCase()}`;

function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="text-muted-foreground">Kỳ trước chưa có dữ liệu</span>;
  const delta = (current - previous) / Math.abs(previous);
  return <span>{delta >= 0 ? '+' : ''}{percent(delta)} so với kỳ trước</span>;
}

function Kpi({ label, value, note, icon: Icon }: { label: string; value: string; note: ReactNode; icon: React.ElementType }) {
  return <div className="min-w-0 rounded-xl border border-border bg-background p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-muted-foreground">{label}</span><Icon size={16} className="shrink-0 text-primary" /></div><div className="mt-2 text-lg font-semibold tabular-nums">{value}</div><div className="mt-1 text-xs text-muted-foreground">{note}</div></div>;
}

function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="space-y-1"><p className="text-xs text-muted-foreground sm:hidden">Vuốt ngang để xem đầy đủ các cột.</p><div className="min-w-0 overflow-x-auto rounded-xl border border-border"><table className="w-full text-xs"><thead className="bg-muted/50"><tr>{headers.map((label, index) => <th key={index} className={`whitespace-nowrap px-4 py-3 text-left font-medium ${index === 0 ? 'sticky left-0 z-10 bg-muted' : ''}`}>{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column} className={`whitespace-nowrap px-4 py-3 tabular-nums ${column === 0 ? 'sticky left-0 bg-card' : ''}`}>{value}</td>)}</tr>) : <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-muted-foreground">Không có dữ liệu trong kỳ.</td></tr>}</tbody></table></div></div>;
}

export default function BusinessReportsPanel({ startDate, endDate, branch = '', sharedResult }: { startDate: string; endDate: string; branch?: string; sharedResult?: { key: string; data: BusinessReportData | null; error: string; retry: () => void } }) {
  const { isAdmin } = useAuth();
  const requestKey = `${startDate}:${endDate}:${branch}`;
  const [result, setResult] = useState<{ key: string; data: BusinessReportData | null; error: string }>({ key: '', data: null, error: '' });
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [costProduct, setCostProduct] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  useEffect(() => {
    if (sharedResult) return;
    const controller = new AbortController();
    getBusinessReportData(startDate, endDate, undefined, controller.signal, branch)
      .then(data => { if (!controller.signal.aborted) setResult({ key: requestKey, data, error: '' }); })
      .catch(reason => { if (!controller.signal.aborted) setResult({ key: requestKey, data: null, error: reason instanceof Error ? reason.message : String(reason) }); });
    return () => controller.abort();
  }, [startDate, endDate, branch, requestKey, sharedResult, retry]);
  useEffect(() => { setDetail(null); setCostProduct(null); }, [requestKey]);
  const refresh = () => { if (sharedResult) sharedResult.retry(); else { setResult({ key: '', data: null, error: '' }); setRetry(value => value + 1); } };
  const shown = sharedResult ?? result;
  if (shown.key !== requestKey) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 size={17} className="animate-spin" /> Đang tổng hợp báo cáo tài chính...</div>;
  if (shown.error || !shown.data) return <div role="alert" className="flex items-start gap-2 rounded-xl border border-border p-4 text-sm"><AlertCircle size={18} /><div><strong>Không tải được báo cáo.</strong><p>{shown.error}</p><button type="button" onClick={refresh} className="mt-2 underline">Thử lại</button></div></div>;
  const data = shown.data;
  const sourceCode = (row: BusinessTransactionRow) => data.purchases.find(p => p.id === row.source_id || p.id === row.id_don || p.ma_phieu === row.id_don)?.ma_phieu || data.orders.find(order => order.id === row.id_don || order.id_bh === row.id_don)?.id_bh || row.id_don || '—';
  const openVoucher = (row: BusinessTransactionRow) => setDetail({ title: `Chứng từ ${voucherCode(row)}`, headers: ['Thông tin', 'Giá trị'], rows: [['Ngày', dateVi(row.ngay)], ['Cơ sở', row.co_so || '—'], ['Loại phiếu', row.loai_phieu], ['Chứng từ đối trừ', sourceCode(row)], ['Người nhận', row.nguoi_nhan || '—'], ['Quỹ', row.phuong_thuc || 'Chưa phân loại'], ['Số tiền', money(Number(row.so_tien))], ['Trạng thái', row.trang_thai], ['Danh mục', row.danh_muc || '—'], ['Ghi chú', row.ghi_chu || '—']] });
  const voucherRows = (rows: BusinessTransactionRow[]) => rows.map(row => [<button type="button" className="min-h-8 min-w-8 text-foreground underline underline-offset-2 hover:bg-muted focus-visible:bg-muted outline-none" onClick={() => openVoucher(row)}>{voucherCode(row)}</button>, dateVi(row.ngay), row.co_so || '—', sourceCode(row), row.danh_muc || '—', row.trang_thai, money(Number(row.so_tien))]);
  const cashHeaders = ['Mã PT/PC', 'Ngày', 'Cơ sở', 'Đơn đối trừ', 'Danh mục', 'Trạng thái', 'Số tiền'];
  const exportReport = async () => {
    setExporting(true); setExportError('');
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const add = (name: string, headers: string[], rows: (string | number)[][]) => { const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]); sheet['!cols'] = headers.map(() => ({ wch: 24 })); XLSX.utils.book_append_sheet(workbook, sheet, name); };
      add('Tổng hợp', ['Kỳ', 'Cơ sở', 'Doanh thu', 'Số xe', 'Đã thu', 'Giá vốn', 'LN gộp', 'Biên gộp', 'Chi phí', 'LN trước thuế', 'Biên trước thuế'], [[`${startDate} - ${endDate}`, branch || 'Toàn hệ thống', data.summary.total_revenue, data.summary.total_vehicles, data.summary.total_collected, data.summary.total_cost, data.summary.total_profit, percent(data.summary.gross_margin), data.totalExpenses, data.profitBeforeTax, percent(data.preTaxMargin)]]);
      add('Công nợ', ['Đối tượng', 'Loại', 'Phát sinh', 'Đã thanh toán', 'Còn nợ'], data.debts.map(row => [row.doi_tuong, row.loai, row.tong_phat_sinh, row.da_thanh_toan, row.con_no]));
      add('Giá vốn', ['Mã sản phẩm', 'Tên sản phẩm', 'SL', 'Doanh thu', 'Giá vốn', 'LN gộp', 'Biên gộp'], data.productCosts.map(row => [row.ma_san_pham, row.san_pham, row.so_luong, row.doanh_thu, row.gia_von, row.loi_nhuan_gop, percent(row.bien_loi_nhuan)]));
      add('Chi phí', ['Nhóm', 'Số tiền', 'Tỷ trọng'], data.expenses.map(row => [row.danh_muc, row.so_tien, percent(row.ty_trong)]));
      add('Dòng tiền', ['Quỹ', 'Đã thu', 'Đã chi', 'Thuần', 'Chờ thu', 'Chờ chi'], data.cashFlow.map(row => [row.phuong_thuc, row.thu, row.chi, row.dong_tien_thuan, row.cho_thu, row.cho_chi]));
      add('Sổ thu chi', cashHeaders, data.transactions.map(row => [voucherCode(row), row.ngay, row.co_so || '', sourceCode(row), row.danh_muc || '', row.trang_thai, Number(row.so_tien)]));
      add('Nhập xuất tồn', ['Mã', 'Sản phẩm', 'Đầu kỳ SL', 'Đầu kỳ GT', 'Nhập SL', 'Nhập GT', 'Xuất SL', 'Xuất GT', 'Cuối kỳ SL', 'Cuối kỳ GT'], data.inventory.map(row => [row.ma_hang, row.ten_hang, row.dau_ky_so_luong, row.dau_ky_gia_tri, row.nhap_so_luong, row.nhap_gia_tri, row.xuat_so_luong, row.xuat_gia_tri, row.cuoi_ky_so_luong, row.cuoi_ky_gia_tri]));
      add('Chi tiết kho', ['Mã phiếu', 'Ngày', 'Cơ sở', 'Sản phẩm', 'Loại', 'SL', 'Đơn giá', 'Giá trị', 'Đơn liên quan'], data.inventoryMovements.map(row => [row.id_xuat_nhap_kho || row.id, row.ngay, row.co_so || '', row.ten_mat_hang, row.loai_phieu, Number(row.so_luong), Number(row.gia), Number(row.tong_tien), row.id_don_hang || '']));
      XLSX.writeFile(workbook, `Bao-cao-kinh-doanh-${startDate}-${endDate}.xlsx`);
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : 'Không xuất được báo cáo.'); }
    finally { setExporting(false); }
  };
  return <div className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Tổng hợp tài chính · {branch || 'Toàn hệ thống'}</h2><p className="mt-1 text-xs text-muted-foreground">Kỳ so sánh: {dateVi(data.previousStart)} – {dateVi(data.previousEnd)}. Tháng/năm đầy đủ so sánh với tháng/năm liền trước.</p></div><button type="button" disabled={exporting} onClick={() => void exportReport()} className="flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm hover:bg-muted disabled:opacity-50"><Download size={16} />{exporting ? 'Đang xuất...' : 'Xuất Excel'}</button></div>
    {exportError && <p role="alert" className="text-sm text-rose-700">{exportError}</p>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Kpi label="Doanh thu" value={money(data.summary.total_revenue)} note={<Delta current={data.summary.total_revenue} previous={data.previousSummary.total_revenue} />} icon={Banknote} />
      <Kpi label="Số xe đã phục vụ" value={number(data.summary.total_vehicles)} note={<Delta current={data.summary.total_vehicles} previous={data.previousSummary.total_vehicles} />} icon={Boxes} />
      <Kpi label="Đã thu từ đơn" value={money(data.summary.total_collected)} note={<Delta current={data.summary.total_collected} previous={data.previousSummary.total_collected} />} icon={ReceiptText} />
      <Kpi label="Giá vốn" value={money(data.summary.total_cost)} note={`${data.missingCostLines} dòng có giá vốn bằng 0 hoặc chưa nhập`} icon={ReceiptText} />
      <Kpi label="Lợi nhuận gộp" value={money(data.summary.total_profit)} note={`Biên lợi nhuận gộp ${percent(data.summary.gross_margin)}`} icon={Scale} />
      <Kpi label="Lợi nhuận trước thuế" value={money(data.profitBeforeTax)} note={`Biên trước thuế ${percent(data.preTaxMargin)}`} icon={Landmark} />
    </div>
    <section className="min-w-0 space-y-2"><h3 className="font-semibold">Giá vốn và lợi nhuận gộp theo mã sản phẩm</h3><p className="text-xs text-muted-foreground">Bấm tên sản phẩm để xem giá vốn từng đơn{isAdmin ? ' và cập nhật.' : '.'}</p>
      <Table headers={['Mã sản phẩm', 'Sản phẩm / dịch vụ', 'Số lượng', 'Doanh thu', 'Giá vốn', 'LN gộp', 'Biên gộp']} rows={data.productCosts.map(row => [row.ma_san_pham, <button type="button" className="min-h-8 min-w-8 text-foreground underline underline-offset-2 hover:bg-muted focus-visible:bg-muted outline-none" onClick={() => setCostProduct(row.san_pham)}>{row.san_pham}</button>, number(row.so_luong), money(row.doanh_thu), money(row.gia_von), money(row.loi_nhuan_gop), percent(row.bien_loi_nhuan)])} />
    </section>
    <section className="min-w-0 space-y-2"><h3 className="font-semibold">Công nợ phải thu / phải trả</h3><p className="text-xs text-muted-foreground">Công nợ còn lại đến {dateVi(endDate)}, gồm chứng từ phát sinh trước kỳ. Tổng còn nợ: {money(data.debts.reduce((sum, row) => sum + row.con_no, 0))}.</p>
      <Table headers={['Đối tượng', 'Loại', 'Phát sinh', 'Đã thanh toán', 'Còn nợ']} rows={data.debts.map(row => [row.doi_tuong, row.loai, money(row.tong_phat_sinh), money(row.da_thanh_toan), money(row.con_no)])} />
    </section>
    <section className="min-w-0 space-y-2"><div className="flex items-center justify-between"><h3 className="font-semibold">Chi phí theo nhóm</h3><span className="text-xs">{money(data.totalExpenses)}</span></div><p className="text-xs text-muted-foreground">Ghi nhận tại Thu chi theo nhóm thuê nhà, lương, điện nước, chi phí khác. Tiền mua hàng được tính trong giá vốn.</p>
      <Table headers={['Danh mục', 'Số tiền', 'Tỷ trọng']} rows={data.expenses.map(row => [row.danh_muc, money(row.so_tien), percent(row.ty_trong)])} />
    </section>
    <section className="min-w-0 space-y-2"><h3 className="font-semibold">Dòng tiền tiền mặt / ngân hàng</h3><p className="text-xs text-muted-foreground">Khoản chờ thu/chi chưa làm thay đổi dòng tiền thực tế. Bấm quỹ để xem chứng từ.</p>
      <Table headers={['Quỹ', 'Đã thu', 'Đã chi', 'Thuần', 'Chờ thu', 'Chờ chi']} rows={data.cashFlow.map(row => [<button type="button" className="min-h-8 min-w-8 text-foreground underline underline-offset-2 hover:bg-muted focus-visible:bg-muted outline-none" onClick={() => setDetail({ title: `Sổ quỹ ${row.phuong_thuc}`, headers: cashHeaders, rows: voucherRows(data.transactions.filter(t => normalizeCashFlowMethod(t.phuong_thuc) === row.phuong_thuc)) })}>{row.phuong_thuc}</button>, money(row.thu), money(row.chi), money(row.dong_tien_thuan), money(row.cho_thu), money(row.cho_chi)])} />
      <Table headers={cashHeaders} rows={voucherRows(data.transactions)} />
    </section>
    <section className="min-w-0 space-y-2"><h3 className="font-semibold">Nhập – xuất – tồn theo mã sản phẩm</h3><p className="text-xs text-muted-foreground">Bấm tên sản phẩm để xem các phiếu nhập/xuất trong kỳ.{branch && ' Tồn đầu hệ thống chưa phân bổ cơ sở được giữ trong báo cáo toàn hệ thống.'}</p>
      <Table headers={['Mã', 'Sản phẩm', 'Đầu kỳ SL', 'Đầu kỳ GT', 'Nhập SL', 'Nhập GT', 'Xuất SL', 'Xuất GT', 'Cuối kỳ SL', 'Cuối kỳ GT']} rows={data.inventory.map(row => [row.ma_hang || '—', <button type="button" className="min-h-8 min-w-8 text-foreground underline underline-offset-2 hover:bg-muted focus-visible:bg-muted outline-none" onClick={() => setDetail({ title: `Chi tiết kho: ${row.ma_hang || ''} ${row.ten_hang}`, headers: ['Mã phiếu', 'Ngày', 'Cơ sở', 'Loại', 'Số lượng', 'Đơn giá', 'Giá trị', 'Đơn liên quan'], rows: data.inventoryMovements.filter(m => normalizeBusinessText(m.ten_mat_hang) === normalizeBusinessText(row.ten_hang)).map(m => [m.id_xuat_nhap_kho || m.id, dateVi(m.ngay), m.co_so, m.loai_phieu, number(Number(m.so_luong)), money(Number(m.gia)), money(Number(m.tong_tien)), m.id_don_hang || '—']) })}>{row.ten_hang}</button>, number(row.dau_ky_so_luong), money(row.dau_ky_gia_tri), number(row.nhap_so_luong), money(row.nhap_gia_tri), number(row.xuat_so_luong), money(row.xuat_gia_tri), number(row.cuoi_ky_so_luong), money(row.cuoi_ky_gia_tri)])} />
    </section>
    {detail && <ReportDetailsModal detail={detail} onClose={() => setDetail(null)} />}
    {costProduct && <ProductCostModal name={costProduct} lines={data.costLines.filter(row => normalizeBusinessText(row.san_pham) === normalizeBusinessText(costProduct))} editable={isAdmin} onClose={() => setCostProduct(null)} onSaved={refresh} />}
  </div>;
}
