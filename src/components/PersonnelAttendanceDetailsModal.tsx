import { useMemo } from 'react';
import { AlertCircle, CheckCircle2, Clock3, LogIn, LogOut, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { DongChamBuaNhap } from '../data/payrollAttendanceSalary';
import { formatDateVi } from '../utils/datetimeFormat';
import {
  calculateAttendanceStatus,
  formatMinutesToHours,
  overtimeMinutesForDayShifts,
} from '../utils/timekeeping';

interface PersonnelAttendanceDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  personnelName: string;
  month: number;
  year: number;
  rows: DongChamBuaNhap[];
}

interface AttendanceDay {
  date: string;
  rows: DongChamBuaNhap[];
  hasCheckin: boolean;
  hasMissingCheckout: boolean;
  lateMinutes: number;
  overtimeMinutes: number;
  locations: string[];
}

function formatTime(value: string | null): string {
  if (!value?.trim()) return '—';
  const match = value.match(/(?:T|^)(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : value;
}

function formatOvertime(minutes: number): string {
  return minutes > 0 ? formatMinutesToHours(minutes) : '0h';
}

const PersonnelAttendanceDetailsModal: React.FC<PersonnelAttendanceDetailsModalProps> = ({
  isOpen,
  onClose,
  personnelName,
  month,
  year,
  rows,
}) => {
  const days = useMemo<AttendanceDay[]>(() => {
    const byDate = new Map<string, DongChamBuaNhap[]>();
    rows.forEach((row) => {
      if (!row.ngay) return;
      const dateRows = byDate.get(row.ngay) ?? [];
      dateRows.push(row);
      byDate.set(row.ngay, dateRows);
    });

    return Array.from(byDate.entries())
      .map(([date, dateRows]) => {
        const statuses = dateRows.map((row) => calculateAttendanceStatus(row.checkin, row.checkout));
        return {
          date,
          rows: dateRows,
          hasCheckin: dateRows.some((row) => Boolean(row.checkin?.trim())),
          hasMissingCheckout: dateRows.some((row) => Boolean(row.checkin?.trim()) && !row.checkout?.trim()),
          lateMinutes: Math.max(0, ...statuses.map((status) => status.lateMinutes)),
          overtimeMinutes: overtimeMinutesForDayShifts(dateRows),
          locations: Array.from(
            new Set(dateRows.map((row) => row.vi_tri?.trim()).filter((value): value is string => Boolean(value)))
          ),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [rows]);

  if (!isOpen) return null;

  const workDays = days.filter((day) => day.hasCheckin).length;
  const missingCheckoutDays = days.filter((day) => day.hasMissingCheckout).length;
  const overtimeMinutes = days.reduce((sum, day) => sum + day.overtimeMinutes, 0);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Clock3 className="h-5 w-5 shrink-0 text-primary" />
              Chi tiết chấm công nguồn
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {personnelName} · Tháng {month}/{year}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border bg-background p-4 sm:grid-cols-4">
          <MiniSummary label="Ngày có công" value={`${workDays} ngày`} />
          <MiniSummary label="Lượt chấm" value={`${rows.length} lượt`} />
          <MiniSummary label="Tổng tăng ca" value={formatOvertime(overtimeMinutes)} />
          <MiniSummary
            label="Thiếu giờ ra"
            value={`${missingCheckoutDays} ngày`}
            warning={missingCheckoutDays > 0}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {days.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center text-center text-muted-foreground">
              <Clock3 className="mb-3 h-9 w-9" />
              <p className="text-sm font-medium">Không có lượt chấm công nào trong kỳ.</p>
            </div>
          ) : (
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-semibold">Ngày</th>
                  <th className="px-3 py-2.5 font-semibold">Giờ vào</th>
                  <th className="px-3 py-2.5 font-semibold">Giờ ra</th>
                  <th className="px-3 py-2.5 font-semibold">Kết quả</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Đi muộn</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Tăng ca</th>
                  <th className="px-3 py-2.5 font-semibold">Vị trí</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.date} className="border-b border-border/70 align-top hover:bg-muted/20">
                    <td className="whitespace-nowrap px-3 py-3 font-bold text-foreground">{formatDateVi(day.date)}</td>
                    <td className="px-3 py-3">
                      <TimeList icon={LogIn} tone="green" values={day.rows.map((row) => formatTime(row.checkin))} />
                    </td>
                    <td className="px-3 py-3">
                      <TimeList icon={LogOut} tone="orange" values={day.rows.map((row) => formatTime(row.checkout))} />
                    </td>
                    <td className="px-3 py-3">
                      {!day.hasCheckin ? (
                        <StatusBadge tone="slate" label="Không tính công" />
                      ) : day.hasMissingCheckout ? (
                        <StatusBadge tone="amber" label="Thiếu giờ ra" />
                      ) : (
                        <StatusBadge tone="green" label="Đủ dữ liệu" />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs">
                      {day.lateMinutes > 0 ? `${day.lateMinutes} phút` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs font-bold text-blue-700">
                      {formatOvertime(day.overtimeMinutes)}
                    </td>
                    <td className="max-w-[260px] px-3 py-3 text-xs text-muted-foreground">
                      {day.locations.length > 0 ? day.locations.join(' · ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

function MiniSummary({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${warning ? 'border-amber-200 bg-amber-50' : 'border-border bg-muted/20'}`}>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-bold tabular-nums ${warning ? 'text-amber-800' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function TimeList({
  icon: Icon,
  tone,
  values,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'green' | 'orange';
  values: string[];
}) {
  const toneClass = tone === 'green' ? 'text-emerald-700' : 'text-orange-700';
  return (
    <div className="space-y-1">
      {values.map((value, index) => (
        <div key={`${value}-${index}`} className={`flex items-center gap-1.5 whitespace-nowrap font-mono text-xs ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" /> {value}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ tone, label }: { tone: 'green' | 'amber' | 'slate'; label: string }) {
  const tones = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${tones[tone]}`}>
      {tone === 'green' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

export default PersonnelAttendanceDetailsModal;
