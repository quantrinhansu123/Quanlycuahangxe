import { useCallback, useMemo, useRef, useState } from 'react';
import { getAttendanceSettings } from '../data/attendanceSettingsData';
import { DEFAULT_ATTENDANCE_SETTINGS, type AttendanceSettings } from '../utils/timekeeping';
import {
  AttendanceSettingsContext,
  type AttendanceSettingsContextValue,
} from './attendanceSettingsContextValue';

export function AttendanceSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AttendanceSettings>({ ...DEFAULT_ATTENDANCE_SETTINGS });
  const [loading, setLoading] = useState(true);
  const started = useRef(false);

  const refresh = useCallback(async () => {
    const value = await getAttendanceSettings(true);
    setSettings(value);
    return value;
  }, []);

  const ensureLoaded = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void getAttendanceSettings().then((value) => {
      setSettings(value);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const value = useMemo<AttendanceSettingsContextValue>(() => ({
    settings,
    loading,
    refresh,
    replace: setSettings,
    ensureLoaded,
  }), [settings, loading, refresh, ensureLoaded]);

  return <AttendanceSettingsContext.Provider value={value}>{children}</AttendanceSettingsContext.Provider>;
}
