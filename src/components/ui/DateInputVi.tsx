import { Calendar } from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';
import { isoToDateViInput, parseDateViToIso } from '../../utils/datetimeFormat';

type DateInputViProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  /** Giá trị ISO yyyy-mm-dd */
  value: string;
  onChange: (iso: string) => void;
  /** Hiện nút mở lịch (mặc định true) */
  showCalendarButton?: boolean;
};

/** Ô nhập ngày hiển thị dd/mm/yyyy, lưu ISO yyyy-mm-dd; có nút chọn lịch. */
const DateInputVi: React.FC<DateInputViProps> = ({
  value,
  onChange,
  className = '',
  placeholder = 'dd/mm/yyyy',
  showCalendarButton = true,
  disabled,
  title,
  ...rest
}) => {
  const [text, setText] = useState(() => isoToDateViInput(value));
  const nativeRef = useRef<HTMLInputElement>(null);
  const pickerId = useId();

  useEffect(() => {
    setText(isoToDateViInput(value));
  }, [value]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange('');
      setText('');
      return;
    }
    const iso = parseDateViToIso(trimmed);
    if (iso) {
      onChange(iso);
      setText(isoToDateViInput(iso));
    } else {
      setText(isoToDateViInput(value));
    }
  };

  const openNativePicker = () => {
    const el = nativeRef.current;
    if (!el || disabled) return;
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
      } else {
        el.click();
      }
    } catch {
      el.click();
    }
  };

  if (!showCalendarButton) {
    return (
      <input
        {...rest}
        title={title}
        disabled={disabled}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(text);
          }
        }}
        className={className}
      />
    );
  }

  return (
    <div className="relative inline-flex items-center" title={title}>
      <input
        {...rest}
        disabled={disabled}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(text);
          }
        }}
        className={`${className} pr-8`.trim()}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={openNativePicker}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-primary disabled:opacity-50"
        title="Chọn trên lịch"
        aria-label="Chọn trên lịch"
        tabIndex={-1}
      >
        <Calendar size={15} />
      </button>
      <input
        id={pickerId}
        ref={nativeRef}
        type="date"
        value={value || ''}
        disabled={disabled}
        onChange={(e) => {
          const iso = e.target.value;
          onChange(iso);
          setText(isoToDateViInput(iso));
        }}
        className="sr-only absolute opacity-0 pointer-events-none w-0 h-0"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
};

export default DateInputVi;
