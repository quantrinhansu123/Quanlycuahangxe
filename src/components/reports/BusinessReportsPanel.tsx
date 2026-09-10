import { AlertCircle, Banknote, Boxes, Landmark, Loader2, ReceiptText, Scale } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { getBusinessReportData, type BusinessReportData } from '../../data/businessReportData';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0);
const number = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value || 0);
const dateVi = (value: string) => value.split('-').reverse().join('/');

function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="text-muted-foreground">Kỳ trước chưa có dữ liệu</span>;
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  return <span className={percent >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{percent >= 0 ? '+' : ''}{percent.toFixed(1)}% so với kỳ trước</span>;
}

function Kpi({ label, value, note, icon: Icon }: { label: string; value: string; note: React.ReactNode; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon size={16} className="text-primary" />
      </div>
      <div className="mt-2 text-lg font-black text-foreground">{value}</div>
      <div className="mt-1 text-[11px]">{note}</div>
    </div>
  );
}

const EmptyRow = ({ cols }: { cols: number }) => <tr><td colSpan={cols} className="px-4 py-8 text-center italic text-muted-foreground">Không có dữ liệu trong kỳ.</td></tr>;

export default function BusinessReportsPanel({ startDate, endDate }: { startDate: string; endDate: string }) {
  const requestKey = `${startDate}:${endDate}`;
  const [result, setResult] = useState<{ key: string; data: BusinessReportData | null; error: string }>({ key: '', data: null, error: '' });

  useEffect(() => {
    let active = true;
    getBusinessReportData(startDate, endDate)
      .then((data) => { if (active) setResult({ key: requestKey, data, error: '' }); })
      .catch((reason) => { if (active) setResult({ key: requestKey, data: null, error: reason instanceof Error ? reason.message : String(reason) }); });
    return () => { active = false; };
  }, [startDate, endDate, requestKey]);

  if (result.key !== requestKey) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 size={17} className="animate-spin" /> Đang tổng hợp báo cáo tài chính...</div>;
  if (result.error || !result.data) return <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div><strong>Không tải được báo cáo.</strong><div className="mt-1 text-xs">{result.error}</div></div></div>;
  const data = result.data;

  const inventoryTotals = data.inventory.reduce((sum, row) => ({
    opening: sum.opening + row.dau_ky_gia_tri,
    input: sum.input + row.nhap_gia_tri,
    output: sum.output + row.xuat_gia_tri,
    closing: sum.closing + row.cuoi_ky_gia_tri,
  }), { opening: 0, input: 0, output: 0, closing: 0 });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[15px] font-black text-foreground">Tổng hợp tài chính</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">Kỳ so sánh: {dateVi(data.previousStart)} – {dateVi(data.previousEnd)}. Chọn một ngày, tháng hoặc năm sẽ so sánh với kỳ liền trước có cùng độ dài.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Doanh thu" value={money(data.summary.total_revenue)} note={<Delta current={data.summary.total_revenue} previous={data.previousSummary.total_revenue} />} icon={Banknote} />
        <Kpi label="Số xe đã phục vụ" value={number(data.summary.total_vehicles)} note={<Delta current={data.summary.total_vehicles} previous={data.previousSummary.total_vehicles} />} icon={Boxes} />
        <Kpi label="Đã thu từ đơn" value={money(data.summary.total_collected)} note={<Delta current={data.summary.total_collected} previous={data.previousSummary.total_collected} />} icon={ReceiptText} />
        <Kpi label="Giá vốn" value={money(data.summary.total_cost)} note={`${(data.summary.total_revenue ? data.summary.total_cost / data.summary.total_revenue * 100 : 0).toFixed(1)}% doanh thu`} icon={ReceiptText} />
        <Kpi label="Lợi nhuận gộp" value={money(data.summary.total_profit)} note={`Biên lợi nhuận gộp ${(data.summary.gross_margin * 100).toFixed(1)}%`} icon={Scale} />
        <Kpi label="Lợi nhuận trước thuế" value={money(data.profitBeforeTax)} note={`Biên trước thuế ${(data.preTaxMargin * 100).toFixed(1)}%`} icon={Landmark} />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3"><h3 className="font-black text-foreground">Giá vốn và lợi nhuận gộp theo mã sản phẩm</h3><span className="text-xs text-muted-foreground">Tổng giá vốn: {money(data.summary.total_cost)}</span></div>
        <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 text-left">Mã sản phẩm</th><th className="px-4 py-3 text-left">Sản phẩm / dịch vụ</th><th className="px-4 py-3 text-right">Số lượng</th><th className="px-4 py-3 text-right">Doanh thu</th><th className="px-4 py-3 text-right">Giá vốn</th><th className="px-4 py-3 text-right">LN gộp</th><th className="px-4 py-3 text-right">Biên gộp</th></tr></thead><tbody className="divide-y divide-border">{data.productCosts.length === 0 ? <EmptyRow cols={7} /> : data.productCosts.map((row) => <tr key={row.key}><td className="px-4 py-3 font-semibold text-foreground">{row.ma_san_pham}</td><td className="px-4 py-3">{row.san_pham}</td><td className="px-4 py-3 text-right">{number(row.so_luong)}</td><td className="px-4 py-3 text-right">{money(row.doanh_thu)}</td><td className="px-4 py-3 text-right text-rose-600">{money(row.gia_von)}</td><td className="px-4 py-3 text-right font-bold text-emerald-600">{money(row.loi_nhuan_gop)}</td><td className="px-4 py-3 text-right">{(row.bien_loi_nhuan * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-foreground">Công nợ phải thu / phải trả</h3><p className="mt-0.5 text-[11px] text-muted-foreground">Khách hàng theo đơn chưa thu đủ; nhà cung cấp theo phiếu chi chưa hoàn thành.</p></div><span className="text-xs text-muted-foreground">Tổng còn nợ: {money(data.debts.reduce((sum, row) => sum + row.con_no, 0))}</span></div>
        <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 text-left">Đối tượng</th><th className="px-4 py-3 text-left">Loại</th><th className="px-4 py-3 text-right">Phát sinh</th><th className="px-4 py-3 text-right">Đã thanh toán</th><th className="px-4 py-3 text-right">Còn nợ</th></tr></thead><tbody className="divide-y divide-border">{data.debts.length === 0 ? <EmptyRow cols={5} /> : data.debts.map((row) => <tr key={row.key}><td className="px-4 py-3 font-semibold text-foreground">{row.doi_tuong}</td><td className="px-4 py-3">{row.loai}</td><td className="px-4 py-3 text-right">{money(row.tong_phat_sinh)}</td><td className="px-4 py-3 text-right text-emerald-600">{money(row.da_thanh_toan)}</td><td className="px-4 py-3 text-right font-bold text-rose-600">{money(row.con_no)}</td></tr>)}</tbody></table></div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="space-y-2">
          <div className="flex items-center justify-between"><h3 className="font-black text-foreground">Chi phí theo nhóm</h3><span className="text-xs font-bold text-rose-600">{money(data.totalExpenses)}</span></div>
          <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 text-left">Danh mục</th><th className="px-4 py-3 text-right">Số tiền</th><th className="px-4 py-3 text-right">Tỷ trọng</th></tr></thead><tbody className="divide-y divide-border">{data.expenses.length === 0 ? <EmptyRow cols={3} /> : data.expenses.map((row) => <tr key={row.danh_muc}><td className="px-4 py-3 font-semibold text-foreground">{row.danh_muc}</td><td className="px-4 py-3 text-right">{money(row.so_tien)}</td><td className="px-4 py-3 text-right">{(row.ty_trong * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between"><h3 className="font-black text-foreground">Dòng tiền tiền mặt / ngân hàng</h3><span className="text-xs text-muted-foreground">Thu {money(data.totalCashIn)} · Chi {money(data.totalCashOut)}</span></div>
          <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 text-left">Tiền mặt / ngân hàng</th><th className="px-4 py-3 text-right">Thu</th><th className="px-4 py-3 text-right">Chi</th><th className="px-4 py-3 text-right">Thuần</th></tr></thead><tbody className="divide-y divide-border">{data.cashFlow.length === 0 ? <EmptyRow cols={4} /> : data.cashFlow.map((row) => <tr key={row.phuong_thuc}><td className="px-4 py-3 font-semibold text-foreground">{row.phuong_thuc}</td><td className="px-4 py-3 text-right text-emerald-600">{money(row.thu)}</td><td className="px-4 py-3 text-right text-rose-600">{money(row.chi)}</td><td className="px-4 py-3 text-right font-bold">{money(row.dong_tien_thuan)}</td></tr>)}</tbody></table></div>
        </section>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-black text-foreground"><Boxes size={16} /> Nhập – xuất – tồn theo mã sản phẩm</h3><span className="text-xs text-muted-foreground">Giá trị tồn cuối kỳ: {money(inventoryTotals.closing)}</span></div>
        <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 text-left">Mã</th><th className="px-4 py-3 text-left">Sản phẩm</th><th className="px-4 py-3 text-right">Đầu kỳ SL</th><th className="px-4 py-3 text-right">Đầu kỳ GT</th><th className="px-4 py-3 text-right">Nhập SL</th><th className="px-4 py-3 text-right">Nhập GT</th><th className="px-4 py-3 text-right">Xuất SL</th><th className="px-4 py-3 text-right">Xuất GT</th><th className="px-4 py-3 text-right">Cuối kỳ SL</th><th className="px-4 py-3 text-right">Cuối kỳ GT</th></tr></thead><tbody className="divide-y divide-border">{data.inventory.length === 0 ? <EmptyRow cols={10} /> : data.inventory.map((row) => <tr key={row.id}><td className="px-4 py-3">{row.ma_hang || '—'}</td><td className="px-4 py-3 font-semibold text-foreground">{row.ten_hang}</td><td className="px-4 py-3 text-right">{number(row.dau_ky_so_luong)}</td><td className="px-4 py-3 text-right">{money(row.dau_ky_gia_tri)}</td><td className="px-4 py-3 text-right text-emerald-600">{number(row.nhap_so_luong)}</td><td className="px-4 py-3 text-right text-emerald-600">{money(row.nhap_gia_tri)}</td><td className="px-4 py-3 text-right text-rose-600">{number(row.xuat_so_luong)}</td><td className="px-4 py-3 text-right text-rose-600">{money(row.xuat_gia_tri)}</td><td className="px-4 py-3 text-right font-bold">{number(row.cuoi_ky_so_luong)}</td><td className="px-4 py-3 text-right font-bold">{money(row.cuoi_ky_gia_tri)}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
