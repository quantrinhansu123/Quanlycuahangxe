import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, X } from 'lucide-react';
import { addManualAttendance, formatAttendanceSaveError } from '../data/attendanceData';
import type { NhanSu } from '../data/personnelData';
import { workDaysForDayShifts } from '../utils/timekeeping';
import { useAttendanceSettings } from '../hooks/useAttendanceSettings';
import { formatLocalIsoDate } from '../utils/datetimeFormat';
import DateInputVi from './ui/DateInputVi';
import Time24Picker from './ui/Time24Picker';

export default function ManualAttendanceModal({ personnel, initialPerson = '', initialDay, onClose, onSaved }: {
  personnel: NhanSu[]; initialPerson?: string; initialDay?: string;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { settings } = useAttendanceSettings();
  const [person, setPerson] = useState(initialPerson);
  const [day, setDay] = useState(initialDay || formatLocalIsoDate());
  const [shift, setShift] = useState<'morning' | 'afternoon' | 'full'>(() => settings.splitShiftEnabled ? 'morning' : 'full');
  const [start, setStart] = useState<string>(() => settings.splitShiftEnabled ? settings.morningStart : settings.fullDayStart);
  const [end, setEnd] = useState<string>(() => settings.splitShiftEnabled ? settings.morningEnd : settings.fullDayEnd);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const field = 'min-h-11 w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20';
  const label = 'block space-y-1.5 text-sm font-semibold text-foreground';
  const credit = shift === 'full' ? settings.fullDayCredit : workDaysForDayShifts([{ checkin: start, checkout: end }], settings);
  return createPortal(<div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <form role="dialog" aria-modal="true" aria-labelledby="manual-attendance-title"
      className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      onSubmit={async e => {
      e.preventDefault();
      if (busy.current) return;
      busy.current = true; setSaving(true); setError('');
      try {
        await addManualAttendance({ person, day, shift, start, end, note });
      } catch (err) {
        setError(formatAttendanceSaveError(err)); busy.current = false; setSaving(false); return;
      }
      // Close after a successful write even if refreshing the list fails.
      onClose(); await onSaved();
    }}>
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-5 py-3 sm:px-8 sm:py-5">
        <h2 id="manual-attendance-title" className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Clock size={20} className="text-primary" aria-hidden="true" />
          Bổ sung chấm công
        </h2>
        <button type="button" disabled={saving} onClick={onClose} aria-label="Đóng bổ sung chấm công" className="rounded-full p-2 text-muted-foreground hover:bg-muted">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5 sm:px-8">
        <label className={label}>Nhân viên
          <select required className={field} value={person} onChange={e => setPerson(e.target.value)}>
            <option value="">Chọn nhân viên</option>
            {personnel.map(p => <option key={p.id} value={p.id}>{p.ho_ten} — {p.id_nhan_su || p.co_so}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className={label}>
            <label htmlFor="manual-attendance-day">Ngày</label>
            <DateInputVi id="manual-attendance-day" value={day} onChange={setDay} className={field} />
          </div>
          <label className={label}>Ca
            <select aria-label="Ca" className={field} value={shift} onChange={e => {
              const next = e.target.value as typeof shift;
              setShift(next);
              const times = next === 'full'
                ? { start: settings.fullDayStart, end: settings.fullDayEnd }
                : next === 'morning'
                  ? { start: settings.morningStart, end: settings.morningEnd }
                  : { start: settings.afternoonStart, end: settings.afternoonEnd };
              setStart(times.start);
              setEnd(times.end);
            }}>
              {settings.splitShiftEnabled && <option value="morning">Ca sáng</option>}
              {settings.splitShiftEnabled && <option value="afternoon">Ca chiều</option>}
              <option value="full">Cả ngày</option>
            </select>
          </label>
        </div>
        {shift === 'full' ? (
          <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
            Cả ngày {settings.fullDayStart}–{settings.fullDayEnd}
            {settings.splitShiftEnabled ? `. Hệ thống lưu ca sáng ${settings.morningStart}–${settings.morningEnd} và ca chiều ${settings.afternoonStart}–${settings.afternoonEnd}.` : '.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Time24Picker label="Giờ vào" tone="emerald" value={start} onChange={value => setStart(value ?? '')} required />
            <Time24Picker label="Giờ ra" tone="orange" value={end} onChange={value => setEnd(value ?? '')} required />
          </div>
        )}
        <p className="text-sm text-muted-foreground">Công bổ sung <strong className="text-foreground">{credit}</strong></p>
        <label className={label}>Ghi chú / lý do bổ sung
          <textarea required className={field} value={note} onChange={e => setNote(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      </div>
      <div className="flex shrink-0 justify-end gap-3 border-t border-border px-5 py-4 sm:px-8">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Đóng</button>
        <button type="submit" disabled={saving || !day || !note.trim()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {saving ? 'Đang lưu…' : 'Lưu bổ sung'}
        </button>
      </div>
    </form>
  </div>, document.body);
}
