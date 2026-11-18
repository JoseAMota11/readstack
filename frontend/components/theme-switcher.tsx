'use client';

import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTheme } from '@/context/theme.context';

function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      onClick={toggleTheme}
      type="text"
      className="theme-switcher"
      aria-label={theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro'}
      icon={theme === 'dark' ? <SunOutlined aria-hidden="true" /> : <MoonOutlined aria-hidden="true" />}
    />
  );
}

export default ThemeSwitcher;
