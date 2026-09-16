import { createContext } from 'react';
import type { AttendanceSettings } from '../utils/timekeeping';

export interface AttendanceSettingsContextValue {
  settings: AttendanceSettings;
  loading: boolean;
  refresh: () => Promise<AttendanceSettings>;
  replace: (settings: AttendanceSettings) => void;
}

export const AttendanceSettingsContext = createContext<AttendanceSettingsContextValue | null>(null);
