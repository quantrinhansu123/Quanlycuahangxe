import {
  BarChart2,
  TrendingUp,
  TrendingDown,
  Calendar,
  Building2,
  Users,
  ChevronLeft,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Search,
  X,
  ExternalLink,
  Filter,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getReportSummary,
  getRevenueByBranch,
  getRevenueByDay,
  getRevenueByPersonnel,
  getRevenueByService,
  type ReportSummary,
  type RevenueByBranch,
  type RevenueByDay,
  type RevenueByPersonnel,
  type RevenueByService,
} from '../data/reportData';

// ──────────── Formatters ────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

const fmtDate = (d: string) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const toDisplay = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const toISO = (display: string): string => {
  const parts = display.replace(/[^\d/]/g, '').split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return '';
  const iso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  return isNaN(new Date(iso).getTime()) ? '' : iso;
};

// ──────────── DateInput (dd/mm/yyyy) ────────────
function DateInput({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(toDisplay(value));

  useEffect(() => {
    setRaw(toDisplay(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/[^\d/]/g, '');
    if (v.length === 2 && !v.includes('/') && raw.length < v.length) v += '/';
    if (v.length === 5 && v.charAt(2) === '/' && !v.slice(3).includes('/') && raw.length < v.length) v += '/';
    setRaw(v);
    const iso = toISO(v);
    if (iso) onChange(iso);
    else if (v === '') onChange('');
  };

  return (
    <input
      value={raw}
      onChange={handleChange}
      maxLength={10}
      placeholder={placeholder}
      className="w-28 bg-background border border-border rounded-lg px-2.5 py-1 text-[12px] font-mono outline-none focus:ring-1 focus:ring-primary text-center"
    />
  );
}

// ──────────── Local Filter Bar ────────────
function LocalFilter({
  localStart,
  localEnd,
  onStartChange,
  onEndChange,
  filteredCount,
  totalCount,
}: {
  localStart: string;
  localEnd: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  filteredCount: number;
  totalCount: number;
}) {
  const isActive = !!(localStart || localEnd);
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border flex-wrap ${isActive ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-border'}`}>
      <div className="flex items-center gap-2">
        <Filter size={12} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
        <span className="text-[11px] font-bold text-muted-foreground">Lọc theo ngày:</span>
      </div>
      <div className="flex items-center gap-2">
        <DateInput value={localStart} onChange={onStartChange} placeholder="Từ dd/mm/yyyy" />
        <span className="text-muted-foreground text-[12px]">→</span>
        <DateInput value={localEnd} onChange={onEndChange} placeholder="Đến dd/mm/yyyy" />
      </div>
      {isActive && (
        <>
          <span className="text-[11px] text-muted-foreground">
            Hiển thị <strong>{filteredCount}</strong>/{totalCount} dòng
          </span>
          <button
            onClick={() => { onStartChange(''); onEndChange(''); }}
            className="flex items-center gap-1 text-[11px] font-bold text-rose-500 hover:text-rose-600 transition-colors"
          >
            <X size={10} />
            Xóa lọc
          </button>
        </>
      )}
    </div>
  );
}

// ──────────── Sort hook ────────────
type SortDir = 'asc' | 'desc';
function useSortableTable<T>(rows: T[], defaultKey: keyof T, defaultDir: SortDir = 'desc') {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const handleSort = (key: keyof T) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number')
        return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [rows, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, handleSort };
}

// ──────────── Shared UI ────────────
function SortTh<T>({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: keyof T; sortKey: keyof T; sortDir: SortDir; onSort: (k: keyof T) => void;
}) {
  const active = col === sortKey;
  return (
    <th
      className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors group"
      onClick={() => onSort(col)}
    >
      <div className="flex items-center justify-end gap-1">
        {label}
        {active
          ? sortDir === 'desc' ? <ChevronDown size={11} className="text-primary" /> : <ChevronUp size={11} className="text-primary" />
          : <ChevronsUpDown size={11} className="opacity-25 group-hover:opacity-60" />}
      </div>
    </th>
  );
}

function ProfitBadge({ revenue, profit }: { revenue: number; profit: number }) {
  const pct = revenue > 0 ? (profit / revenue) * 100 : 0;
  const cls = pct >= 30 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : pct >= 0 ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-rose-700 bg-rose-50 border-rose-200';
  return (
    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border ${cls} whitespace-nowrap`}>
      {pct.toFixed(0)}%
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <div className="text-xl font-black text-foreground leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ──────────── Daily Modal ────────────
interface ModalRow { date: string; revenue: number; profit: number; order_count?: number; quantity?: number; }
interface ModalConfig { title: string; subtitle?: string; rows: ModalRow[]; }

function DailyModal({ config, onClose }: { config: ModalConfig; onClose: () => void }) {
  const { sorted, sortKey, sortDir, handleSort } = useSortableTable<ModalRow>(config.rows, 'date', 'asc');
  const totalRev = config.rows.reduce((s, r) => s + r.revenue, 0);
  const totalPro = config.rows.reduce((s, r) => s + r.profit, 0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const hasQty = config.rows.some(r => r.quantity !== undefined);
  const hasOrders = config.rows.some(r => r.order_count !== undefined);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-border shrink-0">
          <div>
            <h3 className="font-black text-foreground text-[15px]">{config.title}</h3>
            {config.subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{config.subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><X size={15} /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/50 sticky top-0 border-b border-border">
              <tr>
                <th className="px-4 py-2.5 text-left font-bold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('date')}>
                  <div className="flex items-center gap-1">Ngày {sortKey === 'date' ? (sortDir === 'desc' ? <ChevronDown size={11} className="text-primary" /> : <ChevronUp size={11} className="text-primary" />) : <ChevronsUpDown size={11} className="opacity-25" />}</div>
                </th>
                {hasOrders && <SortTh<ModalRow> label="Số đơn" col="order_count" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                {hasQty && <SortTh<ModalRow> label="Số lượng" col="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                <SortTh<ModalRow> label="Doanh thu" col="revenue" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh<ModalRow> label="Lợi nhuận" col="profit" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-2.5 text-right text-[11px] font-bold text-muted-foreground">Biên LN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{fmtDate(row.date)}</td>
                  {hasOrders && <td className="px-4 py-2.5 text-right text-muted-foreground">{row.order_count ?? '-'}</td>}
                  {hasQty && <td className="px-4 py-2.5 text-right text-muted-foreground">{row.quantity ?? '-'}</td>}
                  <td className="px-4 py-2.5 text-right font-bold">{fmt(row.revenue)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{fmt(row.profit)}</td>
                  <td className="px-4 py-2.5 text-right"><ProfitBadge revenue={row.revenue} profit={row.profit} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-primary/5 border-t-2 border-primary/20 sticky bottom-0">
              <tr>
                <td className="px-4 py-2.5 font-black" colSpan={1 + (hasOrders ? 1 : 0) + (hasQty ? 1 : 0)}>Tổng ({config.rows.length} ngày)</td>
                <td className="px-4 py-2.5 text-right font-black">{fmt(totalRev)}</td>
                <td className="px-4 py-2.5 text-right font-black text-emerald-600">{fmt(totalPro)}</td>
                <td className="px-4 py-2.5 text-right"><ProfitBadge revenue={totalRev} profit={totalPro} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// Service-day breakdown modal (shows services per day)
function ServiceBreakdownModal({ date, breakdown, onClose }: {
  date: string;
  breakdown: Array<{ san_pham: string; revenue: number; profit: number; quantity: number }>;
  onClose: () => void;
}) {
  const totalRev = breakdown.reduce((s, r) => s + r.revenue, 0);
  const totalPro = breakdown.reduce((s, r) => s + r.profit, 0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: '75vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-border shrink-0">
          <div>
            <h3 className="font-black text-foreground">Chi tiết ngày {fmtDate(date)}</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">Phân tích theo sản phẩm / dịch vụ</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><X size={15} /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/50 sticky top-0 border-b border-border">
              <tr>
                <th className="px-4 py-2.5 text-left font-bold text-muted-foreground">Dịch vụ / Sản phẩm</th>
                <th className="px-4 py-2.5 text-right font-bold text-muted-foreground">SL</th>
                <th className="px-4 py-2.5 text-right font-bold text-muted-foreground">Doanh thu</th>
                <th className="px-4 py-2.5 text-right font-bold text-muted-foreground">Lợi nhuận</th>
                <th className="px-4 py-2.5 text-right font-bold text-muted-foreground">Biên</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {breakdown.map((r, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">{r.san_pham}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{r.quantity}</td>
                  <td className="px-4 py-2.5 text-right font-bold">{fmt(r.revenue)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{fmt(r.profit)}</td>
                  <td className="px-4 py-2.5 text-right"><ProfitBadge revenue={r.revenue} profit={r.profit} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-primary/5 border-t-2 border-primary/20 sticky bottom-0">
              <tr>
                <td className="px-4 py-2.5 font-black" colSpan={2}>Tổng</td>
                <td className="px-4 py-2.5 text-right font-black">{fmt(totalRev)}</td>
                <td className="px-4 py-2.5 text-right font-black text-emerald-600">{fmt(totalPro)}</td>
                <td className="px-4 py-2.5 text-right"><ProfitBadge revenue={totalRev} profit={totalPro} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ──────────── Helper: filter daily_breakdown by local date range ────────────
function inRange(date: string, start: string, end: string) {
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

// Re-aggregate items with daily_breakdown by a local date range
function reAggregate<T extends {
  daily_breakdown: Array<{ date: string; revenue: number; profit: number; order_count?: number; quantity?: number }>;
  total_revenue: number;
  total_profit: number;
  order_count: number;
}>(items: T[], localStart: string, localEnd: string): (T & { _rev: number; _pro: number; _orders: number; _active: boolean })[] {
  return items.map(item => {
    if (!localStart && !localEnd) {
      return { ...item, _rev: item.total_revenue, _pro: item.total_profit, _orders: item.order_count, _active: false };
    }
    const filtered = item.daily_breakdown.filter(d => inRange(d.date, localStart, localEnd));
    const _rev = filtered.reduce((s, d) => s + d.revenue, 0);
    const _pro = filtered.reduce((s, d) => s + d.profit, 0);
    const _orders = filtered.reduce((s, d) => s + (d.order_count ?? 0), 0);
    return { ...item, _rev, _pro, _orders, _active: true };
  }).filter(item => !item._active || item._rev > 0);
}

// ──────────── Service Table ────────────
function ServiceTable({ data }: { data: RevenueByService[] }) {
  const [localStart, setLocalStart] = useState('');
  const [localEnd, setLocalEnd] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalConfig | null>(null);

  const aggregated = useMemo(() => reAggregate(data, localStart, localEnd), [data, localStart, localEnd]);
  const searchFiltered = useMemo(
    () => aggregated.filter(r => r.san_pham.toLowerCase().includes(search.toLowerCase())),
    [aggregated, search]
  );

  // Merge _rev/_pro back as total_revenue/profit for sorting
  const forSort = useMemo(() => searchFiltered.map(r => ({ ...r, total_revenue: r._rev, total_profit: r._pro })), [searchFiltered]);
  const { sorted, sortKey, sortDir, handleSort } = useSortableTable(forSort, 'total_revenue');

  const grandRev = sorted.reduce((s, r) => s + r._rev, 0);
  const grandPro = sorted.reduce((s, r) => s + r._pro, 0);
  const grandTotal = aggregated.reduce((s, r) => s + r._rev, 0) || 1;

  return (
    <>
      {modal && <DailyModal config={modal} onClose={() => setModal(null)} />}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-[15px] font-black text-foreground">Doanh thu theo Sản phẩm / Dịch vụ</h2>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm..."
              className="pl-7 pr-3 py-1.5 text-[12px] bg-muted/50 border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary w-36" />
          </div>
        </div>

        <LocalFilter
          localStart={localStart}
          localEnd={localEnd}
          onStartChange={setLocalStart}
          onEndChange={setLocalEnd}
          filteredCount={sorted.length}
          totalCount={data.length}
        />

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground w-8">#</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('san_pham')}>
                  <div className="flex items-center gap-1">Sản phẩm / DV {sortKey === 'san_pham' ? (sortDir === 'desc' ? <ChevronDown size={11} className="text-primary" /> : <ChevronUp size={11} className="text-primary" />) : <ChevronsUpDown size={11} className="opacity-25" />}</div>
                </th>
                <SortTh<typeof sorted[0]> label="Đơn" col="order_count" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh<typeof sorted[0]> label="SL" col="total_quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh<typeof sorted[0]> label="Doanh thu" col="total_revenue" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh<typeof sorted[0]> label="Lợi nhuận" col="total_profit" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">Biên LN</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">Tỷ trọng</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">Theo ngày</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0
                ? <tr><td colSpan={9} className="text-center py-10 text-muted-foreground italic text-[12px]">Không có dữ liệu trong khoảng thời gian đã chọn.</td></tr>
                : sorted.map((item, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-[10px]">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{item.san_pham}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{item._orders || item.order_count}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{item.total_quantity}</td>
                    <td className="px-4 py-3 text-right font-bold">{fmt(item._rev)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmt(item._pro)}</td>
                    <td className="px-4 py-3 text-right"><ProfitBadge revenue={item._rev} profit={item._pro} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${(item._rev / grandTotal) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground w-9 text-right">
                          {((item._rev / grandTotal) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          const rows = item.daily_breakdown
                            .filter(d => inRange(d.date, localStart, localEnd) && d.revenue > 0)
                            .map(d => ({ date: d.date, revenue: d.revenue, profit: d.profit, quantity: d.quantity }));
                          setModal({ title: `Theo ngày — ${item.san_pham}`, subtitle: `${rows.length} ngày có giao dịch`, rows });
                        }}
                        className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline ml-auto"
                      >
                        <ExternalLink size={10} /> Theo ngày
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot className="bg-primary/5 border-t-2 border-primary/20">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-[12px] font-black">Tổng cộng ({sorted.length} dịch vụ)</td>
                <td className="px-4 py-3 text-right font-black">{fmt(grandRev)}</td>
                <td className="px-4 py-3 text-right font-black text-emerald-600">{fmt(grandPro)}</td>
                <td className="px-4 py-3 text-right"><ProfitBadge revenue={grandRev} profit={grandPro} /></td>
                <td className="px-4 py-3 text-right font-black">100%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

// ──────────── Day Table ────────────
function DayTable({ data, summary }: { data: RevenueByDay[]; summary: ReportSummary }) {
  const [localStart, setLocalStart] = useState('');
  const [localEnd, setLocalEnd] = useState('');
  const [dayModal, setDayModal] = useState<{ date: string; breakdown: RevenueByDay['service_breakdown'] } | null>(null);

  const filtered = useMemo(
    () => data.filter(d => inRange(d.date, localStart, localEnd)),
    [data, localStart, localEnd]
  );

  const { sorted, sortKey, sortDir, handleSort } = useSortableTable(filtered, 'date', 'asc');

  const localRev = filtered.reduce((s, r) => s + r.total_revenue, 0);
  const localPro = filtered.reduce((s, r) => s + r.total_profit, 0);
  const localOrders = filtered.reduce((s, r) => s + r.order_count, 0);
  const avgPerDay = filtered.length > 0 ? localRev / filtered.length : summary.avg_per_day;

  return (
    <>
      {dayModal && <ServiceBreakdownModal date={dayModal.date} breakdown={dayModal.breakdown} onClose={() => setDayModal(null)} />}
      <div className="space-y-3">
        <h2 className="text-[15px] font-black text-foreground">Doanh thu theo Ngày</h2>

        <LocalFilter
          localStart={localStart}
          localEnd={localEnd}
          onStartChange={setLocalStart}
          onEndChange={setLocalEnd}
          filteredCount={sorted.length}
          totalCount={data.length}
        />

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('date')}>
                  <div className="flex items-center gap-1">Ngày {sortKey === 'date' ? (sortDir === 'desc' ? <ChevronDown size={11} className="text-primary" /> : <ChevronUp size={11} className="text-primary" />) : <ChevronsUpDown size={11} className="opacity-25" />}</div>
                </th>
                <SortTh<RevenueByDay> label="Số đơn" col="order_count" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh<RevenueByDay> label="Doanh thu" col="total_revenue" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh<RevenueByDay> label="Lợi nhuận" col="total_profit" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">Biên LN</th>
                <SortTh<RevenueByDay> label="TB/đơn" col="avg_per_order" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">So TB ngày</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">Theo DV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0
                ? <tr><td colSpan={8} className="text-center py-10 text-muted-foreground italic text-[12px]">Không có dữ liệu trong khoảng thời gian đã chọn.</td></tr>
                : sorted.map((item, i) => {
                  const vs = item.total_revenue - avgPerDay;
                  return (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{fmtDate(item.date)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{item.order_count}</td>
                      <td className="px-4 py-3 text-right font-bold">{fmt(item.total_revenue)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmt(item.total_profit)}</td>
                      <td className="px-4 py-3 text-right"><ProfitBadge revenue={item.total_revenue} profit={item.total_profit} /></td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt(item.avg_per_order)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-[11px] font-bold flex items-center justify-end gap-0.5 ${vs >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {vs >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                          {fmt(Math.abs(vs))}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.service_breakdown.length > 0 && (
                          <button onClick={() => setDayModal({ date: item.date, breakdown: item.service_breakdown })}
                            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline ml-auto">
                            <ExternalLink size={10} /> Theo DV
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot className="bg-primary/5 border-t-2 border-primary/20">
              <tr>
                <td className="px-4 py-3 font-black text-[12px]">Tổng ({sorted.length} ngày)</td>
                <td className="px-4 py-3 text-right font-black">{localOrders}</td>
                <td className="px-4 py-3 text-right font-black">{fmt(localRev)}</td>
                <td className="px-4 py-3 text-right font-black text-emerald-600">{fmt(localPro)}</td>
                <td className="px-4 py-3 text-right"><ProfitBadge revenue={localRev} profit={localPro} /></td>
                <td className="px-4 py-3 text-right font-black">{fmt(localOrders > 0 ? localRev / localOrders : 0)}</td>
                <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">TB/ngày: {fmt(avgPerDay)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

// ──────────── Branch Table ────────────
function BranchTable({ data }: { data: RevenueByBranch[] }) {
  const [localStart, setLocalStart] = useState('');
  const [localEnd, setLocalEnd] = useState('');
  const [modal, setModal] = useState<ModalConfig | null>(null);

  const aggregated = useMemo(() => reAggregate(data, localStart, localEnd), [data, localStart, localEnd]);
  const forSort = useMemo(() => aggregated.map(r => ({ ...r, total_revenue: r._rev, total_profit: r._pro })), [aggregated]);
  const { sorted, sortKey, sortDir, handleSort } = useSortableTable(forSort, 'total_revenue');

  const grandRev = sorted.reduce((s, r) => s + r._rev, 0);
  const grandPro = sorted.reduce((s, r) => s + r._pro, 0);
  const grandTotal = grandRev || 1;

  return (
    <>
      {modal && <DailyModal config={modal} onClose={() => setModal(null)} />}
      <div className="space-y-3">
        <h2 className="text-[15px] font-black text-foreground">Doanh thu theo Cơ sở</h2>

        <LocalFilter
          localStart={localStart}
          localEnd={localEnd}
          onStartChange={setLocalStart}
          onEndChange={setLocalEnd}
          filteredCount={sorted.length}
          totalCount={data.length}
        />

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground w-8">#</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('co_so')}>
                  <div className="flex items-center gap-1">Cơ sở {sortKey === 'co_so' ? (sortDir === 'desc' ? <ChevronDown size={11} className="text-primary" /> : <ChevronUp size={11} className="text-primary" />) : <ChevronsUpDown size={11} className="opacity-25" />}</div>
                </th>
                <SortTh<typeof sorted[0]> label="Đơn" col="order_count" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh<typeof sorted[0]> label="Doanh thu" col="total_revenue" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh<typeof sorted[0]> label="Lợi nhuận" col="total_profit" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">Biên LN</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">Tỷ trọng</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">Theo ngày</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0
                ? <tr><td colSpan={8} className="text-center py-10 text-muted-foreground italic text-[12px]">Không có dữ liệu trong khoảng thời gian đã chọn.</td></tr>
                : sorted.map((item, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-[10px]">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold">
                      <div className="flex items-center gap-2"><Building2 size={12} className="text-muted-foreground" />{item.co_so}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{item._orders || item.order_count}</td>
                    <td className="px-4 py-3 text-right font-bold">{fmt(item._rev)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmt(item._pro)}</td>
                    <td className="px-4 py-3 text-right"><ProfitBadge revenue={item._rev} profit={item._pro} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(item._rev / grandTotal) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground w-9 text-right">
                          {((item._rev / grandTotal) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          const rows = item.daily_breakdown
                            .filter(d => inRange(d.date, localStart, localEnd) && d.revenue > 0)
                            .map(d => ({ date: d.date, revenue: d.revenue, profit: d.profit, order_count: d.order_count }));
                          setModal({ title: `Theo ngày — ${item.co_so}`, subtitle: `${rows.length} ngày có giao dịch`, rows });
                        }}
                        className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline ml-auto"
                      >
                        <ExternalLink size={10} /> Theo ngày
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot className="bg-primary/5 border-t-2 border-primary/20">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-[12px] font-black">Tổng cộng ({sorted.length} cơ sở)</td>
                <td className="px-4 py-3 text-right font-black">{fmt(grandRev)}</td>
                <td className="px-4 py-3 text-right font-black text-emerald-600">{fmt(grandPro)}</td>
                <td className="px-4 py-3 text-right"><ProfitBadge revenue={grandRev} profit={grandPro} /></td>
                <td className="px-4 py-3 text-right font-black">100%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

// ──────────── Personnel Table ────────────
function PersonnelTable({ data }: { data: { personnel: RevenueByPersonnel[]; avg_revenue_per_person: number } }) {
  const [localStart, setLocalStart] = useState('');
  const [localEnd, setLocalEnd] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalConfig | null>(null);

  const aggregated = useMemo(() => reAggregate(data.personnel, localStart, localEnd), [data.personnel, localStart, localEnd]);
  const searchFiltered = useMemo(
    () => aggregated.filter(p => p.nhan_vien_name.toLowerCase().includes(search.toLowerCase())),
    [aggregated, search]
  );
  const forSort = useMemo(() => searchFiltered.map(r => ({ ...r, total_revenue: r._rev, total_profit: r._pro })), [searchFiltered]);
  const { sorted, sortKey, sortDir, handleSort } = useSortableTable(forSort, 'total_revenue');

  const avgRevInPeriod = useMemo(
    () => aggregated.length > 0 ? aggregated.reduce((s, p) => s + p._rev, 0) / aggregated.length : 0,
    [aggregated]
  );

  const grandRev = sorted.reduce((s, p) => s + p._rev, 0);
  const grandPro = sorted.reduce((s, p) => s + p._pro, 0);
  const grandOrders = sorted.reduce((s, p) => s + p.order_count, 0);

  return (
    <>
      {modal && <DailyModal config={modal} onClose={() => setModal(null)} />}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-[15px] font-black text-foreground">Doanh thu theo Nhân sự</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Click "Theo ngày" để xem modal chi tiết</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[12px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-lg border border-border">
              TB: <span className="font-black text-foreground">{fmt(avgRevInPeriod)}</span>
            </div>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nhân viên..."
                className="pl-7 pr-3 py-1.5 text-[12px] bg-muted/50 border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary w-44" />
            </div>
          </div>
        </div>

        <LocalFilter
          localStart={localStart}
          localEnd={localEnd}
          onStartChange={setLocalStart}
          onEndChange={setLocalEnd}
          filteredCount={sorted.length}
          totalCount={data.personnel.length}
        />

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground w-8">#</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('nhan_vien_name')}>
                  <div className="flex items-center gap-1">Nhân viên {sortKey === 'nhan_vien_name' ? (sortDir === 'desc' ? <ChevronDown size={11} className="text-primary" /> : <ChevronUp size={11} className="text-primary" />) : <ChevronsUpDown size={11} className="opacity-25" />}</div>
                </th>
                <SortTh<typeof sorted[0]> label="Đơn" col="order_count" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh<typeof sorted[0]> label="Doanh thu" col="total_revenue" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh<typeof sorted[0]> label="Lợi nhuận" col="total_profit" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">Biên LN</th>
                <SortTh<typeof sorted[0]> label="TB/đơn" col="avg_per_order" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh<typeof sorted[0]> label="TB/ngày" col="avg_per_day" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">So TB</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground">Theo ngày</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0
                ? <tr><td colSpan={10} className="text-center py-10 text-muted-foreground italic text-[12px]">Không có dữ liệu trong khoảng thời gian đã chọn.</td></tr>
                : sorted.map((p, i) => {
                  const over = p._rev >= avgRevInPeriod;
                  const activeDays = p.daily_breakdown.filter(d => inRange(d.date, localStart, localEnd) && d.revenue > 0);
                  return (
                    <tr key={p.nhan_vien_name} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground font-mono text-[10px]">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0"
                            style={{ background: `hsl(${(i * 47) % 360}, 60%, 50%)` }}>
                            {p.nhan_vien_name.charAt(0)}
                          </div>
                          <span className="font-semibold">{p.nhan_vien_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{p.order_count}</td>
                      <td className="px-4 py-3 text-right font-bold">{fmt(p._rev)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmt(p._pro)}</td>
                      <td className="px-4 py-3 text-right"><ProfitBadge revenue={p._rev} profit={p._pro} /></td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt(p.avg_per_order)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt(p.avg_per_day)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-[11px] font-bold flex items-center justify-end gap-0.5 ${over ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {over ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                          {over ? 'Trên TB' : 'Dưới TB'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {activeDays.length > 0 && (
                          <button
                            onClick={() => setModal({
                              title: `Theo ngày — ${p.nhan_vien_name}`,
                              subtitle: `${activeDays.length} ngày có giao dịch`,
                              rows: activeDays.map(d => ({ date: d.date, revenue: d.revenue, profit: d.profit })),
                            })}
                            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline ml-auto"
                          >
                            <ExternalLink size={10} /> Theo ngày
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot className="bg-primary/5 border-t-2 border-primary/20">
              <tr>
                <td colSpan={2} className="px-4 py-3 text-[12px] font-black">Tổng ({sorted.length} nhân sự)</td>
                <td className="px-4 py-3 text-right font-black">{grandOrders}</td>
                <td className="px-4 py-3 text-right font-black">{fmt(grandRev)}</td>
                <td className="px-4 py-3 text-right font-black text-emerald-600">{fmt(grandPro)}</td>
                <td className="px-4 py-3 text-right"><ProfitBadge revenue={grandRev} profit={grandPro} /></td>
                <td className="px-4 py-3 text-right text-muted-foreground text-[11px]" colSpan={2}>TB: {fmt(avgRevInPeriod)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground italic">
          * Mỗi nhân viên được tính 100% doanh thu đơn hàng N-N họ tham gia.
        </p>
      </div>
    </>
  );
}

// ────────────  Slug map  ────────────
type TabKey = 'service' | 'day' | 'branch' | 'personnel';

const SLUG_TO_TAB: Record<string, TabKey> = {
  'san-pham': 'service',
  'theo-ngay': 'day',
  'co-so': 'branch',
  'nhan-su': 'personnel',
};

const TAB_TO_SLUG: Record<TabKey, string> = {
  service: 'san-pham',
  day: 'theo-ngay',
  branch: 'co-so',
  personnel: 'nhan-su',
};

// ──────────── Main Page ────────────
const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'service', label: 'Sản phẩm/DV', icon: BarChart2 },
  { key: 'day', label: 'Theo ngày', icon: Calendar },
  { key: 'branch', label: 'Theo cơ sở', icon: Building2 },
  { key: 'personnel', label: 'Nhân sự', icon: Users },
];

const RevenueReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { tab: tabSlug } = useParams<{ tab: string }>();

  // Derive active tab from URL slug; fall back to 'service'
  const activeTab: TabKey = SLUG_TO_TAB[tabSlug ?? ''] ?? 'service';
  const setActiveTab = (key: TabKey) => navigate(`/bao-cao/${TAB_TO_SLUG[key]}`, { replace: false });

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [serviceData, setServiceData] = useState<RevenueByService[]>([]);
  const [dayData, setDayData] = useState<RevenueByDay[]>([]);
  const [branchData, setBranchData] = useState<RevenueByBranch[]>([]);
  const [personnelData, setPersonnelData] = useState<{
    personnel: RevenueByPersonnel[];
    avg_revenue_per_person: number;
    date_list: string[];
  } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, svc, day, branch, personnel] = await Promise.all([
        getReportSummary(startDate, endDate),
        getRevenueByService(startDate, endDate),
        getRevenueByDay(startDate, endDate),
        getRevenueByBranch(startDate, endDate),
        getRevenueByPersonnel(startDate, endDate),
      ]);
      setSummary(sum);
      setServiceData(svc);
      setDayData(day);
      setBranchData(branch);
      setPersonnelData(personnel);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <div className="w-full h-full flex flex-col p-4 lg:p-6 overflow-y-auto pt-8">
      <div className="w-full space-y-5 max-w-[1400px] mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 rounded-lg border border-border hover:bg-muted text-muted-foreground transition-colors">
              <ChevronLeft size={16} />
            </button>
            <div>
              <h1 className="text-xl font-black text-foreground flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <BarChart2 size={20} />
                </div>
                Báo cáo Doanh thu
              </h1>
              <p className="text-[12px] text-muted-foreground mt-0.5 ml-11 italic">
                Sắp xếp · Xem chi tiết modal
              </p>
            </div>
          </div>

          {/* Global date range filter */}
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 shadow-sm">
            <Calendar size={12} className="text-muted-foreground" />
            <span className="text-[11px] font-bold text-muted-foreground">Khoảng thời gian:</span>
            <DateInput value={startDate} onChange={setStartDate} />
            <span className="text-muted-foreground opacity-40">→</span>
            <DateInput value={endDate} onChange={setEndDate} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-[13px]">Đang tải dữ liệu...</span>
          </div>
        ) : summary ? (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <StatCard label="Tổng doanh thu" value={fmt(summary.total_revenue)} sub={`${summary.date_range_days} ngày hoạt động`} icon={TrendingUp} color="#3b82f6" />
              <StatCard label="Lợi nhuận" value={fmt(summary.total_profit)} sub={`Biên: ${((summary.total_profit / (summary.total_revenue || 1)) * 100).toFixed(1)}%`} icon={summary.total_profit >= 0 ? TrendingUp : TrendingDown} color="#10b981" />
              <StatCard label="Tổng đơn hàng" value={summary.total_orders.toLocaleString('vi-VN')} sub="đơn giao dịch" icon={BarChart2} color="#8b5cf6" />
              <StatCard label="TB / ngày" value={fmt(summary.avg_per_day)} sub="doanh thu bình quân" icon={Calendar} color="#f59e0b" />
              <StatCard label="TB / đơn" value={fmt(summary.avg_per_order)} sub="giá trị đơn bình quân" icon={ArrowUpRight} color="#ec4899" />
            </div>

            {/* Tabs */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="flex border-b border-border overflow-x-auto">
                {tabs.map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-2 px-5 py-3 text-[13px] font-bold transition-colors whitespace-nowrap border-b-2 ${activeTab === tab.key
                        ? 'border-primary text-primary bg-primary/5'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}>
                    <tab.icon size={14} />
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="p-5">
                {activeTab === 'service' && <ServiceTable data={serviceData} />}
                {activeTab === 'day' && <DayTable data={dayData} summary={summary} />}
                {activeTab === 'branch' && <BranchTable data={branchData} />}
                {activeTab === 'personnel' && personnelData && <PersonnelTable data={personnelData} />}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default RevenueReportPage;
