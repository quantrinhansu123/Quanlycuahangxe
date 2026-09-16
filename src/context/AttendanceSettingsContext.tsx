import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAttendanceSettings } from '../data/attendanceSettingsData';
import { DEFAULT_ATTENDANCE_SETTINGS, type AttendanceSettings } from '../utils/timekeeping';
import {
  AttendanceSettingsContext,
  type AttendanceSettingsContextValue,
} from './attendanceSettingsContextValue';

export function AttendanceSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AttendanceSettings>({ ...DEFAULT_ATTENDANCE_SETTINGS });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const value = await getAttendanceSettings(true);
    setSettings(value);
    return value;
  }, []);

  useEffect(() => {
    let active = true;
    void getAttendanceSettings().then((value) => {
      if (active) setSettings(value);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const value = useMemo<AttendanceSettingsContextValue>(() => ({
    settings,
    loading,
    refresh,
    replace: setSettings,
  }), [settings, loading, refresh]);

  return <AttendanceSettingsContext.Provider value={value}>{children}</AttendanceSettingsContext.Provider>;
}
