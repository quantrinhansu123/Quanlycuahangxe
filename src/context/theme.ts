import { createContext, useContext } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_COLORS = [
  { name: 'Xanh dương', hex: '#3b82f6', class: 'bg-blue-600' },
  { name: 'Tím', hex: '#8b5cf6', class: 'bg-violet-600' },
  { name: 'Xanh lá', hex: '#10b981', class: 'bg-emerald-600' },
  { name: 'Hồng', hex: '#ec4899', class: 'bg-pink-600' },
  { name: 'Cam vàng', hex: '#f59e0b', class: 'bg-amber-500' },
  { name: 'Cam', hex: '#f97316', class: 'bg-orange-600' },
  { name: 'Xanh lơ', hex: '#06b6d4', class: 'bg-cyan-500' },
  { name: 'Xám', hex: '#475569', class: 'bg-slate-600' },
];

export const THEME_FONTS = [
  { id: 'Inter', name: 'Inter', description: 'Hiện đại, trung tính' },
  { id: 'Be Vietnam Pro', name: 'Be Vietnam Pro', description: 'Tối ưu tiếng Việt' },
  { id: 'Lexend', name: 'Lexend', description: 'Dễ đọc, thoáng' },
  { id: 'Nunito', name: 'Nunito', description: 'Mềm mại, thân thiện' },
  { id: 'Source Sans 3', name: 'Source Sans 3', description: 'Chuyên nghiệp' },
  { id: 'Merriweather', name: 'Merriweather', description: 'Serif cổ điển' },
];

export const THEME_SIZES = [
  { id: 'small', name: 'Nhỏ', description: '14px gốc', size: '14px' },
  { id: 'medium', name: 'Trung bình', description: '16px gốc', size: '16px' },
  { id: 'large', name: 'Lớn', description: '18px gốc', size: '18px' },
];

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
  font: string;
  setFont: (font: string) => void;
  fontSize: string;
  setFontSize: (size: string) => void;
  avatar: string;
  setAvatar: (avatar: string) => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
