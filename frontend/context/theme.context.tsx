'use client';

import { ConfigProvider, theme as antTheme } from 'antd';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

// Ant Design derives color palettes from seed values, so these must be literal
// colors rather than CSS variables. Keep them aligned with globals.css.
const colors = {
  light: { accent: '#1F3A5F', hover: '#304F78', active: '#152C4B', canvas: '#F8F5EE', surface: '#FFFCF7', raised: '#FFFFFF', text: '#191816', secondary: '#5C5852', border: '#5C5852', error: '#A32D27', warning: '#805600', success: '#28613C' },
  dark: { accent: '#7597C4', hover: '#9AB7DB', active: '#B3CAE5', canvas: '#121316', surface: '#1A1C21', raised: '#242730', text: '#ECE8E0', secondary: '#B8B3AA', border: '#B8B3AA', error: '#FF938B', warning: '#E0AC43', success: '#8BCF9F' },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    // The bootstrap script sets the class before hydration; reveal only after
    // the provider has rendered the matching Ant Design algorithm.
    if (document.documentElement.classList.contains('dark') === (theme === 'dark')) {
      document.documentElement.removeAttribute('data-theme-pending');
    }
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try { localStorage.setItem('theme', next); } catch { /* Keep the selection for this session. */ }
    setTheme(next);
  };

  const color = colors[theme];
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ConfigProvider theme={{
        algorithm: theme === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: color.accent, colorPrimaryHover: color.hover,
          colorPrimaryActive: color.active, colorBgLayout: color.canvas,
          colorBgContainer: color.surface, colorBgElevated: color.raised,
          colorText: color.text, colorTextSecondary: color.secondary,
          colorBorder: color.border, colorError: color.error,
          colorWarning: color.warning, colorSuccess: color.success,
          colorTextLightSolid: theme === 'dark' ? '#121316' : '#FFFFFF',
          fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
        },
      }}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
