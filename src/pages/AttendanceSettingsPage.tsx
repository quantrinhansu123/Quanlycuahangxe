import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, Save, Split, Timer } from 'lucide-react';
import { useAttendanceSettings } from '../hooks/useAttendanceSettings';
import { saveAttendanceSettings } from '../data/attendanceSettingsData';
import { validateAttendanceSettings, type AttendanceSettings } from '../utils/timekeeping';

const inputClass = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="space-y-1.5">
    <span className="block text-sm font-semibold text-foreground">{label}</span>
    {children}
    {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
  </label>;
}

const numberValue = (value: string): number => value === '' ? 0 : Number(value);

export default function AttendanceSettingsPage() {
  const { settings, loading, replace, refresh } = useAttendanceSettings();
  const [draft, setDraft] = useState<AttendanceSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => setDraft(settings), [settings]);
  const errors = useMemo(() => validateAttendanceSettings(draft), [draft]);
  const totalSplitCredit = Math.round((draft.morningCredit + draft.afternoonCredit) * 1000) / 1000;

  const set = <K extends keyof AttendanceSettings>(key: K, value: AttendanceSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (errors.length > 0 || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const saved = await saveAttendanceSettings(draft);
      replace(saved);
      setDraft(saved);
      setNotice({ kind: 'success', text: 'Đã lưu và áp dụng cấu hình chấm công cho toàn hệ thống.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không thể lưu cấu hình.' });
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto w-full max-w-6xl space-y-5 pb-10">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-foreground">
          <Clock3 className="h-6 w-6 text-primary" /> Cài đặt chấm công
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Một cấu hình chung áp dụng cho tất cả nhân viên và mọi màn hình tính công.</p>
      </div>
      <button
        type="button"
        disabled={loading || saving}
        onClick={() => void refresh().then(setDraft)}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50"
      >
        <RefreshCw className="h-4 w-4" /> Tải lại
      </button>
    </div>

    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary"><Clock3 className="h-5 w-5" /></div>
          <div>
            <h2 className="font-bold text-foreground">Ca full ngày</h2>
            <p className="text-xs text-muted-foreground">Một cặp Vào/Ra xuyên ngày được xét theo phần này trước, không cần OUT/IN giữa trưa.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tên ca">
            <input className={inputClass} value={draft.shiftName} onChange={(e) => set('shiftName', e.target.value)} />
          </Field>
          <Field label="Công full ngày">
            <input className={inputClass} type="number" min="0.001" max="1" step="0.001" value={draft.fullDayCredit} onChange={(e) => set('fullDayCredit', numberValue(e.target.value))} />
          </Field>
          <Field label="Giờ vào chuẩn">
            <input className={inputClass} type="time" value={draft.fullDayStart} onChange={(e) => set('fullDayStart', e.target.value)} />
          </Field>
          <Field label="Giờ ra chuẩn">
            <input className={inputClass} type="time" value={draft.fullDayEnd} onChange={(e) => set('fullDayEnd', e.target.value)} />
          </Field>
          <Field label="Chuẩn ngày công (phút)">
            <input className={inputClass} type="number" min="1" step="1" value={draft.standardWorkMinutes} onChange={(e) => set('standardWorkMinutes', numberValue(e.target.value))} />
          </Field>
          <Field label="Phút nghỉ không tính công" hint="08:30–17:30 là 540 phút; chuẩn 480 phút tương ứng nghỉ 60 phút.">
            <input className={inputClass} type="number" min="0" step="1" value={draft.unpaidBreakMinutes} onChange={(e) => set('unpaidBreakMinutes', numberValue(e.target.value))} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm sm:p-6 dark:border-blue-900 dark:bg-blue-950/20">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={draft.splitShiftEnabled}
            onChange={(e) => set('splitShiftEnabled', e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border accent-primary"
          />
          <span>
            <span className="flex items-center gap-2 font-bold text-foreground"><Split className="h-4 w-4 text-primary" /> Bật chia ca thành 2 buổi</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Không thay đổi chấm công full ngày. Khi có lượt ra/vào giữa ca, hệ thống tính riêng từng buổi.</span>
          </span>
        </label>

        <div className={`mt-5 grid gap-4 md:grid-cols-2 ${draft.splitShiftEnabled ? '' : 'pointer-events-none opacity-50'}`} aria-disabled={!draft.splitShiftEnabled}>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-4 font-bold text-foreground">Buổi sáng</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bắt đầu"><input className={inputClass} type="time" value={draft.morningStart} onChange={(e) => set('morningStart', e.target.value)} /></Field>
              <Field label="Kết thúc"><input className={inputClass} type="time" value={draft.morningEnd} onChange={(e) => set('morningEnd', e.target.value)} /></Field>
              <div className="sm:col-span-2"><Field label="Công tối đa"><input className={inputClass} type="number" min="0" max="1" step="0.001" value={draft.morningCredit} onChange={(e) => set('morningCredit', numberValue(e.target.value))} /></Field></div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-4 font-bold text-foreground">Buổi chiều</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bắt đầu"><input className={inputClass} type="time" value={draft.afternoonStart} onChange={(e) => set('afternoonStart', e.target.value)} /></Field>
              <Field label="Kết thúc"><input className={inputClass} type="time" value={draft.afternoonEnd} onChange={(e) => set('afternoonEnd', e.target.value)} /></Field>
              <div className="sm:col-span-2"><Field label="Công tối đa"><input className={inputClass} type="number" min="0" max="1" step="0.001" value={draft.afternoonCredit} onChange={(e) => set('afternoonCredit', numberValue(e.target.value))} /></Field></div>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-blue-200 bg-white/70 px-4 py-3 text-sm text-blue-900 dark:bg-background dark:text-blue-100">
          Công sáng: <strong>{draft.morningCredit}</strong> · Công chiều: <strong>{draft.afternoonCredit}</strong> · Tổng hai buổi: <strong>{totalSplitCredit}</strong>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-700"><Timer className="h-5 w-5" /></div>
          <div>
            <h2 className="font-bold text-foreground">Đi muộn và tăng ca</h2>
            <p className="text-xs text-muted-foreground">Đi muộn tính từ giờ vào chuẩn; mỗi ngày tăng ca lấy giờ ra muộn nhất.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Cho phép đi trễ (phút)">
            <input className={inputClass} type="number" min="0" step="1" value={draft.lateGraceMinutes} onChange={(e) => set('lateGraceMinutes', numberValue(e.target.value))} />
          </Field>
          <Field label="Mốc bắt đầu tính tăng ca">
            <input className={inputClass} type="time" value={draft.overtimeStart} onChange={(e) => set('overtimeStart', e.target.value)} />
          </Field>
          <Field label="Tăng ca tối đa/tháng (giờ)">
            <input className={inputClass} type="number" min="0" step="0.25" value={draft.maxOvertimeHoursMonth} onChange={(e) => set('maxOvertimeHoursMonth', numberValue(e.target.value))} />
          </Field>
        </div>
      </section>

      {errors.length > 0 && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
        <div className="mb-1 flex items-center gap-2 font-bold"><AlertCircle className="h-4 w-4" /> Chưa thể lưu cấu hình</div>
        <ul className="list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
      </div>}

      {notice && <div className={`flex items-center gap-2 rounded-xl border p-4 text-sm font-semibold ${notice.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`} role="status">
        {notice.kind === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{notice.text}
      </div>}

      <div className="flex justify-end">
        <button disabled={saving || loading || errors.length > 0} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
        </button>
      </div>
    </form>
  </div>;
}
