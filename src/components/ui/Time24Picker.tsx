import { ChevronDown, Clock } from 'lucide-react';
import { normalizeAttendanceTimeInput } from '../../utils/timekeeping';

export default function Time24Picker({
  label,
  value,
  tone,
  required,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  tone: 'emerald' | 'orange';
  required?: boolean;
  onChange: (value: string | null) => void;
}) {
  const normalized = normalizeAttendanceTimeInput(value);
  const parts = normalized ? normalized.split(':') : ['', '', ''];
  const colors = tone === 'emerald'
    ? {
      icon: 'text-emerald-600 dark:text-emerald-400',
      badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
      surface: 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20',
      focus: 'focus-within:border-emerald-400 focus-within:ring-emerald-500/10',
    }
    : {
      icon: 'text-orange-600 dark:text-orange-400',
      badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
      surface: 'border-orange-200/80 bg-orange-50/40 dark:border-orange-900/60 dark:bg-orange-950/20',
      focus: 'focus-within:border-orange-400 focus-within:ring-orange-500/10',
    };

  const updatePart = (index: number, nextValue: string) => {
    if (!nextValue) {
      onChange(null);
      return;
    }
    const next = [...parts];
    next[index] = nextValue;
    onChange(`${next[0] || '00'}:${next[1] || '00'}:${next[2] || '00'}`);
  };

  const selectClass = 'min-h-11 w-full cursor-pointer appearance-none rounded-lg bg-transparent px-1 pr-4 text-center font-mono text-base font-semibold tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40';
  const renderOptions = (count: number) => Array.from({ length: count }, (_, index) => String(index).padStart(2, '0'))
    .map(part => <option key={part} value={part}>{part}</option>);

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Clock size={16} className={colors.icon} aria-hidden="true" />
        {label}
        <span className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide ${colors.badge}`}>24 GIỜ</span>
      </div>
      <div role="group" aria-label={`${label}, chọn theo giờ 24h`} className={`rounded-xl border p-2 transition-all focus-within:ring-4 ${colors.surface} ${colors.focus}`}>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { label: 'Giờ', ariaLabel: `${label}, giờ`, count: 24 },
            { label: 'Phút', ariaLabel: `${label}, phút`, count: 60 },
            { label: 'Giây', ariaLabel: `${label}, giây`, count: 60 },
          ] as const).map((unit, index) => (
            <div key={unit.label} className="min-w-0 rounded-lg border border-border/70 bg-card px-1.5 pt-1 shadow-sm transition-colors hover:border-primary/30 focus-within:border-primary/40">
              <div className="text-center text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{unit.label}</div>
              <div className="relative">
                <select
                  aria-label={unit.ariaLabel}
                  className={selectClass}
                  required={required}
                  value={parts[index]}
                  onChange={event => updatePart(index, event.target.value)}
                >
                  <option value="">--</option>
                  {renderOptions(unit.count)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-0.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="px-0.5 text-[11px] text-muted-foreground">Giờ 00–23 · phút, giây 00–59</p>
    </div>
  );
}
