import { useContext, useEffect } from 'react';
import { AttendanceSettingsContext } from '../context/attendanceSettingsContextValue';
import type { AttendanceSettingsContextValue } from '../context/attendanceSettingsContextValue';

export function useAttendanceSettings(): AttendanceSettingsContextValue {
  const value = useContext(AttendanceSettingsContext);
  const ensureLoaded = value?.ensureLoaded;
  useEffect(() => { ensureLoaded?.(); }, [ensureLoaded]);
  if (!value) throw new Error('useAttendanceSettings phải nằm trong AttendanceSettingsProvider.');
  return value;
}
