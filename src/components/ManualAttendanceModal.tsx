import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addManualAttendance, formatAttendanceSaveError } from '../data/attendanceData';
import type { NhanSu } from '../data/personnelData';
import { ATTENDANCE_SHIFTS, workDaysForDayShifts } from '../utils/timekeeping';
import { formatLocalIsoDate } from '../utils/datetimeFormat';
import DateInputVi from './ui/DateInputVi';

export default function ManualAttendanceModal({ personnel, initialPerson = '', initialDay, onClose, onSaved }: {
  personnel: NhanSu[]; initialPerson?: string; initialDay?: string;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [person, setPerson] = useState(initialPerson);
  const [day, setDay] = useState(initialDay || formatLocalIsoDate());
  const [shift, setShift] = useState<'morning' | 'afternoon' | 'full'>('morning');
  const [start, setStart] = useState<string>('07:30');
  const [end, setEnd] = useState<string>('11:30');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const field = 'w-full border border-border rounded-lg p-2 bg-background';
  const credit = shift === 'full' ? 1 : workDaysForDayShifts([{ checkin: start, checkout: end }]);
  return createPortal(<div className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center p-4">
    <form className="bg-card rounded-xl p-6 space-y-4 w-full max-w-lg max-h-[90vh] overflow-auto" onSubmit={async e => {
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
      <h2 className="text-lg font-bold">Bổ sung chấm công</h2>
      <label className="block">Nhân viên<select required className={field} value={person} onChange={e => setPerson(e.target.value)}>
        <option value="">Chọn nhân viên</option>{personnel.map(p => <option key={p.id} value={p.id}>{p.ho_ten} — {p.id_nhan_su || p.co_so}</option>)}
      </select></label>
      <label className="block">Ngày<DateInputVi value={day} onChange={setDay} className={field} /></label>
      <label className="block">Ca<select aria-label="Ca" className={field} value={shift} onChange={e => {
        const next = e.target.value as typeof shift; setShift(next);
        const times = next === 'full' ? { start: '07:30', end: '19:30' } : ATTENDANCE_SHIFTS[next];
        setStart(times.start); setEnd(times.end);
      }}><option value="morning">Ca sáng</option><option value="afternoon">Ca chiều</option><option value="full">Cả ngày</option></select></label>
      {shift === 'full' ? <p>Ca sáng 07:30–11:30 và ca chiều 14:00–19:30.</p> : <div className="grid grid-cols-2 gap-3">
        <label>Giờ vào<input required type="time" className={field} value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>Giờ ra<input required type="time" className={field} value={end} onChange={e => setEnd(e.target.value)} /></label>
      </div>}
      <p>Công bổ sung: <strong>{credit}</strong>. Mỗi ca đủ giờ = 0,5 công.</p>
      <label className="block">Ghi chú / lý do bổ sung<textarea required className={field} value={note} onChange={e => setNote(e.target.value)} /></label>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={onClose}>Đóng</button>
        <button disabled={saving || !day || !note.trim()} className="bg-primary text-primary-foreground rounded-lg px-4 py-2">{saving ? 'Đang lưu…' : 'Lưu bổ sung'}</button></div>
    </form>
  </div>, document.body);
}
