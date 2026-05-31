import React from 'react';

type DatePickerViProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  /** Giá trị ISO yyyy-mm-dd */
  value: string;
  onChange: (iso: string) => void;
};

/** Chọn ngày bằng lịch (type=date), lưu ISO yyyy-mm-dd. */
const DatePickerVi: React.FC<DatePickerViProps> = ({
  value,
  onChange,
  className = '',
  ...rest
}) => {
  return (
    <input
      {...rest}
      type="date"
      value={value?.slice(0, 10) || ''}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
};

export default DatePickerVi;
