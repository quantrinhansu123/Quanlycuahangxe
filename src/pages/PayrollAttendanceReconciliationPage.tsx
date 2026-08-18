import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserCheck,
  Users,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PersonnelAttendanceDetailsModal from '../components/PersonnelAttendanceDetailsModal';
import { getChamCongTrongKhoang } from '../data/attendanceData';
import {
  demGioTangCaTheoDongCham,
  demSoNgayCongTheoDongCham,
  locDongChamTheoNhanVien,
  type DongChamBuaNhap,
} from '../data/payrollAttendanceSalary';
import { getPayrollBatch, getPayrollBreakdown, type BangLuong } from '../data/payrollData';
import { getPersonnel, type NhanSu } from '../data/personnelData';
import { cn, normalizeForCompare } from '../lib/utils';

type ComparisonStatus = 'matched' | 'mismatched' | 'missing-payroll';

interface ComparisonRow {
  key: string;
  name: string;
  branch: string;
  position: string;
  payroll?: BangLuong;
  payrollWorkDays: number;
  payrollExtraDays: number;
  payrollOvertimeHours: number;
  sourceWorkDays: number;
  sourceOvertimeHours: number;
  workDayDifference: number;
  overtimeDifference: number;
  attendanceRows: DongChamBuaNhap[];
  status: ComparisonStatus;
}

interface ReconciliationData {
  personnel: NhanSu[];
  payroll: BangLuong[];
  attendanceRows: DongChamBuaNhap[];
}

const ALL_BRANCHES = 'Tất cả cơ sở';

function validMonth(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : fallback;
}

function validYear(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : fallback;
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, '0');
  const lastDay = String(new Date(year, month, 0).getDate()).padStart(2, '0');
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${lastDay}` };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
}

function formatHours(value: number): string {
  return `${formatNumber(value)}h`;
}

function signedValue(value: number, unit: 'công' | 'h'): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatNumber(value)} ${unit}`;
}

function formatUpdatedAt(value?: string): string {
  if (!value) return 'Chưa có thời gian lưu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa có thời gian lưu';
  return `Lưu lúc ${new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)}`;
}

function statusLabel(status: ComparisonStatus): string {
  if (status === 'matched') return 'Khớp';
  if (status === 'missing-payroll') return 'Chưa có bảng lương';
  return 'Lệch';
}

const PayrollAttendanceReconciliationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentDate = useMemo(() => new Date(), []);
  const month = validMonth(searchParams.get('thang'), currentDate.getMonth() + 1);
  const year = validYear(searchParams.get('nam'), currentDate.getFullYear());

  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [branch, setBranch] = useState(ALL_BRANCHES);
  const [onlyMismatched, setOnlyMismatched] = useState(false);
  const [detailsModal, setDetailsModal] = useState<{
    name: string;
    rows: DongChamBuaNhap[];
  } | null>(null);

  const years = useMemo(() => {
    const values = new Set<number>();
    for (let current = currentDate.getFullYear() - 5; current <= currentDate.getFullYear() + 2; current += 1) {
      values.add(current);
    }
    values.add(year);
    return Array.from(values).sort((a, b) => b - a);
  }, [currentDate, year]);

  const updatePeriod = (nextMonth: number, nextYear: number) => {
    setSearchParams({ thang: String(nextMonth), nam: String(nextYear) });
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { start, end } = monthRange(year, month);
    try {
      const [personnel, payroll, attendanceRows] = await Promise.all([
        getPersonnel(),
        getPayrollBatch(month, year),
        getChamCongTrongKhoang(start, end),
      ]);
      setData({ personnel, payroll, attendanceRows: attendanceRows as DongChamBuaNhap[] });
    } catch (loadError) {
      console.error('Không thể tải dữ liệu rà soát chấm công:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Không thể tải dữ liệu đối chiếu.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    // The selected period is external input; reload payroll and attendance together.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const rows = useMemo<ComparisonRow[]>(() => {
    if (!data) return [];

    const payrollByPersonnelId = new Map(data.payroll.map((item) => [item.nhan_su_id, item]));
    const personnelById = new Map(data.personnel.map((person) => [person.id, person]));
    const rowsByKey = new Map<string, ComparisonRow>();
    const matchedAttendanceRows = new Set<DongChamBuaNhap>();

    const addRow = (
      key: string,
      person: NhanSu | undefined,
      payroll: BangLuong | undefined,
      sourceRows: DongChamBuaNhap[],
      fallbackName?: string
    ) => {
      const payrollName = payroll?.nhan_su?.ho_ten?.trim();
      const name = person?.ho_ten?.trim() || payrollName || fallbackName || key;
      const personnelUuid = person?.id || payroll?.nhan_su_id;
      const personnelCode = person?.id_nhan_su;
      const sourceWorkDays = demSoNgayCongTheoDongCham(sourceRows, name, personnelUuid, personnelCode);
      const sourceOvertimeHours = demGioTangCaTheoDongCham(sourceRows, name, personnelUuid, personnelCode);
      const payrollBreakdown = payroll ? getPayrollBreakdown(payroll) : null;
      const payrollWorkDays = Number(payroll?.ngay_cong_thuc_te ?? 0);
      const payrollExtraDays = Number(payrollBreakdown?.ngay_cong_them ?? 0);
      const payrollOvertimeHours = Number(payrollBreakdown?.so_gio_tang_ca ?? 0);
      const workDayDifference = sourceWorkDays - payrollWorkDays;
      const overtimeDifference = sourceOvertimeHours - payrollOvertimeHours;
      const status: ComparisonStatus = !payroll
        ? 'missing-payroll'
        : Math.abs(workDayDifference) < 0.001 && Math.abs(overtimeDifference) < 0.01
          ? 'matched'
          : 'mismatched';

      sourceRows.forEach((row) => matchedAttendanceRows.add(row));
      rowsByKey.set(key, {
        key,
        name,
        branch: person?.co_so?.trim() || payroll?.co_so?.trim() || 'Chưa xác định',
        position: person?.vi_tri?.trim() || payroll?.nhan_su?.vi_tri?.trim() || 'Chưa xác định',
        payroll,
        payrollWorkDays,
        payrollExtraDays,
        payrollOvertimeHours,
        sourceWorkDays,
        sourceOvertimeHours,
        workDayDifference,
        overtimeDifference,
        attendanceRows: sourceRows,
        status,
      });
    };

    data.personnel.forEach((person) => {
      const key = normalizeForCompare(person.ho_ten);
      if (!key) return;
      const sourceRows = locDongChamTheoNhanVien(
        data.attendanceRows,
        person.ho_ten,
        person.id,
        person.id_nhan_su
      );
      addRow(key, person, payrollByPersonnelId.get(person.id), sourceRows);
    });

    data.payroll.forEach((payroll) => {
      const person = personnelById.get(payroll.nhan_su_id);
      const name = person?.ho_ten || payroll.nhan_su?.ho_ten || payroll.nhan_su_id;
      const key = normalizeForCompare(name);
      if (!key || rowsByKey.has(key)) return;
      const sourceRows = locDongChamTheoNhanVien(
        data.attendanceRows,
        name,
        payroll.nhan_su_id,
        person?.id_nhan_su
      );
      addRow(key, person, payroll, sourceRows);
    });

    const unmatchedByStaff = new Map<string, DongChamBuaNhap[]>();
    data.attendanceRows.forEach((attendanceRow) => {
      if (matchedAttendanceRows.has(attendanceRow)) return;
      const key = normalizeForCompare(attendanceRow.nhan_su);
      if (!key) return;
      const sourceRows = unmatchedByStaff.get(key) ?? [];
      sourceRows.push(attendanceRow);
      unmatchedByStaff.set(key, sourceRows);
    });
    unmatchedByStaff.forEach((sourceRows, key) => {
      addRow(`attendance:${key}`, undefined, undefined, sourceRows, sourceRows[0]?.nhan_su || key);
    });

    return Array.from(rowsByKey.values()).sort((a, b) => {
      const statusOrder: Record<ComparisonStatus, number> = {
        mismatched: 0,
        'missing-payroll': 1,
        matched: 2,
      };
      return statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name, 'vi');
    });
  }, [data]);

  const branches = useMemo(
    () => [ALL_BRANCHES, ...Array.from(new Set(rows.map((row) => row.branch))).sort((a, b) => a.localeCompare(b, 'vi'))],
    [rows]
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeForCompare(query);
    return rows.filter((row) => {
      if (branch !== ALL_BRANCHES && row.branch !== branch) return false;
      if (onlyMismatched && row.status === 'matched') return false;
      if (!normalizedQuery) return true;
      return normalizeForCompare(`${row.name} ${row.branch} ${row.position}`).includes(normalizedQuery);
    });
  }, [branch, onlyMismatched, query, rows]);

  const summary = useMemo(() => {
    const matched = rows.filter((row) => row.status === 'matched').length;
    const missing = rows.filter((row) => row.status === 'missing-payroll').length;
    return {
      total: rows.length,
      matched,
      mismatched: rows.length - matched,
      missing,
      dayDifference: rows.reduce((sum, row) => sum + Math.abs(row.workDayDifference), 0),
      overtimeDifference: rows.reduce((sum, row) => sum + Math.abs(row.overtimeDifference), 0),
    };
  }, [rows]);

  return (
    <div className="min-h-screen bg-muted/20 p-4 sm:p-6" data-testid="attendance-reconciliation-page">
      <div className="mx-auto max-w-[1480px] space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={() => navigate(`/tien-luong/bang-luong-cham-cong?thang=${month}&nam=${year}`)}
              className="mt-0.5 rounded-lg border border-border bg-background p-2.5 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Quay lại bảng lương chấm công"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Rà soát chấm công</h1>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                  Chỉ đọc
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Đối chiếu ngày công và giờ tăng ca đã lưu trong bảng lương với các lượt chấm công gốc.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-2 shadow-sm">
            <div className="flex items-center gap-2 px-2 text-sm font-semibold text-muted-foreground">
              <CalendarDays className="h-4 w-4" /> Kỳ đối chiếu
            </div>
            <select
              value={month}
              onChange={(event) => updatePeriod(Number(event.target.value), year)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
              aria-label="Chọn tháng"
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>Tháng {value}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={(event) => updatePeriod(month, Number(event.target.value))}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
              aria-label="Chọn năm"
            >
              {years.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Tải lại
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>Ngày công nguồn</strong> là số ngày duy nhất có giờ vào. <strong>Tăng ca nguồn</strong> lấy giờ ra
              muộn nhất mỗi ngày và chỉ tính phần sau 19:40. Ngày công bổ sung được hiển thị riêng, không tính là chênh lệch.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard icon={Users} label="Nhân viên kiểm tra" value={String(summary.total)} tone="slate" />
          <SummaryCard icon={CheckCircle2} label="Đã khớp" value={String(summary.matched)} tone="green" />
          <SummaryCard icon={AlertCircle} label="Cần kiểm tra" value={String(summary.mismatched)} tone="red" />
          <SummaryCard
            icon={SlidersHorizontal}
            label="Tổng chênh lệch"
            value={`${formatNumber(summary.dayDifference)} công · ${formatHours(summary.overtimeDifference)}`}
            tone="amber"
          />
        </div>

        <section className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-bold text-foreground">Chi tiết đối chiếu tháng {month}/{year}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Hiển thị {filteredRows.length}/{rows.length} nhân viên
                {summary.missing > 0 ? ` · ${summary.missing} người chưa có dòng bảng lương` : ''}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm tên, vị trí, cơ sở..."
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  className="h-10 min-w-[190px] appearance-none rounded-lg border border-border bg-background pl-9 pr-8 text-sm font-medium outline-none focus:border-primary"
                >
                  {branches.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={onlyMismatched}
                  onChange={(event) => setOnlyMismatched(event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Chỉ xem lệch
              </label>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(170px,0.65fr)_minmax(280px,1fr)_145px_minmax(280px,1fr)] border-b border-border bg-muted/40 px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground max-lg:hidden">
            <div>Nhân viên</div>
            <div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Bảng lương</div>
            <div className="text-center">Kết quả</div>
            <div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> Chấm công nguồn</div>
          </div>

          {loading ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Đang lấy dữ liệu từ hai nguồn...</p>
            </div>
          ) : error ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
              <AlertCircle className="mb-3 h-9 w-9 text-red-500" />
              <p className="font-semibold text-foreground">Không tải được dữ liệu đối chiếu</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{error}</p>
              <button type="button" onClick={() => void loadData()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                Thử lại
              </button>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <Search className="mb-3 h-8 w-8" />
              <p className="text-sm font-medium">Không có nhân viên phù hợp bộ lọc.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredRows.map((row) => (
                <ComparisonRowCard
                  key={row.key}
                  row={row}
                  onShowDetails={() => setDetailsModal({ name: row.name, rows: row.attendanceRows })}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <PersonnelAttendanceDetailsModal
        isOpen={detailsModal !== null}
        onClose={() => setDetailsModal(null)}
        personnelName={detailsModal?.name ?? ''}
        month={month}
        year={year}
        rows={detailsModal?.rows ?? []}
      />
    </div>
  );
};

const summaryTones = {
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
} as const;

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: keyof typeof summaryTones;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
        </div>
        <div className={cn('rounded-lg border p-2', summaryTones[tone])}><Icon className="h-4 w-4" /></div>
      </div>
    </div>
  );
}

function ComparisonRowCard({ row, onShowDetails }: { row: ComparisonRow; onShowDetails: () => void }) {
  const matched = row.status === 'matched';
  const missingPayroll = row.status === 'missing-payroll';

  return (
    <article
      className={cn(
        'grid gap-3 px-4 py-4 transition-colors lg:grid-cols-[minmax(170px,0.65fr)_minmax(280px,1fr)_145px_minmax(280px,1fr)] lg:items-stretch',
        matched ? 'hover:bg-emerald-50/30' : 'bg-red-50/20 hover:bg-red-50/40'
      )}
      data-status={row.status}
    >
      <div className="flex min-w-0 flex-col justify-center">
        <p className="truncate font-bold text-foreground" title={row.name}>{row.name}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground" title={`${row.position} · ${row.branch}`}>
          {row.position} · {row.branch}
        </p>
      </div>

      <div className={cn('rounded-xl border p-3', missingPayroll ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50/70')}>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground lg:hidden">Bảng lương</p>
        {missingPayroll ? (
          <div className="flex min-h-16 items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" /> Chưa có dòng bảng lương kỳ này
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="text-xl font-bold tabular-nums text-slate-900">{formatNumber(row.payrollWorkDays)} ngày công</p>
              <p className="font-semibold tabular-nums text-slate-700">{formatHours(row.payrollOvertimeHours)} tăng ca</p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Ngày bổ sung: <strong className="text-foreground">+{formatNumber(row.payrollExtraDays)}</strong></span>
              <span>Trạng thái: <strong className="text-foreground">{row.payroll?.trang_thai || 'Chưa duyệt'}</strong></span>
              <span>{formatUpdatedAt(row.payroll?.updated_at)}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col items-center justify-center gap-1 text-center">
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold',
          matched && 'border-emerald-200 bg-emerald-50 text-emerald-700',
          row.status === 'mismatched' && 'border-red-200 bg-red-50 text-red-700',
          missingPayroll && 'border-amber-200 bg-amber-50 text-amber-800'
        )}>
          {matched ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {statusLabel(row.status)}
        </span>
        <span className={cn('text-xs font-semibold tabular-nums', Math.abs(row.workDayDifference) < 0.001 ? 'text-muted-foreground' : 'text-red-600')}>
          Công {signedValue(row.workDayDifference, 'công')}
        </span>
        <span className={cn('text-xs font-semibold tabular-nums', Math.abs(row.overtimeDifference) < 0.01 ? 'text-muted-foreground' : 'text-red-600')}>
          TC {signedValue(row.overtimeDifference, 'h')}
        </span>
      </div>

      <div className={cn('rounded-xl border p-3', matched ? 'border-emerald-200 bg-emerald-50/60' : 'border-blue-200 bg-blue-50/60')}>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground lg:hidden">Chấm công nguồn</p>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="text-xl font-bold tabular-nums text-slate-900">{formatNumber(row.sourceWorkDays)} ngày công</p>
              <p className="font-semibold tabular-nums text-blue-800">{formatHours(row.sourceOvertimeHours)} tăng ca</p>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{row.attendanceRows.length} lượt chấm trong kỳ</p>
          </div>
          <button
            type="button"
            onClick={onShowDetails}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-background px-2.5 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-50"
          >
            <UserCheck className="h-3.5 w-3.5" /> Xem ngày
          </button>
        </div>
      </div>
    </article>
  );
}

export default PayrollAttendanceReconciliationPage;
