import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getInventoryStockSummary,
  syncProductOpeningStockByDate,
  type InventoryStockSummaryRow,
} from '../data/inventoryData';

const formatNumber = (n: number): string => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
const todayStr = (): string => new Date().toISOString().slice(0, 10);
const monthStartStr = (): string => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const WarehouseStockListPage: React.FC = () => {
  const navigate = useNavigate();
  const [fromDate, setFromDate] = useState<string>(monthStartStr());
  const [toDate, setToDate] = useState<string>(todayStr());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<InventoryStockSummaryRow[]>([]);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await getInventoryStockSummary(fromDate, toDate);
      setRows(data);
    } catch (error) {
      console.error(error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  const handleSync = async () => {
    try {
      setLoading(true);
      await syncProductOpeningStockByDate(fromDate);
      await loadData();
      alert('Đã đồng bộ tồn đầu kỳ theo công thức nhập - xuất.');
    } catch (error) {
      console.error(error);
      alert('Đồng bộ thất bại. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.ten_hang.toLowerCase().includes(q) ||
        r.ma_hang.toLowerCase().includes(q) ||
        r.dvt.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        dau_ky_so_luong: acc.dau_ky_so_luong + r.dau_ky_so_luong,
        dau_ky_gia_tri: acc.dau_ky_gia_tri + r.dau_ky_gia_tri,
        nhap_so_luong: acc.nhap_so_luong + r.nhap_so_luong,
        nhap_gia_tri: acc.nhap_gia_tri + r.nhap_gia_tri,
        xuat_so_luong: acc.xuat_so_luong + r.xuat_so_luong,
        xuat_gia_tri: acc.xuat_gia_tri + r.xuat_gia_tri,
        cuoi_ky_so_luong: acc.cuoi_ky_so_luong + r.cuoi_ky_so_luong,
        cuoi_ky_gia_tri: acc.cuoi_ky_gia_tri + r.cuoi_ky_gia_tri,
      }),
      {
        dau_ky_so_luong: 0,
        dau_ky_gia_tri: 0,
        nhap_so_luong: 0,
        nhap_gia_tri: 0,
        xuat_so_luong: 0,
        xuat_gia_tri: 0,
        cuoi_ky_so_luong: 0,
        cuoi_ky_gia_tri: 0,
      }
    );
  }, [filtered]);

  return (
    <div className="w-full flex-1 text-muted-foreground space-y-4">
      <div className="bg-card p-3 rounded-lg border border-border shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors"
          >
            <ArrowLeft size={18} /> Quay lại
          </button>
          <div className="text-[30px] leading-none font-bold text-foreground font-['Times_New_Roman'] tracking-wide">TỔNG HỢP TỒN KHO</div>
        </div>
        <div className="text-[16px] italic text-muted-foreground font-['Times_New_Roman']">
          Từ ngày <span className="font-bold text-foreground">{fromDate}</span> đến ngày{' '}
          <span className="font-bold text-foreground">{toDate}</span>
        </div>
      </div>

      <div className="bg-card p-3 rounded-lg border border-border shadow-sm flex flex-wrap items-end gap-3">
        <label className="text-[12px] font-semibold">
          Từ ngày
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="ml-2 px-3 py-1.5 border border-border rounded text-[13px] bg-background"
          />
        </label>
        <label className="text-[12px] font-semibold">
          Đến ngày
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="ml-2 px-3 py-1.5 border border-border rounded text-[13px] bg-background"
          />
        </label>
        <button
          onClick={loadData}
          className="px-4 py-1.5 rounded bg-primary text-white text-[13px] font-semibold hover:bg-primary/90"
        >
          Lọc dữ liệu
        </button>
        <button
          onClick={handleSync}
          className="px-4 py-1.5 rounded border border-border bg-card text-[13px] font-semibold hover:bg-accent"
        >
          Đồng bộ nhập - xuất
        </button>
        <div className="relative ml-auto w-full sm:w-[280px]">
          <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-border rounded text-[13px] bg-background"
            placeholder="Tìm mã hàng, tên hàng..."
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border shadow-sm overflow-x-auto">
        <table className="w-full border-collapse text-[13px] font-['Times_New_Roman']">
          <thead>
            <tr className="bg-muted border-b border-border text-[13px] uppercase">
              <th rowSpan={2} className="px-3 py-2 border-r border-border">Mã hàng</th>
              <th rowSpan={2} className="px-3 py-2 border-r border-border">Tên hàng</th>
              <th rowSpan={2} className="px-3 py-2 border-r border-border">ĐVT</th>
              <th colSpan={2} className="px-3 py-2 border-r border-border">Đầu kỳ</th>
              <th colSpan={2} className="px-3 py-2 border-r border-border">Nhập kho</th>
              <th colSpan={2} className="px-3 py-2 border-r border-border">Xuất kho</th>
              <th colSpan={2} className="px-3 py-2">Cuối kỳ</th>
            </tr>
            <tr className="bg-muted border-b border-border text-[12px] uppercase">
              <th className="px-3 py-2 border-r border-border">Số lượng</th>
              <th className="px-3 py-2 border-r border-border">Giá trị</th>
              <th className="px-3 py-2 border-r border-border">Số lượng</th>
              <th className="px-3 py-2 border-r border-border">Giá trị</th>
              <th className="px-3 py-2 border-r border-border">Số lượng</th>
              <th className="px-3 py-2 border-r border-border">Giá trị</th>
              <th className="px-3 py-2 border-r border-border">Số lượng</th>
              <th className="px-3 py-2">Giá trị</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 size={18} className="animate-spin inline-block mr-2" />
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : (
              <>
                <tr className="bg-yellow-50/70 font-bold text-foreground">
                  <td colSpan={3} className="px-3 py-2 border-r border-border">
                    Tên kho: Hàng hóa ({filtered.length})
                  </td>
                  <td className="px-3 py-2 text-right border-r border-border">{formatNumber(totals.dau_ky_so_luong)}</td>
                  <td className="px-3 py-2 text-right border-r border-border">{formatNumber(totals.dau_ky_gia_tri)}</td>
                  <td className="px-3 py-2 text-right border-r border-border">{formatNumber(totals.nhap_so_luong)}</td>
                  <td className="px-3 py-2 text-right border-r border-border">{formatNumber(totals.nhap_gia_tri)}</td>
                  <td className="px-3 py-2 text-right border-r border-border">{formatNumber(totals.xuat_so_luong)}</td>
                  <td className="px-3 py-2 text-right border-r border-border">{formatNumber(totals.xuat_gia_tri)}</td>
                  <td className="px-3 py-2 text-right border-r border-border">{formatNumber(totals.cuoi_ky_so_luong)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(totals.cuoi_ky_gia_tri)}</td>
                </tr>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                      Không có dữ liệu.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2 border-r border-border">{r.ma_hang || '—'}</td>
                      <td className="px-3 py-2 border-r border-border font-medium text-foreground">{r.ten_hang}</td>
                      <td className="px-3 py-2 border-r border-border">{r.dvt}</td>
                      <td className="px-3 py-2 text-right border-r border-border">{formatNumber(r.dau_ky_so_luong)}</td>
                      <td className="px-3 py-2 text-right border-r border-border">{formatNumber(r.dau_ky_gia_tri)}</td>
                      <td className="px-3 py-2 text-right border-r border-border">{formatNumber(r.nhap_so_luong)}</td>
                      <td className="px-3 py-2 text-right border-r border-border">{formatNumber(r.nhap_gia_tri)}</td>
                      <td className="px-3 py-2 text-right border-r border-border">{formatNumber(r.xuat_so_luong)}</td>
                      <td className="px-3 py-2 text-right border-r border-border">{formatNumber(r.xuat_gia_tri)}</td>
                      <td className="px-3 py-2 text-right border-r border-border">{formatNumber(r.cuoi_ky_so_luong)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(r.cuoi_ky_gia_tri)}</td>
                    </tr>
                  ))
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WarehouseStockListPage;
