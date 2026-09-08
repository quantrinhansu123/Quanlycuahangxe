import React, { useEffect, useState } from 'react';
import { ThemeContext, THEME_COLORS, THEME_SIZES, type Theme } from './theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'system';
  });

  const [primaryColor, setPrimaryColor] = useState<string>(() => {
    return localStorage.getItem('primaryColor') || 'Xanh dương';
  });

  const [font, setFont] = useState<string>(() => {
    return localStorage.getItem('font') || 'Inter';
  });

  const [fontSize, setFontSize] = useState<string>(() => {
    return localStorage.getItem('fontSize') || 'medium';
  });

  const [avatar, setAvatar] = useState<string>(() => {
    return localStorage.getItem('userAvatar') || '';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }

    localStorage.setItem('theme', theme);
  }, [theme]);

  // Handle primary color change
  useEffect(() => {
    const root = window.document.documentElement;
    const colorConfig = THEME_COLORS.find(c => c.name === primaryColor) || THEME_COLORS[0];
    root.style.setProperty('--primary', colorConfig.hex);
    root.style.setProperty('--ring', colorConfig.hex);
    localStorage.setItem('primaryColor', primaryColor);
  }, [primaryColor]);

  // Handle font change
  useEffect(() => {
    const root = window.document.documentElement;
    root.style.setProperty('--font-sans', `'${font}', sans-serif`);
    localStorage.setItem('font', font);
  }, [font]);

  // Handle font size change
  useEffect(() => {
    const root = window.document.documentElement;
    const sizeConfig = THEME_SIZES.find(s => s.id === fontSize) || THEME_SIZES[1];
    root.style.fontSize = sizeConfig.size;
    localStorage.setItem('fontSize', fontSize);
  }, [fontSize]);

  // Handle avatar change
  useEffect(() => {
    if (avatar) {
      localStorage.setItem('userAvatar', avatar);
    }
  }, [avatar]);

  // Listen for system changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(mediaQuery.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ 
      theme, setTheme, 
      primaryColor, setPrimaryColor, 
      font, setFont,
      fontSize, setFontSize,
      avatar, setAvatar
    }}>
      {children}
    </ThemeContext.Provider>
  );
};
