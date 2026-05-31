import React, { useEffect, useState } from 'react';
import { isoToDateViInput, parseDateViToIso } from '../../utils/datetimeFormat';

type DateInputViProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  /** Giá trị ISO yyyy-mm-dd */
  value: string;
  onChange: (iso: string) => void;
};

/** Ô nhập ngày hiển thị dd/mm/yyyy, lưu ISO yyyy-mm-dd. */
const DateInputVi: React.FC<DateInputViProps> = ({
  value,
  onChange,
  className = '',
  placeholder = 'dd/mm/yyyy',
  ...rest
}) => {
  const [text, setText] = useState(() => isoToDateViInput(value));

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

  return (
    <input
      {...rest}
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
};

export default DateInputVi;
