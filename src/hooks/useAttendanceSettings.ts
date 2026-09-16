import { useContext } from 'react';
import { AttendanceSettingsContext } from '../context/attendanceSettingsContextValue';
import type { AttendanceSettingsContextValue } from '../context/attendanceSettingsContextValue';

export function useAttendanceSettings(): AttendanceSettingsContextValue {
  const value = useContext(AttendanceSettingsContext);
  if (!value) throw new Error('useAttendanceSettings phải nằm trong AttendanceSettingsProvider.');
  return value;
}
