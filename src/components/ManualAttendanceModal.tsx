import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, Loader2, Save, User, X } from 'lucide-react';
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

  const field = 'w-full px-4 py-2.5 bg-card border border-border rounded-xl font-bold text-[14px] text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all';
  const label = 'text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2';
  const credit = shift === 'full' ? settings.fullDayCredit : workDaysForDayShifts([{ checkin: start, checkout: end }], settings);

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" style={{ zIndex: 9999999 }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-attendance-title"
        className="bg-card w-full max-w-lg rounded-3xl border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in duration-300"
        style={{ zIndex: 10000000 }}
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
        }}
      >
        <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/30 shrink-0">
          <h3 id="manual-attendance-title" className="text-lg font-bold text-foreground flex items-center gap-2">
            <Clock size={20} className="text-primary" aria-hidden="true" />
            Bổ sung chấm công
          </h3>
          <button type="button" disabled={saving} onClick={onClose} aria-label="Đóng bổ sung chấm công" className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-8 flex-1 custom-scrollbar space-y-5">
          <div className="space-y-1.5">
            <label className={label}>
              <User size={14} className="text-primary/70" />
              Nhân viên <span className="text-red-500">*</span>
            </label>
            <select required className={field} value={person} onChange={e => setPerson(e.target.value)}>
              <option value="">Chọn nhân viên</option>
              {personnel.map(p => <option key={p.id} value={p.id}>{p.ho_ten} — {p.id_nhan_su || p.co_so}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="manual-attendance-day" className={label}>
                <Calendar size={14} className="text-primary/70" />
                Ngày <span className="text-red-500">*</span>
              </label>
              <DateInputVi id="manual-attendance-day" value={day} onChange={setDay} className={field} />
            </div>
            <div className="space-y-1.5">
              <label className={label}>
                <Clock size={14} className="text-primary/70" />
                Ca <span className="text-red-500">*</span>
              </label>
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
            </div>
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

          <div className="space-y-1.5">
            <label className={label}>
              Ghi chú / lý do bổ sung <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              className={`${field} resize-y min-h-[72px]`}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Nhập lý do bổ sung..."
            />
          </div>

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-8 py-5">
          <button type="button" disabled={saving} onClick={onClose} className="px-6 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted border border-border transition-all disabled:opacity-50">Đóng lại</button>
          <button
            type="submit"
            disabled={saving || !day || !note.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Đang lưu…' : 'Lưu bổ sung'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
